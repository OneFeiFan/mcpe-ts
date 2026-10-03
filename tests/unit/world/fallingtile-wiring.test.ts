import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Random } from '@mcpe/util';
import {
  FallingTile,
  HeavyTile,
  type Level,
  SandTile,
  Tile,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D2：把 FallingTile 接到线上。D1 测的是**类本身**，这里测的是**接线**。
//
// 【为什么单独开一个文件】这一步最容易抄错的地方是 HeavyTile 和 SandTile 那两段
// `checkSlide` **长得像但不一样**——C++ 里 SandTile 是 `public Tile`，不是 HeavyTile 的子类，
// 那段代码是**抄了两遍**的，两遍之间有肉眼容易漏掉的差异。这里的断言专门钉那几处差异；
// 抄错任何一处，这个文件就会红。
//
// 平台位置照 fallingtile.test.ts 的说明：平坦世界只有区块 7–9（方块 x/z 112..159）有地形，
// 地表草方块在 y=63，所以 y=64 是第一个空位。下面所有用例都放在 X=Z=130。

let level: Level;
const X = 130;
const Z = 130;

/** 记录 falling() 被调了几次、传的是谁 */
class RecordingHeavyTile extends HeavyTile {
  public fallingCalls: FallingTile[] = [];
  override falling(entity: FallingTile): void {
    this.fallingCalls.push(entity);
  }
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  prepareLevel(level);
});

/**
 * 清掉前一条用例留下的方块和实体，保证互不影响。
 *
 * ⚠ `level.removeEntity(e)` **只是把 e.removed 置真**，真正从 `entities` 数组里摘掉
 * 发生在 `tickEntities` 里（Level.ts:1147-1157）。所以清空实体列表必须补一次 `tickEntities()`
 * ——漏了这步的话，后面用例的 `entities[0]` 会抓到前一条留下的、已经 removed 的实体，
 * 而它们是"跳过的"，看起来就像什么都没发生（第一版就是这么假绿的）。
 */
beforeEach(() => {
  for (let y = 64; y <= 100; y++) level.setTileNoUpdate(X, y, Z, 0);
  for (const e of level.entities.slice()) level.removeEntity(e);
  level.tickEntities();
  Tile.tiles[200] = null;
  Tile.tiles[201] = null;
  Tile.tiles[202] = null;
  HeavyTile.instaFall = false;
  SandTile.instaFall = false;
  level.isClientSide = false;
});

describe('FallingTile 接线（D2）', () => {
  describe('两个类的结构关系（别"统一"它们）', () => {
    it('SandTile 不是 HeavyTile 的子类，instaFall 也是两个独立的静态量', () => {
      // C++: `class SandTile: public Tile` —— 段代码是抄了两遍的，不是继承来的
      expect(Object.getPrototypeOf(SandTile.prototype)).toBe(Tile.prototype);
      expect(SandTile.prototype instanceof HeavyTile).toBe(false);
      // 各自一个 `static bool instaFall`，改一个不该动另一个
      HeavyTile.instaFall = true;
      expect(SandTile.instaFall).toBe(false);
      HeavyTile.instaFall = false;
      SandTile.instaFall = true;
      expect(HeavyTile.instaFall).toBe(false);
    });
  });

  describe('HeavyTile 那条路（三句：new → falling → addEntity）', () => {
    it('端到端：造出实体 → 实体自己往下落 → 落地把方块放回去', () => {
      const heavy = new RecordingHeavyTile(200, 0);
      Tile.tiles[200] = heavy;
      level.setTileNoUpdate(X, 70, Z, 200);

      heavy.tick(level, X, 70, Z, level.random);

      // 三句里的前两句：实体造出来了，而且 falling() 收到的是同一个对象
      expect(level.entities.length).toBe(1);
      const e = level.entities[0] as FallingTile;
      expect(e).toBeInstanceOf(FallingTile);
      expect(heavy.fallingCalls).toEqual([e]);
      expect(e.getLevel()).toBe(level);

      // 还没清：清方块的是 FallingTile::tick() 的第一刻，此时实体还没被 tick
      expect(level.getTile(X, 70, Z)).toBe(200);

      // 跑起来：第一刻清掉原位置，然后一路落到 y=64 把方块放回去
      for (let i = 0; i < 200 && !e.removed; i++) level.tickEntities();

      expect(e.removed).toBe(true);
      expect(level.getTile(X, 70, Z)).toBe(0);
      expect(level.getTile(X, 64, Z)).toBe(200);
      expect(level.getTile(X, 63, Z)).toBe(Tile.grass.id); // 没穿地
    });

    it('把下方那格的 data 原样传给实体（`level->getData(x, y, z)` 那一句）', () => {
      const heavy = new HeavyTile(200, 0);
      Tile.tiles[200] = heavy;
      level.setTileNoUpdate(X, 70, Z, 200);
      level.setData(X, 70, Z, 7); // 原句读的是**自己这一格**的 data，不是下面那格

      heavy.tick(level, X, 70, Z, level.random);

      const e = level.entities[0] as FallingTile;
      expect(e.data).toBe(7);
    });

    it('isClientSide 时 tick() 直接返回，既不出实体也不动方块', () => {
      const heavy = new RecordingHeavyTile(200, 0);
      Tile.tiles[200] = heavy;
      level.setTileNoUpdate(X, 70, Z, 200);
      level.isClientSide = true;

      heavy.tick(level, X, 70, Z, level.random);

      expect(level.entities.length).toBe(0);
      expect(heavy.fallingCalls).toEqual([]);
      expect(level.getTile(X, 70, Z)).toBe(200);
    });

    it('isClientSide 时连 instaFall 那条支路也拦住 —— 这条才真正钉住 tick() 里那道守卫', () => {
      // 【为什么单开一条】HeavyTile 的 isClientSide **写了两遍**：tick() 里一道，
      // checkSlide 的 else 分支上还有一道。只测上面那条"造不造实体"的话，
      // 把 tick() 里那道删掉，else 那道还挡着，测试照样全绿 —— **实测过，是个无效扰动**。
      // instaFall 走的是另一支（setTile 搬方块），只有 tick() 那道守得住它。
      const heavy = new HeavyTile(200, 0);
      Tile.tiles[200] = heavy;
      level.setTileNoUpdate(X, 70, Z, 200);
      level.isClientSide = true;
      HeavyTile.instaFall = true;

      heavy.tick(level, X, 70, Z, level.random);

      expect(level.getTile(X, 70, Z), '方块没被搬走').toBe(200);
      expect(level.getTile(X, 64, Z)).toBe(0);
    });
  });

  describe('SandTile 那条路（两句，且和上面不一样）', () => {
    it('不传 data：下面那格 data 是 7，实体拿到的仍是默认值 0', () => {
      const sand = new SandTile(202, 0);
      Tile.tiles[202] = sand;
      level.setTileNoUpdate(X, 70, Z, 202);
      level.setData(X, 70, Z, 7);

      sand.tick(level, X, 70, Z, level.random);

      expect(level.entities.length).toBe(1);
      const e = level.entities[0] as FallingTile;
      expect(e).toBeInstanceOf(FallingTile);
      expect(e.tile).toBe(202);
      expect(e.data, 'C++ 这里没传第 6 个参数，走的是默认值').toBe(0);
    });

    it('tick() 和 checkSlide 都**没有** isClientSide 守卫，客户端也照造', () => {
      const sand = new SandTile(202, 0);
      Tile.tiles[202] = sand;
      level.setTileNoUpdate(X, 70, Z, 202);
      level.isClientSide = true;

      sand.tick(level, X, 70, Z, level.random);

      // 对照：同一种情况 HeavyTile 一个实体都不出（上一条用例），SandTile 出
      expect(level.entities.length).toBe(1);
      expect(level.entities[0]).toBeInstanceOf(FallingTile);
    });

    it('客户端 + instaFall 时方块真的落到底（HeavyTile 那边被 tick() 的守卫拦住）', () => {
      const sand = new SandTile(202, 0);
      Tile.tiles[202] = sand;
      level.setTileNoUpdate(X, 70, Z, 202);
      level.isClientSide = true;
      SandTile.instaFall = true;

      sand.tick(level, X, 70, Z, level.random);

      expect(level.getTile(X, 70, Z)).toBe(0);
      expect(level.getTile(X, 64, Z)).toBe(202);
    });

    it('不会调 falling()（SandTile 根本没有这个钩子）', () => {
      const sand = new SandTile(202, 0);
      expect((sand as unknown as Record<string, unknown>)['falling']).toBeUndefined();
      // 顺带：onLand 也是 HeavyTile 专有的
      expect((sand as unknown as Record<string, unknown>)['onLand']).toBeUndefined();
    });

    it('端到端：沙砾也走同一条落下来再放回去的路', () => {
      const sand = new SandTile(202, 0);
      Tile.tiles[202] = sand;
      level.setTileNoUpdate(X, 70, Z, 202);

      sand.tick(level, X, 70, Z, level.random);
      const e = level.entities[0] as FallingTile;
      for (let i = 0; i < 200 && !e.removed; i++) level.tickEntities();

      expect(level.getTile(X, 70, Z)).toBe(0);
      expect(level.getTile(X, 64, Z)).toBe(202);
    });
  });

  describe('实体落点坐标（x + 0.5f 那三个字面量）', () => {
    it('实体站在方块中心偏 0.5，x/y/z 都是 float 加法', () => {
      const heavy = new HeavyTile(201, 0);
      Tile.tiles[201] = heavy;
      level.setTileNoUpdate(X, 70, Z, 201);

      heavy.tick(level, X, 70, Z, level.random);

      const e = level.entities[0] as FallingTile;
      expect([e.x, e.y, e.z]).toEqual([X + 0.5, 70.5, Z + 0.5]);
      // 逐位确认包了 f()：整数 + 0.5 在 float 里是精确的，这里对得上就说明没走 double 再截断
      expect(e.x).toBe(Math.fround(X + Math.fround(0.5)));
    });
  });

  describe('instaFall 那条支路不受接线影响', () => {
    it('instaFall 为真时直接落到底，不造实体', () => {
      const heavy = new RecordingHeavyTile(200, 0);
      Tile.tiles[200] = heavy;
      level.setTileNoUpdate(X, 70, Z, 200);
      HeavyTile.instaFall = true;

      heavy.tick(level, X, 70, Z, level.random);

      expect(level.entities.length).toBe(0);
      expect(heavy.fallingCalls).toEqual([]);
      expect(level.getTile(X, 70, Z)).toBe(0);
      expect(level.getTile(X, 64, Z)).toBe(200);
    });
  });
});
