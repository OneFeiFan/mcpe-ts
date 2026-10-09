/**
 * 1:1 移植自 src/util/PerfRenderer.h 与 PerfRenderer.cpp（调试画面）：“渲染调试”选项打开时的帧时间曲线与 PerfTimer 饼图。
 * 左下：最近 512 帧的帧时间竖线（超过 1/60 秒画红色）；右下：当前 PerfTimer 路径下各区段的饼图与百分比；按 0–9 进出子区段。
 * 放在 client 包（C++ 在 src/util/，但它要用 Minecraft、Font、Tesselator）。
 * 原样保留：
 *   - frameTimes 存的是**秒**，却拿去和微秒的 usPer60Fps 比较（frameTimes[i] > usPer60Fps 几乎永远为假，竖线基本都是绿色）；
 *   - 第一个色块的 hh1 = usPer60Fps / 200 = 83 像素高（与帧时间无关）；
 *   - `(i - frameTimePos) & (size - 1)` 里 i 是 unsigned，减法回绕后按 511 取掩码。
 */
import { getTimeS } from '@mcpe/platform';
import { Mth, PerfTimer } from '@mcpe/util';
import type { Font } from '../gui/Font';
import type { Minecraft } from '../Minecraft';
import {
  GL_BLEND, GL_COLOR_MATERIAL, GL_CULL_FACE, GL_DEPTH_BUFFER_BIT, GL_LINES, GL_MODELVIEW, GL_PROJECTION, GL_QUADS, GL_TEXTURE_2D,
  GL_TRIANGLE_FAN, GL_TRIANGLE_STRIP, glClear, glDisable, glDisable2, glEnable, glEnable2, glLineWidth, glLoadIdentity2, glMatrixMode,
  glOrthof, glTranslatef2,
} from '../renderer/gles';
import { Tesselator } from '../renderer/Tesselator';

const f = Math.fround;

export class PerfRenderer {
  private _mc: Minecraft;
  private _font: Font;
  private _debugPath = 'root';
  private frameTimes: number[] = new Array<number>(512).fill(0);
  private tickTimes: number[] = new Array<number>(512).fill(0);
  private frameTimePos = 0;
  private lastTimer = -1;

  constructor(mc: Minecraft, font: Font) {
    this._mc = mc;
    this._font = font;
  }

  debugFpsMeterKeyPress(key: number): void {
    const list = PerfTimer.getLog(this._debugPath);
    if (list.length === 0) return;
    const node = list.shift()!;
    if (key === 0) {
      if (node.name.length > 0) {
        const pos = this._debugPath.lastIndexOf('.');
        if (pos !== -1) this._debugPath = this._debugPath.substring(0, pos);
      }
    } else {
      key--;
      if (key < list.length && list[key]!.name !== 'unspecified') {
        if (this._debugPath.length > 0) this._debugPath += '.';
        this._debugPath += list[key]!.name;
      }
    }
  }

  renderFpsMeter(tickTime: number): void {
    const list = PerfTimer.getLog(this._debugPath);
    if (list.length === 0) return;
    const node = list.shift()!;
    const mc = this._mc;
    const usPer60Fps = Math.trunc(1000000 / 60);
    if (this.lastTimer === -1) {
      this.lastTimer = f(getTimeS());
    }
    const now = f(getTimeS());
    this.tickTimes[this.frameTimePos] = f(tickTime);
    this.frameTimes[this.frameTimePos] = f(now - this.lastTimer);
    this.lastTimer = now;
    if (++this.frameTimePos >= this.frameTimes.length) this.frameTimePos = 0;
    glClear(GL_DEPTH_BUFFER_BIT);
    glMatrixMode(GL_PROJECTION);
    glEnable2(GL_COLOR_MATERIAL);
    glLoadIdentity2();
    glOrthof(0, mc.width, mc.height, 0, 1000, 3000);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity2();
    glTranslatef2(0, 0, -2000);
    glLineWidth(1);
    glDisable2(GL_TEXTURE_2D);
    const t = Tesselator.instance;
    t.begin(GL_QUADS);
    const hh1 = Math.trunc(usPer60Fps / 200);
    const count = this.frameTimes.length;
    t.color(0x20000000);
    t.vertex(0, mc.height - hh1, 0);
    t.vertex(0, mc.height, 0);
    t.vertex(count, mc.height, 0);
    t.vertex(count, mc.height - hh1, 0);
    t.color(0x20200000);
    t.vertex(0, mc.height - hh1 * 2, 0);
    t.vertex(0, mc.height - hh1, 0);
    t.vertex(count, mc.height - hh1, 0);
    t.vertex(count, mc.height - hh1 * 2, 0);
    t.draw();
    let totalTime = 0;
    for (const ft of this.frameTimes) totalTime = f(totalTime + ft);
    const hh = Math.trunc(f(f(totalTime / 200) / this.frameTimes.length));
    t.begin();
    t.color(0x20400000);
    t.vertex(0, mc.height - hh, 0);
    t.vertex(0, mc.height, 0);
    t.vertex(count, mc.height, 0);
    t.vertex(count, mc.height - hh, 0);
    t.draw();
    t.begin(GL_LINES);
    const n = this.frameTimes.length;
    for (let i = 0; i < n; i++) {
      const col = Math.trunc((((i - this.frameTimePos) >>> 0) & (n - 1)) * 255 / n); // unsigned 回绕
      let cc = Math.trunc((col * col) / 255);
      cc = Math.trunc((cc * cc) / 255);
      let cc2 = Math.trunc((cc * cc) / 255);
      cc2 = Math.trunc((cc2 * cc2) / 255);
      if (this.frameTimes[i]! > usPer60Fps) {
        t.color((0xff000000 + cc * 65536) | 0);
      } else {
        t.color((0xff000000 + cc * 256) | 0);
      }
      const time = f(this.frameTimes[i]! * 4000.0);
      const time2 = f(f(10 * 1000 * this.tickTimes[i]!) / 200);
      t.vertex(f(i + 0.5), f(f(mc.height - time) + 0.5), 0);
      t.vertex(f(i + 0.5), f(mc.height + 0.5), 0);
      t.color((0xff000000 + cc * 65536 + cc * 256 + cc * 1) | 0);
      t.vertex(f(i + 0.5), f(f(mc.height - time) + 0.5), 0);
      t.vertex(f(i + 0.5), f(f(mc.height - f(time - time2)) + 0.5), 0);
    }
    t.draw();
    const r = 160;
    const x = mc.width - r - 10;
    const y = mc.height - r * 2;
    glEnable(GL_BLEND);
    t.begin();
    t.color(0x000000, 200);
    t.vertex(f(x - f(r * 1.1)), f(f(y - f(r * 0.6)) - 16), 0);
    t.vertex(f(x - f(r * 1.1)), f(y + r * 2.0), 0);
    t.vertex(f(x + f(r * 1.1)), f(y + r * 2.0), 0);
    t.vertex(f(x + f(r * 1.1)), f(f(y - f(r * 0.6)) - 16), 0);
    t.draw();
    glDisable(GL_BLEND);
    glDisable(GL_CULL_FACE);
    let totalPercentage = 0;
    for (const result of list) {
      const steps = Mth.floor(f(result.percentage / 4)) + 1;
      t.begin(GL_TRIANGLE_FAN);
      t.color(result.getColor());
      t.vertex(x, y, 0);
      for (let j = steps; j >= 0; j--) {
        const dir = f((((totalPercentage + (result.percentage * j) / steps) * Mth.PI) * 2) / 100);
        const xx = f(Mth.sin(dir) * r);
        const yy = f(f(Mth.cos(dir) * r) * f(0.5));
        t.vertex(f(x + xx), f(y - yy), 0);
      }
      t.draw();
      t.begin(GL_TRIANGLE_STRIP);
      t.color((result.getColor() & 0xfefefe) >> 1);
      for (let j = steps; j >= 0; j--) {
        const dir = f((((totalPercentage + (result.percentage * j) / steps) * Mth.PI) * 2) / 100);
        const xx = f(Mth.sin(dir) * r);
        const yy = f(f(Mth.cos(dir) * r) * f(0.5));
        t.vertex(f(x + xx), f(y - yy), 0);
        t.vertex(f(x + xx), f(f(y - yy) + 10), 0);
      }
      t.draw();
      totalPercentage = f(totalPercentage + result.percentage);
    }
    glEnable(GL_TEXTURE_2D);
    {
      let msg = '';
      if (node.name !== 'unspecified') msg += '[0] ';
      if (node.name.length === 0) msg += 'ROOT ';
      else msg += node.name + ' ';
      const col = 0xffffff;
      this._font.drawShadow(msg, x - r, y - Math.trunc(r / 2) - 16, col);
      const msg2 = this.toPercentString(node.globalPercentage);
      this._font.drawShadow(msg2, x + r - this._font.width(msg2), y - Math.trunc(r / 2) - 16, col);
    }
    for (let i = 0; i < list.length; i++) {
      const result = list[i]!;
      let msg = result.name !== 'unspecified' ? `[${i + 1}] ` : '[?] ';
      msg += result.name;
      const xx = x - r;
      const yy = y + Math.trunc(r / 2) + i * 8 + 20;
      this._font.drawShadow(msg, xx + 10 + 10, yy, result.getColor());
      let msg2 = this.toPercentString(result.percentage);
      this._font.drawShadow(msg2, xx + 10 + 10 - this._font.width(msg2), yy, result.getColor());
      msg2 = this.toPercentString(result.globalPercentage);
      this._font.drawShadow(msg2, xx + 10 + 10 - this._font.width(msg2), yy, result.getColor());
    }
  }

  /** C++ sprintf("%3.2f%%") */
  private toPercentString(percentage: number): string {
    return percentage.toFixed(2).padStart(3, ' ') + '%';
  }
}
