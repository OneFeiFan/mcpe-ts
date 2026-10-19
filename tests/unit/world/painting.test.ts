import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import {
  Direction,
  EntityRendererId,
  EntityTypes,
  GameType,
  HangingEntityItem,
  initItems,
  type Level,
  Motive,
  Painting,
  Tile,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D7：`Motive`（画尺寸表）+ `Painting` + 接线。
//
// ⚠ 这个文件里最要紧的是 `Motive.getAllMotivesAsList()` 的**顺序**：
// `setRandomMotive` 的随机下标就建立在它上面，顺序错一处，随机画作分布就变了。
// 所以下面把整张表逐个钉住（连"Aztec 不在列表里"这个怪癖一起）。

const X = 130;
const Y = 64;
const Z = 130;
let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // ⚠ initItems 必须在 initTiles 之后（ShovelItem 构造时会读 Tile.grass.id）
  createFlatLevel();
  initItems();
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  for (let y = 64; y <= 100; y++)
    for (let x = X - 6; x <= X + 6; x++)
      for (let z = Z - 6; z <= Z + 6; z++) level.setTileNoUpdate(x, y, z, 0);
});

/** 摆一堵能挂下 1×1、2×1、1×2… 的墙（`survives()` 要的那几格是实心） */
function buildWall(): void {
  for (let dx = -4; dx <= 4; dx++)
    for (let dy = 0; dy <= 4; dy++) level.setTileNoUpdate(X + dx, Y + dy, Z, Tile.rock.id);
}

describe('Motive（D7）', () => {
  it('⚠ 列表是 28 项，而且**顺序和声明顺序不一样**（Aztec2 在 Alban 前）', () => {
    const list = Motive.getAllMotivesAsList();
    expect(list.length).toBe(28);
    expect(list.map((m) => m.name)).toEqual([
      'Kebab',
      'Aztec2',
      'Alban',
      'Bomb',
      'Plant',
      'Wasteland',
      'Pool',
      'Courbet',
      'Sea',
      'Sunset',
      'Creebet',
      'Wanderer',
      'Graham',
      'Match',
      'Bust',
      'Stage',
      'Void',
      'SkullAndRoses',
      'Fighters',
      'Pointer',
      'Pigscene',
      'BurningSkull',
      'Skeleton',
      'DonkeyKong',
      'Earth',
      'Wind',
      'Fire',
      'Water',
    ]);
  });

  it('⚠ Aztec 声明了但**不在列表里**，所以按名字查它会落到 DefaultImage（= Kebab）', () => {
    expect(Motive.Aztec.name).toBe('Aztec');
    expect(Motive.getAllMotivesAsList().includes(Motive.Aztec)).toBe(false);
    expect(Motive.getMotiveByName('Aztec'), '这个坑是原样行为').toBe(Motive.DefaultImage);
    expect(Motive.DefaultImage).toBe(Motive.Kebab);
  });

  it('查得到的名字返回自己；查不到返回 DefaultImage', () => {
    expect(Motive.getMotiveByName('Pointer')).toBe(Motive.Pointer);
    expect(Motive.getMotiveByName('不存在的画')).toBe(Motive.DefaultImage);
    expect(Motive.getMotiveByName('')).toBe(Motive.DefaultImage);
  });

  it('每张画的尺寸与贴图坐标逐项对得上（抽几张有代表性的）', () => {
    expect([Motive.Kebab.w, Motive.Kebab.h, Motive.Kebab.uo, Motive.Kebab.vo]).toEqual([
      16, 16, 0, 0,
    ]);
    expect([Motive.Pool.w, Motive.Pool.h, Motive.Pool.uo, Motive.Pool.vo]).toEqual([32, 16, 0, 32]);
    expect([Motive.Wanderer.w, Motive.Wanderer.h]).toEqual([16, 32]);
    expect([Motive.Fighters.w, Motive.Fighters.h, Motive.Fighters.uo, Motive.Fighters.vo]).toEqual([
      64, 32, 0, 96,
    ]);
    expect([Motive.Pointer.w, Motive.Pointer.h, Motive.Pointer.uo, Motive.Pointer.vo]).toEqual([
      64, 64, 0, 192,
    ]);
    expect([Motive.Skeleton.w, Motive.Skeleton.h, Motive.Skeleton.uo, Motive.Skeleton.vo]).toEqual([
      64, 48, 192, 64,
    ]);
  });

  it('四张 isPublic=false 的（Earth/Wind/Fire/Water）**在列表里**但不会被随机选中', () => {
    const list = Motive.getAllMotivesAsList();
    const priv = list.filter((m) => !m.isPublic).map((m) => m.name);
    expect(priv).toEqual(['Earth', 'Wind', 'Fire', 'Water']);
  });

  it('MAX_MOTIVE_NAME_LENGTH 是 13', () => {
    expect(Motive.MAX_MOTIVE_NAME_LENGTH).toBe(13);
  });
});

describe('Painting（D7）', () => {
  it('三参构造（带画作名）：直接指定，尺寸跟着画作走', () => {
    buildWall();
    const p = new Painting(level, X, Y, Z, Direction.NORTH, 'Pointer');
    expect(p.motive).toBe(Motive.Pointer);
    expect(p.getWidth()).toBe(64);
    expect(p.getHeight()).toBe(64);
    expect(p.getEntityTypeId()).toBe(EntityTypes.IdPainting);
    expect(p.entityRendererId, '渲染器 id 也在构造里设了').toBe(
      EntityRendererId.ER_PAINTING_RENDERER,
    );

    // ⚠ 用一张**不是正方形**的画作再钉一次：Pointer 是 64×64，
    // 只拿它测的话把 getWidth 写成返回 h 也看不出来（实测这条扰动就是这么漏过去的）
    const q = new Painting(level, X, Y, Z, Direction.NORTH, 'Fighters');
    expect(q.getWidth()).toBe(64);
    expect(q.getHeight()).toBe(32);
    const r = new Painting(level, X, Y, Z, Direction.NORTH, 'Wanderer');
    expect(r.getWidth()).toBe(16);
    expect(r.getHeight()).toBe(32);
  });

  it('画作名查不到 → 落到 DefaultImage', () => {
    buildWall();
    const p = new Painting(level, X, Y, Z, Direction.NORTH, '没有这张');
    expect(p.motive).toBe(Motive.DefaultImage);
  });

  it('五参构造：setRandomMotive 选一张**挂得住**的，且一定是 isPublic 的', () => {
    buildWall();
    const p = new Painting(level, X, Y, Z, Direction.NORTH);
    expect(Motive.getAllMotivesAsList()).toContain(p.motive);
    expect(p.motive!.isPublic, '选出来的必须是可以随机到的那一档').toBe(true);
    // 选完之后位置是按这张画的尺寸重算过的
    expect(p.dir).toBe(Direction.NORTH);
  });

  it('完全没有墙时 → 一张都挂不住 → 用 DefaultImage', () => {
    const p = new Painting(level, X, Y, Z, Direction.NORTH); // 墙没建
    expect(p.motive).toBe(Motive.DefaultImage);
  });

  it('isPickable 恒 true', () => {
    buildWall();
    const p = new Painting(level, X, Y, Z, Direction.NORTH, 'Kebab');
    expect(p.isPickable()).toBe(true);
  });

  describe('存档往返', () => {
    it('Motive 按名字存，读回来是同一张画', () => {
      buildWall();
      const p = new Painting(level, X, Y, Z, Direction.NORTH, 'BurningSkull');
      const tag = new CompoundTag();
      expect(p.save(tag)).toBe(true);
      expect(tag.getString('Motive')).toBe('BurningSkull');

      const back = new Painting(level);
      back.load(tag);
      expect(back.motive).toBe(Motive.BurningSkull);
      // 父类的那些也读回来了
      expect([back.xTile, back.yTile, back.zTile]).toEqual([X, Y, Z]);
      expect(back.dir).toBe(Direction.NORTH);
    });

    it('存的名字不在表里 → 读回来是 DefaultImage（老存档/坏存档）', () => {
      const tag = new CompoundTag();
      tag.putString('Motive', 'Aztec'); // 就是那个"查不到"的
      tag.putByte('Direction', Direction.NORTH);
      tag.putInt('TileX', 1);
      tag.putInt('TileY', 2);
      tag.putInt('TileZ', 3);
      const p = new Painting(level);
      p.load(tag);
      expect(p.motive).toBe(Motive.DefaultImage);
    });
  });

  describe('dropItem', () => {
    it('创造模式不掉（原句那个 GameType 判断）', () => {
      buildWall();
      const p = new Painting(level, X, Y, Z, Direction.NORTH, 'Kebab');
      level.addEntity(p);
      level.getLevelData().setGameType(GameType.Creative);
      const before = level.entities.length;
      p.dropItem();
      expect(level.entities.length, '创造模式什么都不掉').toBe(before);
    });

    it('生存模式掉一个画', () => {
      buildWall();
      const p = new Painting(level, X, Y, Z, Direction.NORTH, 'Kebab');
      level.addEntity(p);
      level.getLevelData().setGameType(GameType.Survival);
      const before = level.entities.length;
      p.dropItem();
      expect(level.entities.length).toBe(before + 1);
    });
  });

  describe('HangingEntityItem 接线', () => {
    it('createEntity 认 IdPainting，造出来的是真 Painting', () => {
      buildWall();
      const item = new HangingEntityItem(65, EntityTypes.IdPainting);
      // createEntity 是 private，走 useOnByPlayer 那条真路
      const player = { abilities: { instabuild: true } } as unknown as Parameters<
        HangingEntityItem['useOnByPlayer']
      >[1];
      const inst = { count: 1 } as unknown as Parameters<HangingEntityItem['useOnByPlayer']>[0];
      const before = level.entities.length;
      expect(item.useOnByPlayer(inst, player, level, X, Y, Z, 3, 0, 0, 0)).toBe(true);
      expect(level.entities.length).toBe(before + 1);
      expect(level.entities[level.entities.length - 1]).toBeInstanceOf(Painting);
      expect(inst.count, '成功挂上之后数量减一').toBe(0);
    });

    it('挂不住（没墙）时数量不减、也不进世界', () => {
      const item = new HangingEntityItem(65, EntityTypes.IdPainting);
      const player = { abilities: { instabuild: true } } as unknown as Parameters<
        HangingEntityItem['useOnByPlayer']
      >[1];
      const inst = { count: 1 } as unknown as Parameters<HangingEntityItem['useOnByPlayer']>[0];
      const before = level.entities.length;
      item.useOnByPlayer(inst, player, level, X, Y, Z, 3, 0, 0, 0);
      expect(level.entities.length).toBe(before);
      expect(inst.count).toBe(1);
    });
  });
});
