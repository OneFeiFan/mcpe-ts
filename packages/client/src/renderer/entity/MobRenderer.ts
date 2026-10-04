/**
 * 1:1 移植自 src/client/renderer/entity/MobRenderer.h 与 MobRenderer.cpp（任务单 G 的 G6）。
 *
 * 【这一版包含】构造函数、`render` 全流程、`setupPosition` / `setupRotations` / `getAttackAnim` /
 * `getBob` / `getOverlayColor` / `prepareArmor` / `getFlipDegrees` / `scale` / `additionalRendering` /
 * `onGraphicsReset` / `renderName` / `renderNameTag`，以及护甲与受伤/染色两段叠加渲染。
 * **一条 DEFERRED 都没有** —— 用到的 GL 函数、`Model`、`Font`、`Tesselator`、`OptionId` 在 TS 里都已存在。
 *
 * 【ADAPTED(Cpp)】
 * - C++ 的 `~MobRenderer() { delete model; }` 不写：TS 由 GC 管，没有 `delete`。
 * - `onGraphicsReset` 里 C++ 有 `if (model)` 判空；TS 的 `model` 是必填字段，直接调。
 * - `renderNameTag` 里 C++ 的 `(float)x + 0` / `(float)z` 是无意义的强转，直接写 `x` / `z`
 *   （`y + 1.0f` / `y + 2.3f` 的 float 加法保留）。
 *
 * 【R10】没有重名冲突，方法名与 C++ 一致。
 */
import { Mth } from '@mcpe/util';
import type { Entity, Mob } from '@mcpe/world';
import type { Font } from '../../gui/Font';
import type { Model } from '../../model/Model';
import { OptionId } from '../../Options';
import {
  GL_ALPHA_TEST,
  GL_BLEND,
  GL_COLOR_MATERIAL,
  GL_CULL_FACE,
  GL_DEPTH_TEST,
  GL_EQUAL,
  GL_LEQUAL,
  GL_LIGHTING,
  GL_ONE_MINUS_SRC_ALPHA,
  GL_SRC_ALPHA,
  GL_TEXTURE_2D,
  glBlendFunc2,
  glColor4f2,
  glDepthFunc,
  glDepthMask,
  glDisable,
  glDisable2,
  glEnable,
  glEnable2,
  glPopMatrix2,
  glPushMatrix2,
  glRotatef2,
  glScalef2,
  glTranslatef2,
} from '../gles';
import { Tesselator } from '../Tesselator';
import { EntityRenderer } from './EntityRenderer';

const f = Math.fround;

export class MobRenderer extends EntityRenderer {
  private static readonly MAX_ARMOR_LAYERS = 4;

  protected model: Model;
  private armor: Model | null = null;

  constructor(model: Model, shadow: number) {
    super();
    this.model = model;
    this.armor = null;
    this.shadowRadius = shadow;
  }

  /* MobRenderer.cpp:48 */
  override render(e: Entity, x: number, y: number, z: number, rot: number, a: number): void {
    const mob = e as Mob;
    glPushMatrix2();
    glDisable2(GL_CULL_FACE);
    this.model.attackTime = this.getAttackAnim(mob, a);
    this.model.riding = false;
    this.model.young = mob.isBaby();
    if (this.armor) {
      this.armor.riding = this.model.riding;
      this.armor.young = this.model.young;
      this.armor.attackTime = this.model.attackTime;
    }
    const bodyRot = f(mob.yBodyRotO + (mob.yBodyRot - mob.yBodyRotO) * a);
    const headRot = f(mob.yRotO + (mob.yRot - mob.yRotO) * a);
    const headRotx = f(mob.xRotO + (mob.xRot - mob.xRotO) * a);
    const yoffset = mob.heightOffset;
    this.setupPosition(mob, x, f(y - yoffset), z);
    const bob = this.getBob(mob, a);
    this.setupRotations(mob, bob, bodyRot, a);
    // C++ `float ascale = 1 / 16.0f;` —— 16.0f 是 float 字面量，1/16 又是二进制精确值
    const ascale = f(1 / f(16.0));
    glScalef2(-1, -1, 1);
    this.scale(mob, a);
    // C++ `-24 * ascale - 0.125f / 16.0f`：24 是 int、ascale 是 float → float 乘法。
    // 三个参与的数（0.125、16、ascale）都是二进制精确值，包一次 f() 与 C++ 逐位相同。
    glTranslatef2(0, f(-24 * ascale - f(0.125) / f(16.0)), 0);
    let ws = f(mob.walkAnimSpeedO + (mob.walkAnimSpeed - mob.walkAnimSpeedO) * a);
    let wp = f(mob.walkAnimPos - mob.walkAnimSpeed * (1 - a));
    if (mob.isBaby()) {
      wp = f(wp * f(3.0));
    }
    // ⚠ C++ 原样保留：只夹 ws，不夹 wp
    if (ws > 1) ws = 1;
    this.bindTexture(mob.getTexture());
    this.model.prepareMobModel(mob, wp, ws, a);
    this.model.render(e, wp, ws, bob, f(headRot - bodyRot), headRotx, ascale);
    for (let i = 0; i < MobRenderer.MAX_ARMOR_LAYERS; i++) {
      if (this.prepareArmor(mob, i, a) < 0) continue;
      // prepareArmor 返回非负表示子类已经把 armor 摆好了（基类恒返回 -1）
      const armor = this.armor!;
      armor.prepareMobModel(mob, wp, ws, a);
      armor.render(e, wp, ws, bob, f(headRot - bodyRot), headRotx, ascale);
      glDisable2(GL_BLEND);
      glEnable2(GL_ALPHA_TEST);
    }
    this.additionalRendering(mob, a);
    const br = mob.getBrightness(a);
    const overlayColor = this.getOverlayColor(mob, br, a);
    const renderOverlay = ((overlayColor >> 24) & 0xff) > 0;
    const renderHurt = mob.hurtTime > 0 || mob.deathTime > 0;
    if (renderOverlay || renderHurt) {
      glDisable2(GL_TEXTURE_2D);
      glDisable2(GL_ALPHA_TEST);
      glEnable2(GL_BLEND);
      glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
      glDepthFunc(GL_EQUAL);
      if (renderHurt) {
        glEnable(GL_COLOR_MATERIAL);
        glColor4f2(br, 0, 0, f(0.4));
        this.model.render(e, wp, ws, bob, f(headRot - bodyRot), headRotx, ascale);
        for (let i = 0; i < MobRenderer.MAX_ARMOR_LAYERS; i++) {
          if (this.prepareArmor(mob, i, a) < 0) continue;
          glColor4f2(br, 0, 0, f(0.4));
          const armor = this.armor!;
          armor.prepareMobModel(mob, wp, ws, a);
          armor.render(e, wp, ws, bob, f(headRot - bodyRot), headRotx, ascale);
        }
      }
      if (renderOverlay) {
        // C++ 用的是 `255.0f`（带 f 后缀）→ float 除法
        const r = f(((overlayColor >> 16) & 0xff) / f(255.0));
        const g = f(((overlayColor >> 8) & 0xff) / f(255.0));
        const b = f((overlayColor & 0xff) / f(255.0));
        const aa = f(((overlayColor >> 24) & 0xff) / f(255.0));
        glColor4f2(r, g, b, aa);
        this.model.render(e, wp, ws, bob, f(headRot - bodyRot), headRotx, ascale);
        for (let i = 0; i < MobRenderer.MAX_ARMOR_LAYERS; i++) {
          if (this.prepareArmor(mob, i, a) < 0) continue;
          glColor4f2(r, g, b, aa);
          const armor = this.armor!;
          armor.prepareMobModel(mob, wp, ws, a);
          armor.render(e, wp, ws, bob, f(headRot - bodyRot), headRotx, ascale);
        }
      }
      glDepthFunc(GL_LEQUAL);
      glDisable2(GL_BLEND);
      glEnable2(GL_ALPHA_TEST);
      glEnable2(GL_TEXTURE_2D);
    }
    glEnable2(GL_CULL_FACE);
    glPopMatrix2();
    this.postRender(mob, x, y, z, rot, a);
    this.renderName(mob, x, y, z);
  }

  /* MobRenderer.cpp:134 */
  setupPosition(mob: Entity, x: number, y: number, z: number): void {
    glTranslatef2(x, y, z);
  }

  /* MobRenderer.cpp:137 */
  setupRotations(mob_: Entity, _bob: number, bodyRot: number, a: number): void {
    glRotatef2(f(180 - bodyRot), 0, 1, 0);
    const mob = mob_ as Mob;
    if (mob.deathTime > 0) {
      let fall = f(((mob.deathTime + a - 1) / f(20.0)) * f(1.6));
      fall = f(Mth.sqrt(fall));
      if (fall > 1) fall = 1;
      glRotatef2(f(fall * this.getFlipDegrees(mob)), 0, 0, 1);
    }
  }

  /* MobRenderer.cpp:147 */
  getAttackAnim(mob: Mob, a: number): number {
    return mob.getAttackAnim(a);
  }

  /* MobRenderer.cpp:150 */
  getBob(mob: Mob, a: number): number {
    return f(mob.tickCount + a);
  }

  /* MobRenderer.cpp:153 */
  additionalRendering(_mob: Mob, _a: number): void {}

  /* MobRenderer.cpp:155 */
  override onGraphicsReset(): void {
    this.model.onGraphicsReset();
    if (this.armor) this.armor.onGraphicsReset();
  }

  /* MobRenderer.cpp:159 */
  prepareArmor(_mob: Mob, _layer: number, _a: number): number {
    return -1;
  }

  /* MobRenderer.cpp:162 */
  getFlipDegrees(_mob: Mob): number {
    return 90;
  }

  /* MobRenderer.cpp:165 */
  getOverlayColor(_mob: Mob, _br: number, _a: number): number {
    return 0;
  }

  /* MobRenderer.cpp:168 */
  scale(_mob: Mob, _a: number): void {}

  /* MobRenderer.cpp:170 */
  renderName(mob: Mob, x: number, y: number, z: number): void {
    const ss = String(mob.entityId); // C++ `ss << mob->entityId`：stringstream 输出 int
    const erd = EntityRenderer.entityRenderDispatcher!;
    if (erd.minecraft!.options.getBooleanValue(OptionId.OPTIONS_RENDER_DEBUG)) {
      this.renderNameTag(mob, ss, x, y, z, 64);
    }
  }

  /* MobRenderer.cpp:176 */
  renderNameTag(mob: Mob, name: string, x: number, y: number, z: number, maxDist: number): void {
    const erd = EntityRenderer.entityRenderDispatcher!;
    const dist = mob.distanceToSqr(erd.cameraEntity!);
    if (dist > maxDist * maxDist) return;
    const font = this.getFont() as Font;
    const size = f(1.6); // C++ `float size = 1.60f;`
    const s = f(f(1 / f(60.0)) * size);
    glPushMatrix2();
    if (mob.isPlayer()) {
      glTranslatef2(x, f(y + f(1.0)), z);
    } else {
      glTranslatef2(x, f(y + f(2.3)), z);
    }
    glRotatef2(f(-erd.playerRotY), 0, 1, 0);
    glRotatef2(erd.playerRotX, 1, 0, 0);
    glScalef2(-s, -s, s);
    glDisable(GL_LIGHTING);
    glDepthMask(false);
    glDisable2(GL_DEPTH_TEST);
    glEnable2(GL_BLEND);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    const t = Tesselator.instance;
    glDisable2(GL_TEXTURE_2D);
    t.begin();
    const w = Math.trunc(font.width(name) / 2); // C++ `int w = font->width(name) / 2;` 是整数除法
    t.color(0, 0, 0, f(0.25));
    t.vertex(-w - 1, -1, 0);
    t.vertex(-w - 1, 8, 0);
    t.vertex(w + 1, 8, 0);
    t.vertex(w + 1, -1, 0);
    t.draw();
    glEnable2(GL_TEXTURE_2D);
    const fnameWidth = f(font.width(name) / -2);
    font.draw(name, fnameWidth, 0, 0x20ffffff);
    glEnable2(GL_DEPTH_TEST);
    glDepthMask(true);
    font.draw(name, fnameWidth, 0, 0xffffffff | 0);
    glEnable(GL_LIGHTING);
    glDisable2(GL_BLEND);
    glColor4f2(1, 1, 1, 1);
    glPopMatrix2();
  }
}
