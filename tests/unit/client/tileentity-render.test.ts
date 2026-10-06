/**
 * 方块实体渲染：TileEntityRenderDispatcher、SignRenderer、ChestRenderer、EntityTileRenderer
 * —— 对应 packages/client/src/renderer/tileentity/ 与 renderer/EntityTileRenderer.ts。
 *
 * 【要钉住的原版行为】
 * - 分派器注册两种渲染器：TR_CHEST_RENDERER → ChestRenderer、TR_SIGN_RENDERER → SignRenderer；
 * - **箱子的方块实体不用 ChestRenderer**：C++ 把 `rendererId = TR_CHEST_RENDERER;` 注释掉了，
 *   ChestTileEntity 的 rendererId 是 TR_DEFAULT_RENDERER，分派器找不到渲染器 → 什么都不画；
 *   EntityTileRenderer 因此也什么都不画；
 * - 距离玩家 64 格以外（平方 ≥ 4096）的方块实体不画；
 * - 告示牌：立着的（Tile.sign）按 data×360/16 旋转、显示立杆；墙上的按朝向 2/4/5 旋转 180/90/-90、
 *   再往墙里贴 (0, -5/16, -7/16)、不显示立杆；选中行画成 "> 文字 <"；文字颜色 0。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ChestRenderer,
  EntityTileRenderer,
  GLES1,
  SignRenderer,
  TileEntityRenderDispatcher,
  glSetContext,
  type Font,
} from '@mcpe/client';
import { ChestTileEntity, initTileEntities, SignTileEntity, Tile, TileEntityRendererId, type Mob } from '@mcpe/world';
import { Mth } from '@mcpe/util';
import { createFlatLevel } from '../../helpers/headlessLevel';

const f = Math.fround;

class SpyGL extends GLES1 {
  ops: string[] = [];
  override pushMatrix(): void {
    this.ops.push('push');
    super.pushMatrix();
  }
  override popMatrix(): void {
    this.ops.push('pop');
    super.popMatrix();
  }
  override translate(x: number, y: number, z: number): void {
    this.ops.push(`t:${x},${y},${z}`);
    super.translate(x, y, z);
  }
  override rotate(a: number, x: number, y: number, z: number): void {
    this.ops.push(`r:${a},${x},${y},${z}`);
    super.rotate(a, x, y, z);
  }
  override scale(x: number, y: number, z: number): void {
    this.ops.push(`s:${x},${y},${z}`);
    super.scale(x, y, z);
  }
}

let gl: SpyGL;
const drawn: { text: string; x: number; y: number; color: number }[] = [];
const fakeFont = {
  width: (s: string) => s.length * 6,
  draw: (text: string, x: number, y: number, color: number) => drawn.push({ text, x, y, color }),
} as unknown as Font;
const fakeTextures = { loadAndBindTexture: vi.fn(() => 1) };

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Mth.initMth();
  gl = new SpyGL(null);
  glSetContext(gl);
  createFlatLevel(); // initHeadless：注册材质、方块、物品、生物群系
  initTileEntities(); // 方块实体子类注入工厂（NinecraftApp.init 里也是这一步）
});

function prepared(): TileEntityRenderDispatcher {
  const level = createFlatLevel();
  const d = TileEntityRenderDispatcher.getInstance();
  const player = { x: 0, y: 64, z: 0, xOld: 0, yOld: 64, zOld: 0, xRot: 0, xRotO: 0, yRot: 0, yRotO: 0 } as unknown as Mob;
  d.prepare(level, fakeTextures as never, fakeFont, player, 0);
  return d;
}

describe('分派器', () => {
  it('注册了箱子、告示牌两种渲染器；默认 id 没有渲染器', () => {
    const d = TileEntityRenderDispatcher.getInstance();
    expect(d.getRendererById(TileEntityRendererId.TR_CHEST_RENDERER)).toBeInstanceOf(ChestRenderer);
    expect(d.getRendererById(TileEntityRendererId.TR_SIGN_RENDERER)).toBeInstanceOf(SignRenderer);
    expect(d.getRendererById(TileEntityRendererId.TR_DEFAULT_RENDERER)).toBeNull();
  });

  it('箱子的方块实体在这一版里不用 ChestRenderer（rendererId 是默认值），EntityTileRenderer 也什么都不画', () => {
    const d = prepared();
    const chest = new ChestTileEntity();
    expect(chest.rendererId).toBe(TileEntityRendererId.TR_DEFAULT_RENDERER);
    expect(d.getRenderer(chest)).toBeNull();
    gl.ops.length = 0;
    EntityTileRenderer.instance.render(Tile.chest, 0, 1);
    expect(gl.ops).toEqual([]);
  });

  it('64 格以外不画，以内才交给渲染器', () => {
    const d = prepared();
    const sign = new SignTileEntity();
    const spy = vi.spyOn(d.getRendererById(TileEntityRendererId.TR_SIGN_RENDERER)!, 'render').mockImplementation(() => {});
    sign.x = 64; sign.y = 64; sign.z = 0; // 距离平方 = 64² + 0.5² … ≥ 4096
    d.render(sign, 0);
    expect(spy).not.toHaveBeenCalled();
    sign.x = 10;
    d.render(sign, 0);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('SignRenderer', () => {
  function renderSign(tileId: number, data: number, selectedLine = -1): { ops: string[]; cube2Visible: boolean } {
    const d = prepared();
    const level = d.level!;
    level.setTileAndData(2, 70, 2, tileId, data);
    const sign = level.getTileEntity(2, 70, 2) as SignTileEntity;
    sign.messages = ['Hello', 'MCPE', '', 'TS'];
    sign.selectedLine = selectedLine;
    gl.ops.length = 0;
    drawn.length = 0;
    const r = d.getRendererById(TileEntityRendererId.TR_SIGN_RENDERER) as SignRenderer;
    r.render(sign, 1, 2, 3, 0);
    return { ops: [...gl.ops], cube2Visible: (r as unknown as { signModel: { cube2: { visible: boolean } } }).signModel.cube2.visible };
  }

  const size = f(16 / 24.0);

  it('立着的告示牌：按 data×360/16 旋转，显示立杆', () => {
    const { ops, cube2Visible } = renderSign(Tile.sign.id, 4);
    expect(cube2Visible).toBe(true);
    expect(ops[0]).toBe('push');
    expect(ops[1]).toBe(`t:${1 + 0.5},${2 + f(0.75 * size)},${3 + 0.5}`);
    expect(ops[2]).toBe(`r:${-f((4 * 360) / 16.0)},0,1,0`);
  });

  it('墙上的告示牌：朝向 5 → 旋转 90（-(-90)），再贴墙，不显示立杆', () => {
    const { ops, cube2Visible } = renderSign(Tile.wallSign.id, 5);
    expect(cube2Visible).toBe(false);
    expect(ops[1]).toBe(`t:${1 + 0.5},${2 + f(0.75 * size)},${3 + 0.5}`);
    expect(ops[2]).toBe('r:90,0,1,0');
    expect(ops[3]).toBe(`t:0,${f(-5 / 16.0)},${f(-7 / 16.0)}`);
  });

  it('四行字：从 y = -20 起每行 +10，水平居中，颜色 0；选中行加 "> … <"', () => {
    renderSign(Tile.sign.id, 0, 1);
    expect(drawn.map((d) => d.text)).toEqual(['Hello', '> MCPE <', '', 'TS']);
    expect(drawn.map((d) => d.y)).toEqual([-20, -10, 0, 10]);
    expect(drawn[0]!.x).toBe(-(5 * 6) / 2);
    expect(drawn.every((d) => d.color === 0)).toBe(true);
  });
});
