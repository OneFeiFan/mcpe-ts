/**
 * 1:1 移植自 src/client/renderer/entity/TntRenderer.h 与 .cpp（任务单 G 的 G10）。
 *
 * 【它是谁】点燃的 TNT 实体的渲染器：画一个 TNT 方块；快炸时先"鼓起来"（`glScalef2` 缩放），
 * 并且 `life / 5` 为偶数的那几 tick 再画第二遍 —— 关纹理、开混合、半透明叠一层白光（闪烁感）。
 *
 * 【照抄的三处】
 *   1. `g < 0` / `g > 1` 两个 clamp 是**死分支**（能进这支说明 `life - a + 1 < 10`，
 *      而渲染时 `life >= 0` → 该值恒 > 0 → g 恒落在 (0, 1] 内），原样保留不删。
 *   2. `g = g * g;` 连写两遍（四次方），别顺手合并成 `g ** 4`。
 *   3. `(life / 5) & 1` 是**整数除法**（PITFALLS 第 1 条）→ `Math.trunc(tnt.life / 5) & 1`。
 *
 * 【浮点】渲染属第三档：不逐步 fround；带 f 后缀的小数字面量过 f()（0.3f、0.8f），
 * 整数形态的（1.0f、10.0f、100.0f）直写。
 */
import { type Entity, type PrimedTnt, Tile } from '@mcpe/world';
import {
  GL_BLEND,
  GL_DST_ALPHA,
  GL_SRC_ALPHA,
  GL_TEXTURE_2D,
  glBlendFunc2,
  glColor4f2,
  glDisable2,
  glEnable2,
  glPopMatrix2,
  glPushMatrix2,
  glScalef2,
  glTranslatef2,
} from '../gles';
import { Tesselator } from '../Tesselator';
import { TileRenderer } from '../TileRenderer';
import { EntityRenderer } from './EntityRenderer';

const f = Math.fround;

export class TntRenderer extends EntityRenderer {
  tileRenderer: TileRenderer;

  constructor() {
    super();
    this.shadowRadius = f(0.5);
    this.tileRenderer = new TileRenderer();
  }

  override render(e: Entity, x: number, y: number, z: number, _rot: number, a: number): void {
    const tnt = e as PrimedTnt;

    glPushMatrix2();
    glTranslatef2(x, y, z);

    if (tnt.life - a + 1 < 10) {
      let g = 1 - (tnt.life - a + 1) / 10.0;
      if (g < 0) g = 0; // 死分支（见文件头），照抄
      if (g > 1) g = 1; // 死分支（见文件头），照抄
      g = g * g;
      g = g * g;
      const s = 1.0 + g * f(0.3);
      glScalef2(s, s, s);
    }

    const br = (1 - (tnt.life - a + 1) / 100.0) * f(0.8);
    this.bindTexture('terrain.png');
    const t = Tesselator.instance;
    t.color(1.0, 1.0, 1.0);
    this.tileRenderer.renderTile(Tile.tnt, 0);

    if ((Math.trunc(tnt.life / 5) & 1) === 0) {
      glDisable2(GL_TEXTURE_2D);
      glEnable2(GL_BLEND);
      glBlendFunc2(GL_SRC_ALPHA, GL_DST_ALPHA);
      glColor4f2(1, 1, 1, br);
      this.tileRenderer.renderTile(Tile.tnt, 0);
      glColor4f2(1, 1, 1, 1);
      glDisable2(GL_BLEND);
      glEnable2(GL_TEXTURE_2D);
    }

    glPopMatrix2();
  }
}
