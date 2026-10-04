/**
 * 1:1 移植自 src/client/renderer/entity/ArrowRenderer.h 与 .cpp（整个类 62 行 + 头 8 行）。
 *
 * 画一支箭：一个箭杆（4 个侧面）+ 一个箭尾（两片、每片转 90° 画 4 次），
 * 贴图是 `item/arrows.png` 里 32×32 的那一块（上半 5 行是箭尾、下半 5 行是箭杆）。
 *
 * 【为什么补这个（D11.5）】D11 把箭接上线之后它逻辑全对但**画面上看不见** ——
 * 和 D2 的落沙、D9 的雪球是同一个缺口（实体渲染器没移植）。这个是那批里第二小的：
 * 不依赖模型系统，只有 12 个顶点。照 D2.5 / D9.5 的先例单拎出来补。
 *
 * 【照抄的两处】
 *   1. C++ 这里混用了两套 gl 名字：`glPushMatrix2/glPopMatrix2` 是带 2 的，
 *      而 `glTranslatef/glRotatef/glScalef` **不带 2**。TS 的 gles 里 `xxx2` 就是 `xxx`
 *      （gles.ts:286-289 的别名），所以两种写法等价 —— 但**按 C++ 原样写**，别"统一"。
 *   2. `int type = 0;` 是照抄的：0.6.1 只有一种箭，这个局部量恒为 0，
 *      但 uv 算式里那些 `type * 10` 还留着。
 *
 * 【第三档浮点】这是画面（PITFALLS 第 3 条第三档），uv 那几个算式不逐步 fround；
 * 带 f 后缀的字面量（`0.9f`）照样包 `f()`。
 */
import { Mth } from '@mcpe/util';
import { type Arrow, type Entity } from '@mcpe/world';
import {
  glPopMatrix2,
  glPushMatrix2,
  glRotatef,
  glScalef,
  glTranslatef,
} from '../gles';
import { Tesselator } from '../Tesselator';
import { EntityRenderer } from './EntityRenderer';

const f = Math.fround;

export class ArrowRenderer extends EntityRenderer {
  override render(entity: Entity, x: number, y: number, z: number, _rot: number, a: number): void {
    this.bindTexture('item/arrows.png');
    const arrow = entity as Arrow;
    glPushMatrix2();
    glTranslatef(x, y, z);
    glRotatef(arrow.yRotO + (arrow.yRot - arrow.yRotO) * a - 90, 0, 1, 0);
    glRotatef(arrow.xRotO + (arrow.xRot - arrow.xRotO) * a, 0, 0, 1);
    const t = Tesselator.instance;
    const type = 0;
    const u0 = 0 / 32.0;
    const u1 = 16 / 32.0;
    const v0 = (0 + type * 10) / 32.0;
    const v1 = (5 + type * 10) / 32.0;
    const u02 = 0 / 32.0;
    const u12 = 5 / 32.0;
    const v02 = (5 + type * 10) / 32.0;
    const v12 = (10 + type * 10) / 32.0;
    const ss = f(0.9) / 16.0;
    const shake = arrow.shakeTime - a;
    if (shake > 0) {
      const pow = -Mth.sin(f(shake * 3)) * shake;
      glRotatef(pow, 0, 0, 1);
    }
    glRotatef(45, 1, 0, 0);
    glScalef(ss, ss, ss);
    glTranslatef(-4, 0, 0);
    t.begin();
    t.vertexUV(-7, -2, -2, u02, v02);
    t.vertexUV(-7, -2, +2, u12, v02);
    t.vertexUV(-7, +2, +2, u12, v12);
    t.vertexUV(-7, +2, -2, u02, v12);
    t.vertexUV(-7, +2, -2, u02, v02);
    t.vertexUV(-7, +2, +2, u12, v02);
    t.vertexUV(-7, -2, +2, u12, v12);
    t.vertexUV(-7, -2, -2, u02, v12);
    t.draw();
    for (let i = 0; i < 4; i++) {
      glRotatef(90, 1, 0, 0);
      t.begin();
      t.vertexUV(-8, -2, 0, u0, v0);
      t.vertexUV(+8, -2, 0, u1, v0);
      t.vertexUV(+8, +2, 0, u1, v1);
      t.vertexUV(-8, +2, 0, u0, v1);
      t.endOverrideAndDraw();
    }
    glPopMatrix2();
  }
}
