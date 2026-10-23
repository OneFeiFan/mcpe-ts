import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Level, LightLayer, LightUpdate, Material, Region, Tile } from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';
import { createFlatLevel } from '../../helpers/headlessLevel';
import { initTestTiles } from '../../helpers/initTestTiles';

beforeAll(() => {
  initTestTiles();
});

describe('W65 LightUpdate 审核', () => {
  it('区域体积 > 16*16*128 时直接返回（C++ 是 int 乘法，TS 用 Math.imul）', () => {
    const lv = new FakeLevel();
    const hasChunksAt = vi.spyOn(lv, 'hasChunksAt');
    const getChunk = vi.spyOn(lv, 'getChunk');
    new LightUpdate(LightLayer.Block, 0, 0, 0, 100, 10, 30).update(lv); // 101*11*31 = 34441
    expect(hasChunksAt).not.toHaveBeenCalled();
    expect(getChunk).not.toHaveBeenCalled();
  });

  it('体积恰好 16*16*128 时不返回（C++ 的条件是 > 而不是 >=）', () => {
    const lv = new FakeLevel();
    const hasChunksAt = vi.spyOn(lv, 'hasChunksAt');
    const getChunk = vi.spyOn(lv, 'getChunk');
    new LightUpdate(LightLayer.Block, 0, 0, 0, 15, 127, 15).update(lv); // 16*128*16 = 32768
    expect(hasChunksAt).toHaveBeenCalledTimes(16 * 16);
    expect(getChunk).toHaveBeenCalledTimes(16 * 16);
  });

  it('hasLast 从不置 true（C++ 原样）：同一区块内的每一列都重新检查区块', () => {
    const lv = new FakeLevel();
    const hasChunksAt = vi.spyOn(lv, 'hasChunksAt');
    const getChunk = vi.spyOn(lv, 'getChunk');
    new LightUpdate(LightLayer.Sky, 0, 64, 0, 1, 64, 1).update(lv);
    expect(hasChunksAt).toHaveBeenCalledTimes(4);
    expect(getChunk).toHaveBeenCalledTimes(4);
  });

  it('y 范围写回成员并夹到 [0, DEPTH-1]（C++ 改的是成员本身）', () => {
    const lv = new FakeLevel().put(0, 0, 0, Tile.lava.id);
    const u = new LightUpdate(LightLayer.Block, 0, -5, 0, 0, Level.DEPTH + 5, 0);
    u.update(lv);
    expect([u.y0, u.y1]).toEqual([0, Level.DEPTH - 1]);
    expect(lv.getBrightness(LightLayer.Block, 0, 0, 0)).toBe(15);
  });

  it('不透明方块（lightBlock >= 15）且不发光时，目标亮度直接为 0', () => {
    expect(Tile.lightBlock[Tile.rock.id]!).toBeGreaterThanOrEqual(15);
    const lv = new FakeLevel().put(0, 64, 0, Tile.rock.id);
    lv.setBrightness(LightLayer.Block, 0, 64, 0, 7);
    new LightUpdate(LightLayer.Block, 0, 64, 0, 0, 64, 0).update(lv);
    expect(lv.getBrightness(LightLayer.Block, 0, 64, 0)).toBe(0);
  });

  it('每个变化格都对 6 个邻居发出检查；内部格也发（C++ 的 x+1 >= x1 恒成立）', () => {
    const lv = new FakeLevel().put(1, 64, 1, Tile.lava.id);
    new LightUpdate(LightLayer.Block, 0, 64, 0, 2, 64, 2).update(lv);
    expect(lv.otherThanCalls.slice(0, 6).map(([, x, y, z, e]) => [x, y, z, e])).toEqual([
      [0, 64, 1, 14],
      [1, 63, 1, 14],
      [1, 64, 0, 14],
      [2, 64, 1, 14],
      [1, 65, 1, 14],
      [1, 64, 2, 14],
    ]);
  });

  it('expandToContain：体积增量恰好 2 时扩大（条件是 <= 2）；已包含时不动边界', () => {
    const u = new LightUpdate(LightLayer.Sky, 1, 1, 1, 2, 2, 2); // 1*1*1
    expect(u.expandToContain(0, 1, 1, 3, 2, 2)).toBe(true); // 3*1*1 - 1 = 2
    expect([u.x0, u.x1]).toEqual([0, 3]);

    const p = new LightUpdate(LightLayer.Sky, 0, 0, 0, 4, 4, 4);
    expect(p.expandToContain(1, 1, 1, 2, 2, 2)).toBe(true);
    expect([p.x0, p.y0, p.z0, p.x1, p.y1, p.z1]).toEqual([0, 0, 0, 4, 4, 4]);
  });

  it('拷贝构造与 assign 复制全部 7 个字段', () => {
    const src = new LightUpdate(LightLayer.Block, 1, 2, 3, 4, 5, 6);
    const expected = [LightLayer.Block, 1, 2, 3, 4, 5, 6];

    const copy = new LightUpdate(src);
    expect([copy.layer, copy.x0, copy.y0, copy.z0, copy.x1, copy.y1, copy.z1]).toEqual(expected);

    const dst = new LightUpdate(LightLayer.Sky, 0, 0, 0, 0, 0, 0);
    dst.assign(src);
    expect([dst.layer, dst.x0, dst.y0, dst.z0, dst.x1, dst.y1, dst.z1]).toEqual(expected);
  });
});

describe('W66 Region 审核', () => {
  let level: Level;

  beforeAll(() => {
    level = createFlatLevel();
  });

  it('getTile：y 越界与区块范围外返回 0，区块内取 (x&15, y, z&15)', () => {
    level.setTile(2, 100, 3, Tile.rock.id);
    const region = new Region(level, 0, 0, 0, 15, 127, 15);
    expect(region.getTile(2, 100, 3)).toBe(Tile.rock.id);
    expect(region.getTile(2, -1, 3)).toBe(0);
    expect(region.getTile(2, Level.DEPTH, 3)).toBe(0);
    expect(region.getTile(16, 100, 3)).toBe(0);
    expect(region.getTile(2, 100, 16)).toBe(0);
  });

  it('二维 chunks 压平后的下标是 (xc - xc1) * size_z + (zc - zc1)', () => {
    level.setTile(1, 100, 17, Tile.rock.id); // chunk (0, 1)
    level.setTile(17, 100, 1, Tile.dirt.id); // chunk (1, 0)
    level.setTile(2, 100, 3, Tile.grass.id); // chunk (0, 0)
    const region = new Region(level, 0, 0, 0, 31, 127, 31);
    expect(region.getTile(1, 100, 17)).toBe(Tile.rock.id);
    expect(region.getTile(17, 100, 1)).toBe(Tile.dirt.id);
    expect(region.getTile(2, 100, 3)).toBe(Tile.grass.id);
  });

  it('isEmptyTile / getMaterial / isSolidBlockingTile / isSolidRenderTile 与 C++ 分支一致', () => {
    level.setTile(2, 100, 3, Tile.rock.id);
    level.setTile(4, 100, 4, Tile.water.id);
    const region = new Region(level, 0, 0, 0, 15, 127, 15);

    expect(region.isEmptyTile(0, 100, 0)).toBe(true);
    expect(region.isEmptyTile(2, 100, 3)).toBe(false);

    expect(region.getMaterial(0, 100, 0)).toBe(Material.air);
    expect(region.getMaterial(2, 100, 3)).toBe(Tile.rock.material);

    expect(region.isSolidBlockingTile(0, 100, 0)).toBe(false);
    expect(region.isSolidBlockingTile(2, 100, 3)).toBe(true);
    expect(region.isSolidBlockingTile(4, 100, 4)).toBe(false);

    expect(region.isSolidRenderTile(0, 100, 0)).toBe(false);
    expect(region.isSolidRenderTile(2, 100, 3)).toBe(true);
    expect(region.isSolidRenderTile(4, 100, 4)).toBe(false);
  });

  it('getData：y 越界返回 0，否则转给区块', () => {
    level.setData(6, 100, 6, 7);
    const region = new Region(level, 0, 0, 0, 15, 127, 15);
    expect(region.getData(6, 100, 6)).toBe(7);
    expect(region.getData(6, -1, 6)).toBe(0);
    expect(region.getData(6, Level.DEPTH, 6)).toBe(0);
  });

  it('getRawBrightness：y 越界、世界边界（x 用 >= / z 用 > 的不对称）、亮度表', () => {
    const region = new Region(level, 0, 0, 0, 15, 127, 15);

    expect(region.getRawBrightness(0, -1, 0)).toBe(0);
    const expectedTop = Math.max(0, Level.MAX_BRIGHTNESS - level.skyDarken);
    expect(region.getRawBrightness(0, Level.DEPTH, 0)).toBe(expectedTop);

    expect(region.getRawBrightness(Level.MAX_LEVEL_SIZE, 64, 0)).toBe(Level.MAX_BRIGHTNESS);
    expect(region.getRawBrightness(-Level.MAX_LEVEL_SIZE - 1, 64, 0)).toBe(Level.MAX_BRIGHTNESS);
    expect(region.getRawBrightness(0, 64, Level.MAX_LEVEL_SIZE + 1)).toBe(Level.MAX_BRIGHTNESS);

    const raw = region.getRawBrightness(0, 100, 0);
    expect(region.getBrightness(0, 100, 0)).toBe(level.dimension.brightnessRamp[raw]);
  });

  it('getRawBrightness(propagate)：half-slab / farmland 取周围 5 格最大值，不走自身亮度', () => {
    const chunk = level.getChunk(0, 0);
    const region = new Region(level, 0, 0, 0, 15, 127, 15);

    chunk.setTile(5, 100, 5, Tile.stoneSlabHalf.id);
    chunk.setBrightness(LightLayer.Sky, 5, 100, 5, 2);
    chunk.setBrightness(LightLayer.Sky, 5, 101, 5, 7);
    chunk.setBrightness(LightLayer.Sky, 6, 100, 5, 3);
    chunk.setBrightness(LightLayer.Sky, 4, 100, 5, 9);
    chunk.setBrightness(LightLayer.Sky, 5, 100, 6, 1);
    chunk.setBrightness(LightLayer.Sky, 5, 100, 4, 5);

    const around = Math.max(
      region.getRawBrightness(5, 101, 5, false),
      region.getRawBrightness(6, 100, 5, false),
      region.getRawBrightness(4, 100, 5, false),
      region.getRawBrightness(5, 100, 6, false),
      region.getRawBrightness(5, 100, 4, false),
    );
    expect(around).toBe(9);
    expect(region.getRawBrightness(5, 100, 5, false)).toBe(2);
    expect(region.getRawBrightness(5, 100, 5, true)).toBe(around);

    chunk.setTile(8, 100, 8, Tile.farmland.id);
    chunk.setBrightness(LightLayer.Sky, 8, 100, 8, 1);
    chunk.setBrightness(LightLayer.Sky, 8, 101, 8, 4);
    chunk.setBrightness(LightLayer.Sky, 9, 100, 8, 2);
    chunk.setBrightness(LightLayer.Sky, 7, 100, 8, 2);
    chunk.setBrightness(LightLayer.Sky, 8, 100, 9, 2);
    chunk.setBrightness(LightLayer.Sky, 8, 100, 7, 2);
    expect(region.getRawBrightness(8, 100, 8, false)).toBe(1);
    expect(region.getRawBrightness(8, 100, 8, true)).toBe(4);
  });

  it('getBiome / getBiomeSource 直接转给 Level', () => {
    const region = new Region(level, 0, 0, 0, 15, 127, 15);
    expect(region.getBiome(0, 0)).toBe(level.getBiome(0, 0));
    expect(region.getBiomeSource()).toBe(level.getBiomeSource());
  });
});
