/**
 * 1:1 移植自 src/world/entity/animal/Chicken.h 与 .cpp（113 行 + 头 49 行）。
 *
 * 鸡：`Animal` 的全部行为 + 扇翅膀动画（`flap`/`flapSpeed`/`oFlap`/`oFlapSpeed` 这四个字段是
 * **客户端渲染用的插值量**，`flapping` 是翅膀相位累加量）+ **每隔 5~10 分钟原地掉一个蛋** +
 * 死时掉羽毛/鸡肉。
 *
 * 【四处照抄】
 *   1. `--eggTime <= 0` 是**前置自减**：先减再比。计时到点后重新抽一个
 *      `nextInt(TicksPerSecond * 60 * 5) + TicksPerSecond * 60 * 5` —— 也就是 **5~10 分钟**。
 *   2. 掉蛋那段外面套着 `!isBaby()` 和 `!level->isClientSide` 两层判断：客户端不产蛋。
 *   3. `causeFallDamage` 是**空函数体**（鸡摔不死），照抄。
 *   4. `sheared` 是 public 的 `bool`，但全参考源码**只写不读**（Sheep 用的是自己的字段）—— 照抄保留。
 *
 * 【浮点】`flapSpeed += (onGround ? -1 : 4) * 0.3f` 这类都按 PITFALLS 第 3 条逐步 fround，
 * 十进制字面量一律包 `f()`（`0.3f` / `0.9f` / `0.6f` / `0.2f`）。
 *
 * 已接线：G9 落的 `ChickenRenderer` + `ChickenModel` 负责画它（`EntityRenderDispatcher` 里注册的
 * `ER_CHICKEN_RENDERER`）—— G9 时它是 TS 里**第一只画面上看得见的生物**（后续又有别的生物接入）。
 */
import { SharedConstants } from '@mcpe/core';
import type { CompoundTag } from '@mcpe/nbt';
import { Item } from '../../item/Item';
import type { Level } from '../../level/Level';
import { EntityRendererId } from '../EntityRendererId';
import { MobTypes } from '../EntityTypes';
import { Animal } from './Animal';

const f = Math.fround;

export class Chicken extends Animal {
  sheared: boolean;
  flap: number;
  flapSpeed: number;
  oFlapSpeed: number;
  oFlap: number;
  flapping: number;
  eggTime: number;

  /** C++ `Chicken(Level* level)` */
  constructor(level: Level) {
    super(level);
    this.sheared = false;
    this.flap = 0;
    this.oFlap = 0;
    this.flapSpeed = 0;
    this.oFlapSpeed = 0;
    this.flapping = 1;
    this.eggTime = 0;

    this.entityRendererId = EntityRendererId.ER_CHICKEN_RENDERER;
    this.textureName = 'mob/chicken.png';
    this.setSize(f(0.3), f(0.7));
    this.eggTime =
      this.random.nextInt(SharedConstants.TicksPerSecond * 60 * 5) +
      SharedConstants.TicksPerSecond * 60 * 5;
  }

  /** C++ `int Chicken::getEntityTypeId() const` */
  override getEntityTypeId(): number {
    return MobTypes.Chicken;
  }

  /** C++ `int Chicken::getMaxHealth()` */
  override getMaxHealth(): number {
    return 4;
  }

  /** C++ `void Chicken::aiStep()` */
  override aiStep(): void {
    super.aiStep();
    this.oFlap = this.flap;
    this.oFlapSpeed = this.flapSpeed;
    this.flapSpeed = f(this.flapSpeed + f((this.onGround ? -1 : 4) * f(0.3)));
    if (this.flapSpeed < 0) this.flapSpeed = 0;
    if (this.flapSpeed > 1) this.flapSpeed = 1;
    if (!this.onGround && this.flapping < 1) this.flapping = 1;
    this.flapping = f(this.flapping * f(0.9));
    if (!this.onGround && this.yd < 0) {
      this.yd = f(this.yd * f(0.6));
    }
    this.flap = f(this.flap + f(this.flapping * 2));
    if (!this.isBaby()) {
      // ⚠ `--eggTime` 是前置自减：先减再比
      if (!this.level.isClientSide && --this.eggTime <= 0) {
        // DEFERRED(待确认): level->playSound(this, "mob.chickenplop", 1.0f, (random.nextFloat() - random.nextFloat()) * 0.2f + 1.0f);
        // C++ 里两个 nextFloat() 的求值顺序未指定；不生成新黄金样本，先按从左到右（与 Entity/Mob/ItemEntity/Player 的先例一致），待确认。
        this.level.playSound(
          this,
          'mob.chickenplop',
          f(1.0),
          f(f(f(this.random.nextFloat() - this.random.nextFloat()) * f(0.2)) + f(1.0)),
        );
        this.spawnAtLocation(Item.egg.id, 1);
        this.eggTime =
          this.random.nextInt(SharedConstants.TicksPerSecond * 60 * 5) +
          SharedConstants.TicksPerSecond * 60 * 5;
      }
    }
  }

  /** C++ `void Chicken::addAdditonalSaveData(CompoundTag* tag)` —— 只转调，注意拼写 */
  override addAdditonalSaveData(tag: CompoundTag): void {
    super.addAdditonalSaveData(tag);
  }

  /** C++ `void Chicken::readAdditionalSaveData(CompoundTag* tag)` —— 只转调 */
  override readAdditionalSaveData(tag: CompoundTag): void {
    super.readAdditionalSaveData(tag);
  }

  /** C++ `void Chicken::causeFallDamage(float distance)` —— 空函数体（鸡摔不死） */
  protected override causeFallDamage(_distance: number): void {}

  /** C++ `const char* Chicken::getAmbientSound()` */
  protected override getAmbientSound(): string | null {
    return 'mob.chicken';
  }

  /** C++ `std::string Chicken::getHurtSound()` */
  protected override getHurtSound(): string {
    return 'mob.chickenhurt';
  }

  /** C++ `std::string Chicken::getDeathSound()` */
  protected override getDeathSound(): string {
    return 'mob.chickenhurt';
  }

  /** C++ `void Chicken::dropDeathLoot()` —— 先掉 0~2 根羽毛，再掉鸡肉（着火了掉熟的） */
  protected override dropDeathLoot(): void {
    const count = this.random.nextInt(3);
    for (let i = 0; i < count; i++) {
      this.spawnAtLocation(Item.feather.id, 1);
    }
    if (this.isOnFire()) this.spawnAtLocation(Item.chicken_cooked.id, 1);
    else this.spawnAtLocation(Item.chicken_raw.id, 1);
  }

  /**
   * C++ `Animal* Chicken::getBreedOffspring(Animal* target)`。
   * ⚠ 全参考源码**零调用方**（它不在任何基类里声明，也没人调它）—— 照抄，不删。
   */
  // ADAPTED(Cpp)：C++ Chicken.h 把它写在 protected 段；但既有测试 chicken.test.ts:343 在类外
  // 直接调用 `c.getBreedOffspring(c)`，收窄成 protected 会让该测试无法编译（已用 tsc 实测 TS2445），
  // 又不能改既有断言，故保持 public。
  getBreedOffspring(_target: Animal): Animal {
    return new Chicken(this.level);
  }
}
