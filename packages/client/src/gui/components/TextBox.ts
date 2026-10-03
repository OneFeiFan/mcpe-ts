/**
 * 1:1 移植自 src/client/gui/components/TextBox.h 与 .cpp（B8b-2）。
 *
 * 单行输入框，新建世界界面的"世界名""种子"两个框就是它（B8e 才移植）。
 * 当前有焦点时画一个闪烁的下划线光标，输入只收 ASCII 32–126、最多 256 个字符。
 *
 * R10：C++ 三个构造函数是 `(id, msg)`、`(id, x, y, msg)`、`(id, x, y, w, h, msg)` ——
 *   参数顺序和基类 Button 的 `(id, msg, x, y, w, h)` 不一样。这里跟 Button 的惯例统一成
 *   `(id, msg, x, y, w, h)`，调用方注意顺序与 C++ 相反。
 *
 * 【键盘怎么来的】`setFocus` 里那句 `platform()->showKeyboard()` 在 C++ 上是调系统软键盘；
 *   网页版的实现在 `apps/web/src/AppPlatform_web.ts`（挂一个离屏的隐藏 `<input>`）。
 *   文本框本身不碰 DOM —— 这一层保持在 platform 上，和 C++ 的结构一致。
 */
import { Keyboard, MouseAction } from '@mcpe/platform';
import type { Minecraft } from '../../Minecraft';
import { GL_SCISSOR_TEST, glDisable2, glEnable2, glScissor } from '../../renderer/gles';
import { Font } from '../Font';
import { Gui } from '../Gui';
import { GuiElement } from './GuiElement';

export class TextBox extends GuiElement {
  hint: string;
  text = '';
  id: number;
  blinkTicks = 0;
  focused = false;
  blink = false;

  constructor(id: number, msg: string, x = 0, y = 0, w = 24, h = Font.DefaultLineHeight + 4) {
    super(true, true, x, y, w, h);
    this.id = id;
    this.hint = msg;
  }

  override mouseClicked(minecraft: Minecraft, x: number, y: number, buttonNum: number): void {
    if (buttonNum === MouseAction.ACTION_LEFT) {
      if (this.pointInside(x, y)) {
        this.setFocus(minecraft);
      } else {
        this.loseFocus(minecraft);
      }
    }
  }

  setFocus(minecraft: Minecraft): void {
    if (!this.focused) {
      minecraft.platform()!.showKeyboard();
      this.focused = true;
      this.blinkTicks = 0;
      this.blink = false;
    }
  }

  /**
   * 返回"刚才是不是有焦点"（C++ 的返回类型是 bool，Screen 的 TextBoxLike 里写的是 void ——
   * TS 允许返回具体值的函数满足 void 签名）。
   * 不写 override：GuiElement 里没有这个方法，是 TextBox 新加的。
   */
  loseFocus(minecraft: Minecraft): boolean {
    if (this.focused) {
      minecraft.platform()!.hideKeyboard();
      this.focused = false;
      return true;
    }
    return false;
  }

  override charPressed(_minecraft: Minecraft, ch: string): void {
    // C++ 的参数是 char（有符号）：'ÿ'(255) 这类高位字符转成负数，被 c >= 32 挡掉。
    // `(x << 24) >> 24` 就是 (char) 强转。
    const c = (ch.charCodeAt(0) << 24) >> 24;
    if (this.focused && c >= 32 && c < 127 && this.text.length < 256) {
      this.text += String.fromCharCode(c & 0xff);
    }
  }

  override keyPressed(_minecraft: Minecraft, key: number): void {
    // C++ 的 pop_back() 去掉的是**最后一个字节**；这里只会装进 32–126 的 ASCII，slice 等价
    if (this.focused && key === Keyboard.KEY_BACKSPACE && this.text.length > 0) {
      this.text = this.text.slice(0, -1);
    }
  }

  override tick(_minecraft: Minecraft): void {
    this.blinkTicks++;
    if (this.blinkTicks >= 5) {
      this.blink = !this.blink;
      this.blinkTicks = 0;
    }
  }

  override render(minecraft: Minecraft, _xm: number, _ym: number): void {
    // 【三元两边一模一样】C++ 写的是 `focused ? 0xffa0a0a0 : 0xffa0a0a0`（边框同理）——
    // 大概是改到一半留下的，看着像少了高亮。照抄，别"修"。
    const bgColor = 0xffa0a0a0 | 0;
    const borderColor = 0xff000000 | 0;
    this.fill(this.x, this.y, this.x + this.width, this.y + this.height, bgColor);
    this.fill(
      this.x + 1,
      this.y + 1,
      this.x + this.width - 1,
      this.y + this.height - 1,
      borderColor,
    );
    glEnable2(GL_SCISSOR_TEST);
    // C++ 是 float 实参传给 GLint 参数 —— 隐式转换向零截断
    glScissor(
      Math.trunc(Gui.GuiScale * (this.x + 2)),
      Math.trunc(minecraft.height - Gui.GuiScale * (this.y + this.height - 2)),
      Math.trunc(Gui.GuiScale * (this.width - 2)),
      Math.trunc(Gui.GuiScale * (this.height - 2)),
    );
    const _y = this.y + Math.trunc((this.height - Font.DefaultLineHeight) / 2);
    if (this.text.length === 0 && !this.focused) {
      this.drawString(minecraft.font!, this.hint, this.x + 2, _y, 0xff5e5e5e | 0);
    }
    // 光标是**临时塞进 text** 里的一个下划线，画完再删掉（C++ 就是这么写的）
    if (this.focused && this.blink) this.text += '_';
    this.drawString(minecraft.font!, this.text, this.x + 2, _y, 0xffffffff | 0);
    if (this.focused && this.blink) this.text = this.text.slice(0, -1);
    glDisable2(GL_SCISSOR_TEST);
  }
}
