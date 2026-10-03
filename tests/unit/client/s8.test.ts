import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BuildActionIntention, Config, createConfig, CustomInputHolder, Gui, KeyboardInput, Minecraft, MouseBuildInput, MouseHandler,
  MouseTurnInput, OptionId, Options, PixelCalc,
} from '@mcpe/client';
import { DebugFreeCamera } from '../../../apps/web/dev/camera/DebugFreeCamera'; // S12 起只供 dev 页使用
import { Mouse, MouseAction } from '@mcpe/platform';
import { Level, Material } from '@mcpe/world';
import { DomInput } from '../../../apps/web/src/DomInput';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

let level: Level;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  level = createFlatLevel();
  prepareLevel(level);
});

describe('S8 检查点', () => {
  it('KeyboardInput：setKey(87) 后 ya = 1；再按左 Shift（10）：sneaking，ya = 0.3', () => {
    const k = new KeyboardInput(new Options(null));
    k.setKey(87, true);
    k.tick(null);
    expect(k.ya).toBe(1);
    k.setKey(10, true);
    k.tick(null);
    expect(k.sneaking).toBe(true);
    expect(k.ya).toBeCloseTo(0.3);
    expect(k.wantDown).toBe(true);
    k.releaseAllKeys();
    k.tick(null);
    expect([k.xa, k.ya, k.sneaking]).toEqual([0, 0, false]);
  });

  it('turn(10, 0)：yRot、yRotO 都加 1.5；turn(0, 1000)：xRot 夹到 −90', () => {
    const c = new DebugFreeCamera(level, 0, 0, 0);
    c.turn(10, 0);
    expect([c.yRot, c.yRotO]).toEqual([1.5, 1.5]);
    c.turn(0, 1000);
    expect(c.xRot).toBe(-90);
    expect(c.xRotO).toBe(-90);
  });

  it('getPos(0.5) 是 xo 与 x 的中点；yRot = 0 时按住 W 一个 tick，z 增加 0.5', () => {
    const c = new DebugFreeCamera(level, 136, 72, 104);
    const k = new KeyboardInput(new Options(null));
    k.setKey(87, true);
    c.tick(k);
    expect(c.z).toBeCloseTo(104.5);
    expect(c.x).toBeCloseTo(136);
    expect(c.getPos(0.5).z).toBeCloseTo(104.25);
    expect(c.getPos(1)).toMatchObject({ x: c.x, y: c.y, z: c.z });
    k.setKey(87, false);
    k.setKey(32, true); // 空格：上升
    c.tick(k);
    expect(c.y).toBeCloseTo(72.5);
    expect([c.isPlayer(), c.isAlive(), c.hasDied(), c.heightOffset]).toEqual([false, true, false, 1.62]);
    expect(c.isUnderLiquid(Material.water)).toBe(false);
  });

  it('默认灵敏度 0.5：GameRenderer 的系数 (0.5×0.6+0.2)³×8 = 1.0', () => {
    const ss = new Options(null).getProgressValue(OptionId.OPTIONS_SENSITIVITY) * 0.6 + 0.2;
    expect((ss * ss * ss) * 8).toBeCloseTo(1.0, 6);
    // S9 移植 GameRenderer 时，把它的 render() 里的同一公式也接到这条测试上
  });
});

describe('输入链路', () => {
  it('Mouse.feed 的相对移动 → MouseTurnInput(MODE_DELTA) → MouseHandler.poll；reset2 后清零', () => {
    const turn = new MouseTurnInput(MouseTurnInput.MODE_DELTA, 427, 240);
    const h = new MouseHandler(turn);
    Mouse.reset2();
    Mouse.feed(MouseAction.ACTION_MOVE, 0, 10, 10, 3, -2);
    Mouse.feed(MouseAction.ACTION_MOVE, 0, 14, 9, 4, -1);
    h.poll();
    expect([h.xd, h.yd]).toEqual([7, -3]);
    Mouse.reset2();
    h.poll();
    expect([h.xd, h.yd]).toEqual([0, 0]);
    Mouse.reset();
  });

  it('MouseHandler.grab/release 经平台钩子（ADAPTED(Platform)）', () => {
    const calls: string[] = [];
    MouseHandler.platformHooks = { grab: () => calls.push('grab'), release: () => calls.push('release') };
    const h = new MouseHandler();
    h.xd = 5;
    h.grab();
    h.release();
    expect(calls).toEqual(['grab', 'release']);
    expect(h.xd).toBe(0);
    MouseHandler.platformHooks = null;
  });

  it('MouseBuildInput：左键破坏，右键按住每 10 tick 放置一次', () => {
    const b = new MouseBuildInput();
    const bai = new BuildActionIntention();
    Mouse.feed(MouseAction.ACTION_RIGHT, MouseAction.DATA_DOWN, 0, 0);
    const fired = Array.from({ length: 21 }, () => b.tickBuild(null, bai));
    expect(fired.filter(Boolean).length).toBe(3); // 第 1、11、21 个 tick
    expect(bai.isBuild() && bai.isInteract()).toBe(true);
    Mouse.feed(MouseAction.ACTION_RIGHT, MouseAction.DATA_UP, 0, 0);
    Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_DOWN, 0, 0);
    expect(b.tickBuild(null, bai)).toBe(true);
    expect(bai.isRemove() && bai.isAttack()).toBe(true);
    Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_UP, 0, 0);
    Mouse.reset();
  });

  it('CustomInputHolder 把 Config 转给三个输入；createConfig 用 Gui.GuiScale', () => {
    const turn = new MouseTurnInput(MouseTurnInput.MODE_OFFSET, 0, 0);
    const holder = new CustomInputHolder(new KeyboardInput(new Options(null)), turn, new MouseBuildInput());
    const mc = { width: 854, height: 480, options: new Options(null), pixelCalc: new PixelCalc(10), pixelCalcUi: new PixelCalc(2) } as unknown as Minecraft;
    const c: Config = createConfig(mc);
    expect([c.guiScale, c.guiWidth, c.guiHeight]).toEqual([Gui.GuiScale, Math.trunc(854 / Gui.GuiScale), Math.trunc(480 / Gui.GuiScale)]);
    expect(c.pixelCalc.millimetersToPixels(2)).toBe(20);
    holder.onConfigChanged(c);
    expect(holder.getTurnInput()).toBe(turn);
  });

  it('DomInput.mapKey：DOM 键码 → 分支的 Keyboard 常量', () => {
    expect(['KeyA', 'KeyZ', 'Digit0', 'Digit9', 'Space', 'ShiftLeft', 'Escape', 'Enter', 'Backspace', 'Tab', 'ControlLeft', 'F1', 'F12', 'ArrowUp'].map(DomInput.mapKey))
      .toEqual([65, 90, 48, 57, 32, 10, 27, 13, 8, 9, 232, 112, 123, -1]);
  });
});
