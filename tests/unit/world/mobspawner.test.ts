/**
 * 任务单 H9：MobSpawner（自然刷怪）。
 * 钉住的 C++ 行为：
 * - isSpawnPositionOk（陆地类别）：脚下实心、所在格与头顶两格都不实心、所在格不是液体；
 * - addMob：force 时无条件加入；否则看 canSpawn（白天亮处的僵尸不行）；
 * - makeBabyMob：只对动物（BaseCreature），用固定种子 98495119 的静态 Random，nextFloat() < 0.5 时 setAge(-24000)；
 * - tick：两个开关都关 → 0；只开怪物但没有玩家 → 没有区块可轮询 → 0；
 *   只开友好生物 → 轮询全部 256 个区块，放出来的都是动物，且都离出生点至少 24 格。
 * 原样保留：tick 的返回值 `count += clusterSize` 每次成功都把当前群的累计数再加一遍，所以会大于实际放出的数量。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import {
  Animal,
  Chicken,
  Difficulty,
  MobFactory,
  Player,
  initItems,
  initTileEntities,
  type Level,
  MobCategory,
  MobSpawner,
  MobTypes,
  Zombie,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
  level.difficulty = Difficulty.NORMAL;
});

describe('MobSpawner', () => {
  it('isSpawnPositionOk：平地地表上一格可以，地表那一格（草方块里）不行', () => {
    expect(MobSpawner.isSpawnPositionOk(MobCategory.creature, level, 128, 64, 128)).toBe(true);
    expect(MobSpawner.isSpawnPositionOk(MobCategory.creature, level, 128, 63, 128)).toBe(false);
    expect(MobSpawner.isSpawnPositionOk(MobCategory.creature, level, 128, 70, 128)).toBe(false); // 脚下是空气
  });

  it('addMob：force 无条件加入；否则看 canSpawn（白天亮处的僵尸不能刷）', () => {
    const n0 = level.getAllEntities().length;
    const z1 = new Zombie(level);
    expect(MobSpawner.addMob(level, z1, 120.5, 64, 120.5, 0, 0, true)).toBe(true);
    expect(level.getAllEntities().length).toBe(n0 + 1);
    const z2 = new Zombie(level);
    expect(MobSpawner.addMob(level, z2, 122.5, 64, 120.5, 0, 0, false)).toBe(false);
    expect(level.getAllEntities().length).toBe(n0 + 1);
    level.removeEntity(z1);
  });

  it('makeBabyMob：动物按固定种子 98495119 的序列决定幼崽，怪物不受影响也不消耗随机数', () => {
    const ref = new Random(98495119);
    for (let i = 0; i < 6; i++) {
      const z = new Zombie(level);
      MobSpawner.makeBabyMob(z, 0.5); // 怪物：不取随机数
      const c = new Chicken(level);
      MobSpawner.makeBabyMob(c, 0.5);
      const expectBaby = ref.nextFloat() < 0.5;
      expect((c as Animal).isBaby(), `第 ${i} 只鸡`).toBe(expectBaby);
      if (expectBaby) expect(c.getAge()).toBe(-20 * 60 * 20);
    }
  });

  it('tick：两个开关都关 → 0；只开怪物但没有玩家 → 0', () => {
    expect(MobSpawner.tick(level, false, false)).toBe(0);
    expect(level.players.length).toBe(0);
    expect(MobSpawner.tick(level, true, false)).toBe(0);
  });

  it('tick（友好生物）：放出来的都是动物，离出生点至少 24 格', () => {
    const before = new Set(level.getAllEntities());
    let total = 0;
    // 平坦测试世界只有中央 3×3 个区块有地面（x、z 112..159），而离出生点 (128, 64, 128) 24 格内不能刷——命中很稀疏，多跑几次
    for (let i = 0; i < 80 && total === 0; i++) total += MobSpawner.tick(level, false, true);
    const added = level.getAllEntities().filter((e) => !before.has(e));
    expect(added.length).toBeGreaterThan(0);
    const sp = level.getSharedSpawnPos();
    for (const e of added) {
      expect(e.getCreatureBaseType(), e.constructor.name).toBe(MobTypes.BaseCreature);
      const d = Math.hypot(e.x - sp.x, e.y - sp.y, e.z - sp.z);
      expect(d).toBeGreaterThanOrEqual(24);
    }
  });

  it('tick（怪物，夜里）：围绕玩家刷，放出来的都是怪物，离玩家与出生点都至少 24 格', () => {
    // 平坦 demo 维度沿用 Dimension 基类：getTimeOfDay 恒定、永远是白天（与 C++ 一致），所以这里直接把 skyDarken 设成夜里的值 8
    class TestPlayer extends Player {}
    const p = new TestPlayer(level, false);
    p.moveTo(128.5, 64, 128.5, 0, 0);
    level.addEntity(p);
    (level as unknown as { skyDarken: number }).skyDarken = 8;
    // 判断“能不能刷”用的是 MobFactory 缓存的测试用生物（getStaticTestMob），它的 random 默认按时间播种——这里固定种子，让结果可复现
    for (const t of [MobTypes.Spider, MobTypes.Zombie, MobTypes.Skeleton, MobTypes.Creeper])
      MobFactory.getStaticTestMob(t, level)!.random.setSeed(t * 7919);
    const before = new Set(level.getAllEntities());
    for (let i = 0; i < 20000 && level.getAllEntities().length === before.size; i++)
      MobSpawner.tick(level, true, false);
    const added = level.getAllEntities().filter((e) => !before.has(e));
    expect(added.length).toBeGreaterThan(0);
    for (const e of added) {
      expect(e.getCreatureBaseType(), e.constructor.name).toBe(MobTypes.BaseEnemy);
      expect(Math.hypot(e.x - p.x, e.y - p.bb.y0, e.z - p.z)).toBeGreaterThanOrEqual(24);
    }
    (level as unknown as { skyDarken: number }).skyDarken = 0;
    level.removeEntity(p);
  });
});
