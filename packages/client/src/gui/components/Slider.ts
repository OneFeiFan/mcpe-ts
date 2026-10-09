/**
 * 1:1 移植自 src/client/gui/components/Slider.h 与 Slider.cpp（选项界面）：浮点滑条（灵敏度、音量）与分档滑条（难度、视距……）。
 * 按住时每刻按鼠标位置更新百分比；松开时写回选项。分档滑条松开时吸附到最近一档（`int(p * (n-1) + 0.5f)`）。
 * 原样保留：基类构造函数不初始化 m_percentage（由子类构造函数设置）；`stepDistance = barWidth / (m_numSteps-1)` 是整数除法。
 */
import { Mouse, MouseAction } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import type { Minecraft } from '../../Minecraft';
import type { OptionFloat, OptionInt } from '../../Option';
import type { OptionId } from '../../Options';
import { GuiElement } from './GuiElement';

const f = Math.fround;

export abstract class Slider extends GuiElement {
  protected m_optId: OptionId;
  protected m_mouseDownOnElement = false;
  protected m_percentage = 0;
  protected m_numSteps = 0;

  protected constructor(optId: OptionId) {
    super();
    this.m_optId = optId;
  }

  override render(minecraft: Minecraft, _xm: number, _ym: number): void {
    const xSliderStart = this.x + 5;
    const xSliderEnd = this.x + this.width - 5;
    const ySliderStart = this.y + 6;
    const ySliderEnd = this.y + 9;
    const handleSizeX = 9;
    const handleSizeY = 15;
    const barWidth = xSliderEnd - xSliderStart;
    this.fill(xSliderStart, ySliderStart, xSliderEnd, ySliderEnd, 0xff606060 | 0);
    if (this.m_numSteps > 2) {
      const stepDistance = Math.trunc(barWidth / (this.m_numSteps - 1));
      for (let a = 0; a < this.m_numSteps; ++a) {
        const renderSliderStepPosX = xSliderStart + a * stepDistance + 1;
        this.fill(renderSliderStepPosX - 1, ySliderStart - 2, renderSliderStepPosX + 1, ySliderEnd + 2, 0xff606060 | 0);
      }
    }
    minecraft.textures!.loadAndBindTexture('gui/touchgui.png');
    this.blit(xSliderStart + Math.trunc(f(this.m_percentage * barWidth)) - Math.trunc(handleSizeX / 2), this.y, 226, 126, handleSizeX, handleSizeY, handleSizeX, handleSizeY);
  }

  override mouseClicked(_minecraft: Minecraft, x: number, y: number, _buttonNum: number): void {
    if (this.pointInside(x, y)) {
      this.m_mouseDownOnElement = true;
    }
  }

  override mouseReleased(_minecraft: Minecraft, _x: number, _y: number, _buttonNum: number): void {
    this.m_mouseDownOnElement = false;
  }

  override tick(minecraft: Minecraft): void {
    if (minecraft.screen !== null) {
      const [xm] = minecraft.screen.toGUICoordinate(Mouse.getX(), Mouse.getY());
      if (this.m_mouseDownOnElement) {
        this.m_percentage = f(f(xm - this.x) / f(this.width));
        this.m_percentage = Mth.clamp(this.m_percentage, 0.0, 1.0);
      }
    }
  }
}

export class SliderFloat extends Slider {
  protected m_option: OptionFloat;

  constructor(minecraft: Minecraft, option: OptionId) {
    super(option);
    this.m_option = minecraft.options.getOpt(option) as OptionFloat;
    const o = this.m_option;
    this.m_percentage = Mth.clamp(f(f(o.get() - o.getMin()) / f(o.getMax() - o.getMin())), 0, 1);
  }

  override mouseReleased(minecraft: Minecraft, x: number, y: number, buttonNum: number): void {
    super.mouseReleased(minecraft, x, y, buttonNum);
    if (this.pointInside(x, y)) {
      const o = this.m_option;
      minecraft.options.set(this.m_optId, f(f(this.m_percentage * f(o.getMax() - o.getMin())) + o.getMin()));
    }
  }
}

export class SliderInt extends Slider {
  protected m_option: OptionInt;

  constructor(minecraft: Minecraft, option: OptionId) {
    super(option);
    this.m_option = minecraft.options.getOpt(option) as OptionInt;
    const o = this.m_option;
    this.m_numSteps = o.getMax() - o.getMin() + 1;
    this.m_percentage = f(f(o.get() - o.getMin()) / (this.m_numSteps - 1));
  }

  override render(minecraft: Minecraft, xm: number, ym: number): void {
    super.render(minecraft, xm, ym);
  }

  override mouseReleased(minecraft: Minecraft, x: number, y: number, buttonNum: number): void {
    super.mouseReleased(minecraft, x, y, buttonNum);
    if (this.pointInside(x, y)) {
      const o = this.m_option;
      let curStep = Math.trunc(f(f(this.m_percentage * (this.m_numSteps - 1)) + f(0.5)));
      curStep = Mth.clamp(curStep + o.getMin(), o.getMin(), o.getMax());
      this.m_percentage = f(f(curStep - o.getMin()) / (this.m_numSteps - 1));
      minecraft.options.set(this.m_optId, curStep);
    }
  }
}
