/**
 * 1:1 移植自 src/client/gui/screens/ChatScreen.h 与 ChatScreen.cpp：用平台对话框输入一条聊天消息（手机版的方式）。
 * 打开时请平台弹出 DIALOG_NEW_CHAT_MESSAGE；对话框结束后（status > -1），确认（1）且有内容就加到聊天区，然后关闭。
 * 这一版里没有任何地方打开它（桌面与网页走 ConsoleScreen），照抄。
 */
import type { Button } from '../components/Button';
import { Screen } from '../Screen';
import { DialogDefinitions } from './DialogDefinitions';

export class ChatScreen extends Screen {
  protected override initScreen(): void {
    this.minecraft.platform()!.createUserInput(DialogDefinitions.DIALOG_NEW_CHAT_MESSAGE);
  }

  override render(_xm: number, _ym: number, _a: number): void {
    const platform = this.minecraft.platform()!;
    const status = platform.getUserInputStatus();
    if (status > -1) {
      if (status === 1) {
        const v = platform.getUserInput();
        if (v.length && v[0]!.length > 0) this.minecraft.gui.addMessage(v[0]!);
      }
      this.minecraft.setScreen(null);
    }
  }

  protected override buttonClicked(_button: Button): void {}
}
