/**
 * 1:1 移植自 src/client/renderer/entity/PaintingRenderer.h 与 .cpp（任务单 G 的 G10）。
 *
 * 【它是谁】挂在墙上的画的渲染器。`renderPainting` 是核心：把画作（motive）的图块
 * 铺成 `w × h` 的"像素板"—— 画先缩到 1/16，之后 1 单位 = 1 像素；每个 16×16 的图块
 * 画一块厚 1 像素的板（正面/背面/上/下/左/右共 24 个顶点一批）。
 *
 * 【照抄的四处】
 *   1. gl 名字混用照抄：render 里用**不带 2** 的那套（glPushMatrix/glRotatef/glScalef/glPopMatrix），
 *      和 C++ 原文一致（两套名字是同一函数的别名，见 gles.ts 的别名导出）。
 *   2. 12 个 UV 常量里 bu0==uu0、bu1==uu1、bv1==sv1、uv0==uv1 —— 看着冗余，是 C++ 原样，不合并。
 *   3. `w / 16`、`h / 16` 是**整数除法**（PITFALLS 第 1 条）→ Math.trunc。
 *   4. 24 个 vertexUV 的顺序（正面、背面、顶、底、左、右）逐条照抄。
 *
 * 【浮点】第三档：整数形态字面量（16、256.0、1.0f）直写；带 f 后缀的小数（0.5f）过 f()。
 */
import { type Entity, type Painting } from '@mcpe/world';
import {
  GL_RESCALE_NORMAL,
  glDisable,
  glEnable,
  glPopMatrix,
  glPushMatrix,
  glRotatef,
  glScalef,
  glTranslatef,
} from '../gles';
import { Tesselator } from '../Tesselator';
import { EntityRenderer } from './EntityRenderer';

const f = Math.fround;

export class PaintingRenderer extends EntityRenderer {
  override render(e: Entity, x: number, y: number, z: number, rot: number, a: number): void {
    glPushMatrix();
    glTranslatef(x, y, z);
    glRotatef(rot, 0, 1.0, 0);
    glEnable(GL_RESCALE_NORMAL);
    this.bindTexture('art/kz.png');
    const painting = e as Painting;
    const motive = painting.motive;
    const s = 1.0 / 16.0;
    glScalef(s, s, s);
    this.renderPainting(painting, motive.w, motive.h, motive.uo, motive.vo, a);
    glDisable(GL_RESCALE_NORMAL);
    glPopMatrix();
  }

  private renderPainting(
    painting: Painting,
    w: number,
    h: number,
    uo: number,
    vo: number,
    a: number,
  ): void {
    const xx0 = -w / 2.0;
    const yy0 = -h / 2.0;
    const edgeWidth = f(0.5);
    const bu0 = (12 * 16) / 256.0;
    const bu1 = (12 * 16 + 16) / 256.0;
    const bv0 = 0 / 256.0;
    const bv1 = (0 + 16) / 256.0;
    const uu0 = (12 * 16) / 256.0;
    const uu1 = (12 * 16 + 16) / 256.0;
    const uv0 = f(0.5) / 256.0;
    const uv1 = f(0.5) / 256.0;
    const su0 = (12 * 16 + f(0.5)) / 256.0;
    const su1 = (12 * 16 + f(0.5)) / 256.0;
    const sv0 = 0 / 256.0;
    const sv1 = (0 + 16) / 256.0;

    for (let xs = 0; xs < Math.trunc(w / 16); xs++) {
      for (let ys = 0; ys < Math.trunc(h / 16); ys++) {
        const x0 = xx0 + (xs + 1) * 16;
        const x1 = xx0 + xs * 16;
        const y0 = yy0 + (ys + 1) * 16;
        const y1 = yy0 + ys * 16;
        const fu0 = (uo + w - xs * 16) / 256.0;
        const fu1 = (uo + w - (xs + 1) * 16) / 256.0;
        const fv0 = (vo + h - ys * 16) / 256.0;
        const fv1 = (vo + h - (ys + 1) * 16) / 256.0;

        const t = Tesselator.instance;
        const br = painting.getBrightness(a);
        t.color(br, br, br);
        t.begin();
        t.vertexUV(x0, y1, -edgeWidth, fu1, fv0);
        t.vertexUV(x1, y1, -edgeWidth, fu0, fv0);
        t.vertexUV(x1, y0, -edgeWidth, fu0, fv1);
        t.vertexUV(x0, y0, -edgeWidth, fu1, fv1);
        t.vertexUV(x0, y0, edgeWidth, bu0, bv0);
        t.vertexUV(x1, y0, edgeWidth, bu1, bv0);
        t.vertexUV(x1, y1, edgeWidth, bu1, bv1);
        t.vertexUV(x0, y1, edgeWidth, bu0, bv1);
        t.vertexUV(x0, y0, -edgeWidth, uu0, uv0);
        t.vertexUV(x1, y0, -edgeWidth, uu1, uv0);
        t.vertexUV(x1, y0, edgeWidth, uu1, uv1);
        t.vertexUV(x0, y0, edgeWidth, uu0, uv1);
        t.vertexUV(x0, y1, edgeWidth, uu0, uv0);
        t.vertexUV(x1, y1, edgeWidth, uu1, uv0);
        t.vertexUV(x1, y1, -edgeWidth, uu1, uv1);
        t.vertexUV(x0, y1, -edgeWidth, uu0, uv1);
        t.vertexUV(x0, y0, edgeWidth, su1, sv0);
        t.vertexUV(x0, y1, edgeWidth, su1, sv1);
        t.vertexUV(x0, y1, -edgeWidth, su0, sv1);
        t.vertexUV(x0, y0, -edgeWidth, su0, sv0);
        t.vertexUV(x1, y0, -edgeWidth, su1, sv0);
        t.vertexUV(x1, y1, -edgeWidth, su1, sv1);
        t.vertexUV(x1, y1, edgeWidth, su0, sv1);
        t.vertexUV(x1, y0, edgeWidth, su0, sv0);
        t.draw();
      }
    }
  }
}
