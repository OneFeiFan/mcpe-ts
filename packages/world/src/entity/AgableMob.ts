/**
 * 1:1 移植自 src/world/entity/AgableMob.h 与 .cpp（53 行 + 头 30 行）—— 完整移植。
 *
 * "会长大的生物"那一层：一个 age 计数器 + 一个同步标志（`isBaby` 走网络同步给客户端，
 * 因为客户端不跑 `aiStep`、age 不会自己变）。
 *
 * 【两处原样的怪癖】
 *   1. 构造函数里 `age` 先被初始化成 **-1**，紧接着 `setAge(0)` —— 也就是"出生即成年"。
 *      走的是 `setAge` 里 `age < 0 && age >= 0` 那条分支：**清掉** ISBABY 标志。
 *      照抄，别"顺手"改成从 -1 开始（那会让新生成的生物全是幼崽）。
 *   2. `isBaby()` 分两条路：**服务端看 `age < 0`**，**客户端看同步标志**。原样。
 *
 * 【同步标志】`DATA_FLAGS_ID = 14`、`DATAFLAG_ISBABY = 0`。
 * C++ 的 `entityData.define(DATA_FLAGS_ID, (TypeChar)0)` → TS `defineByte(14, 0)`；
 * `setFlag/clearFlag/getFlag<T>(id, flag)` 里的 flag 是**位号**（TS 的 SynchedEntityData 同语义）。
 * id 14 和 `Mob` 的共享标志（0）、空气（1）都不撞。
 */
import type { CompoundTag } from '@mcpe/nbt';
import type { Level } from '../level/Level';
import { PathfinderMob } from './PathfinderMob';

export abstract class AgableMob extends PathfinderMob {
  private age!: number;

  /** C++ `static const int DATA_FLAGS_ID = 14;` */
  private static readonly DATA_FLAGS_ID = 14;
  /** C++ `static const int DATAFLAG_ISBABY = 0;` */
  private static readonly DATAFLAG_ISBABY = 0;

  /** C++ `AgableMob(Level* level)` */
  constructor(level: Level) {
    super(level);
    this.age = -1;
    this.entityData.defineByte(AgableMob.DATA_FLAGS_ID, 0);
    // C++ 的 setAge 不是 virtual：构造期间的调用只到 AgableMob 的版本，不派发到子类。
    AgableMob.prototype.setAge.call(this, 0);
  }

  /** C++ `int AgableMob::getAge()` */
  getAge(): number {
    return this.age;
  }

  /** C++ `void AgableMob::setAge(int age)` */
  setAge(age: number): void {
    if (this.age < 0 && age >= 0) {
      this.entityData.clearFlag(AgableMob.DATA_FLAGS_ID, AgableMob.DATAFLAG_ISBABY);
    } else if (this.age >= 0 && age < 0) {
      this.entityData.setFlag(AgableMob.DATA_FLAGS_ID, AgableMob.DATAFLAG_ISBABY);
    }
    this.age = age;
  }

  /**
   * C++ `void AgableMob::addAdditonalSaveData(CompoundTag* tag)` —— 注意拼写。
   * ⚠ 这里是 **public**（不是 C++ 的 protected）：`Mob.ts` 覆写 Entity 那两个抽象方法时放宽成了
   * public（Entity 声明 protected、Mob 写成 public），TS 不允许子类再收窄回去。
   */
  override addAdditonalSaveData(tag: CompoundTag): void {
    super.addAdditonalSaveData(tag);
    tag.putInt('Age', this.getAge());
  }

  /** C++ `void AgableMob::readAdditionalSaveData(CompoundTag* tag)` —— public 的理由同上 */
  override readAdditionalSaveData(tag: CompoundTag): void {
    super.readAdditionalSaveData(tag);
    this.setAge(tag.getInt('Age'));
  }

  /** C++ `void AgableMob::aiStep()` */
  override aiStep(): void {
    super.aiStep();
    if (this.age < 0) this.setAge(this.age + 1);
    else if (this.age > 0) this.setAge(this.age - 1);
  }

  /** C++ `bool AgableMob::isBaby()` */
  override isBaby(): boolean {
    if (!this.level.isClientSide) {
      return this.age < 0;
    } else {
      return this.entityData.getFlag(AgableMob.DATA_FLAGS_ID, AgableMob.DATAFLAG_ISBABY);
    }
  }
}
