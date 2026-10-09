/**
 * 1:1 移植自 src/client/gui/screens/ConsoleScreen.h 与 ConsoleScreen.cpp（聊天与控制台）：按 T 打开的输入框。
 * 回车：以 "/" 开头就交给 CommandManager 执行，结果逐行显示在聊天区；否则作为聊天消息 "<名字> 内容" 显示。空输入直接关闭。
 * 只接受可打印 ASCII（32–126）；光标每 10 刻闪一次。
 * 联网时的 MessagePacket（客户端发给服务器、服务器广播）：DEFERRED(Network)，单机时 netCallback 为空、不是服务器。
 * C++ 的无参 init() 是 initScreen（R10），这里是空的。
 */
import { Keyboard } from '@mcpe/platform';
import { Util } from '@mcpe/util';
import { Screen } from '../Screen';

export class ConsoleScreen extends Screen {
  private _input = '';
  private _cursorBlink = 0;

  protected override initScreen(): void {}

  override tick(): void {
    this._cursorBlink++;
  }

  override renderGameBehind(): boolean {
    return true;
  }

  override isInGameScreen(): boolean {
    return true;
  }

  override isPauseScreen(): boolean {
    return false;
  }

  override handleBackEvent(_isDown: boolean): boolean {
    this.minecraft.setScreen(null);
    return true;
  }

  protected override keyPressed(eventKey: number): void {
    if (eventKey === Keyboard.KEY_ESCAPE) {
      this.minecraft.setScreen(null);
    } else if (eventKey === Keyboard.KEY_RETURN) {
      this.execute();
    } else if (eventKey === Keyboard.KEY_BACKSPACE) {
      if (this._input.length > 0) this._input = this._input.substring(0, this._input.length - 1);
    } else {
      super.keyPressed(eventKey);
    }
  }

  protected override charPressed(inputChar: string): void {
    const c = inputChar.charCodeAt(0);
    if (c >= 32 && c < 127) this._input += inputChar;
  }

  private execute(): void {
    const mc = this.minecraft;
    if (!mc.level) return;
    if (this._input.length === 0) {
      return mc.setScreen(null);
    }
    // DEFERRED(Network): if (minecraft->netCallback && !raknetInstance->isServer()) { MessagePacket … send } else
    if (this._input[0] === '/') {
      this._input = Util.stringTrim(this._input.substring(1));
      const out = mc.commandManager().execute(mc, mc.player!, this._input);
      // std::getline 逐行：最后一个换行之后的空串不算一行
      const lines = out.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      for (const line of lines) mc.gui.addMessage(line);
    } else {
      // DEFERRED(Network): if (raknetInstance->isServer()) { MessagePacket … send }
      mc.gui.addMessage('<' + mc.player!.name + '> ' + this._input);
    }
    mc.setScreen(null);
  }

  override render(_xm: number, _ym: number, _a: number): void {
    this.fillGradient(0, 0, this.width, this.height, 0x00000000, 0x40000000);
    const boxH = 12;
    const boxY = this.height - boxH - 2;
    const boxX0 = 2;
    const boxX1 = this.width - 2;
    this.fill(boxX0, boxY, boxX1, boxY + boxH, 0xc0000000 | 0);
    this.fill(boxX0, boxY, boxX1, boxY + 1, 0xff808080 | 0);
    this.fill(boxX0, boxY + boxH - 1, boxX1, boxY + boxH, 0xff808080 | 0);
    this.fill(boxX0, boxY, boxX0 + 1, boxY + boxH, 0xff808080 | 0);
    this.fill(boxX1 - 1, boxY, boxX1, boxY + boxH, 0xff808080 | 0);
    let displayed = this._input;
    if (Math.trunc(this._cursorBlink / 10) % 2 === 0) displayed += '_';
    this.minecraft.font!.drawShadow(displayed, boxX0 + 2, boxY + 2, 0xffffffff | 0);
  }
}
