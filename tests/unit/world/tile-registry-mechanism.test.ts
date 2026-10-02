import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  initMaterials, isUnregistered, Item, ItemCategory, Material, StoneSlabTileItem, Tile, TileItem,
  type Level, type LevelSource, type TileClasses, TILE_CLASSES } from '@mcpe/world';

// S3 注册表机制测试：用最小的替身子类代替 16 个方块类（它们由你按 1:1 移植），
// 只验证本轮新写的非 1:1 部分——注入、逐行 DEFERRED、静态表、物品注册、重载分派、未注册哨兵。
// 真实方块类就位后，再跑 tile-registry.test.ts（S3 验收）。
class Solid extends Tile {}
class NonSolid extends Tile {
  override isSolidRender(): boolean { return false; }
}
const fakes: TileClasses = {
  ...TILE_CLASSES,
  StoneTile: class extends Solid { constructor(id: number, tex: number) { super(id, tex, Material.stone); } },
  GrassTile: class extends Solid {
    constructor(id: number) { super(id, Material.dirt); this.tex = 3; }
    override getTextureForData(face: number, data: number): number { return face === 1 ? 0 : data === 5 ? 77 : 3; }
  },
  DirtTile: class extends Solid { constructor(id: number, tex: number) { super(id, tex, Material.dirt); } },
  LiquidTileDynamic: class extends NonSolid { constructor(id: number, m: Material) { super(id, 14, m); } },
  LiquidTileStatic: class extends NonSolid { constructor(id: number, m: Material) { super(id, 14, m); } },
  LeafTile: class extends NonSolid { constructor(id: number, tex: number) { super(id, tex, Material.leaves); } },
  BedTile: class extends NonSolid { constructor(id: number) { super(id, 134, Material.cloth); } },
  StoneSlabTile: class extends NonSolid { constructor(id: number, _full: boolean) { super(id, 6, Material.stone); } },
  FireTile: class extends NonSolid { constructor(id: number, tex: number) { super(id, tex, Material.fire); } },
  FarmTile: class extends NonSolid { constructor(id: number) { super(id, 87, Material.dirt); } },
  InvisibleTile: class extends Solid { constructor(id: number, tex: number, m: Material) { super(id, tex, m); } },
  TopSnowTile: class extends NonSolid {
    constructor(id: number, tex: number) { super(id, tex, Material.topSnow); }
    override mayPlaceAt(): boolean { return false; }
  },
  TileItem,
  StoneSlabTileItem,
  LeafTileItem: class extends TileItem {},
};

/** C++ 注册的 89 个方块减去还没移植的下界反应堆（247，S12 阶段 C 后半） */
const S12_IDS = [247];
const REGISTERED = [1,  2,  3,  4,  5,  6,  7,  8,  9,  10,  11,  12,  13,  14,  15,  16,  17,  18,  20,  21,  22,  24,  26,  30,  31,  35,  37,  38,  39,  40,  41,  42,  43,  44,  45,  46,  47,  48,  49,  50,  51,  53,  54,  56,  57,  58,  59,  60,  61,  62,  63,  64,  65,  67,  68,  71,  73,  74,  78,  79,  80,  81,  82,  83,  85,  87,  89,  95,  96,  98,  102,  103,  105,  107,  108,  109,  112,  114,  128,  155,  156,  245,  246,  248,  249,  253,  254,  255];
let errors: string[] = [];

beforeAll(() => {
  initMaterials();
  const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.join(' ')); });
  errors = [];
  Tile.initTiles(fakes);
  spy.mockRestore();
});

describe('Tile.initTiles（注入 + 逐行 DEFERRED）', () => {
  it('恰好注册 88 个方块（S3 27 + S11 42 + S12 19），其余槽位为空', () => {
    const ids = Tile.tiles.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
    expect(ids).toEqual(REGISTERED);
  });

  it('DEFERRED 的具名字段是哨兵：访问即报错，并写明字段名', () => {
    expect(isUnregistered(Tile.netherReactor)).toBe(true); // 下界反应堆还没移植
    expect(isUnregistered(Tile.rock)).toBe(false);
    expect(() => Tile.netherReactor.id).toThrow(/Tile\.netherReactor 尚未注册/);
    expect(isUnregistered(Item.apple)).toBe(true);
    expect(() => Item.snowBall.id).toThrow(/Item\.snowBall 尚未注册/);
  });

  it('init() 填的静态表与构造链里的设置', () => {
    expect([Tile.lightBlock[0], Tile.lightBlock[1], Tile.lightBlock[2], Tile.lightBlock[7]]).toEqual([0, 255, 255, 255]);
    expect([Tile.lightBlock[8], Tile.lightBlock[9], Tile.lightBlock[10], Tile.lightBlock[11]]).toEqual([3, 3, 255, 255]);
    expect([Tile.lightBlock[18], Tile.lightBlock[254]]).toEqual([1, 1]);
    expect([Tile.lightEmission[10], Tile.lightEmission[11], Tile.lightEmission[51]]).toEqual([15, 15, 15]);
    expect([Tile.solid[1], Tile.solid[8], Tile.translucent[0], Tile.translucent[8]]).toEqual([true, false, true, false]); // C++ 的 LiquidMaterial 没重写 blocksLight，水不算 translucent
    expect(Tile.rock.destroySpeed).toBe(1.5);
    expect(Tile.rock.explosionResistance).toBe(30); // setDestroyTime 先设 7.5，setExplodeable(10) 再改成 30
    expect(Tile.rock.soundType).toBe(Tile.SOUND_STONE);
    expect(Tile.rock.getDescriptionId()).toBe('tile.stone');
    expect(Tile.unbreakable.destroySpeed).toBe(-1);
  });

  it('物品注册：每个方块一个 TileItem，两个特殊 TileItem，category 复制自方块', () => {
    for (const id of REGISTERED) expect(Item.items[id], `items[${id}]`).toBeInstanceOf(TileItem);
    expect(Item.items[44]).toBeInstanceOf(StoneSlabTileItem);
    expect(Item.items[18]).not.toBe(Item.items[254]);
    expect(Item.items[1]!.category).toBe(ItemCategory.Structures);
    expect(Item.items[1]!.getDescriptionId()).toBe('tile.stone');
    expect(Item.items[18]!.getDescriptionId()).toBe('tile.leaves'); // TileItem 取方块的描述
  });

  it('缺 category 的方块照 C++ 打错误日志：netherrack、invisible_bedrock、grass_carried、info_reserved6', () => {
    const ids = errors.map((e) => Number(/tile (\d+):/.exec(e)?.[1])).filter((n) => !Number.isNaN(n));
    expect(ids).toEqual([87, 95, 253, 255]); // 与 C++ 的输出一致（黄金样本 harness 的日志）
  });
});

describe('C++ 重载的分派', () => {
  const level = { getData: () => 5, getTile: () => 0 } as unknown as LevelSource & Level;
  it('getTexture 三个重载分别落到 getTextureForFace、getTextureForData、getTextureAt', () => {
    expect(Tile.rock.getTexture(0)).toBe(1); // getTextureForFace：tex
    expect(Tile.grass.getTexture(1, 0)).toBe(0); // 子类重写的 getTextureForData
    expect(Tile.grass.getTexture(level, 0, 0, 0, 2)).toBe(77); // getTextureAt → getTextureForData(face, level.getData)
    expect(Tile.grass.getTexture(2)).toBe(3); // getTextureForFace 未重写：tex
  });
  it('mayPlace 两个重载：$5 默认转到 $4', () => {
    expect(Tile.rock.mayPlace(level, 0, 0, 0)).toBe(true); // getTile 为 0
    expect(Tile.topSnow.mayPlace(level, 0, 0, 0, 1)).toBe(false); // 子类只重写 $4，$5 也生效
  });
  it('mayPick 两个重载', () => {
    expect(Tile.rock.mayPick()).toBe(true);
    expect(Tile.rock.mayPick(0, false)).toBe(true);
  });
});

describe('Tile 基类行为', () => {
  const air = { getTile: () => 0 } as unknown as LevelSource;
  const stoneAbove = { getTile: () => 1 } as unknown as LevelSource;
  const snowAbove = { getTile: () => 78 } as unknown as LevelSource;
  it('shouldRenderFace：y = -1 的底面、世界边界外侧不画；上方是雪层时顶面不画', () => {
    expect(Tile.rock.shouldRenderFace(air, 0, -1, 0, 0)).toBe(false);
    expect(Tile.rock.shouldRenderFace(air, 0, 64, 256, 3)).toBe(false);
    expect(Tile.rock.shouldRenderFace(air, 0, 64, 0, 1)).toBe(true);
    expect(Tile.rock.shouldRenderFace(stoneAbove, 0, 64, 0, 1)).toBe(false);
    expect(Tile.rock.shouldRenderFace(snowAbove, 0, 64, 0, 1)).toBe(false); // 需要 topSnow 已注册
  });
  it('transformToValidBlockId：未注册的 id 按坐标奇偶换成 info_updateGame1/2', () => {
    expect(Tile.transformToValidBlockId(19, 1, 0, 0)).toBe(248); // C++ 也没有注册 19
    expect(Tile.transformToValidBlockId(19, 0, 0, 0)).toBe(249);
    expect(Tile.transformToValidBlockId(1)).toBe(1);
  });
  it('getAABB 返回共享的 tmpBB；addAABBs 放入的是拷贝', () => {
    const lv = {} as Level;
    const a = Tile.rock.getAABB(lv, 1, 2, 3)!;
    expect([a.x0, a.y0, a.z0, a.x1, a.y1, a.z1]).toEqual([1, 2, 3, 2, 3, 4]);
    expect(Tile.rock.getAABB(lv, 5, 5, 5)).toBe(a);
    const boxes: typeof a[] = [];
    Tile.rock.addAABBs(lv, 5, 5, 5, a.copy(), boxes);
    expect(boxes[0]).not.toBe(a);
  });
});
