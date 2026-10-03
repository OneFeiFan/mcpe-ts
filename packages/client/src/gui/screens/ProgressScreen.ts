/**
 * 1:1 移植自 src/client/gui/screens/ProgressScreen.h 与 .cpp（B8d-1）。
 *
 * 「正在生成世界」那张加载屏：深色底 + 一条进度条 + 两行字（固定的 "Generating world"
 * 和 `minecraft.getProgressMessage()`）；进度状态 id 为 0（正在找服务器）时，状态文字后面
 * 还转一个小风车。
 *
 * 部分：
 *   - `render()` 末尾的 `sleepMs(50)` 是 C++ 里**阻塞主线程**让加载屏别刷太快用的，
 *     浏览器不能这么干 —— 标 OMIT(Web)；
 *   - `tick()` 里 10 秒后跳的那个 `DisconnectionScreen` 没移植（DEFERRED(Gui)）。
 *
 * 【render 里会 setScreen】世界一旦生成好就自己把屏关掉（C++ 就写在 render 开头）。
 * 别以为那是笔误。
 */
import { SharedConstants } from '@mcpe/core';
import { getTimeS } from '@mcpe/platform';
import type { Minecraft } from '../../Minecraft';
import { GL_BLEND, GL_TEXTURE_2D, glDisable2, glEnable2 } from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import { Screen } from '../Screen';

/** C++ 里是函数内的 `static const char* spinnerTexts[]`（PITFALLS 第 14 条：提到模块级） */
const SPINNER_TEXTS = ['-', '\\', '|', '/'];

export class ProgressScreen extends Screen {
  private ticks = 0;

  override render(_xm: number, _ym: number, _a: number): void {
    if (this.minecraft.isLevelGenerated()) {
      this.minecraft.setScreen(null);
      return;
    }
    const t = Tesselator.instance;
    this.renderBackground();
    this.minecraft.textures!.loadAndBindTexture('gui/background.png');
    const s = 32;
    t.begin();
    t.color(0x404040);
    t.vertexUV(0, this.height, 0, 0, this.height / s);
    t.vertexUV(this.width, this.height, 0, this.width / s, this.height / s);
    t.vertexUV(this.width, 0, 0, this.width / s, 0);
    t.vertexUV(0, 0, 0, 0, 0);
    t.draw();
    const i = this.minecraft.progressStagePercentage;
    if (i >= 0) {
      const w = 100;
      const h = 2;
      const x = Math.trunc(this.width / 2) - Math.trunc(w / 2);
      const y = Math.trunc(this.height / 2) + 16;
      glDisable2(GL_TEXTURE_2D);
      t.begin();
      t.color(0x808080);
      t.vertex(x, y, 0);
      t.vertex(x, y + h, 0);
      t.vertex(x + w, y + h, 0);
      t.vertex(x + w, y, 0);
      t.color(0x80ff80);
      t.vertex(x, y, 0);
      t.vertex(x, y + h, 0);
      t.vertex(x + i, y + h, 0);
      t.vertex(x + i, y, 0);
      t.draw();
      glEnable2(GL_TEXTURE_2D);
    }
    glEnable2(GL_BLEND);
    const font = this.minecraft.font!;
    const title = 'Generating world';
    font.drawShadow(
      title,
      Math.trunc((this.width - font.width(title)) / 2),
      Math.trunc(this.height / 2) - 4 - 16,
      0xffffff,
    );
    const status = this.minecraft.getProgressMessage();
    const progressWidth = font.width(status);
    const progressLeft = Math.trunc((this.width - progressWidth) / 2);
    const progressY = Math.trunc(this.height / 2) - 4 + 8;
    font.drawShadow(status, progressLeft, progressY, 0xffffff);
    const isLocating = this.minecraft.getProgressStatusId() === 0;
    if (isLocating) {
      const spinnerX = progressLeft + progressWidth + 6;
      const n = Math.trunc(5.5 * getTimeS()) % 4;
      this.drawCenteredString(font, SPINNER_TEXTS[n]!, spinnerX, progressY, 0xffffffff | 0);
    }
    glDisable2(GL_BLEND);
    // OMIT(Web): sleepMs(50);（C++ 阻塞主线程给加载屏减速；浏览器不能阻塞，去掉）
  }

  override isInGameScreen(): boolean {
    return false;
  }

  /** 【空的重写是故意的】C++ 盖掉了基类的 keyPressed，加载屏上按 ESC 不关屏 */
  protected override keyPressed(_eventKey: number): void {}

  override tick(): void {
    if (
      ++this.ticks === 10 * SharedConstants.TicksPerSecond &&
      this.minecraft.getProgressStatusId() === 0
    ) {
      // DEFERRED(Gui): minecraft->setScreen(new DisconnectionScreen("Could not connect to server. Try again."));
    }
  }
}
