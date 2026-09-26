import { beforeAll, describe, expect, it } from 'vitest';
import { Random } from '@mcpe/util';
import {
  BedTile, FarmTile, FireTile, FoliageColor, initMaterials, Item, LeafTile, LeafTileItem, LiquidTile, LiquidTileDynamic,
  LiquidTileStatic, Material, StoneSlabTile, StoneSlabTileItem, Tile, TileItem, type TileClasses,
} from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';

// 这一批 10 个类用真实实现；其余 5 个（StoneTile、DirtTile、GrassTile、InvisibleTile、TopSnowTile）还没移植，用替身
class Solid extends Tile {}
const fakes = {
  StoneTile: class extends Solid { constructor(id: number, tex: number) { super(id, tex, Material.stone); } },
  GrassTile: class extends Solid { constructor(id: number) { super(id, Material.dirt); this.tex = 3; } },
  DirtTile: class extends Solid { constructor(id: number, tex: number) { super(id, tex, Material.dirt); } },
  InvisibleTile: class extends Solid { constructor(id: number, tex: number, m: Material) { super(id, tex, m); } },
  TopSnowTile: class extends Tile {
    constructor(id: number, tex: number) { super(id, tex, Material.topSnow); }
    override isSolidRender(): boolean { return false; }
  },
};

beforeAll(() => {
  initMaterials();
  const classes: TileClasses = {
    ...fakes, LiquidTileDynamic, LiquidTileStatic, LeafTile, BedTile, StoneSlabTile, FireTile, FarmTile,
    TileItem, StoneSlabTileItem, LeafTileItem,
  };
  Tile.initTiles(classes); // FireTile 构造函数里那 4 行 DEFERRED 没切掉的话，这里就会报错
});

describe('注册与静态表', () => {
  it('类型与光照表', () => {
    expect(Tile.water).toBeInstanceOf(LiquidTileDynamic);
    expect(Tile.calmLava).toBeInstanceOf(LiquidTileStatic);
    expect(Tile.leaves).toBeInstanceOf(LeafTile);
    expect(Tile.fire).toBeInstanceOf(FireTile);
    expect([8, 9, 10, 11].map((i) => Tile.lightBlock[i])).toEqual([3, 3, 255, 255]);
    // 台阶（半块）和耕地的构造函数里有 setLightBlock(255)，但 initTiles 随后调用的 init() 会按 isSolidRender() 重写成 0，
    // C++ 的执行顺序完全一样，所以这两个在分支里都不挡光
    expect([18, 254, 43, 44, 60, 26, 51].map((i) => Tile.lightBlock[i])).toEqual([1, 1, 255, 0, 0, 0, 0]);
    expect([10, 11, 51].map((i) => Tile.lightEmission[i])).toEqual([15, 15, 15]);
    expect([Tile.shouldTick[8], Tile.shouldTick[9], Tile.shouldTick[11], Tile.shouldTick[18], Tile.shouldTick[51], Tile.shouldTick[60]])
      .toEqual([true, false, true, true, true, true]);
    expect(Item.items[18]).toBeInstanceOf(LeafTileItem);
  });

  it('FireTile：木头与树叶可燃，DEFERRED 的原木、书架、TNT、羊毛不在表里', () => {
    const fire = Tile.fire;
    expect([fire.isFlammable(5), fire.isFlammable(18), fire.isFlammable(17), fire.isFlammable(47), fire.isFlammable(46), fire.isFlammable(35)])
      .toEqual([true, true, false, false, false, false]);
  });
});

describe('StoneSlabTile', () => {
  it('形状、实心与纹理', () => {
    expect(Tile.stoneSlabHalf.yy1).toBe(0.5);
    expect(Tile.stoneSlab.isSolidRender()).toBe(true);
    expect(Tile.stoneSlabHalf.isSolidRender()).toBe(false);
    expect([Tile.stoneSlabHalf.getTexture(0), Tile.stoneSlabHalf.getTexture(2)]).toEqual([6, 5]);
    expect([Tile.stoneSlabHalf.getTexture(0, 1), Tile.stoneSlabHalf.getTexture(1, 1), Tile.stoneSlabHalf.getTexture(3, 1)]).toEqual([208, 176, 192]);
    expect(Tile.stoneSlabHalf.getTexture(2, 4)).toBe(Tile.redBrick.tex);
    expect(() => Tile.stoneSlabHalf.getTexture(2, 5)).toThrow(/Tile\.stoneBrickSmooth 尚未注册/); // 运行时依赖，照原样保留
  });
});

describe('LeafTile', () => {
  it('纹理、fancy 与颜色', () => {
    const tex = Tile.leaves.tex;
    expect(Tile.leaves.getTexture(0, LeafTile.EVERGREEN_LEAF)).toBe(tex + 80);
    expect(Tile.leaves_carried.getTexture(0, LeafTile.EVERGREEN_LEAF)).toBe(Tile.leaves_carried.tex - 16);
    Tile.leaves.setFancy(false);
    expect([Tile.leaves.tex, Tile.leaves.isSolidRender()]).toEqual([tex + 1, true]);
    Tile.leaves.setFancy(true);
    expect([Tile.leaves.tex, Tile.leaves.isSolidRender()]).toEqual([tex, false]);
    FoliageColor.setUseTint(false);
    const lv = new FakeLevel().put(0, 0, 0, 18, 0);
    expect(Tile.leaves.getColor(lv, 0, 0, 0)).toBe(0x48b518);
    lv.put(0, 0, 0, 18, LeafTile.EVERGREEN_LEAF);
    expect(Tile.leaves.getColor(lv, 0, 0, 0)).toBe(0x619961);
  });

  it('没有原木时，带更新标记的树叶在 tick 里腐烂（原木未注册也不报错）', () => {
    const lv = new FakeLevel().put(0, 64, 0, 18, LeafTile.UPDATE_LEAF_BIT);
    Tile.leaves.tick(lv, 0, 64, 0, new Random(1));
    expect(lv.getTile(0, 64, 0)).toBe(0);
  });
});

describe('BedTile', () => {
  it('形状与纹理', () => {
    expect(Tile.bed.yy1).toBeCloseTo(9 / 16);
    const t = Tile.bed.tex; // 6 + 8 * 16
    expect(Tile.bed.getTexture(0, 0)).toBe(Tile.wood.tex); // 底面
    expect(Tile.bed.getTexture(2, 0)).toBe(t - 1 + 16); // 床尾、方向 0 的北面 → 相对朝向 SOUTH
    expect(Tile.bed.getTexture(4, 0)).toBe(t + 16); // 床尾侧面
    expect(Tile.bed.getTexture(1, 0)).toBe(t); // 床尾顶面
    expect(Tile.bed.getTexture(3, BedTile.HEAD_PIECE_DATA)).toBe(t + 2 + 16); // 床头
  });

  it('床尾找不到床头时自己消失（掉落物品已 DEFERRED）', () => {
    const lv = new FakeLevel().put(0, 64, 0, 26, 0);
    Tile.bed.neighborChanged(lv, 0, 64, 0, 0);
    expect(lv.getTile(0, 64, 0)).toBe(0);
  });
});

describe('液体', () => {
  it('高度、颜色、tick 间隔与渲染层', () => {
    expect([LiquidTile.getHeight(0), LiquidTile.getHeight(7), LiquidTile.getHeight(8)]).toEqual([1 / 9, 8 / 9, 1 / 9]);
    expect(Tile.water.getColor(new FakeLevel(), 0, 0, 0)).toBe(-1717986817); // 0x999999ff 按 int 回绕
    expect([Tile.water.getTickDelay(), Tile.lava.getTickDelay()]).toEqual([5, 30]);
    expect([Tile.water.getRenderLayer(), Tile.lava.getRenderLayer()]).toEqual([2, 0]);
  });

  it('水源在石头地面上向四周扩散，源头变成静止水（流动时要检查的 4 个未注册方块不会报错）', () => {
    const lv = new FakeLevel();
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) lv.put(x, 63, z, 1);
    lv.put(0, 64, 0, 8, 0);
    Tile.water.tick(lv, 0, 64, 0, new Random(1));
    expect([lv.getTile(0, 64, 0), lv.getData(0, 64, 0)]).toEqual([9, 0]);
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) expect([lv.getTile(x, 64, z), lv.getData(x, 64, z)]).toEqual([8, 1]);
    expect(lv.getTile(1, 64, 1)).toBe(0);
  });

  it('静止水在邻居变化时变回流动水并排进计划刻', () => {
    const lv = new FakeLevel().put(0, 64, 0, 9, 0);
    Tile.calmWater.neighborChanged(lv, 0, 64, 0, 0);
    expect(lv.getTile(0, 64, 0)).toBe(8);
    expect(lv.scheduled).toEqual([[0, 64, 0, 8, 5]]);
    expect(lv.noNeighborUpdate).toBe(false);
  });
});

describe('FarmTile', () => {
  it('附近没水、没作物时变回泥土（作物未注册也不报错）；有水时湿度设为 7', () => {
    const dry = new FakeLevel().put(0, 64, 0, 60, 0);
    Tile.farmland.tick(dry, 0, 64, 0, new Random(1));
    expect(dry.getTile(0, 64, 0)).toBe(3);
    const wet = new FakeLevel().put(0, 64, 0, 60, 0).put(3, 64, 0, 9, 0);
    Tile.farmland.tick(wet, 0, 64, 0, new Random(1));
    expect([wet.getTile(0, 64, 0), wet.getData(0, 64, 0)]).toEqual([60, 7]);
  });
});

describe('FireTile', () => {
  it('地狱岩上的火不会熄灭，年龄加一并排进计划刻', () => {
    const lv = new FakeLevel().put(0, 63, 0, 87).put(0, 64, 0, 51, 0);
    Tile.fire.tick(lv, 0, 64, 0, new Random(1));
    expect([lv.getTile(0, 64, 0), lv.getData(0, 64, 0)]).toEqual([51, 1]);
    expect(lv.scheduled).toEqual([[0, 64, 0, 51, 10]]);
  });

  it('火能烧木头（烧到时要判断是不是 TNT，TNT 未注册也不报错）', () => {
    let burned = false;
    for (let seed = 0; seed < 50 && !burned; seed++) {
      const lv = new FakeLevel().put(0, 63, 0, 1).put(1, 64, 0, 5).put(0, 64, 0, 51, 15);
      Tile.fire.tick(lv, 0, 64, 0, new Random(seed));
      burned = lv.getTile(1, 64, 0) !== 5;
    }
    expect(burned).toBe(true);
  });
});
