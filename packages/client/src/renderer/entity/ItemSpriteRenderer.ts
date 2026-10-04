/**
 * 1:1 移植自 src/client/renderer/entity/ItemSpriteRenderer.h 与 .cpp（整个类 41 行 + 头 18 行）。
 *
 * 画"一张物品图标"：把 `gui/items.png` 里 16×16 的那一格摊成 1×1 的平板，并且永远正对镜头
 * （用 `playerRotY/playerRotX` 把玩家朝向反过来转回去）。C++ 那边只有两个用户：
 *   assign(ER_THROWNEGG_RENDERER, new ItemSpriteRenderer(Item::egg->getIcon(0)));
 *   assign(ER_SNOWBALL_RENDERER,  new ItemSpriteRenderer(Item::snowBall->getIcon(0)));
 * —— 也就是**雪球和蛋共用这一个类**，只是图标格号不同。
 *
 * 【为什么补这个（D9.5）】D9 把雪球接上线之后，实体能飞、能撞、能消失 —— **但画面上看不见**，
 * 和 D2 的落沙是同一个缺口（实体渲染器没移植，`EntityRenderDispatcher.renderAt` 拿不到就跳过）。
 * 这个类是那一批里最小的：不依赖模型系统，也不依赖 TileRenderer，只有 4 个顶点。
 * ⚠ 建了它之后 `EntityRenderDispatcher` 的构造函数会去读 `Item.snowBall`，
 * 所以**物品必须先初始化**（真机是 `NinecraftApp.initApp` 里 initItems 在前，天然满足）。
 *
 * 【三处照抄的细节】
 *   1. `icon / 16` 是 C++ 的**整数除法**（icon 是 int）→ `Math.trunc(icon / 16)`
 *      （icon 非负，trunc 就是 C++ 的截断语义）。
 *   2. uv 那几个算式**不逐步 fround** —— 这是画面（PITFALLS 第 3 条的第三档），
 *      写法与隔壁 ItemRenderer 里同款的一段保持一致。
 *   3. `glRotatef2(180 - playerRotY, 0, 1, 0)` 与 `glRotatef2(-playerRotX, 1, 0, 0)`
 *      —— 一个 y 轴一个 x 轴，顺序也是原样（先 y 后 x）。
 */
import type { Entity } from '@mcpe/world';
import {
  glPopMatrix2,
  glPushMatrix2,
  glRotatef2,
  glScalef2,
  glTranslatef2,
} from '../gles';
import { Tesselator } from '../Tesselator';
import { EntityRenderer } from './EntityRenderer';

export class ItemSpriteRenderer extends EntityRenderer {
  private icon: number;

  constructor(icon: number) {
    super();
    this.icon = icon;
  }

  override render(_e: Entity, x: number, y: number, z: number, _rot: number, _a: number): void {
    const erd = EntityRenderer.entityRenderDispatcher!;

    glPushMatrix2();
    glTranslatef2(x, y, z);
    glScalef2(1 / 2.0, 1 / 2.0, 1 / 2.0);
    this.bindTexture('gui/items.png');
    const t = Tesselator.instance;
    const u0 = ((this.icon % 16) * 16 + 0) / 256.0;
    const u1 = ((this.icon % 16) * 16 + 16) / 256.0;
    const v0 = (Math.trunc(this.icon / 16) * 16 + 0) / 256.0;
    const v1 = (Math.trunc(this.icon / 16) * 16 + 16) / 256.0;
    const r = 1.0;
    const xo = 0.5;
    const yo = 0.25;
    glRotatef2(180 - erd.playerRotY, 0, 1, 0);
    glRotatef2(-erd.playerRotX, 1, 0, 0);
    t.begin();
    t.vertexUV(0 - xo, 0 - yo, 0, u0, v1);
    t.vertexUV(r - xo, 0 - yo, 0, u1, v1);
    t.vertexUV(r - xo, 1 - yo, 0, u1, v0);
    t.vertexUV(0 - xo, 1 - yo, 0, u0, v0);
    t.draw();
    glPopMatrix2();
  }
}
