/**
 * 1:1 移植自 src/client/gui/screens/UsernameScreen.h 与 UsernameScreen.cpp：首次启动（选项里没有用户名）时让玩家输入用户名。
 * 文本框为空时“Done”不可点；回车等于点“Done”；保存进 options.txt 后关闭。返回键无效（handleBackEvent 返回 true）。
 * 原样保留：_input、_cursorBlink 声明并初始化，但不使用。
 * C++ 的无参 init() 是 initScreen（R10）。
 */
import { Keyboard } from '@mcpe/platform';
import { OptionId } from '../../Options';
import type { Button } from '../components/Button';
import { TButton } from '../components/Button';
import { TextBox } from '../components/TextBox';
import { Screen } from '../Screen';

export class UsernameScreen extends Screen {
  private _btnDone = new TButton(0, 'Done');
  private tUsername = new TextBox(0, 'Username');
  protected _input = '';
  protected _cursorBlink = 0;

  protected override initScreen(): void {
    this._input = '';
    this._btnDone.active = false;
    this.buttons.push(this._btnDone);
    this.tabButtons.push(this._btnDone);
    this.textBoxes.push(this.tUsername);
    this.setupPositions();
  }

  override setupPositions(): void {
    const cx = Math.trunc(this.width / 2);
    const cy = Math.trunc(this.height / 2);
    this._btnDone.width = 66;
    this._btnDone.height = 26;
    this._btnDone.x = cx - Math.trunc(this._btnDone.width / 2);
    this._btnDone.y = cy + 52;
    this.tUsername.width = 120;
    this.tUsername.height = 20;
    this.tUsername.x = Math.trunc((this.width - this.tUsername.width) / 2);
    this.tUsername.y = this._btnDone.y - 60;
  }

  override tick(): void {
    for (const tb of this.textBoxes) tb.tick(this.minecraft);
  }

  override isPauseScreen(): boolean {
    return false;
  }

  override handleBackEvent(_isDown: boolean): boolean {
    return true;
  }

  protected override keyPressed(eventKey: number): void {
    if (eventKey === Keyboard.KEY_RETURN) {
      if (this.tUsername.text.length > 0) this.buttonClicked(this._btnDone);
    }
    super.keyPressed(eventKey);
    this._btnDone.active = this.tUsername.text.length > 0;
  }

  override removed(): void {
    this.minecraft.platform()!.hideKeyboard();
  }

  protected override buttonClicked(button: Button): void {
    if (button === this._btnDone && this.tUsername.text.length > 0) {
      this.minecraft.options.set(OptionId.OPTIONS_USERNAME, this.tUsername.text);
      this.minecraft.options.save();
      this.minecraft.setScreen(null);
    }
  }

  override render(xm: number, ym: number, a: number): void {
    this.renderBackground();
    const cx = Math.trunc(this.width / 2);
    const cy = Math.trunc(this.height / 2);
    const font = this.minecraft.font!;
    this.drawCenteredString(font, 'Enter your username', cx, cy - 70, 0xffffffff | 0);
    this.drawCenteredString(font, 'Please choose a username so others can easily', cx, cy - 52, 0xffaaaaaa | 0);
    this.drawCenteredString(font, "identify you in chat. Don't worry, you can", cx, cy - 40, 0xffaaaaaa | 0);
    this.drawCenteredString(font, 'change it anytime.', cx, cy - 28, 0xffaaaaaa | 0);
    super.render(xm, ym, a);
  }
}
