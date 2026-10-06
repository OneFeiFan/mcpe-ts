/**
 * 1:1 移植自 src/world/level/MobSpawner.h 与 MobSpawner.cpp（任务单 H9）：自然刷怪。
 * - tick：友好生物（每 400 刻一次）轮询全部 16×16 个区块；怪物只轮询当前轮到的那个玩家周围 8 个区块半径内；
 *   每个区块随机取一点，按类别的生成材质与位置条件，三轮、每轮最多四次随机游走地放一群（离玩家与出生点至少 24 格）。
 * - postProcessSpawnMobs：生成区块时放动物（调用点在 RandomLevelSource.postProcess 里，那一段地物生成在 TS 里还没移植，
 *   所以目前没有人调用它——函数本身照抄）。
 * - finalizeMobSettings：羊随机毛色；makeBabyMob：动物有 50% 概率生成幼崽（用一个固定种子 98495119 的静态 Random）。
 * 原样保留的 C++ 行为：
 *   - 一群满员时 `goto chunkLoop` 跳回区块循环**之前**——区块列表从头再轮一遍（不是继续下一个区块）。TS 用带标签的 continue 表达。
 *     怪物有“同类数量上限”挡着；友好生物只在每 400 刻那一次里会这样多放几群。
 *   - std::map<ChunkPos, bool> 按 ChunkPos::operator<（只比 hashCode）排序、去重。
 *   - y 方向的随机偏移 `nextInt(1) - nextInt(1)` 恒为 0，但仍消耗两次随机数。
 * static 局部变量（_pid、babyRandom）→ 模块级状态（ADAPTED(Cpp)）。
 */
import { SharedConstants } from '@mcpe/core';
import { Random, WeighedRandom } from '@mcpe/util';
import type { Animal } from '../entity/animal/Animal';
import { Sheep } from '../entity/animal/Sheep';
import { MobTypes } from '../entity/EntityTypes';
import type { Mob } from '../entity/Mob';
import { MobCategory } from '../entity/MobCategory';
import { MobFactory } from '../entity/MobFactory';
import { Biome, MobSpawnerData } from './biome/Biome';
import { ChunkPos } from './ChunkPos';
import { Level } from './Level';
import { LevelConstants } from './LevelConstants';
import { Material } from './material/Material';

const f = Math.fround;
const MIN_SPAWN_DISTANCE = 24;
/** MobSpawner.cpp 的 _bedEnemies（这一版没有任何代码读它） */
const bedEnemies: readonly number[] = [MobTypes.Spider, MobTypes.Zombie, MobTypes.Skeleton, MobTypes.PigZombie];
/** MobSpawner::tick 的 static unsigned int _pid、makeBabyMob 的 static Random babyRandom(98495119L) */
const statics = { pid: 0, babyRandom: null as Random | null };

export class MobSpawner {
  static readonly bedEnemies = bedEnemies;

  static tick(level: Level, spawnEnemies: boolean, spawnFriendlies: boolean): number {
    if (!spawnEnemies && !spawnFriendlies) {
      return 0;
    }
    const keys = new Map<number, ChunkPos>(); // std::map<ChunkPos, bool>：按 hashCode 去重
    if (spawnFriendlies) {
      spawnEnemies = false;
      for (let i = 0; i < 256; ++i) {
        const cp = new ChunkPos(i >> 4, i & 15);
        if (!keys.has(cp.hashCode())) keys.set(cp.hashCode(), cp);
      }
    } else {
      if (++statics.pid >= level.players.length) statics.pid = 0;
      if (level.players.length) {
        const p = level.players[statics.pid]!;
        const xx = Math.floor(f(p.x / 16));
        const zz = Math.floor(f(p.z / 16));
        const r = Math.trunc(128 / 16);
        for (let x = -r; x <= r; x++)
          for (let z = -r; z <= r; z++) {
            const cx = xx + x;
            const cz = zz + z;
            if (cx >= 0 && cx < 16 && cz >= 0 && cz < 16) {
              const cp = new ChunkPos(cx, cz);
              if (!keys.has(cp.hashCode())) keys.set(cp.hashCode(), cp);
            }
          }
      }
    }
    const chunksToPoll = [...keys.values()].sort((a, b) => a.hashCode() - b.hashCode());
    let count = 0;
    const spawnPos = level.getSharedSpawnPos();
    for (let i = 0; i < MobCategory.numValues; ++i) {
      const mobCategory = MobCategory.values[i]!;
      if ((mobCategory.isFriendly() && !spawnFriendlies) || (!mobCategory.isFriendly() && !spawnEnemies)) continue;
      const numMobs = level.countInstanceOfBaseType(mobCategory.getBaseClassId());
      if (numMobs > mobCategory.getMaxInstancesPerLevel()) continue;
      chunkLoop: for (;;) {
        for (const cp of chunksToPoll) {
          const start = MobSpawner.getRandomPosWithin(level, cp.x * 16, cp.z * 16);
          const xStart = start[0];
          const yStart = start[1];
          const zStart = start[2];
          if (level.isSolidBlockingTile(xStart, yStart, zStart)) continue;
          if (level.getMaterial(xStart, yStart, zStart) !== mobCategory.getSpawnPositionMaterial()) continue;
          let clusterSize = 0;
          for (let dd = 0; dd < 3; dd++) {
            let x = xStart;
            let y = yStart;
            let z = zStart;
            const ss = 6;
            let currentMobType = new MobSpawnerData();
            let maxCreatureCount = 999;
            let currentCreatureCount = 0;
            for (let ll = 0; ll < 4; ll++) {
              if (currentCreatureCount > maxCreatureCount) break;
              x += level.random.nextInt(ss) - level.random.nextInt(ss);
              y += level.random.nextInt(1) - level.random.nextInt(1);
              z += level.random.nextInt(ss) - level.random.nextInt(ss);
              if (MobSpawner.isSpawnPositionOk(mobCategory, level, x, y, z)) {
                const xx = f(x + 0.5);
                const yy = f(y);
                const zz = f(z + 0.5);
                if (level.getNearestPlayer(xx, yy, zz, MIN_SPAWN_DISTANCE) !== null) {
                  continue;
                } else {
                  const xd = f(xx - spawnPos.x);
                  const yd = f(yy - spawnPos.y);
                  const zd = f(zz - spawnPos.z);
                  const sd = f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd));
                  if (sd < MIN_SPAWN_DISTANCE * MIN_SPAWN_DISTANCE) {
                    continue;
                  }
                }
                if (!currentMobType.isValid()) {
                  currentMobType = level.getRandomMobSpawnAt(mobCategory, x, y, z);
                  if (!currentMobType.isValid()) break;
                  if (mobCategory === MobCategory.monster) {
                    const typeCount = level.countInstanceOfType(currentMobType.mobClassId);
                    const typeMax = Math.trunc(Math.trunc(f(f(1.5 * currentMobType.randomWeight) * mobCategory.getMaxInstancesPerLevel())) / Biome.defaultTotalEnemyWeight);
                    if (typeCount >= typeMax) break;
                  }
                  maxCreatureCount = currentMobType.minCount + level.random.nextInt(1 + currentMobType.maxCount - currentMobType.minCount);
                }
                const tmp = MobFactory.getStaticTestMob(currentMobType.mobClassId, level);
                if (!tmp) continue;
                tmp.moveTo(xx, yy, zz, 0, 0);
                if (!tmp.canSpawn()) continue;
                const mob = MobFactory.CreateMob(currentMobType.mobClassId, level);
                if (!mob) continue;
                if (MobSpawner.addMob(level, mob, xx, yy, zz, f(level.random.nextFloat() * 360), 0, false)) {
                  ++currentCreatureCount;
                  if (++clusterSize >= mob.getMaxSpawnClusterSize()) continue chunkLoop; // goto chunkLoop
                }
                // else: delete mob
                count += clusterSize;
              }
            }
          }
        }
        break;
      }
    }
    return count;
  }

  static postProcessSpawnMobs(level: Level, biome: Biome, xo: number, zo: number, cellWidth: number, cellHeight: number, random: Random): void {
    const mobs = biome.getMobs(MobCategory.creature);
    if (mobs.length === 0) {
      return;
    }
    while (random.nextFloat() < biome.getCreatureProbability()) {
      const type = WeighedRandom.getRandomItem(level.random, mobs)!;
      const count = type.minCount + random.nextInt(1 + type.maxCount - type.minCount);
      let x = xo + random.nextInt(cellWidth);
      let z = zo + random.nextInt(cellHeight);
      const startX = x;
      const startZ = z;
      for (let c = 0; c < count; c++) {
        let success = false;
        for (let attempts = 0; !success && attempts < 4; attempts++) {
          const y = level.getTopSolidBlock(x, z);
          if (MobSpawner.isSpawnPositionOk(MobCategory.creature, level, x, y, z)) {
            const xx = f(x + 0.5);
            const yy = f(y);
            const zz = f(z + 0.5);
            const mob = MobFactory.CreateMob(type.mobClassId, level);
            if (!mob) continue;
            mob.moveTo(xx, yy, zz, f(random.nextFloat() * 360), 0);
            level.addEntity(mob);
            MobSpawner.finalizeMobSettings(mob, level, xx, yy, zz);
            success = true;
          }
          x += random.nextInt(5) - random.nextInt(5);
          z += random.nextInt(5) - random.nextInt(5);
          while (x < xo || x >= xo + cellWidth || z < zo || z >= zo + cellWidth) {
            x = startX + random.nextInt(5) - random.nextInt(5);
            z = startZ + random.nextInt(5) - random.nextInt(5);
          }
        }
      }
    }
  }

  static finalizeMobSettings(mob: Mob, level: Level, _xx: number, _yy: number, _zz: number): void {
    if (mob.getEntityTypeId() === MobTypes.Sheep) {
      (mob as Sheep).setColor(Sheep.getSheepColor(level.random));
    }
    MobSpawner.makeBabyMob(mob, f(0.5));
  }

  static isSpawnPositionOk(category: MobCategory, level: Level, x: number, y: number, z: number): boolean {
    if (category.getSpawnPositionMaterial() === Material.water) {
      return level.getMaterial(x, y, z).isLiquid() && !level.isSolidBlockingTile(x, y + 1, z);
    } else {
      return (
        level.isSolidBlockingTile(x, y - 1, z) &&
        !level.isSolidBlockingTile(x, y, z) &&
        !level.getMaterial(x, y, z).isLiquid() &&
        !level.isSolidBlockingTile(x, y + 1, z)
      );
    }
  }

  /** C++ 返回 TilePos（按值）；这里返回 [x, y, z] */
  static getRandomPosWithin(level: Level, xo: number, zo: number): [number, number, number] {
    const x = xo + level.random.nextInt(16);
    const y = level.random.nextInt(LevelConstants.LEVEL_HEIGHT) // Level::DEPTH;
    const z = zo + level.random.nextInt(16);
    return [x, y, z];
  }

  static addMob(level: Level, mob: Mob, xx: number, yy: number, zz: number, yRot: number, xRot: number, force: boolean): boolean {
    mob.moveTo(xx, yy, zz, yRot, xRot);
    if (force || mob.canSpawn()) {
      level.addEntity(mob);
      MobSpawner.finalizeMobSettings(mob, level, xx, yy, zz);
      return true;
    } else {
      return false;
    }
  }

  static makeBabyMob(mob: Mob, probability: number): void {
    if (!statics.babyRandom) statics.babyRandom = new Random(98495119);
    if (MobTypes.BaseCreature === mob.getCreatureBaseType()) {
      if (statics.babyRandom.nextFloat() < probability) (mob as Animal).setAge(-20 * 60 * SharedConstants.TicksPerSecond);
    }
  }
}

// ADAPTED(ESM)：把 tick 注入 Level（见 Level.mobSpawnerTick）
Level.mobSpawnerTick = (level, spawnEnemies, spawnFriendlies) => MobSpawner.tick(level, spawnEnemies, spawnFriendlies);
