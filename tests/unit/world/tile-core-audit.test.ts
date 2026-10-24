import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AABB,
  ItemCategory,
  ItemInstance,
  Material,
  SoundType,
  Tile,
  Vec3,
  type Level,
  type LevelSource,
} from '@mcpe/world';
import type { Random } from '@mcpe/util';
import { initTestTiles } from '../../helpers/initTestTiles';

// 全量审核 W98（Tile 基类 + TileInclude）。逐函数对照后运行时行为全部一致，只补了两处 OMIT。
// 这里锁定的是最容易被“顺手优化”改坏的细节：注册表初值、init 的三张表、亮度截断、
// 共享的 tmpBB、clip 的面号、随机数消耗顺序，以及 R10 的重载分派。

/** 记录调用顺序的随机数替身 */
class StubRandom {
  readonly calls: string[] = [];
  private readonly values: number[];

  constructor(values: number[]) {
    this.values = values;
  }

  nextFloat(): number {
    this.calls.push('nextFloat');
    return this.values.shift() ?? 0;
  }
}

const air = { getTile: () => 0, getData: () => 0 } as unknown as LevelSource;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles();
});

describe('注册表与静态表（W98）', () => {
  it('W98：initTiles 按 C++ 的 id / 材质 / 摧毁时间 / 爆炸抗性 / 声音 / 分类注册', () => {
    expect(Tile.rock.id).toBe(1);
    expect(Tile.rock.tex).toBe(1);
    expect(Tile.rock.destroySpeed).toBe(1.5);
    // setDestroyTime(1.5) 先把爆炸抗性抬到 7.5，随后 setExplodeable(10) 覆盖成 30
    expect(Tile.rock.explosionResistance).toBe(30);
    expect(Tile.rock.soundType).toBe(Tile.SOUND_STONE);
    expect(Tile.rock.category).toBe(ItemCategory.Structures);
    expect(Tile.rock.getDescriptionId()).toBe('tile.stone');

    expect(Tile.grass.destroySpeed).toBe(0.6);
    expect(Tile.grass.explosionResistance).toBe(3); // 只有 setDestroyTime(0.6)

    expect(Tile.unbreakable.destroySpeed).toBe(-1);
    expect(Tile.unbreakable.explosionResistance).toBe(18000000); // setExplodeable(6000000) * 3

    expect(Tile.info_reserved6.id).toBe(255);
    expect(Tile.tiles[0]).toBeNull(); // 空气槽
    expect(Tile.tiles[19]).toBeNull(); // C++ 没有注册 19 号
  });

  it('W98：init 写入 solid / lightBlock / translucent；translucent[0] 的初值是 true', () => {
    expect(Tile.solid[Tile.rock.id]).toBe(true);
    expect(Tile.lightBlock[Tile.rock.id]).toBe(255);
    expect(Tile.translucent[Tile.rock.id]).toBe(!Material.stone.blocksLight());

    expect(Tile.solid[Tile.glass.id]).toBe(Tile.glass.isSolidRender());
    expect(Tile.lightBlock[Tile.glass.id]).toBe(Tile.glass.isSolidRender() ? 255 : 0);
    expect(Tile.translucent[Tile.water.id]).toBe(!Material.water.blocksLight());

    expect(Tile.translucent[0]).toBe(true); // C++ `{true, false}` 的怪癖：0 号是 true
    expect(Tile.solid[0]).toBe(false);
  });

  it('W98：setLightEmission 用 (int)(15 * f) 截断', () => {
    expect(Tile.lightEmission[Tile.torch.id]).toBe(14); // 15 * 15/16 = 14.06
    expect(Tile.lightEmission[Tile.furnace_lit.id]).toBe(13); // 15 * 14/16 = 13.125
    expect(Tile.lightEmission[Tile.redStoneOre_lit.id]).toBe(9); // 15 * 10/16 = 9.375
    expect(Tile.lightEmission[Tile.mushroom1.id]).toBe(1); // 15 * 2/16 = 1.875
    expect(Tile.lightEmission[Tile.lava.id]).toBe(15);
  });

  it('W98：transformToValidBlockId 用 (x+y+z) 的奇偶选 info_update 方块', () => {
    expect(Tile.transformToValidBlockId(0)).toBe(0);
    expect(Tile.transformToValidBlockId(Tile.rock.id)).toBe(Tile.rock.id);
    expect(Tile.transformToValidBlockId(19)).toBe(Tile.info_updateGame2.id); // 0+0+0 偶数
    expect(Tile.transformToValidBlockId(19, 1, 0, 0)).toBe(Tile.info_updateGame1.id);
    expect(Tile.transformToValidBlockId(19, 0, 1, 1)).toBe(Tile.info_updateGame2.id); // 2 偶数
  });

  it('W98：SoundType 两个构造器的 breakSound / stepSound 规则', () => {
    const a = new SoundType('sand', 0.5, 1);
    expect([a.volume, a.pitch, a.breakSound, a.stepSound]).toEqual([
      0.5,
      1,
      'step.sand',
      'step.sand',
    ]);
    const b = new SoundType('stone', 'random.glass', 1, 1);
    expect([b.volume, b.pitch, b.breakSound, b.stepSound]).toEqual([
      1,
      1,
      'random.glass',
      'step.stone',
    ]);
  });
});

describe('形状、碰撞与掉落（W98）', () => {
  it('W98：getAABB 返回共享的 tmpBB，addAABBs 压入的是拷贝', () => {
    const lvl = null as unknown as Level;
    const a = Tile.rock.getAABB(lvl, 10, 20, 30)!;
    const b = Tile.rock.getAABB(lvl, 1, 2, 3)!;
    expect(a).toBe(b); // 同一个 tmpBB
    expect([b.x0, b.y0, b.z0, b.x1, b.y1, b.z1]).toEqual([1, 2, 3, 2, 3, 4]);

    const boxes: AABB[] = [];
    Tile.rock.addAABBs(lvl, 0, 0, 0, new AABB(0.5, 0.5, 0.5, 0.6, 0.6, 0.6), boxes);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).not.toBe(a);
    expect([
      boxes[0]!.x0,
      boxes[0]!.y0,
      boxes[0]!.z0,
      boxes[0]!.x1,
      boxes[0]!.y1,
      boxes[0]!.z1,
    ]).toEqual([0, 0, 0, 1, 1, 1]);

    const none: AABB[] = [];
    Tile.rock.addAABBs(lvl, 0, 0, 0, new AABB(2, 2, 2, 3, 3, 3), none);
    expect(none).toHaveLength(0);
  });

  it('W98：shouldRenderFace 的边界与形状分支', () => {
    expect(Tile.rock.shouldRenderFace(air, 0, -1, 0, 0)).toBe(false); // face 0 && y == -1
    expect(Tile.rock.shouldRenderFace(air, 0, 0, -1, 2)).toBe(false); // face 2 && z == -1
    expect(Tile.rock.shouldRenderFace(air, 0, 0, 256, 3)).toBe(false); // face 3 && z == xz
    expect(Tile.rock.shouldRenderFace(air, -1, 0, 0, 4)).toBe(false);
    expect(Tile.rock.shouldRenderFace(air, 256, 0, 0, 5)).toBe(false);
    expect(Tile.rock.shouldRenderFace(air, 0, 0, 0, 1)).toBe(true); // 邻居是空气

    // 非满方块：六个面都因为自己缩进去而可见
    const partial = new Tile(212, Material.stone);
    partial.setShape(0.1, 0.1, 0.1, 0.9, 0.9, 0.9);
    for (const face of [0, 1, 2, 3, 4, 5]) {
      expect(partial.shouldRenderFace(air, 0, 0, 0, face)).toBe(true);
    }

    // 只有 face 1（上面）对 topSnow 特判
    const snow = { getTile: () => Tile.topSnow.id, getData: () => 0 } as unknown as LevelSource;
    expect(Tile.rock.shouldRenderFace(snow, 0, 0, 0, 1)).toBe(false);
    expect(Tile.rock.shouldRenderFace(snow, 0, 0, 0, 0)).toBe(!Tile.topSnow.isSolidRender());
  });

  it('W98：clip 选最近的交点并给出面号；没有交点时返回默认 HitResult', () => {
    const lvl = null as unknown as Level;
    const hit = Tile.rock.clip(lvl, 0, 0, 0, new Vec3(0.5, 0.5, -2), new Vec3(0.5, 0.5, 2));
    expect(hit.f).toBe(2); // 北面
    expect([hit.x, hit.y, hit.z]).toEqual([0, 0, 0]);
    expect([hit.pos.x, hit.pos.y, hit.pos.z]).toEqual([0.5, 0.5, 0]);

    const miss = Tile.rock.clip(lvl, 0, 0, 0, new Vec3(0.5, 2.5, -2), new Vec3(0.5, 2.5, 2));
    expect(miss.f).toBe(0); // C++ 默认构造的 f 未初始化；按 R 规则取 0
    expect([miss.x, miss.y, miss.z]).toEqual([0, 0, 0]);
  });

  it('W98：getDestroyProgress 的三个分支', () => {
    type P = Parameters<Tile['getDestroyProgress']>[0];
    const no = { canDestroy: () => false, getDestroySpeed: () => 5 } as unknown as P;
    const yes = { canDestroy: () => true, getDestroySpeed: () => 5 } as unknown as P;
    expect(Tile.stoneBrick.getDestroyProgress(no)).toBe(1 / 2 / 100);
    expect(Tile.stoneBrick.getDestroyProgress(yes)).toBe(5 / 2 / 30);
    expect(Tile.unbreakable.getDestroyProgress(no)).toBe(0);
  });

  it('W98：mayPlace 的两个重载与可替换材质', () => {
    const airLevel = { getTile: () => 0 } as unknown as Level;
    const rockLevel = { getTile: () => Tile.rock.id } as unknown as Level;
    const waterLevel = { getTile: () => Tile.water.id } as unknown as Level;

    expect(Tile.rock.mayPlaceAt(airLevel, 0, 0, 0)).toBe(true);
    expect(Tile.rock.mayPlaceAt(rockLevel, 0, 0, 0)).toBe(false);
    expect(Tile.rock.mayPlaceAt(waterLevel, 0, 0, 0)).toBe(Material.water.isReplaceable());
    expect(Tile.rock.mayPlace(airLevel, 0, 0, 0)).toBe(true); // 3 参数重载
    expect(Tile.rock.mayPlace(rockLevel, 0, 0, 0, 1)).toBe(false); // 4 参数重载
  });

  it('W98：三个 getTexture 重载按 R10 分派到子类重写的实现方法', () => {
    class TexTile extends Tile {
      constructor() {
        super(211, 7, Material.stone);
      }

      override getTextureForData(face: number, data: number): number {
        return face * 100 + data;
      }
    }

    const t = new TexTile();
    expect(t.getTexture(3)).toBe(7); // 基类 getTextureForFace 返回 tex
    expect(t.getTexture(3, 5)).toBe(305);
    const lvl = { getData: () => 9 } as unknown as LevelSource;
    expect(t.getTexture(lvl, 0, 0, 0, 3)).toBe(309);
  });

  it('W98：spawnResources 的随机数顺序是 odds → 掉落 → 三个位置', () => {
    class DropTile extends Tile {
      constructor() {
        super(214, Material.stone);
      }

      override getResourceCount(_random: Random): number {
        return 1;
      }

      override getResource(_data: number, _random: Random): number {
        return 1;
      }
    }

    const random = new StubRandom([0.5, 0.25, 0.5, 0.75]);
    const added: { throwTime: number }[] = [];
    const level = {
      isClientSide: false,
      random,
      getLevelData: () => ({ getGameType: () => 0 }),
      addEntity: (e: { throwTime: number }) => added.push(e),
    } as unknown as Level;

    new DropTile().spawnResources(level, 10, 20, 30, 0);
    expect(random.calls).toHaveLength(4);
    expect(added).toHaveLength(1);
    expect(added[0]!.throwTime).toBe(10);
  });

  it('W98：getResource 返回 0 时不再消耗位置随机数', () => {
    class NoDropTile extends Tile {
      constructor() {
        super(215, Material.stone);
      }

      override getResource(_data: number, _random: Random): number {
        return 0;
      }
    }

    const random = new StubRandom([0.5, 0.5]);
    const added: unknown[] = [];
    const level = {
      isClientSide: false,
      random,
      getLevelData: () => ({ getGameType: () => 0 }),
      addEntity: (e: unknown) => added.push(e),
    } as unknown as Level;

    new NoDropTile().spawnResources(level, 0, 0, 0, 0);
    expect(random.calls).toHaveLength(1); // 只消耗了 odds；掉落类型 <= 0 时三个位置随机数都不消耗
    expect(added).toHaveLength(0);
  });

  it('W98：popResource 在创造模式或客户端不生成掉落物', () => {
    const random = new StubRandom([0.5, 0.5, 0.5]);
    const added: unknown[] = [];
    const creative = {
      isClientSide: false,
      random,
      getLevelData: () => ({ getGameType: () => 1 }), // GameType.Creative
      addEntity: (e: unknown) => added.push(e),
    } as unknown as Level;

    Tile.rock.popResource(creative, 0, 0, 0, new ItemInstance(1, 1, 0));
    expect(random.calls).toHaveLength(0);
    expect(added).toHaveLength(0);
  });
});

// 必须放在最后：清空后同文件后面的测试就拿不到方块了
describe('teardownTiles（W98）', () => {
  it('W98：teardownTiles 把所有槽位置空', () => {
    Tile.teardownTiles();
    expect(Tile.tiles.every((t) => t === null)).toBe(true);
  });
});
