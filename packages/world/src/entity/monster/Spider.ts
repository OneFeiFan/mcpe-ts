/**
 * 1:1 移植自 src/world/entity/monster/Spider.h 与 Spider.cpp（任务单 H7）。撞墙即爬（同步标志位 0）、暗处才主动找玩家、2–6 格之间扑跳。
 * 原样保留：
 *   - C++ 的 `bool makeStepSound()` 是一个**方法**，遮蔽了基类同名的**字段** `Entity::makeStepSound`；Entity 读的是字段，
 *     这个方法从来不会被调用（蜘蛛照样有脚步声）。TS 里方法与字段不能同名，命名为 makeStepSoundMethod 并照抄（R10）。
 *   - makeStuckInWeb 是空函数（蜘蛛不会被蜘蛛网减速）。
 *   - `int fireCheckTick` 在 C++ 里声明并在构造函数里置 0，但 Spider 从不读取它（只有 Zombie / Skeleton 用同名成员）；原样保留。
 */
import { Mth } from '@mcpe/util';
import { Item } from '../../item/Item';
import type { Level } from '../../level/Level';
import type { Entity } from '../Entity';
import { EntityRendererId } from '../EntityRendererId';
import { MobTypes } from '../EntityTypes';
import { Monster } from './Monster';

const f = Math.fround;

export class Spider extends Monster {
  private static readonly DATA_FLAGS_ID = 16;
  protected fireCheckTick = 0;

  constructor(level: Level) {
    super(level);
    this.fireCheckTick = 0;
    this.entityRendererId = EntityRendererId.ER_SPIDER_RENDERER;
    this.textureName = 'mob/spider.png';
    this.setSize(f(1.4), f(0.9));
    this.runSpeed = f(0.5);
    this.entityData.defineByte(Spider.DATA_FLAGS_ID, 0);
  }

  override aiStep(): void {
    super.aiStep();
  }

  override tick(): void {
    super.tick();
    if (!this.level.isClientSide) {
      this.setClimbing(this.horizontalCollision);
    }
  }

  override getMaxHealth(): number {
    return 8;
  }

  override onLadder(): boolean {
    return this.isClimbing();
  }

  override makeStuckInWeb(): void {}

  getModelScale(): number {
    return 1.0;
  }

  isClimbing(): boolean {
    return this.entityData.getFlag(Spider.DATA_FLAGS_ID, 0);
  }

  setClimbing(value: boolean): void {
    if (value) this.entityData.setFlag(Spider.DATA_FLAGS_ID, 0);
    else this.entityData.clearFlag(Spider.DATA_FLAGS_ID, 0);
  }

  override getEntityTypeId(): number {
    return MobTypes.Spider;
  }

  /** C++ `bool Spider::makeStepSound()`（见文件头：遮蔽字段、从不被调用） */
  protected makeStepSoundMethod(): boolean {
    return false;
  }

  protected override findAttackTarget(): Entity | null {
    const br = this.getBrightness(1);
    if (br < f(0.5)) {
      return this.level.getNearestPlayer(this, 16);
    }
    return null;
  }

  protected override getAmbientSound(): string | null {
    return 'mob.spider';
  }

  protected override getHurtSound(): string {
    return 'mob.spider';
  }

  protected override getDeathSound(): string {
    return 'mob.spiderdeath';
  }

  protected override checkHurtTarget(target: Entity, d: number): void {
    d = f(d); // C++ 形参是 float，入口先舍入
    const br = this.getBrightness(1);
    if (br > f(0.5) && this.random.nextInt(100) === 0) {
      this.attackTargetId = 0;
      return;
    }
    if (d > 2 && d < 6 && this.random.nextInt(10) === 0) {
      if (this.onGround) {
        const xdd = f(target.x - this.x);
        const zdd = f(target.z - this.z);
        const dd = f(Mth.sqrt(f(f(xdd * xdd) + f(zdd * zdd))));
        this.xd = f(f(f(f(xdd / dd) * f(0.5)) * f(0.8)) + f(this.xd * f(0.2)));
        this.zd = f(f(f(f(zdd / dd) * f(0.5)) * f(0.8)) + f(this.zd * f(0.2)));
        this.yd = f(0.4);
      }
    } else {
      super.checkHurtTarget(target, d);
    }
  }

  protected override getDeathLoot(): number {
    return Item.string.id;
  }
}
