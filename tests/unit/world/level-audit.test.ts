/**
 * Level.ts 全量审核（W61）的回归测试。
 * 这里锁的有两类东西：
 * - 审核里改掉的类型契约：C++ protected 的成员、loadPlayer 的必填参数；
 * - 看起来像 bug、实际参考 C++ 就是这样的行为：removePlayer 删除后不调整下标、
 *   getEntitiesOfType/Class 的计数缺陷、setInitialSpawn 的随机数取数顺序、getSeenPercent 的采样次数。
 * 随机数顺序只覆盖“按从左到右求值”，见 Level.ts 里的 DEFERRED(待确认)。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import {
  AABB,
  HitResult,
  initItems,
  initTileEntities,
  Level,
  LevelConstants,
  LevelListener,
  Player,
  Vec3,
} from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

class TestPlayer extends Player {}

/** 统计 levelEvent 分发次数，用来观察监听器是否还在列表里 */
class CountingListener extends LevelListener {
  public count = 0;
  override levelEvent(): void {
    this.count++;
  }
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  createFlatLevel(); // 先注册方块：initItems 会读 Tile.grass.id（与真机 initTiles → initItems 的顺序一致）
  initItems();
  initTileEntities();
});

describe('W61 类型契约与 C++ 一致', () => {
  it('entityAdded / entityRemoved / setZombieAi 保持 C++ 的 protected', () => {
    // @ts-expect-error C++ Level.h 把 entityAdded 放在 protected 段
    const a = (): unknown => Level.prototype.entityAdded;
    // @ts-expect-error C++ Level.h 把 entityRemoved 放在 protected 段
    const b = (): unknown => Level.prototype.entityRemoved;
    // @ts-expect-error C++ Level.h 把 setZombieAi 放在 protected 段
    const c = (): unknown => Level.prototype.setZombieAi;
    void a;
    void b;
    void c;
  });

  it('loadPlayer 与 C++ 一样必须传 doAddPlayer', () => {
    const level = createFlatLevel();
    // @ts-expect-error C++ Level.h 的 loadPlayer 没有默认参数
    const bad = (): void => level.loadPlayer(null);
    void bad;
  });
});

describe('W61 原样保留的 C++ 行为', () => {
  it('isNightMode 返回 int 0/1', () => {
    const level = createFlatLevel();
    expect(level.isNightMode()).toBe(0);
    level.setNightMode(true);
    expect(level.isNightMode()).toBe(1);
  });

  it('removeListener 找不到监听器时是空操作（ADAPTED(Safety)）', () => {
    const level = createFlatLevel();
    const a = new CountingListener();
    const b = new CountingListener();
    level.addListener(a);
    level.addListener(b);
    level.removeListener(new CountingListener());
    level.levelEvent(null, 0, 0, 0, 0, 0);
    expect(a.count).toBe(1);
    expect(b.count).toBe(1);
  });

  it('removeListener 命中时只删第一个匹配项', () => {
    const level = createFlatLevel();
    const a = new CountingListener();
    level.addListener(a);
    level.addListener(a);
    level.removeListener(a);
    level.levelEvent(null, 0, 0, 0, 0, 0);
    expect(a.count).toBe(1);
  });

  it('removePlayer 删除后不调整下标：相邻的重复引用只删掉一个', () => {
    const level = createFlatLevel();
    const p = new TestPlayer(level, false);
    level.players.push(p, p);
    level.removePlayer(p);
    expect(level.players.length).toBe(1);
    expect(level.players[0]).toBe(p);
  });

  it('getEntitiesOfType / getEntitiesOfClass 照抄 C++ 的计数缺陷', () => {
    const level = createFlatLevel();
    const dummy = new TestPlayer(level, false);
    const list = [dummy];
    const bb = new AABB(0, 0, 0, 1, 1, 1);
    // C++: count = -list.size(); return list.size() - count; 空世界没有实体加进来，
    // 于是非空入参时返回值是“初始长度 + 初始长度”，不是新增数量。
    expect(level.getEntitiesOfType(0, bb, list)).toBe(2);
    expect(level.getEntitiesOfClass(0, bb, list)).toBe(2);
  });

  it('setInitialSpawn 第一轮循环按从左到右取四个随机数', () => {
    const level = createFlatLevel();
    level.random.setSeed(12345);
    const expected = new Random(12345);
    const dx1 = expected.nextInt(32);
    const dx2 = expected.nextInt(32);
    const dz1 = expected.nextInt(32);
    const dz2 = expected.nextInt(32);
    let x = 128 + dx1 - dx2;
    let z = 128 + dz1 - dz2;
    if (x < 4) x += 32;
    if (x >= LevelConstants.LEVEL_WIDTH - 4) x -= 32;
    if (z < 4) z += 32;
    if (z >= LevelConstants.LEVEL_DEPTH - 4) z -= 32;

    const isValidSpawn = vi
      .spyOn(level.dimension, 'isValidSpawn')
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    level.setInitialSpawn();
    expect(isValidSpawn).toHaveBeenCalledTimes(2);
    const pos = level.getSharedSpawnPos();
    expect([pos.x, pos.y, pos.z]).toEqual([x, 64, z]);
  });

  it('getSeenPercent 对单位包围盒采样 4×4×4 次', () => {
    const level = createFlatLevel();
    const clip = vi.spyOn(level, 'clip').mockReturnValue(new HitResult());
    const seen = level.getSeenPercent(new Vec3(0.5, 0.5, 0.5), new AABB(0, 0, 0, 1, 1, 1));
    expect(clip).toHaveBeenCalledTimes(64);
    expect(seen).toBe(1);
  });
});
