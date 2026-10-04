/**
 * 1:1 移植自 src/client/renderer/entity/HumanoidMobRenderer.h 与 .cpp（G8，全量移植，0 条 DEFERRED）。
 *
 * 【这一层干什么】`MobRenderer` 只管"把模型画出来"，这一层负责它旁边三件小事：
 *   1. `render()` —— 画之前把两个状态塞给模型（手上有没有东西、是不是潜行），画完把手持标志**无条件**清掉；
 *   2. `renderHand()` —— 第一人称只画 `arm0` 这一条手臂（`ItemInHandRenderer` 拿它画玩家自己的手）；
 *   3. `additionalRendering()` —— 模型画完之后，贴着 `arm0` 画手持物品；是玩家且披风贴图非空时再画披风。
 *
 * 【数值档位】渲染变换按 float 走（与 G6/G7 一致）。注意**披风那段有两套精度**：
 *   - `capeX/capeY/…`、`px/py/pz`、`dx/dy/dz` 在 C++ 里是 **double**，TS 的 number 就是 double，**不包 f()**；
 *   - `bodyYaw`、`forward`、`lift`、`walk`、`capeXRot`、`capeZRot` 是 float，按 C++ 的运算顺序包 f()。
 *
 * 【原样保留的怪癖】
 *   - 披风 24 个顶点在 `t.begin()` **之前没有 `t.color(...)`** —— 用上一次留下的颜色（C++ 就少这一句）；
 *   - 披风用的是 `t.tex(u,v)` + `t.vertex(x,y,z)` 两个分开的调用，**不是** `t.vertexUV`；
 *   - `render()` 结尾那句清 `holdingRightHand` 在 C++ 里没有条件，前面没置过 true 也照清；
 *   - 手持物品那四路的 `glRotatef2(20 / 45 / -20 / …)` 在 C++ 里传的是 int 字面量，照抄成 int。
 *
 * 【R10 改名】无（这些名字在 TS 里全是空的）。
 */
import { Mth } from '@mcpe/util';
import { Item, Player, Tile, type Entity, type Mob } from '@mcpe/world';
import type { HumanoidModel } from '../../model/HumanoidModel';
import { Tesselator } from '../Tesselator';
import { TileRenderer } from '../TileRenderer';
import {
  GL_TEXTURE_COORD_ARRAY,
  GL_VERTEX_ARRAY,
  glDisableClientState2,
  glEnableClientState2,
  glPopMatrix2,
  glPushMatrix2,
  glRotatef2,
  glScalef2,
  glTranslatef2,
} from '../gles';
import { EntityRenderer } from './EntityRenderer';
import { MobRenderer } from './MobRenderer';

const f = Math.fround;

export class HumanoidMobRenderer extends MobRenderer {
  protected humanoidModel: HumanoidModel;
  protected lastCapeXRot: number;
  protected lastCapeZRot: number;

  /* HumanoidMobRenderer.cpp:14 */
  constructor(humanoidModel: HumanoidModel, shadow: number) {
    super(humanoidModel, shadow);
    this.humanoidModel = humanoidModel;
    this.lastCapeXRot = 0;
    this.lastCapeZRot = 0;
  }

  /* HumanoidMobRenderer.cpp:22 */
  renderHand(): void {
    this.humanoidModel.attackTime = 0;
    this.humanoidModel.setupAnim(0, 0, 0, 0, 0, f(1 / f(16.0)));
    glEnableClientState2(GL_VERTEX_ARRAY);
    glEnableClientState2(GL_TEXTURE_COORD_ARRAY);
    this.humanoidModel.arm0.render(f(1 / f(16.0)));
    glDisableClientState2(GL_VERTEX_ARRAY);
    glDisableClientState2(GL_TEXTURE_COORD_ARRAY);
  }

  /* HumanoidMobRenderer.cpp:36 */
  override additionalRendering(mob: Mob, a: number): void {
    const item = mob.getCarriedItem();
    if (item !== null && item.count > 0) {
      glPushMatrix2();
      this.humanoidModel.arm0.translateTo(f(1 / f(16.0)));
      glTranslatef2(f(-1 / f(16.0)), f(7 / f(16.0)), f(1 / f(16.0)));
      if (item.id < 256 && TileRenderer.canRender(Tile.tiles[item.id]!.getRenderShape())) {
        let s = f(8 / f(16.0));
        glTranslatef2(0, f(3 / f(16.0)), f(-5 / f(16.0)));
        s = f(s * f(0.75));
        glRotatef2(20, 1, 0, 0);
        glRotatef2(45, 0, 1, 0);
        glScalef2(s, -s, s);
      } else if (item.id === Item.bow.id) {
        const s = f(10 / f(16.0));
        glTranslatef2(0, f(2 / f(16.0)), f(5 / f(16.0)));
        glRotatef2(-20, 0, 1, 0);
        glScalef2(s, -s, s);
        glRotatef2(-100, 1, 0, 0);
        glRotatef2(45, 0, 1, 0);
      } else if (Item.items[item.id]!.isHandEquipped()) {
        const s = f(10 / f(16.0));
        glTranslatef2(0, f(3 / f(16.0)), 0);
        glScalef2(s, -s, s);
        glRotatef2(-100, 1, 0, 0);
        glRotatef2(45, 0, 1, 0);
      } else {
        const s = f(6 / f(16.0));
        glTranslatef2(f(4 / f(16.0)), f(3 / f(16.0)), f(-3 / f(16.0)));
        glScalef2(s, s, s);
        glRotatef2(60, 0, 0, 1);
        glRotatef2(-90, 1, 0, 0);
        glRotatef2(20, 0, 0, 1);
      }
      EntityRenderer.entityRenderDispatcher!.itemInHandRenderer!.renderItem(mob, item);
      glPopMatrix2();
    }
    {
      const player = Player.asPlayer(mob);
      if (player !== null) {
        const capeTex = player.getCapeTexture();
        if (capeTex !== '') {
          this.bindTexture(capeTex);
          glPushMatrix2();
          this.humanoidModel.body.translateTo(f(1 / f(16.0)));
          glScalef2(f(1 / f(16.0)), f(1 / f(16.0)), f(1 / f(16.0)));
          glTranslatef2(0, 1, 2);
          const pt = a;
          const capeX = player.getCapePrevX() + (player.getCapeX() - player.getCapePrevX()) * pt;
          const capeY = player.getCapePrevY() + (player.getCapeY() - player.getCapePrevY()) * pt;
          const capeZ = player.getCapePrevZ() + (player.getCapeZ() - player.getCapePrevZ()) * pt;
          const px = player.xo + (player.x - player.xo) * pt;
          const py = player.yo + (player.y - player.yo) * pt;
          const pz = player.zo + (player.z - player.zo) * pt;
          const dx = capeX - px;
          const dy = capeY - py;
          const dz = capeZ - pz;
          // C++ 这几个字段是 float；`pt` 由 float 提升成 double，所以这一行按 float 表达式取一次 f()
          const bodyYaw = f(player.yBodyRotO + (player.yBodyRot - player.yBodyRotO) * pt);
          const rad = f(f(bodyYaw * Mth.PI) / f(180.0));
          const sinYaw = Mth.sin(rad);
          const cosYaw = -Mth.cos(rad);
          // C++ `(float)(dx * sinYaw + dz * cosYaw) * 100.0f`：先落成 float，再乘 100.0f
          let forward = f(f(dx * sinYaw + dz * cosYaw) * f(100.0));
          const sideways = f(f(dx * cosYaw - dz * sinYaw) * f(100.0));
          if (forward < 0) forward = 0;
          // C++ `float lift = (float)dy * 10.0f;`
          let lift = f(f(dy) * f(10.0));
          if (lift < -6) lift = -6;
          if (lift > 32) lift = 32;
          // C++ `Mth::sin((walkAnimPos + walkAnimSpeed) * 6.0f) * 32.0f * walkAnimSpeed`
          const walk = f(
            f(Mth.sin(f(f(player.walkAnimPos + player.walkAnimSpeed) * f(6.0))) * f(32.0)) *
              player.walkAnimSpeed,
          );
          // C++ `6.0f + forward / 2.0f + lift + walk`（左结合，每一步都是 float）
          let capeXRot = f(f(f(6.0 + f(forward / f(2.0))) + lift) + walk);
          let capeZRot = f(sideways / f(2.0));
          const smooth = f(0.3);
          capeXRot = f(this.lastCapeXRot + (capeXRot - this.lastCapeXRot) * smooth);
          capeZRot = f(this.lastCapeZRot + (capeZRot - this.lastCapeZRot) * smooth);
          this.lastCapeXRot = capeXRot;
          this.lastCapeZRot = capeZRot;
          glRotatef2(capeXRot, 1, 0, 0);
          glRotatef2(capeZRot, 0, 0, 1);
          // ⚠ 这里**没有** `t.color(...)`（C++ 就没有）—— 用的是上一次留下的颜色，照抄。
          const t = Tesselator.instance;
          t.begin();
          // C++ 把每个常量写成 `1.0f / 64.0f` 这样的 float 除法；Tesselator 的缓冲是 Float32Array，
          // 写进去时按 float 截断，所以这里用 double 算再存，与 C++ 逐位相同。
          const u0 = 1.0 / 64.0;
          const u1 = 11.0 / 64.0;
          const u2 = 12.0 / 64.0;
          const u3 = 22.0 / 64.0;
          const uL0 = 0.0 / 64.0;
          const uL1 = 1.0 / 64.0;
          const uR0 = 11.0 / 64.0;
          const uR1 = 12.0 / 64.0;
          const v0 = 0.0 / 32.0;
          const v1 = 1.0 / 32.0;
          const vTop = 1.0 / 32.0;
          const vBottom = 17.0 / 32.0;
          const halfW = 5.0;
          const height = 16.0;
          const depth = 1.0;
          t.tex(u2, vTop);
          t.vertex(-halfW, 0.0, 0.0);
          t.tex(u3, vTop);
          t.vertex(halfW, 0.0, 0.0);
          t.tex(u3, vBottom);
          t.vertex(halfW, height, 0.0);
          t.tex(u2, vBottom);
          t.vertex(-halfW, height, 0.0);
          t.tex(u0, vTop);
          t.vertex(halfW, 0.0, depth);
          t.tex(u1, vTop);
          t.vertex(-halfW, 0.0, depth);
          t.tex(u1, vBottom);
          t.vertex(-halfW, height, depth);
          t.tex(u0, vBottom);
          t.vertex(halfW, height, depth);
          t.tex(uL0, vTop);
          t.vertex(-halfW, 0.0, depth);
          t.tex(uL1, vTop);
          t.vertex(-halfW, 0.0, 0.0);
          t.tex(uL1, vBottom);
          t.vertex(-halfW, height, 0.0);
          t.tex(uL0, vBottom);
          t.vertex(-halfW, height, depth);
          t.tex(uR0, vTop);
          t.vertex(halfW, 0.0, 0.0);
          t.tex(uR1, vTop);
          t.vertex(halfW, 0.0, depth);
          t.tex(uR1, vBottom);
          t.vertex(halfW, height, depth);
          t.tex(uR0, vBottom);
          t.vertex(halfW, height, 0.0);
          t.tex(u0, v0);
          t.vertex(-halfW, 0.0, depth);
          t.tex(u1, v0);
          t.vertex(halfW, 0.0, depth);
          t.tex(u1, v1);
          t.vertex(halfW, 0.0, 0.0);
          t.tex(u0, v1);
          t.vertex(-halfW, 0.0, 0.0);
          t.tex(u2, v0);
          t.vertex(halfW, height, 0.0);
          t.tex(u3, v0);
          t.vertex(-halfW, height, 0.0);
          t.tex(u3, v1);
          t.vertex(-halfW, height, depth);
          t.tex(u2, v1);
          t.vertex(halfW, height, depth);
          t.draw();
          glPopMatrix2();
        }
      }
    }
  }

  /* HumanoidMobRenderer.cpp:213 */
  override render(mob_: Entity, x: number, y: number, z: number, rot: number, a: number): void {
    const mob = mob_ as Mob;
    const carriedItem = mob.getCarriedItem();
    if (carriedItem !== null) this.humanoidModel.holdingRightHand = true;
    this.humanoidModel.sneaking = mob.isSneaking();
    super.render(mob_, x, y, z, rot, a);
    this.humanoidModel.holdingRightHand = false;
  }
}
