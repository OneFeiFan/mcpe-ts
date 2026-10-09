import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';
import {
  Direction,
  type Entity,
  EntityTypes,
  HangingEntity,
  initItems,
  type Level,
  Tile,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D6：`HangingEntity`（挂件的抽象基类）。
// 它是 abstract，需要一个最小的具体子类才能实例化 —— 就用下面这个 TestHanging，
// 尺寸取 32×32（= 1×1 格，`offs()` 会返回 0.5，走的是有偏移那条路）。
//
// 平台在区块 7–9（方块 x/z 112..159），地表草在 y=63。测试点用 (130, 64, 130) 一带，
// 墙自己用石头摆。

let level: Level;
const X = 130;
const Y = 64;
const Z = 130;

class TestHanging extends HangingEntity {
  dropped = 0;
  constructor(level: Level, xTile?: number, yTile?: number, zTile?: number, dir?: number) {
    super(level, xTile ?? 0, yTile ?? 0, zTile ?? 0, dir ?? 0);
  }
  override getWidth(): number {
    return 32;
  }
  override getHeight(): number {
    return 32;
  }
  override dropItem(): void {
    this.dropped++;
  }
  // Entity 的纯虚，基类没实现（真实子类 Painting 返回 EntityTypes.IdPainting）。
  // ⚠ 不能返回 0：`Entity.save` 里有一句 `if (this.removed || id === 0) return false;` ——
  //   返回 0 的话整个实体根本存不下来（第一版就是这么让存档往返那两条红的）。
  override getEntityTypeId(): number {
    return EntityTypes.IdPainting;
  }
}

/** 在 (xTile-1..xTile, yTile..yTile+1, zTile) 摆一堵 2×2 的石头墙 */
function buildWall(xTile: number, yTile: number, zTile: number): void {
  for (let dx = -1; dx <= 0; dx++)
    for (let dy = 0; dy <= 1; dy++)
      level.setTileNoUpdate(xTile + dx, yTile + dy, zTile, Tile.rock.id);
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // ⚠ initItems 必须在 initTiles 之后（ShovelItem 构造时会读 Tile.grass.id）。
  // 先 createFlatLevel() 把 tiles 初始化掉，再 initItems()。
  createFlatLevel();
  initItems();
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  for (let y = 64; y <= 100; y++)
    for (let x = X - 4; x <= X + 4; x++)
      for (let z = Z - 4; z <= Z + 4; z++) level.setTileNoUpdate(x, y, z, 0);
});

describe('HangingEntity（D6）', () => {
  describe('构造：dir 参数被 init() 覆盖掉', () => {
    it('⚠ 五参构造传了 dir，建出来还是 0（init() 里那句 `dir = 0`）', () => {
      const e = new TestHanging(level, X, Y, Z, Direction.WEST);
      expect(e.dir, 'C++ 里这个实参被丢弃了，原样保留').toBe(0);
      // xTile/yTile/zTile 是初始化列表里存的，没被覆盖
      expect([e.xTile, e.yTile, e.zTile]).toEqual([X, Y, Z]);
    });

    it('init() 那几行：heightOffset = 0、尺寸 0.5×0.5、checkInterval = 0', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      expect(e.heightOffset).toBe(0);
      expect([e.bbWidth, e.bbHeight]).toEqual([Math.fround(0.5), Math.fround(0.5)]);
      expect((e as unknown as { checkInterval: number }).checkInterval).toBe(0);
    });
  });

  describe('setDir：位置与碰撞盒', () => {
    it('dir = NORTH(2)：贴到 zTile 这一格的 -z 面，bb 落在 zTile-1 那一格里', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setDir(Direction.NORTH);
      expect(e.dir).toBe(Direction.NORTH);
      // d = 2.0f → 2/32 = 0.0625；offset = 0.5 + 1/16 = 0.5625
      // z = zTile + 0.5 - 0.5625 = zTile - 0.0625
      expect(e.z).toBeCloseTo(Z - 0.0625, 6);
      // offs(32) = 0.5 → x = xTile + 0.5 - 0.5 = xTile；y = yTile + 0.5 + 0.5 = yTile + 1
      expect(e.x).toBeCloseTo(X, 6);
      expect(e.y).toBeCloseTo(Y + 1, 6);
      // bb：z 方向厚 2*d，另外两向 2*w = 2（w = 32/32 = 1）
      expect(e.bb.x0).toBeCloseTo(X - 1 + 0.03125, 6);
      expect(e.bb.x1).toBeCloseTo(X + 1 - 0.03125, 6);
      // yRot 在 N/S 时用的是**反方向**的 90 倍
      expect(e.yRot).toBe(Direction.DIRECTION_OPPOSITE[Direction.NORTH]! * 90);
      expect(e.yRot).toBe(e.yRotO);
    });

    it('dir = EAST(3)：走 else 分支（w = 2.0f 而不是 d），位置贴到 xTile 那一格的 +x 面', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setDir(Direction.EAST);
      // x = xTile + 0.5 + offset(0.5625) = xTile + 1.0625；z 只被 offs(width)=0.5 减掉
      expect(e.x).toBeCloseTo(X + 1.0625, 6);
      expect(e.z).toBeCloseTo(Z + 0.5 - 0.5, 6);
      // 这一支没有覆盖 yRot，用的是 `dir * 90`
      expect(e.yRot).toBe(Direction.EAST * 90);
    });

    it('每换一个方向都重算一次位置', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setDir(Direction.NORTH);
      expect(e.z).toBeCloseTo(Z + 0.5 - 0.5625, 6); // zTile 的 -z 侧
      e.setDir(Direction.SOUTH);
      expect(e.z).toBeCloseTo(Z + 0.5 + 0.5625, 6); // zTile 的 +z 侧
      e.setDir(Direction.WEST);
      expect(e.x).toBeCloseTo(X + 0.5 - 0.5625, 6);
    });
  });

  describe('survives：挂墙判定', () => {
    it('墙是实心的 → 挂得住', () => {
      buildWall(X, Y, Z);
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setDir(Direction.NORTH);
      expect(e.survives()).toBe(true);
    });

    it('墙缺一块（非实心材质）→ 挂不住', () => {
      buildWall(X, Y, Z);
      level.setTileNoUpdate(X, Y + 1, Z, 0); // 抠掉一块
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setDir(Direction.NORTH);
      expect(e.survives()).toBe(false);
    });

    it('碰撞盒里钻进别的方块 → 挂不住（getCubes 非空那条路）', () => {
      buildWall(X, Y, Z);
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setDir(Direction.NORTH);
      expect(e.survives()).toBe(true);
      // 往 bb 里塞一块石头（bb 落在 z = Z-1 那一格）
      level.setTileNoUpdate(X, Y + 1, Z - 1, Tile.rock.id);
      expect(e.survives()).toBe(false);
    });

    it('同一个 bb 里已经有另一个挂件 → 挂不住（那段检查写在 for(ss) 里面）', () => {
      buildWall(X, Y, Z);
      const a = new TestHanging(level, X, Y, Z, 0);
      a.setDir(Direction.NORTH);
      level.addEntity(a);
      expect(a.survives(), '只有自己时挂得住').toBe(true);

      const b = new TestHanging(level, X, Y, Z, 0);
      b.setDir(Direction.NORTH);
      level.addEntity(b);
      expect(a.survives(), '多了一个同位挂件 → 后加入的那个（自己）也在 entities 里吗').toBe(false);
    });
  });

  describe('tick：每 100 刻检查一次', () => {
    it('⚠ 是第 101 刻才检查，不是第 100 刻（后置自增比的是自增前的值）', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setDir(Direction.NORTH); // 没有墙 → survives() 为 false
      level.addEntity(e);

      // checkInterval 从 0 起，第 n 刻比的是 n-1；`n-1 == 100` → n = 101
      for (let i = 0; i < 100; i++) level.tickEntities();
      expect(e.removed, '第 100 刻还不检查（差一刻）').toBe(false);

      level.tickEntities(); // 第 101 刻
      expect(e.removed).toBe(true);
      expect(e.dropped).toBe(1);
    });

    it('挂得住就一直不掉，checkInterval 归零重数', () => {
      buildWall(X, Y, Z);
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setDir(Direction.NORTH);
      level.addEntity(e);
      for (let i = 0; i < 250; i++) level.tickEntities();
      expect(e.removed).toBe(false);
      expect(e.dropped).toBe(0);
      expect((e as unknown as { checkInterval: number }).checkInterval).toBeLessThan(100);
    });
  });

  describe('被打 / 被推', () => {
    it('hurt：掉东西 + remove，返回 true', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      level.addEntity(e);
      expect(e.hurt(null, 1)).toBe(true);
      expect(e.removed).toBe(true);
      expect(e.dropped).toBe(1);
    });

    it('interact：拿弓时不响应（原句那条检查）；否则掉东西 + remove', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      level.addEntity(e);
      // 用一个只有 inventory 的最小替身
      const noBow = {
        inventory: { getSelected: () => ({ id: 1 }) },
        abilities: { instabuild: false },
      } as unknown as Parameters<HangingEntity['interact']>[0];
      expect(e.interact(noBow)).toBe(true);
      expect(e.removed).toBe(true);
      expect(e.dropped).toBe(1);
    });

    it('move / push：只要位移不为 0 就掉东西 + remove', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      level.addEntity(e);
      e.move(0, 0, 0);
      expect(e.removed, '位移为 0 时什么都不做').toBe(false);
      e.push(0.1, 0, 0);
      expect(e.removed).toBe(true);
      expect(e.dropped).toBe(1);
    });

    it('客户端上 move 不动它', () => {
      level.isClientSide = true;
      const e = new TestHanging(level, X, Y, Z, 0);
      e.move(1, 0, 0);
      expect(e.removed).toBe(false);
    });
  });

  describe('存档往返', () => {
    it('同时写 Direction 和 Dir，读的时候优先 Direction', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setDir(Direction.WEST);
      const tag = new CompoundTag();
      e.save(tag);
      expect(tag.contains('Direction')).toBe(true);
      expect(tag.contains('Dir')).toBe(true);
      // Dir 是重映射过的：WEST → 1，Direction 是原值 WEST = 1（这版刚好一样，用 EAST 区分）
      const e2 = new TestHanging(level, X, Y, Z, 0);
      e2.setDir(Direction.EAST);
      const tag2 = new CompoundTag();
      e2.save(tag2);
      expect(tag2.getByte('Direction')).toBe(Direction.EAST);
      expect(tag2.getByte('Dir'), 'Dir 是 0..3 的重映射：EAST → 3').toBe(3);

      const back = new TestHanging(level);
      back.load(tag2);
      expect(back.dir).toBe(Direction.EAST);
      expect([back.xTile, back.yTile, back.zTile]).toEqual([X, Y, Z]);
    });

    it('没有 Direction 时退回读 Dir（老存档路径）', () => {
      const tag = new CompoundTag();
      tag.putByte('Dir', 0); // 0 → NORTH
      tag.putInt('TileX', 7);
      tag.putInt('TileY', 8);
      tag.putInt('TileZ', 9);
      const e = new TestHanging(level);
      e.load(tag);
      expect(e.dir).toBe(Direction.NORTH);
      expect([e.xTile, e.yTile, e.zTile]).toEqual([7, 8, 9]);
    });
  });

  describe('零碎', () => {
    it('isHangingEntity 为 true，isPickable 为 true', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      expect(e.isHangingEntity()).toBe(true);
      expect(e.isPickable()).toBe(true);
    });

    it('getBrightness：区块在就取亮度，不在就返回 0', () => {
      buildWall(X, Y, Z);
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setDir(Direction.NORTH);
      // 用的是**实体当前位置**的格子（那两个局部变量遮蔽了成员），不是挂的格子
      const want = level.getBrightness(Mth.floor(e.x), Mth.floor(e.y), Mth.floor(e.z));
      expect(e.getBrightness(0)).toBe(want);
      // 换个位置结果也跟着变
      e.setPos(X + 0.5, 80, Z + 0.5);
      const want2 = level.getBrightness(X, 80, Z);
      expect(e.getBrightness(0)).toBe(want2);
    });

    it('setPosition 只改格子坐标，不动位置', () => {
      const e = new TestHanging(level, X, Y, Z, 0);
      e.setPos(1, 2, 3);
      e.setPosition(4, 5, 6);
      expect([e.xTile, e.yTile, e.zTile]).toEqual([4, 5, 6]);
      expect([e.x, e.y, e.z]).toEqual([1, 2, 3]);
    });
  });
});

// 让 TS 知道 Entity 被用到了（interact 的形参类型引用了它）
export type _EntityUsed = Entity;
