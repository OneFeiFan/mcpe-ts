/**
 * 1:1 移植自 src/world/entity/MobFactory.h（任务单 H4）。按 MobTypes 创建生物；EntityFactory.loadEntity 读回存档里的生物用它。
 * C++ 的 getStaticTestMob 里两个 static 局部变量（_mobs、lastLevel）→ 模块级状态（ADAPTED(Cpp)）。
 */
import { LOGE } from '@mcpe/platform';
import type { Level } from '../level/Level';
import { Chicken } from './animal/Chicken';
import { Cow } from './animal/Cow';
import { Pig } from './animal/Pig';
import { Sheep } from './animal/Sheep';
import { Creeper } from './monster/Creeper';
import { PigZombie } from './monster/PigZombie';
import { Skeleton } from './monster/Skeleton';
import { Spider } from './monster/Spider';
import { Zombie } from './monster/Zombie';
import { MobTypes } from './EntityTypes';
import type { Mob } from './Mob';

const staticTestMobs = { mobs: new Map<number, Mob | null>(), lastLevel: null as Level | null };

export class MobFactory {
  static CreateMob(mobType: number, level: Level): Mob | null {
    let mob: Mob | null = null;
    switch (mobType) {
      case MobTypes.Chicken:
        mob = new Chicken(level);
        break;
      case MobTypes.Cow:
        mob = new Cow(level);
        break;
      case MobTypes.Pig:
        mob = new Pig(level);
        break;
      case MobTypes.Sheep:
        mob = new Sheep(level);
        break;
      case MobTypes.Creeper:
        mob = new Creeper(level);
        break;
      case MobTypes.Zombie:
        mob = new Zombie(level);
        break;
      case MobTypes.Skeleton:
        mob = new Skeleton(level);
        break;
      case MobTypes.Spider:
        mob = new Spider(level);
        break;
      case MobTypes.PigZombie:
        mob = new PigZombie(level);
        break;
      default:
        LOGE(`Unknown mob type requested: ${mobType}\n`);
        break;
    }
    if (mob) {
      mob.health = mob.getMaxHealth();
    }
    return mob;
  }

  static clearStaticTestMobs(): void {
    MobFactory.getStaticTestMob(0, null);
  }

  static getStaticTestMob(mobType: number, level: Level | null): Mob | null {
    const s = staticTestMobs;
    const wantClear = mobType === 0 && level === null;
    const newLevel = level !== s.lastLevel;
    s.lastLevel = level;
    if (wantClear || newLevel) {
      s.mobs.clear(); // C++ 逐个 delete
      if (wantClear) return null;
    }
    const found = s.mobs.get(mobType);
    if (found !== undefined) return found;
    const mob = MobFactory.CreateMob(mobType, level!);
    s.mobs.set(mobType, mob);
    return mob;
  }
}
