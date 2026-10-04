/**
 * 1:1 移植自 src/client/gui/Screen.h 与 Screen.cpp（S13 阶段 C：界面类的基础）。替换前向声明。
 * 部分：文本框（TextBox）未移植——textBoxes 始终为空，相关循环照写（DEFERRED(TextBox)）；点击按钮的音效 DEFERRED(Sound)。
 * R10：renderBackground() / renderBackground(int vo) 合并为默认参数（情形 A）；toGUICoordinate(int& x, int& y) 改为返回 [x, y]。
 */
import { Keyboard, Mouse, MouseAction } from '@mcpe/platform';
import type { Minecraft } from '../Minecraft';
import { GL_FOG, glColor4f2, glDisable2 } from '../renderer/gles';
import { Tesselator } from '../renderer/Tesselator';
import type { Button } from './components/Button';
import type { IntRectangle } from './components/ImageButton';
import type { Font } from './Font';
import { GuiComponent } from './GuiComponent';

/** TextBox 的接口（TextBox 本身未移植，DEFERRED(TextBox)） */
export interface TextBoxLike {
  render(minecraft: Minecraft, xm: number, ym: number): void;
  tick(minecraft: Minecraft): void;
  keyPressed(minecraft: Minecraft, key: number): void;
  charPressed(minecraft: Minecraft, ch: string): void;
  mouseClicked(minecraft: Minecraft, x: number, y: number, buttonNum: number): void;
  loseFocus(minecraft: Minecraft): void;
}

export class Screen extends GuiComponent {
  width = 1;
  height = 1;
  passEvents = false;
  protected minecraft!: Minecraft;
  protected buttons: Button[] = [];
  protected textBoxes: TextBoxLike[] = [];
  protected tabButtons: Button[] = [];
  protected tabButtonIndex = 0;
  protected font: Font | null = null;
  private clickedButton: Button | null = null;

  render(xm: number, ym: number, _a: number): void {
    for (const button of this.buttons) button.render(this.minecraft, xm, ym);
    for (const textbox of this.textBoxes) textbox.render(this.minecraft, xm, ym);
  }

  /** C++ 的 init(Minecraft*, int, int) 与无参的虚函数 init() 同名（R10 情形 B：后者命名为 initScreen，子类重写它） */
  init(minecraft: Minecraft, width: number, height: number): void {
    this.minecraft = minecraft;
    this.font = minecraft.font;
    this.width = width;
    this.height = height;
    this.initScreen();
    this.setupPositions();
    this.updateTabButtonSelection();
  }

  protected initScreen(): void {}

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.setupPositions();
  }

  setupPositions(): void {}

  updateEvents(): void {
    if (this.passEvents) return;
    while (Mouse.next()) this.mouseEvent();
    while (Keyboard.next()) this.keyboardEvent();
    while (Keyboard.nextTextChar()) this.keyboardTextEvent();
  }

  mouseEvent(): void {
    const e = Mouse.getEvent();
    const mc = this.minecraft;
    if (e.action === MouseAction.ACTION_WHEEL) {
      const xm = Math.trunc((e.x * this.width) / mc.width);
      const ym = Math.trunc((e.y * this.height) / mc.height) - 1;
      this.mouseWheel(e.dx, e.dy, xm, ym);
      return;
    }
    if (!e.isButton()) return;
    const xm = Math.trunc((e.x * this.width) / mc.width);
    const ym = Math.trunc((e.y * this.height) / mc.height) - 1;
    if (Mouse.getEventButtonState()) {
      this.mouseClicked(xm, ym, Mouse.getEventButton());
    } else {
      this.mouseReleased(xm, ym, Mouse.getEventButton());
    }
  }

  keyboardEvent(): void {
    if (Keyboard.getEventKeyState()) {
      this.keyPressed(Keyboard.getEventKey());
    }
  }

  keyboardTextEvent(): void {
    this.charPressed(Keyboard.getChar());
  }

  handleBackEvent(_isDown: boolean): boolean {
    return false;
  }

  tick(): void {
    for (const textbox of this.textBoxes) textbox.tick(this.minecraft);
  }

  removed(): void {}

  renderBackground(vo = 0): void {
    if (this.minecraft.isLevelGenerated()) {
      this.fillGradient(0, 0, this.width, this.height, 0xc0101010 | 0, 0xd0101010 | 0);
    } else {
      this.renderDirtBackground(vo);
    }
  }

  renderDirtBackground(vo: number): void {
    glDisable2(GL_FOG);
    const t = Tesselator.instance;
    this.minecraft.textures!.loadAndBindTexture('gui/background.png');
    glColor4f2(1, 1, 1, 1);
    const s = 32;
    const fvo = vo;
    t.begin();
    t.color(0x404040);
    t.vertexUV(0, this.height, 0, 0, this.height / s + fvo);
    t.vertexUV(this.width, this.height, 0, this.width / s, this.height / s + fvo);
    t.vertexUV(this.width, 0, 0, this.width / s, 0 + fvo);
    t.vertexUV(0, 0, 0, 0, 0 + fvo);
    t.draw();
  }

  renderGameBehind(): boolean {
    return true;
  }

  hasClippingArea(_out: IntRectangle): boolean {
    return false;
  }

  isPauseScreen(): boolean {
    return true;
  }

  isErrorScreen(): boolean {
    return false;
  }

  isInGameScreen(): boolean {
    return true;
  }

  closeOnPlayerHurt(): boolean {
    return false;
  }

  confirmResult(_result: boolean, _id: number): void {}

  lostFocus(): void {
    for (const tb of this.textBoxes) tb.loseFocus(this.minecraft);
  }

  toGUICoordinate(x: number, y: number): [number, number] {
    return [
      Math.trunc((x * this.width) / this.minecraft.width),
      Math.trunc((y * this.height) / this.minecraft.height) - 1,
    ];
  }

  protected updateTabButtonSelection(): void {}

  protected buttonClicked(_button: Button): void {}

  protected mouseClicked(x: number, y: number, buttonNum: number): void {
    if (buttonNum === MouseAction.ACTION_LEFT) {
      for (const button of this.buttons) {
        if (button.clicked(this.minecraft, x, y)) {
          button.setPressed();
          this.clickedButton = button;
        }
      }
    }
    for (const textbox of this.textBoxes) textbox.mouseClicked(this.minecraft, x, y, buttonNum);
  }

  protected mouseReleased(x: number, y: number, buttonNum: number): void {
    if (!this.clickedButton || buttonNum !== MouseAction.ACTION_LEFT) return;
    for (const button of this.buttons) {
      if (this.clickedButton === button && button.clicked(this.minecraft, x, y)) {
        this.buttonClicked(button);
        this.minecraft.soundEngine?.playUI('random.click', 1, 1);
        this.clickedButton.released(x, y);
      }
    }
    this.clickedButton = null;
  }

  protected mouseWheel(_dx: number, _dy: number, _xm: number, _ym: number): void {}

  protected keyPressed(eventKey: number): void {
    if (eventKey === Keyboard.KEY_ESCAPE) {
      this.minecraft.setScreen(null);
    }
    for (const textbox of this.textBoxes) textbox.keyPressed(this.minecraft, eventKey);
  }

  protected charPressed(inputChar: string): void {
    for (const textbox of this.textBoxes) textbox.charPressed(this.minecraft, inputChar);
  }
}
