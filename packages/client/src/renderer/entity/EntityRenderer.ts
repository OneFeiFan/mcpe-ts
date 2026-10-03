/**
 * 1:1 移植自 src/client/renderer/entity/EntityRenderer.h 与 EntityRenderer.cpp（S13 阶段 C）。
 * C++ 的静态成员 entityRenderDispatcher 由 init 设置（各渲染器共用同一个分派器）。
 * R10：静态的 render(const AABB&, xo, yo, zo) 与纯虚的 render(Entity*, …) 同名，前者命名为 renderAABB。
 */
import { Mth } from '@mcpe/util';
import type { AABB, Entity, Level, Tile } from '@mcpe/world';
import { Tile as TileClass } from '@mcpe/world';
import type { Font } from '../../gui/Font';
import { OptionId } from '../../Options';
import {
  GL_BLEND,
  GL_CLAMP_TO_EDGE,
  GL_LIGHTING,
  GL_ONE_MINUS_SRC_ALPHA,
  GL_REPEAT,
  GL_SRC_ALPHA,
  GL_TEXTURE_2D,
  GL_TEXTURE_WRAP_S,
  GL_TEXTURE_WRAP_T,
  glBlendFunc2,
  glColor4f2,
  glDepthMask,
  glDisable,
  glDisable2,
  glEnable2,
  glPopMatrix2,
  glPushMatrix2,
  glRotatef2,
  glScalef2,
  glTexParameteri,
  glTranslatef2,
} from '../gles';
import { Tesselator } from '../Tesselator';
import type { EntityRenderDispatcher } from './EntityRenderDispatcher';

const f = Math.fround;

export abstract class EntityRenderer {
  protected static entityRenderDispatcher: EntityRenderDispatcher | null = null;
  protected shadowRadius = 0;
  protected shadowStrength = 1.0;

  init(entityRenderDispatcher: EntityRenderDispatcher): void {
    EntityRenderer.entityRenderDispatcher = entityRenderDispatcher;
  }

  abstract render(entity: Entity, x: number, y: number, z: number, rot: number, a: number): void;

  /** C++ 的 static render(const AABB& bb, float xo, float yo, float zo) */
  static renderAABB(bb: AABB, xo: number, yo: number, zo: number): void {
    glDisable2(GL_TEXTURE_2D);
    const t = Tesselator.instance;
    glColor4f2(1, 1, 1, 1);
    t.begin();
    t.offset(xo, yo, zo);
    t.normal(0, 0, -1);
    t.vertex(bb.x0, bb.y1, bb.z0);
    t.vertex(bb.x1, bb.y1, bb.z0);
    t.vertex(bb.x1, bb.y0, bb.z0);
    t.vertex(bb.x0, bb.y0, bb.z0);
    t.normal(0, 0, 1);
    t.vertex(bb.x0, bb.y0, bb.z1);
    t.vertex(bb.x1, bb.y0, bb.z1);
    t.vertex(bb.x1, bb.y1, bb.z1);
    t.vertex(bb.x0, bb.y1, bb.z1);
    t.normal(0, -1, 0);
    t.vertex(bb.x0, bb.y0, bb.z0);
    t.vertex(bb.x1, bb.y0, bb.z0);
    t.vertex(bb.x1, bb.y0, bb.z1);
    t.vertex(bb.x0, bb.y0, bb.z1);
    t.normal(0, 1, 0);
    t.vertex(bb.x0, bb.y1, bb.z1);
    t.vertex(bb.x1, bb.y1, bb.z1);
    t.vertex(bb.x1, bb.y1, bb.z0);
    t.vertex(bb.x0, bb.y1, bb.z0);
    t.normal(-1, 0, 0);
    t.vertex(bb.x0, bb.y0, bb.z1);
    t.vertex(bb.x0, bb.y1, bb.z1);
    t.vertex(bb.x0, bb.y1, bb.z0);
    t.vertex(bb.x0, bb.y0, bb.z0);
    t.normal(1, 0, 0);
    t.vertex(bb.x1, bb.y0, bb.z0);
    t.vertex(bb.x1, bb.y1, bb.z0);
    t.vertex(bb.x1, bb.y1, bb.z1);
    t.vertex(bb.x1, bb.y0, bb.z1);
    t.offset(0, 0, 0);
    t.draw();
    glEnable2(GL_TEXTURE_2D);
  }

  static renderFlat(bb: AABB): void {
    const t = Tesselator.instance;
    t.begin();
    t.vertex(bb.x0, bb.y1, bb.z0);
    t.vertex(bb.x1, bb.y1, bb.z0);
    t.vertex(bb.x1, bb.y0, bb.z0);
    t.vertex(bb.x0, bb.y0, bb.z0);
    t.vertex(bb.x0, bb.y0, bb.z1);
    t.vertex(bb.x1, bb.y0, bb.z1);
    t.vertex(bb.x1, bb.y1, bb.z1);
    t.vertex(bb.x0, bb.y1, bb.z1);
    t.vertex(bb.x0, bb.y0, bb.z0);
    t.vertex(bb.x1, bb.y0, bb.z0);
    t.vertex(bb.x1, bb.y0, bb.z1);
    t.vertex(bb.x0, bb.y0, bb.z1);
    t.vertex(bb.x0, bb.y1, bb.z1);
    t.vertex(bb.x1, bb.y1, bb.z1);
    t.vertex(bb.x1, bb.y1, bb.z0);
    t.vertex(bb.x0, bb.y1, bb.z0);
    t.vertex(bb.x0, bb.y0, bb.z1);
    t.vertex(bb.x0, bb.y1, bb.z1);
    t.vertex(bb.x0, bb.y1, bb.z0);
    t.vertex(bb.x0, bb.y0, bb.z0);
    t.vertex(bb.x1, bb.y0, bb.z0);
    t.vertex(bb.x1, bb.y1, bb.z0);
    t.vertex(bb.x1, bb.y1, bb.z1);
    t.vertex(bb.x1, bb.y0, bb.z1);
    t.draw();
  }

  getFont(): Font | null {
    return EntityRenderer.entityRenderDispatcher!.getFont();
  }

  postRender(entity: Entity, x: number, y: number, z: number, _rot: number, a: number): void {
    const erd = EntityRenderer.entityRenderDispatcher!;
    if (
      erd.minecraft!.options.getBooleanValue(OptionId.OPTIONS_FANCY_GRAPHICS) &&
      this.shadowRadius > 0
    ) {
      const dist = erd.distanceToSqr(entity.x, entity.y, entity.z);
      const pow = f((1 - dist / (16.0 * 16.0)) * this.shadowStrength);
      if (pow > 0) {
        this.renderShadow(entity, x, y, z, pow, a);
      }
    }
    if (entity.isOnFire()) this.renderFlame(entity, x, y, z, a);
  }

  renderFlame(e: Entity, x: number, y: number, z: number, _a: number): void {
    glDisable(GL_LIGHTING);
    const tex = TileClass.fire.tex;
    const xt = (tex & 0xf) << 4;
    const yt = tex & 0xf0;
    const u0 = xt / 256.0;
    const u1 = (xt + 15.99) / 256.0;
    const v0 = yt / 256.0;
    const v1 = (yt + 15.99) / 256.0;
    glPushMatrix2();
    glTranslatef2(x, y, z);
    const s = f(e.bbWidth * 1.4);
    glScalef2(s, s, s);
    this.bindTexture('terrain.png');
    const t = Tesselator.instance;
    let r = 0.5;
    const xo = 0.0;
    let h = f(e.bbHeight / s);
    let yo = f((e.y - e.bb.y0) / s);
    glRotatef2(-EntityRenderer.entityRenderDispatcher!.playerRotY, 0, 1, 0);
    glTranslatef2(0, 0, -0.3 + Math.trunc(h) * 0.02);
    glColor4f2(1, 1, 1, 1);
    let zo = 0.0;
    let cycle_counter = 0;
    t.begin();
    while (h > 0.0) {
      let current_u0 = u0;
      let current_u1 = u1;
      let current_v0 = v0;
      let current_v1 = v1;
      if (cycle_counter % 2 !== 0) {
        current_v0 = (yt + 16) / 256.0;
        current_v1 = (yt + 16 + 15.99) / 256.0;
      }
      if (Math.trunc(cycle_counter / 2) % 2 === 0) {
        const tmp = current_u1;
        current_u1 = current_u0;
        current_u0 = tmp;
      }
      t.vertexUV(r - xo, 0.0 - yo, zo, current_u1, current_v1);
      t.vertexUV(-r - xo, 0.0 - yo, zo, current_u0, current_v1);
      t.vertexUV(-r - xo, 1.4 - yo, zo, current_u0, current_v0);
      t.vertexUV(r - xo, 1.4 - yo, zo, current_u1, current_v0);
      h = f(h - 0.45);
      yo = f(yo - 0.45);
      r = f(r * 0.9);
      zo = f(zo + 0.03);
      cycle_counter++;
    }
    t.draw();
    glPopMatrix2();
    glEnable2(GL_LIGHTING);
  }

  renderShadow(e: Entity, x: number, y: number, z: number, pow: number, a: number): void {
    glEnable2(GL_BLEND);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    const textures = EntityRenderer.entityRenderDispatcher!.textures!;
    textures.loadAndBindTexture('misc/shadow.png');
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    const level = this.getLevel()!;
    glDepthMask(false);
    const r = this.shadowRadius;
    const ex = e.xOld + (e.x - e.xOld) * a;
    const ey = e.yOld + (e.y - e.yOld) * a + e.getShadowHeightOffs();
    const ez = e.zOld + (e.z - e.zOld) * a;
    const x0 = Mth.floor(ex - r);
    const x1 = Mth.floor(ex + r);
    const y0 = Mth.floor(ey - r);
    const y1 = Mth.floor(ey);
    const z0 = Mth.floor(ez - r);
    const z1 = Mth.floor(ez + r);
    const xo = x - ex;
    const yo = y - ey;
    const zo = z - ez;
    const tt = Tesselator.instance;
    tt.begin();
    for (let xt = x0; xt <= x1; xt++)
      for (let yt = y0; yt <= y1; yt++)
        for (let zt = z0; zt <= z1; zt++) {
          const t = level.getTile(xt, yt - 1, zt);
          if (t > 0 && level.getRawBrightness(xt, yt, zt) > 3) {
            this.renderTileShadow(
              TileClass.tiles[t]!,
              x,
              y + e.getShadowHeightOffs(),
              z,
              xt,
              yt,
              zt,
              pow,
              r,
              xo,
              yo + e.getShadowHeightOffs(),
              zo,
            );
          }
        }
    tt.draw();
    glColor4f2(1, 1, 1, 1);
    glDisable2(GL_BLEND);
    glDepthMask(true);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
  }

  renderTileShadow(
    tt: Tile,
    x: number,
    y: number,
    z: number,
    xt: number,
    yt: number,
    zt: number,
    pow: number,
    r: number,
    xo: number,
    yo: number,
    zo: number,
  ): void {
    const t = Tesselator.instance;
    if (!tt.isCubeShaped()) return;
    let a = f((pow - (y - (yt + yo)) / 2) * 0.5 * this.getLevel()!.getBrightness(xt, yt, zt));
    if (a < 0) return;
    if (a > 1) a = 1;
    glColor4f2(1, 1, 1, a);
    const x0 = xt + tt.xx0 + xo;
    const x1 = xt + tt.xx1 + xo;
    const y0 = yt + tt.yy0 + yo + 1.0 / 64.0;
    const z0 = zt + tt.zz0 + zo;
    const z1 = zt + tt.zz1 + zo;
    const u0 = f((x - x0) / 2 / r + 0.5);
    const u1 = f((x - x1) / 2 / r + 0.5);
    const v0 = f((z - z0) / 2 / r + 0.5);
    const v1 = f((z - z1) / 2 / r + 0.5);
    t.vertexUV(x0, y0, z0, u0, v0);
    t.vertexUV(x0, y0, z1, u0, v1);
    t.vertexUV(x1, y0, z1, u1, v1);
    t.vertexUV(x1, y0, z0, u1, v0);
  }

  getLevel(): Level | null {
    return EntityRenderer.entityRenderDispatcher!.level;
  }

  onGraphicsReset(): void {}

  protected bindTexture(resourceName: string): void {
    EntityRenderer.entityRenderDispatcher!.textures!.loadAndBindTexture(resourceName);
  }
}
