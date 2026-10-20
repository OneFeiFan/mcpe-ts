/**
 * 1:1 移植自 src/world/entity/item/TripodCamera.h 与 .cpp（120 行）。
 * **在此之前这里只是个 7 行的 FORWARD-DECL 空接口**（只作为 `LevelListener.takePicture` 的参数类型）。
 *
 * 相机道具用一次，就在玩家站的地方立起这个三脚架：它继承 `Mob`，但 `tick()` 整体重写、
 * **完全不调 `super.tick()`** —— 所以 Mob 的 AI（任务单 H 已移植）对它不起作用，与 C++ 相同。
 * 玩家右键它（`interact`）→ `activated = true` → 引信开始走：`life` 从 80 数下来，
 * **到 8 的那一刻**拍照（`level->takePicture`）+ 冒三团爆炸粒子，到 0 就自己消失。
 *
 * 【三处原样保留】
 *   1. `getEntityTypeId()` **硬编码返回 0** —— EntityTypes 里根本没有 TripodCamera 这个 id
 *      （它只由 CameraItem 生成，不走存档那条路）。别"顺手"给它编一个。
 *   2. `life == 0` / `life == 8` 是**等于**判断，不是 `<=`。漏掉一帧就再也不拍照了。
 *   3. `interactPreventDefault()` 返回 true（玩家右键它不算"用手打了一下"）。
 */
import { EntityRendererId } from '../EntityRendererId';
import { ParticleType } from '../EntityTypes';
import { Mob } from '../Mob';
import type { Player } from '../player/Player';
import type { Level } from '../../level/Level';

const f = Math.fround;

export class TripodCamera extends Mob {
  /** C++ `int life;`，初始化列表里是 80 */
  public life: number;
  protected owner: Player;
  protected activated: boolean;

  /** C++ `TripodCamera(Level*, Player* owner, float x, float y, float z)` */
  constructor(level: Level, owner: Player, x: number, y: number, z: number) {
    super(level);
    // C++ 实际按成员声明顺序初始化：life → owner → activated（初始化列表写的是 owner 在前）
    this.life = 80;
    this.owner = owner;
    this.activated = false;

    // C++ 形参是 float（W26）：实参先舍入，后面的 setPos 与 xo/yo/zo 赋的都是舍入后的值
    x = f(x);
    y = f(y);
    z = f(z);
    this.entityRendererId = EntityRendererId.ER_TRIPODCAMERA_RENDERER;
    // C++ 的 `xRot = xRotO = owner->xRot;` 这种链式赋值照抄（两边都是 float 字段，W26 补舍入）
    this.xRot = this.xRotO = f(owner.xRot);
    this.yRot = this.yRotO = f(owner.yRot);
    this.blocksBuilding = true;
    this.setSize(f(1.0), f(1.5));
    this.heightOffset = f(f(this.bbHeight / f(2.0)) - f(0.25));
    this.setPos(x, y, z);
    // C++ 用的是**形参** x/y/z，只对齐 xo/yo/zo（没有 xOld，和 PrimedTnt 一样）
    this.xo = x;
    this.yo = y;
    this.zo = z;
  }

  /** C++ `bool TripodCamera::isPickable()` */
  override isPickable(): boolean {
    return !this.removed;
  }

  /** C++ `bool TripodCamera::isPushable()` */
  override isPushable(): boolean {
    return false;
  }

  /** C++ `int TripodCamera::getEntityTypeId() const { return 0; }` —— 写死 0，原样 */
  override getEntityTypeId(): number {
    return 0;
  }

  /** C++ `bool TripodCamera::interact(Player*)` */
  override interact(_player: Player): boolean {
    this.activated = true;
    return true;
  }

  /** C++ `bool TripodCamera::interactPreventDefault()` */
  override interactPreventDefault(): boolean {
    return true;
  }

  /** C++ `float TripodCamera::getShadowHeightOffs()` */
  override getShadowHeightOffs(): number {
    return 0;
  }

  /** C++ `void TripodCamera::tick()` —— 整体重写，**不调 super.tick()** */
  override tick(): void {
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.yd = f(this.yd - f(0.04));
    this.move(this.xd, this.yd, this.zd);
    this.xd = f(this.xd * f(0.98));
    this.yd = f(this.yd * f(0.98));
    this.zd = f(this.zd * f(0.98));
    if (this.onGround) {
      this.xd = f(this.xd * f(0.7));
      this.zd = f(this.zd * f(0.7));
      this.yd = f(this.yd * f(-0.5));
    }
    if (this.activated) {
      --this.life;
      if (this.life === 0) {
        this.remove();
      } else if (this.life === 8) {
        this.level.takePicture(this, this.owner);
        this.level.addParticle(ParticleType.explode, this.x, f(this.y + f(0.6)), this.z, 0, 0, 0);
        this.level.addParticle(ParticleType.explode, this.x, f(this.y + f(0.8)), this.z, 0, 0, 0);
        this.level.addParticle(ParticleType.explode, this.x, f(this.y + f(1.0)), this.z, 0, 0, 0);
      } else if (this.life > 8) {
        this.level.addParticle(ParticleType.smoke, this.x, f(this.y + f(1.0)), this.z, 0, 0, 0);
      }
    }
  }
}
