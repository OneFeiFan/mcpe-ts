/**
 * 1:1 移植自 src/client/gui/components/OptionsItem.h 与 .cpp（选项界面）：一行选项——左边灰色标签，右边是控件（开关/滑条/文本框/按键）。
 * 几个分档选项在标签后面附上当前档位的名字（界面缩放、雾、调试样式、菜单风格、视距）。
 */
import { I18n } from '@mcpe/locale';
import type { Minecraft } from '../../Minecraft';
import { OptionId } from '../../Options';
import type { GuiElement } from './GuiElement';
import { GuiElementContainer } from './GuiElementContainer';

export class OptionsItem extends GuiElementContainer {
  private m_optionId: OptionId;
  private m_label: string;

  constructor(optionId: OptionId, label: string, element: GuiElement) {
    super(false, true, 0, 0, 24, 12);
    this.m_optionId = optionId;
    this.m_label = label;
    this.addChild(element);
  }

  override setupPositions(): void {
    let currentHeight = 0;
    for (const c of this.children) {
      c.x = this.x + this.width - c.width - 15;
      c.y = this.y + currentHeight;
      currentHeight += c.height;
    }
    this.height = currentHeight;
  }

  override render(minecraft: Minecraft, xm: number, ym: number): void {
    const yOffset = Math.trunc((this.height - 8) / 2);
    let text = this.m_label;
    const o = minecraft.options;
    const pick = (
      keys: (string | null)[],
      value: number,
      fallback: string | null,
    ): string | null => (value >= 0 && value < keys.length ? keys[value]! : fallback);
    if (this.m_optionId === OptionId.OPTIONS_GUI_SCALE) {
      const k = pick(
        [
          'options.guiScale.auto',
          'options.guiScale.small',
          'options.guiScale.medium',
          'options.guiScale.large',
          'options.guiScale.larger',
          'options.guiScale.largest',
        ],
        o.getIntValue(OptionId.OPTIONS_GUI_SCALE),
        'options.guiScale.auto',
      );
      text += ': ' + I18n.get(k!);
    }
    if (this.m_optionId === OptionId.OPTIONS_FOG_TYPE) {
      const k = pick(
        ['options.fogType.vanilla', 'options.fogType.java', 'options.fogType.unused'],
        o.getIntValue(OptionId.OPTIONS_FOG_TYPE),
        null,
      );
      text += ': ' + (k === null ? '' : I18n.get(k)); // C++ switch 无 default：scaleText 保持空串
    }
    if (this.m_optionId === OptionId.OPTIONS_DEBUG_STYLE) {
      const k = pick(
        ['options.debugStyle.javaBeta', 'options.debugStyle.custom', 'options.fogType.unused'],
        o.getIntValue(OptionId.OPTIONS_DEBUG_STYLE),
        null,
      );
      text += ': ' + (k === null ? '' : I18n.get(k)); // 原样：第 3 档借用了 fogType.unused 的文字
    }
    if (this.m_optionId === OptionId.OPTIONS_MENU_STYLE) {
      const k = pick(
        ['options.menuStyle.pocket', 'options.menuStyle.xperia', 'options.menuStyle.java'],
        o.getIntValue(OptionId.OPTIONS_MENU_STYLE),
        null,
      );
      text += ': ' + (k === null ? '' : I18n.get(k));
    }
    if (this.m_optionId === OptionId.OPTIONS_VIEW_DISTANCE) {
      const v = o.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE);
      const k = pick(
        [
          'options.renderDistance.far',
          'options.renderDistance.normal',
          'options.renderDistance.short',
          'options.renderDistance.tiny',
        ],
        v,
        null,
      );
      text += ': ' + (k === null ? 'Debug' : I18n.get(k));
    }
    minecraft.font!.draw(text, this.x, this.y + yOffset, 0x909090, false);
    super.render(minecraft, xm, ym);
  }
}
