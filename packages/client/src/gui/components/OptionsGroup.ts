/**
 * 1:1 移植自 src/client/gui/components/OptionsGroup.h 与 .cpp（选项界面）：一个分类的选项列表（标题 + 一列 OptionsItem），可滚动。
 * 按下后先不派发点击：竖向拖动超过 5 像素就当滚动；横向先超过就把“按下”补发给子元素；松开时没滚动过才派发点击与松开。
 * addOptionItem 按选项的类型建控件：键位（字符串 id 含 "options.key"）→ KeyOption；布尔 → 开关图片按钮；浮点 → 连续滑条；
 *   整数 → 分档滑条；字符串 → 文本框。C++ 的 dynamic_cast 在这里是 instanceof。
 * glScissor 的参数是 `Gui::GuiScale * x` 等 float 表达式，传给 GLint 时截断。
 */
import { I18n } from '@mcpe/locale';
import { Mouse, MouseAction } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import type { Minecraft } from '../../Minecraft';
import { OptionBool, OptionFloat, OptionInt, OptionString } from '../../Option';
import type { OptionId } from '../../Options';
import { GL_SCISSOR_TEST, glDisable2, glEnable2, glScissor } from '../../renderer/gles';
import { Gui } from '../Gui';
import { GuiElementContainer } from './GuiElementContainer';
import { ImageDef, IntRectangle, OptionButton } from './ImageButton';
import { KeyOption } from './KeyOption';
import { OptionsItem } from './OptionsItem';
import { SliderFloat, SliderInt } from './Slider';
import { TextOption } from './TextOption';

const f = Math.fround;

export class OptionsGroup extends GuiElementContainer {
  private static readonly ScrollStartThreshold = 5;
  protected label: string;
  protected contentHeight = 0;
  protected scrollOffsetY = 0;
  protected maxScrollOffsetY = 0;
  protected trackingScrollGesture = false;
  protected scrollingGesture = false;
  protected touchDispatched = false;
  protected dragStartX = 0;
  protected dragStartY = 0;
  protected lastDragY = 0;
  protected touchStartX = 0;
  protected touchStartY = 0;

  constructor(labelID: string) {
    super();
    this.label = I18n.get(labelID);
  }

  override setupPositions(): void {
    const labelHeight = 18;
    const bottomPadding = 36;
    const requestedScroll = this.scrollOffsetY;
    const scrollOffset = Math.trunc(requestedScroll);
    let curY = this.y + labelHeight - scrollOffset;
    const contentStartY = this.y + labelHeight;
    for (const c of this.children) {
      c.width = this.width - 5;
      c.y = curY;
      c.x = this.x + 10;
      c.setupPositions();
      curY += c.height + 3;
    }
    curY += bottomPadding;
    this.contentHeight = Math.max(0, curY - contentStartY + scrollOffset);
    this.maxScrollOffsetY = Math.max(0, this.contentHeight - (this.height - labelHeight));
    const clampedScroll = Mth.clamp(requestedScroll, 0.0, this.maxScrollOffsetY);
    if (clampedScroll !== requestedScroll) {
      this.scrollOffsetY = clampedScroll;
      this.setupPositions();
    }
  }

  override render(minecraft: Minecraft, xm: number, ym: number): void {
    const padX = 10.0;
    const padY = 5.0;
    const labelHeight = 18;
    minecraft.font!.draw(this.label, this.x + padX, this.y + padY, 0xffffffff | 0, false);
    glEnable2(GL_SCISSOR_TEST);
    glScissor(
      Math.trunc(f(Gui.GuiScale * this.x)),
      Math.trunc(minecraft.height - f(Gui.GuiScale * (this.y + this.height))),
      Math.trunc(f(Gui.GuiScale * this.width)),
      Math.trunc(f(Gui.GuiScale * (this.height - labelHeight))),
    );
    super.render(minecraft, xm, ym);
    glDisable2(GL_SCISSOR_TEST);
  }

  override tick(minecraft: Minecraft): void {
    let xm = Mouse.getX();
    let ym = Mouse.getY();
    if (minecraft.screen !== null) {
      [xm, ym] = minecraft.screen.toGUICoordinate(xm, ym);
    }
    const leftDown = Mouse.isButtonDown(MouseAction.ACTION_LEFT);
    if (this.trackingScrollGesture && leftDown) {
      const dy = ym - this.lastDragY;
      if (!this.scrollingGesture) {
        const totalDx = xm - this.dragStartX;
        const totalDy = ym - this.dragStartY;
        if (Math.abs(totalDx) >= OptionsGroup.ScrollStartThreshold || Math.abs(totalDy) >= OptionsGroup.ScrollStartThreshold) {
          if (Math.abs(totalDy) >= Math.abs(totalDx)) {
            this.scrollingGesture = true;
          } else if (!this.touchDispatched) {
            super.mouseClicked(minecraft, this.touchStartX, this.touchStartY, MouseAction.ACTION_LEFT);
            this.touchDispatched = true;
          }
        }
      }
      if (this.scrollingGesture && dy !== 0) {
        this.scrollByPixels(dy);
      }
      this.lastDragY = ym;
    }
    super.tick(minecraft);
  }

  override mouseClicked(minecraft: Minecraft, x: number, y: number, buttonNum: number): void {
    this.trackingScrollGesture = false;
    this.scrollingGesture = false;
    this.touchDispatched = false;
    if (buttonNum === MouseAction.ACTION_LEFT && this.pointInside(x, y)) {
      this.trackingScrollGesture = true;
      this.dragStartX = x;
      this.dragStartY = y;
      this.lastDragY = y;
      this.touchStartX = x;
      this.touchStartY = y;
      return;
    }
    super.mouseClicked(minecraft, x, y, buttonNum);
  }

  override mouseReleased(minecraft: Minecraft, x: number, y: number, buttonNum: number): void {
    const wasScrolling = this.scrollingGesture;
    const wasTracking = this.trackingScrollGesture;
    this.trackingScrollGesture = false;
    this.scrollingGesture = false;
    if (buttonNum === MouseAction.ACTION_LEFT && wasTracking && !this.touchDispatched && this.pointInside(this.touchStartX, this.touchStartY)) {
      super.mouseClicked(minecraft, this.touchStartX, this.touchStartY, buttonNum);
      this.touchDispatched = true;
    }
    if (!wasScrolling) {
      super.mouseReleased(minecraft, x, y, buttonNum);
    }
  }

  scrollByPixels(deltaY: number): void {
    if (deltaY === 0.0 || this.maxScrollOffsetY <= 0.0) return;
    this.scrollOffsetY = Mth.clamp(f(this.scrollOffsetY - deltaY), 0.0, this.maxScrollOffsetY);
    this.setupPositions();
  }

  isScrollingGestureActive(): boolean {
    return this.trackingScrollGesture || this.scrollingGesture;
  }

  /** C++ 返回 *this（链式调用） */
  addOptionItem(optId: OptionId, minecraft: Minecraft): this {
    const option = minecraft.options.getOpt(optId);
    if (option === null) return this;
    if (option.getStringId().includes('options.key')) this.createKey(optId, minecraft);
    else if (option instanceof OptionBool) this.createToggle(optId, minecraft);
    else if (option instanceof OptionFloat) this.createProgressSlider(optId, minecraft);
    else if (option instanceof OptionInt) this.createStepSlider(optId, minecraft);
    else if (option instanceof OptionString) this.createTextbox(optId, minecraft);
    return this;
  }

  protected createToggle(optId: OptionId, minecraft: Minecraft): void {
    const def = new ImageDef();
    def.setSrc(new IntRectangle(160, 206, 39, 20));
    def.name = 'gui/touchgui.png';
    def.width = f(39 * f(0.7));
    def.height = f(20 * f(0.7));
    const element = new OptionButton(optId);
    element.setImageDef(def, true);
    element.updateImage(minecraft.options);
    const itemLabel = I18n.get(minecraft.options.getOpt(optId)!.getStringId());
    this.addChild(new OptionsItem(optId, itemLabel, element));
    this.setupPositions();
  }

  protected createProgressSlider(optId: OptionId, minecraft: Minecraft): void {
    const element = new SliderFloat(minecraft, optId);
    element.width = 100;
    element.height = 20;
    const itemLabel = I18n.get(minecraft.options.getOpt(optId)!.getStringId());
    this.addChild(new OptionsItem(optId, itemLabel, element));
    this.setupPositions();
  }

  protected createStepSlider(optId: OptionId, minecraft: Minecraft): void {
    const element = new SliderInt(minecraft, optId);
    element.width = 100;
    element.height = 20;
    const itemLabel = I18n.get(minecraft.options.getOpt(optId)!.getStringId());
    this.addChild(new OptionsItem(optId, itemLabel, element));
    this.setupPositions();
  }

  protected createTextbox(optId: OptionId, minecraft: Minecraft): void {
    const element = new TextOption(minecraft, optId);
    element.width = 100;
    element.height = 20;
    const itemLabel = I18n.get(minecraft.options.getOpt(optId)!.getStringId());
    this.addChild(new OptionsItem(optId, itemLabel, element));
    this.setupPositions();
  }

  protected createKey(optId: OptionId, minecraft: Minecraft): void {
    const element = new KeyOption(minecraft, optId);
    element.width = 50;
    element.height = 20;
    const itemLabel = I18n.get(minecraft.options.getOpt(optId)!.getStringId());
    this.addChild(new OptionsItem(optId, itemLabel, element));
    this.setupPositions();
  }
}
