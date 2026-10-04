/**
 * 1:1 移植自 src/world/entity/animal/Animal.h 与 .cpp（92 行 + 头 39 行）。
 *
 * "动物"这一层：比 `AgableMob` 多了"被打就跑"（`hurt` 里设 `fleeTime`）、
 * "只在草地上生成"、以及"不被距离卸载"。
 *
 * 【ADAPTED(Cpp)：C++ 是双继承】`class Animal: public AgableMob, public Creature`，
 * 而 `Creature` 是个**空接口**（`class Creature {};`，整个头文件就这一行）。
 * JS 没有多继承、也没有空接口这回事，所以这里只继承 `AgableMob`。
 *
 * 【两处只写不读的字段/改写，照抄】
 *   1. `inLove` 是 private：构造时置 0、`hurt` 里清 0 —— 全参考源码里**一处读它都没有**
 *      （繁殖逻辑整块被 `//` 注释掉了，Animal.cpp:49-57）。照抄成私有字段，不删。
 *   2. C++ 把 `getWalkTargetValue` 在 Animal 里收成了 `protected`；TS 不允许子类把基类的
 *      **public** 成员收窄，所以这里只能是 public（同 AgableMob 那两个 NBT 方法的理由）。
 *
 * 【`getBreedOffspring` 全参考源码零调用方】—— 它只定义在 Chicken/Cow/Pig 里，
 * 没有任何基类声明、也没有任何调用点（Sheep 那份还被注释掉了）。属于死代码，照抄。
 */
import { SharedConstants } from '@mcpe/core';
import { Mth } from '@mcpe/util';
import type { Entity } from '../Entity';
import { MobTypes } from '../EntityTypes';
import type { Level } from '../../level/Level';
import { Tile } from '../../level/tile/Tile';
import { AgableMob } from '../AgableMob';

const f = Math.fround;

export abstract class Animal extends AgableMob {
  private inLove!: number;

  /** C++ `Animal(Level* level)` */
  constructor(level: Level) {
    super(level);
    this.inLove = 0;
  }

  /** C++ `bool Animal::hurt(Entity* source, int dmg)` */
  override hurt(source: Entity | null, dmg: number): boolean {
    this.fleeTime = 3 * SharedConstants.TicksPerSecond;
    this.attackTargetId = 0;
    this.inLove = 0;
    return super.hurt(source, dmg);
  }

  /** C++ `bool Animal::canSpawn()` —— 脚下必须是草方块，而且那里够亮 */
  override canSpawn(): boolean {
    const xt = Mth.floor(this.x);
    const yt = Mth.floor(this.bb.y0);
    const zt = Mth.floor(this.z);
    return (
      this.level.getTile(xt, yt - 1, zt) === Tile.grass.id &&
      this.level.getRawBrightness(xt, yt, zt) > 8 &&
      super.canSpawn()
    );
  }

  /** C++ `int Animal::getAmbientSoundInterval()` */
  override getAmbientSoundInterval(): number {
    return 12 * SharedConstants.TicksPerSecond;
  }

  /** C++ `float Animal::getWalkTargetValue(int x, int y, int z)` —— 草上方值 10，否则亮度减 0.5 */
  override getWalkTargetValue(x: number, y: number, z: number): number {
    if (this.level.getTile(x, y - 1, z) === Tile.grass.id) return 10;
    return f(this.level.getBrightness(x, y, z) - f(0.5));
  }

  /** C++ `Entity* Animal::findAttackTarget()` */
  protected override findAttackTarget(): Entity | null {
    return null;
  }

  /** C++ `bool Animal::removeWhenFarAway()` */
  protected override removeWhenFarAway(): boolean {
    return false;
  }

  /** C++ `int Animal::getCreatureBaseType() const` */
  override getCreatureBaseType(): number {
    return MobTypes.BaseCreature;
  }
}
