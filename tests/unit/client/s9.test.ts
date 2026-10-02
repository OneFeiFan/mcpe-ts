import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AppPlatform, GLES1, glGetContext, glSetContext, Minecraft, NinecraftApp, TextureData } from '@mcpe/client';
import { getTimeMs, Mouse, MouseAction } from '@mcpe/platform';
import { FlatDimension, Level } from '@mcpe/world';

// S9 检查点：无头 GLES1 上完整跑一遍 NinecraftApp（init → startDemoWorld → tick → render）
class FakePlatform extends AppPlatform {
  override loadTexture(name: string): TextureData {
    const t = new TextureData();
    if (!['terrain.png', 'misc/grasscolor.png', 'misc/foliagecolor.png'].includes(name)) return t;
    t.w = 256;
    t.h = 256;
    t.data = new Uint8Array(256 * 256 * 4).fill(200);
    return t;
  }
}

type Priv = { fr: number; fg: number; fb: number; fogBr: number; _rotX: number };
let app: NinecraftApp;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  glSetContext(new GLES1(null));
  app = new NinecraftApp();
  app.init({ platform: new FakePlatform(), doRender: true });
  app.setSize(854, 480);
});

describe('S9 检查点', () => {
  it('init 后：平坦世界已建好，allChanged 之前 levelRenderer 还没有世界；useTouchscreen 为 false（桌面输入）', () => {
    expect(app.level).toBeInstanceOf(Level);
    expect(app.level!.dimension).toBeInstanceOf(FlatDimension);
    expect(app.isLevelGenerated()).toBe(true);
    expect(app.levelRenderer!._statsForTest().level).toBeNull();
    expect(app.useTouchscreen()).toBe(false);
    expect(app.inputHolder).not.toBeNull();
    expect(app.debugCamera).toMatchObject({ x: 136, y: 72, z: 104, xRot: 30, yRot: 0 });
    expect(app.mouseGrabbed).toBe(false); // 起始界面的 releaseMouse（ADAPTED(Demo)），等第一次点击
  });

  it('首个 tick 触发 _levelGenerated：cameraTargetPlayer === debugCamera，levelRenderer.level === level（A1）', () => {
    app.tick(0, 0);
    expect(app.cameraTargetPlayer).toBe(app.debugCamera);
    expect(app.levelRenderer!._statsForTest().level).toBe(app.level);
  });

  it('allChanged 后 9×8×9 = 648 个渲染区块（dist = (512>>3)<<(3−2) = 128，非 PowerVR）', () => {
    const s = app.levelRenderer!._statsForTest();
    expect([s.xChunks, s.yChunks, s.zChunks, s.chunksLength]).toEqual([9, 8, 9, 648]);
  });

  it('清屏色与雾不是黑色：A5 让 GameRenderer.tick 在没有 player 时也更新 fogBr', () => {
    for (let i = 1; i <= 40; i++) app.tick(0, 0);
    const g = app.gameRenderer as unknown as Priv;
    expect(g.fogBr).toBeGreaterThan(0.5);
    app.gameRenderer!.setupClearColor(1);
    expect(g.fr + g.fg + g.fb).toBeGreaterThan(0.5);
    expect(g.fb).toBeGreaterThan(g.fr); // 偏蓝的天空色
  });

  it('render：第一帧按选项 ao 打开 AO 并 allChanged（与 C++ 一样这一帧什么都不画），第二帧重建近处区块并经 RenderList 绘制', () => {
    app.gameRenderer!.render(0.5);
    expect(Minecraft.useAmbientOcclusion).toBe(true);
    const before = glGetContext().drawCalls;
    app.gameRenderer!.render(0.5);
    expect(glGetContext().drawCalls - before).toBeGreaterThan(0);
    expect(app.levelRenderer!._statsForTest().rendered).toBeGreaterThan(0);
  });

  it('S8 检查点 4 接到 GameRenderer.render：默认灵敏度下 sens = 1.0，鼠标 dx = 10 → _rotX 增加 10 × 1.0 × 4（A4）', () => {
    const g = app.gameRenderer as unknown as Priv;
    // 第一次点击：tickInput 的“点击即 grabMouse”
    Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_DOWN, 10, 10);
    app.lastTickTime = getTimeMs(); // tickInput 丢弃比上次 tick 早 200ms 以上的鼠标事件
    app.tick(0, 0); // 同时 nTick == maxTick：_rotX 清零
    expect(app.mouseGrabbed).toBe(true);
    Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_UP, 10, 10);
    Mouse.reset();
    Mouse.reset2();
    Mouse.feed(MouseAction.ACTION_MOVE, 0, 100, 100, 10, 0);
    app.gameRenderer!.render(0);
    expect(g._rotX).toBeCloseTo(40, 4);
    Mouse.reset2();
    Mouse.reset();
  });

  it('WASD 经 tickInput（A3）进入移动输入，tick 里自由相机前进（A2）；releaseMouse 松开全部按键（A6）', () => {
    const cam = app.debugCamera!;
    const z0 = cam.z;
    const yRot0 = cam.yRot;
    Mouse.reset();
    // Keyboard.feed 由 DomInput 调用；这里直接喂
    return import('@mcpe/platform').then(({ Keyboard, KeyboardAction }) => {
      Keyboard.feed(87, KeyboardAction.KEYDOWN);
      app.tick(0, 0);
      app.tick(0, 0);
      const moved = Math.hypot(cam.x - 136, cam.z - z0);
      expect(moved).toBeGreaterThan(0.4);
      void yRot0;
      app.releaseMouse();
      expect(app.mouseGrabbed).toBe(false);
      const z1 = cam.z;
      app.tick(0, 0);
      expect(cam.z).toBe(z1);
      Keyboard.feed(87, KeyboardAction.KEYUP);
    });
  });

  it('update() 整帧：Timer 推进、tick、updateLights、render 不出错；Minecraft.useAmbientOcclusion 已按选项变成 true', () => {
    expect(() => app.update()).not.toThrow();
    expect(Minecraft.useAmbientOcclusion).toBe(true);
  });
});
