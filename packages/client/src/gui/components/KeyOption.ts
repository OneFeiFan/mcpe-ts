/**
 * 1:1 移植自 src/client/gui/components/KeyOption.h 与 .cpp（选项界面）：按键绑定按钮。点一下显示 "..."，再按一个键就绑定（Esc 取消）。
 * released 重写成空函数（C++ 同）。
 */
import { Keyboard } from '@mcpe/platform';
import type { Minecraft } from '../../Minecraft';
import type { OptionId } from '../../Options';
import { TButton } from './Button';

export class KeyOption extends TButton {
  protected m_captureMode = false; // C++ 声明了但构造函数没初始化、也从不使用

  constructor(minecraft: Minecraft, optId: OptionId) {
    super(optId, Keyboard.getKeyName(minecraft.options.getIntValue(optId)));
  }

  override mouseClicked(minecraft: Minecraft, x: number, y: number, _buttonNum: number): void {
    this.selected = this.isInside(x, y);
    this.msg = this.selected ? '...' : Keyboard.getKeyName(minecraft.options.getIntValue(this.id as OptionId));
  }

  override released(_mx: number, _my: number): void {}

  override keyPressed(minecraft: Minecraft, key: number): void {
    if (!this.selected) return;
    if (key !== Keyboard.KEY_ESCAPE) {
      minecraft.options.set(this.id as OptionId, key);
    }
    this.selected = false;
    this.msg = Keyboard.getKeyName(minecraft.options.getIntValue(this.id as OptionId));
  }
}
