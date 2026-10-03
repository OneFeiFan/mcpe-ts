/**
 * 1:1 移植自 src/client/gui/screens/ConfirmScreen.h 与 .cpp（B8b-1）。
 *
 * 一个"确定 / 取消"对话框，两个按钮都是触屏风格。当前唯一的用户是选世界界面的
 * Touch::DeleteWorldScreen（B8d 才移植），它覆盖 postResult 来真正删世界。
 *
 * R10：C++ 那两个构造函数是 `(parent, t1, t2, id)` 和 `(parent, t1, t2, yes, no, id)`
 *   —— 第 4 个参数在两个版本里含义不同（id 还是按钮文字）。TS 只能留一个入口，
 *   所以把 `id` 提到第 4 位（对上短的那个），两个按钮文字用默认参数接在后面（情形 B）。
 *   调用方写 `new ConfirmScreen(parent, t1, t2, id, yes, no)`，与 C++ 的参数**顺序不同**。
 */
import { Button } from '../components/Button';
import { TButton } from '../components/Button';
import { Screen } from '../Screen';

export class ConfirmScreen extends Screen {
  protected parent: Screen | null;
  protected id: number;
  private title1: string;
  private title2: string;
  private yesButtonText: string;
  private noButtonText: string;
  private yesButton: Button | null = null;
  private noButton: Button | null = null;

  constructor(
    parent: Screen | null,
    title1: string,
    title2: string,
    id: number,
    yesButtonText = 'Ok',
    noButtonText = 'Cancel',
  ) {
    super();
    this.parent = parent;
    this.title1 = title1;
    this.title2 = title2;
    this.id = id;
    this.yesButtonText = yesButtonText;
    this.noButtonText = noButtonText;
  }

  protected override initScreen(): void {
    // 【原样保留：条件恒为真】C++ 写的是 `if (true) { Touch::TButton } else { Button }`，
    // else 那一支永远走不到，这里只保留真分支。
    this.yesButton = new TButton(0, this.yesButtonText, 0, 0);
    this.noButton = new TButton(1, this.noButtonText, 0, 0);
    this.buttons.push(this.yesButton);
    this.buttons.push(this.noButton);
    this.tabButtons.push(this.yesButton);
    this.tabButtons.push(this.noButton);
  }

  override setupPositions(): void {
    const ButtonWidth = 120;
    const ButtonHeight = 24;
    const yes = this.yesButton!,
      no = this.noButton!;
    yes.x = Math.trunc(this.width / 2) - ButtonWidth - 4;
    yes.y = Math.trunc(this.height / 6) + 72;
    no.x = Math.trunc(this.width / 2) + 4;
    no.y = Math.trunc(this.height / 6) + 72;
    yes.width = no.width = ButtonWidth;
    yes.height = no.height = ButtonHeight;
  }

  override handleBackEvent(isDown: boolean): boolean {
    if (!isDown) this.postResult(false);
    return true;
  }

  override render(xm: number, ym: number, a: number): void {
    this.renderBackground();
    this.drawCenteredString(this.font!, this.title1, Math.trunc(this.width / 2), 50, 0xffffff);
    this.drawCenteredString(this.font!, this.title2, Math.trunc(this.width / 2), 70, 0xffffff);
    super.render(xm, ym, a);
  }

  protected override buttonClicked(button: Button): void {
    this.postResult(button.id === 0);
  }

  /**
   * C++ 是 `parent->confirmResult(isOk, id)`。**`parent` 允许是 NULL** ——
   * Touch::DeleteWorldScreen 传的就是 NULL，它覆盖了 postResult 所以永远走不到这里；
   * 真走到就是空指针解引用，C++ 一样。照抄，不额外加保护。
   */
  protected postResult(isOk: boolean): void {
    this.parent!.confirmResult(isOk, this.id);
  }
}
