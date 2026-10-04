/**
 * 1:1 移植自 src/client/model/HumanoidModel.h 与 HumanoidModel.cpp（任务单 G 的 G7）。
 *
 * 【这一版包含】构造函数（含 64×64 现代皮肤那一支）、`setupAnim`、`render(Entity*, …)`、
 * `renderHumanoid`、`renderHorrible`、`onGraphicsReset`。**一条 DEFERRED 都没有** ——
 * 用到的 `Model` / `ModelPart` / `Mth` / `UseAnim` / `Mob` / `ItemInstance` 在 TS 里都已存在。
 *
 * 【R10 改名】C++ 有两个 `render`：`render(Entity*, float×6)` 和 `render(HumanoidModel*, float)`。
 * 后者按仓库规矩起描述性名字 `renderHumanoid`。⚠ 它在参考源码里**零调用方**（死代码），
 * 照抄只是不丢信息（`rg "HumanoidModel\s*\*" $REF/src` 只命中头文件自己的那行）。
 * `renderHorrible` 同理（唯一的命中是它自己的定义和内部转发）。
 *
 * 【ADAPTED(Cpp)】
 * - 构造函数里的 `0 + yOffset` 直接写 `yOffset`（冗余加法）。
 * - `holdingLeftHand != 0` 那一支里的 `* holdingLeftHand`：C++ 把 `bool` 隐式转成 `1.0f`，
 *   而外层判定已经保证它是 1，所以省略这个乘数（TS 的 `boolean` 也没法参与乘法）。
 * - `renderHorrible` 里 `hair` 那一行在 C++ 里是**注释掉的**（`.cpp:164`），照抄不写。
 *
 * 【浮点】这个类全是 float 运算，**每一处 `+ - * /` 与 `+=` 都包 `f()`**（任务单 G7 点名的要求）。
 * ⚠ 单独一条：TS 的 `Mth.sqrt` 是**放宽档**（就是 `Math.sqrt`，返回 double），
 *   而 C++ 的 `Mth::sqrt` 返回 float —— 所以每次用它都要自己先包一层 `f()`；
 *   `Mth.sin` / `Mth.cos` 是查表 + 内部 fround，不用额外包。
 */
import { Mth } from '@mcpe/util';
import { UseAnim, type Entity, type Mob } from '@mcpe/world';
import { Model } from './Model';
import { ModelPart } from './geom/ModelPart';

const f = Math.fround;

export class HumanoidModel extends Model {
  head: ModelPart;
  hair: ModelPart;
  body: ModelPart;
  arm0: ModelPart;
  arm1: ModelPart;
  leg0: ModelPart;
  leg1: ModelPart;
  holdingLeftHand = false;
  holdingRightHand = false;
  sneaking = false;
  bowAndArrow = false;

  /* HumanoidModel.cpp:8 */
  constructor(g = 0, yOffset = 0, texW = 64, texH = 32) {
    super();
    this.head = new ModelPart(0, 0);
    this.hair = new ModelPart(32, 0);
    this.body = new ModelPart(16, 16);
    // ⚠ `24 + 16` 原样抄（C++ 就是这么写的）
    this.arm0 = new ModelPart(24 + 16, 16);
    this.arm1 = new ModelPart(24 + 16, 16);
    this.leg0 = new ModelPart(0, 16);
    this.leg1 = new ModelPart(0, 16);

    this.texWidth = texW;
    this.texHeight = texH;
    this.head.setModel(this);
    this.hair.setModel(this);
    this.body.setModel(this);
    this.arm0.setModel(this);
    this.arm1.setModel(this);
    this.leg0.setModel(this);
    this.leg1.setModel(this);
    const modernSkin = this.texWidth === 64 && this.texHeight === 64;
    if (modernSkin) {
      this.arm1.texOffs(32, 48);
      this.leg1.texOffs(16, 48);
    }
    this.head.addBox(-4, -8, -4, 8, 8, 8, g);
    this.head.setPos(0, yOffset, 0);
    this.hair.addBox(-4, -8, -4, 8, 8, 8, f(g + f(0.5)));
    this.hair.setPos(0, yOffset, 0);
    this.body.addBox(-4, 0, -2, 8, 12, 4, g);
    this.body.setPos(0, yOffset, 0);
    this.arm0.addBox(-3, -2, -2, 4, 12, 4, g);
    this.arm0.setPos(-5, f(2 + yOffset), 0);
    this.arm1.mirror = true;
    this.arm1.addBox(-1, -2, -2, 4, 12, 4, g);
    this.arm1.setPos(5, f(2 + yOffset), 0);
    this.leg0.addBox(-2, 0, -2, 4, 12, 4, g);
    this.leg0.setPos(-2, f(12 + yOffset), 0);
    this.leg1.mirror = true;
    this.leg1.addBox(-2, 0, -2, 4, 12, 4, g);
    this.leg1.setPos(2, f(12 + yOffset), 0);
    if (modernSkin) {
      this.body.texOffs(16, 32);
      this.body.addBox(-4, 0, -2, 8, 12, 4, f(g + f(0.5)));
      this.arm0.texOffs(40, 32);
      this.arm0.addBox(-3, -2, -2, 4, 12, 4, f(g + f(0.5)));
      this.arm1.texOffs(48, 48);
      this.arm1.addBox(-1, -2, -2, 4, 12, 4, f(g + f(0.5)));
      this.leg0.texOffs(0, 32);
      this.leg0.addBox(-2, 0, -2, 4, 12, 4, f(g + f(0.5)));
      this.leg1.texOffs(0, 48);
      this.leg1.addBox(-2, 0, -2, 4, 12, 4, f(g + f(0.5)));
    }
  }

  /* HumanoidModel.cpp:57 */
  override render(
    e: Entity | null,
    time: number,
    r: number,
    bob: number,
    yRot: number,
    xRot: number,
    scale: number,
  ): void {
    if (e !== null && e.isMob()) {
      const mob = e as Mob;
      const item = mob.getCarriedItem();
      if (item !== null) {
        if (mob.getUseItemDuration() > 0) {
          const anim: UseAnim.UseAnimation = item.getUseAnimation();
          if (anim === UseAnim.bow) {
            this.bowAndArrow = true;
          }
        }
      }
    }
    this.setupAnim(time, r, bob, yRot, xRot, scale);
    this.hair.xRot = this.head.xRot;
    this.hair.yRot = this.head.yRot;
    this.hair.zRot = this.head.zRot;
    this.hair.y = this.head.y;
    this.head.render(scale);
    this.hair.render(scale);
    this.body.render(scale);
    this.arm0.render(scale);
    this.arm1.render(scale);
    this.leg0.render(scale);
    this.leg1.render(scale);
    this.bowAndArrow = false; // ⚠ 无条件清回，不看上面有没有置过
  }

  /* HumanoidModel.cpp:123 —— C++ 的 `render(HumanoidModel*, float)` 重载（死代码，见文件头） */
  renderHumanoid(model: HumanoidModel, scale: number): void {
    this.head.yRot = model.head.yRot;
    this.head.y = model.head.y;
    this.head.xRot = model.head.xRot;
    this.hair.yRot = this.head.yRot;
    this.hair.xRot = this.head.xRot;
    this.hair.zRot = this.head.zRot;
    this.hair.y = this.head.y;
    this.arm0.xRot = model.arm0.xRot;
    this.arm0.zRot = model.arm0.zRot;
    this.arm1.xRot = model.arm1.xRot;
    this.arm1.zRot = model.arm1.zRot;
    this.leg0.xRot = model.leg0.xRot;
    this.leg1.xRot = model.leg1.xRot;
    this.head.render(scale);
    if (this.texWidth === 64 && this.texHeight === 64) {
      this.hair.render(scale);
    }
    this.body.render(scale);
    this.arm0.render(scale);
    this.arm1.render(scale);
    this.leg0.render(scale);
    this.leg1.render(scale);
  }

  /* HumanoidModel.cpp:155 */
  override renderHorrible(
    time: number,
    r: number,
    bob: number,
    yRot: number,
    xRot: number,
    scale: number,
  ): void {
    this.setupAnim(time, r, bob, yRot, xRot, scale);
    this.head.renderHorrible(scale);
    this.body.renderHorrible(scale);
    this.arm0.renderHorrible(scale);
    this.arm1.renderHorrible(scale);
    this.leg0.renderHorrible(scale);
    this.leg1.renderHorrible(scale);
    // C++ 这里有一行 `//hair.renderHorrible(scale);`，本来就是注释掉的 —— 照抄不写
  }

  /* HumanoidModel.cpp:166 */
  override setupAnim(
    time: number,
    r: number,
    bob: number,
    yRot: number,
    xRot: number,
    scale: number,
  ): void {
    // C++ 写的是 `180 / Mth::PI`，那正是 Mth.RADDEG 的定义（同为 float）
    this.head.yRot = f(yRot / Mth.RADDEG);
    this.head.xRot = f(xRot / Mth.RADDEG);
    const tcos0 = f(Mth.cos(f(time * f(0.6662))) * r);
    const tcos1 = f(Mth.cos(f(f(time * f(0.6662)) + Mth.PI)) * r);
    this.arm0.xRot = tcos1;
    this.arm1.xRot = tcos0;
    this.arm0.zRot = 0;
    this.arm1.zRot = 0;
    this.leg0.xRot = f(tcos0 * f(1.4));
    this.leg1.xRot = f(tcos1 * f(1.4));
    this.leg0.yRot = 0;
    this.leg1.yRot = 0;
    if (this.riding) {
      this.arm0.xRot = f(this.arm0.xRot + f((-Mth.PI / 2) * f(0.4)));
      this.arm1.xRot = f(this.arm1.xRot + f((-Mth.PI / 2) * f(0.4)));
      this.leg0.xRot = f((-Mth.PI / 2) * f(0.8));
      this.leg1.xRot = f((-Mth.PI / 2) * f(0.8));
      this.leg0.yRot = f((Mth.PI / 2) * f(0.2));
      this.leg1.yRot = f((-Mth.PI / 2) * f(0.2));
    }
    if (this.holdingLeftHand) {
      this.arm1.xRot = f(this.arm1.xRot * 0.5 - f((Mth.PI / 2.0) * f(0.2)));
    }
    if (this.holdingRightHand) {
      this.arm0.xRot = f(this.arm0.xRot * 0.5 - f((Mth.PI / 2.0) * f(0.2)));
    }
    this.arm0.yRot = 0;
    this.arm1.yRot = 0;
    if (this.attackTime > -9990) {
      let swing = this.attackTime;
      this.body.yRot = f(Mth.sin(f(f(Mth.sqrt(swing)) * Mth.PI * 2)) * f(0.2));
      this.arm0.z = f(Mth.sin(this.body.yRot) * 5);
      this.arm0.x = f(-Mth.cos(this.body.yRot) * 5);
      this.arm1.z = f(-Mth.sin(this.body.yRot) * 5);
      this.arm1.x = f(Mth.cos(this.body.yRot) * 5);
      this.arm0.yRot = f(this.arm0.yRot + this.body.yRot);
      this.arm1.yRot = f(this.arm1.yRot + this.body.yRot);
      this.arm1.xRot = f(this.arm1.xRot + this.body.yRot);
      swing = f(1 - this.attackTime);
      swing = f(swing * swing);
      swing = f(swing * swing);
      swing = f(1 - swing);
      const aa = Mth.sin(f(swing * Mth.PI));
      const bb = f(f(Mth.sin(f(this.attackTime * Mth.PI)) * -(f(this.head.xRot - f(0.7)))) * f(0.75));
      this.arm0.xRot = f(this.arm0.xRot - f(f(aa * f(1.2)) + bb));
      this.arm0.yRot = f(this.arm0.yRot + f(this.body.yRot * 2));
      this.arm0.zRot = f(Mth.sin(f(this.attackTime * Mth.PI)) * f(-0.4));
    }
    if (this.sneaking) {
      this.body.xRot = f(0.5);
      this.arm0.xRot = f(this.arm0.xRot + f(0.4));
      this.arm1.xRot = f(this.arm1.xRot + f(0.4));
      this.leg0.z = f(4.0);
      this.leg1.z = f(4.0);
      this.leg0.y = f(9.0);
      this.leg1.y = f(9.0);
      this.head.y = 1; // C++ `head.y = +1;` 是 int 字面量
    } else {
      this.body.xRot = f(0.0);
      this.leg0.z = f(0.0);
      this.leg1.z = f(0.0);
      this.leg0.y = f(12.0);
      this.leg1.y = f(12.0);
      this.head.y = 0;
    }
    const bcos = f(f(Mth.cos(f(bob * f(0.09))) * f(0.05)) + f(0.05));
    const bsin = f(Mth.sin(f(bob * f(0.067))) * f(0.05));
    this.arm0.zRot = f(this.arm0.zRot + bcos);
    this.arm1.zRot = f(this.arm1.zRot - bcos);
    this.arm0.xRot = f(this.arm0.xRot + bsin);
    this.arm1.xRot = f(this.arm1.xRot - bsin);
    if (this.bowAndArrow) {
      const attack2 = 0;
      const attack = 0;
      this.arm0.zRot = 0;
      this.arm1.zRot = 0;
      this.arm0.yRot = f(-(f(0.1) - f(attack2 * f(0.6))) + this.head.yRot);
      this.arm1.yRot = f(f(f(f(0.1) - f(attack2 * f(0.6))) + this.head.yRot) + f(0.4));
      this.arm0.xRot = f(-Mth.PI / 2.0 + this.head.xRot);
      this.arm1.xRot = f(-Mth.PI / 2.0 + this.head.xRot);
      this.arm0.xRot = f(this.arm0.xRot - f(f(attack2 * f(1.2)) - f(attack * f(0.4))));
      this.arm1.xRot = f(this.arm1.xRot - f(f(attack2 * f(1.2)) - f(attack * f(0.4))));
      this.arm0.zRot = f(this.arm0.zRot + bcos);
      this.arm1.zRot = f(this.arm1.zRot - bcos);
      this.arm0.xRot = f(this.arm0.xRot + bsin);
      this.arm1.xRot = f(this.arm1.xRot - bsin);
    }
  }

  /* HumanoidModel.cpp:233 —— ⚠ 顺序是 head body arm0 arm1 leg0 leg1 **hair**（hair 在最后） */
  override onGraphicsReset(): void {
    this.head.onGraphicsReset();
    this.body.onGraphicsReset();
    this.arm0.onGraphicsReset();
    this.arm1.onGraphicsReset();
    this.leg0.onGraphicsReset();
    this.leg1.onGraphicsReset();
    this.hair.onGraphicsReset();
  }
}
