// 1:1 移植自 src/client/gui/components/TextOption.h 与 .cpp（选项界面）：文本框，失去焦点时把文字写回字符串选项（用户名）
import type { Minecraft } from '../../Minecraft';
import type { OptionId } from '../../Options';
import { TextBox } from './TextBox';

export class TextOption extends TextBox {
  constructor(minecraft: Minecraft, optId: OptionId) {
    super(optId, minecraft.options.getOpt(optId)!.getStringId());
    this.text = minecraft.options.getStringValue(optId);
  }

  override loseFocus(minecraft: Minecraft): boolean {
    if (super.loseFocus(minecraft)) {
      minecraft.options.set(this.id as OptionId, this.text);
      return true;
    }
    return false;
  }
}
