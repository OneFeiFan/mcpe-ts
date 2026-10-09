/**
 * 1:1 移植自 src/client/gui/screens/DeathScreen.h 与 DeathScreen.cpp（死亡界面）。
 * 红色渐变遮罩 + “You died!”（菜单风格 2 时是“Game over!”并显示分数）；1.5 秒（30 刻）后才出现并响应“重生”“回主菜单”两个按钮。
 * 三种菜单风格各用一种按钮：0 → Touch::TButton，1 → Button，2 → 200×20 的 Button（文字也不同）。
 * C++ 的无参 init() 是 initScreen（R10）。
 */
import { I18n } from '@mcpe/locale';
import { OptionId } from '../../Options';
import { glPopMatrix2, glPushMatrix2, glScalef2 } from '../../renderer/gles';
import { Button, TButton } from '../components/Button';
import { Screen } from '../Screen';

const WAIT_TICKS = 30;

export class DeathScreen extends Screen {
  private bRespawn: Button | null = null;
  private bTitle: Button | null = null;
  protected _hasChosen = false; // C++ 声明并初始化，但不使用
  private _tick = 0;

  protected override initScreen(): void {
    const style = this.minecraft.options.getIntValue(OptionId.OPTIONS_MENU_STYLE);
    if (style === 0) {
      this.bRespawn = new TButton(1, 'Respawn!');
      this.bTitle = new TButton(2, 'Main menu');
    } else if (style === 1) {
      this.bRespawn = new Button(1, 'Respawn!');
      this.bTitle = new Button(2, 'Main menu');
    } else {
      this.bRespawn = Button.sized(1, 0, 0, 200, 20, 'Respawn'); // C++ 的 Button(id, x, y, w, h, msg) 重载
      this.bTitle = Button.sized(2, 0, 0, 200, 20, 'Title menu');
    }
    this.buttons.push(this.bRespawn, this.bTitle);
    this.tabButtons.push(this.bRespawn, this.bTitle);
  }

  override setupPositions(): void {
    const bRespawn = this.bRespawn!;
    const bTitle = this.bTitle!;
    if (this.minecraft.options.getIntValue(OptionId.OPTIONS_MENU_STYLE) === 2) {
      bRespawn.width = 200;
      bTitle.width = 200;
      const centerX = Math.trunc(this.width / 2) - Math.trunc(bRespawn.width / 2);
      bRespawn.x = centerX;
      bTitle.x = centerX;
      bRespawn.y = Math.trunc(this.height / 2);
      bTitle.y = bRespawn.y + 24;
    } else {
      bRespawn.width = bTitle.width = Math.trunc(this.width / 4);
      bRespawn.y = bTitle.y = Math.trunc(this.height / 2);
      bRespawn.x = Math.trunc(this.width / 2) - bRespawn.width - 10;
      bTitle.x = Math.trunc(this.width / 2) + 10;
    }
  }

  override tick(): void {
    ++this._tick;
  }

  override render(xm: number, ym: number, a: number): void {
    this.fillGradient(0, 0, this.width, this.height, 0x60500000, 0xa0803030 | 0);
    const font = this.minecraft.font!;
    if (this.minecraft.options.getIntValue(OptionId.OPTIONS_MENU_STYLE) === 2) {
      glPushMatrix2();
      glScalef2(2, 2, 2);
      this.drawCenteredString(
        font,
        I18n.get('deathScreen.title.hardcore'),
        Math.trunc(this.width / 4),
        Math.trunc(this.height / 8),
        0xffffff,
      );
      glPopMatrix2();
      const ss = 'Score: &e' + this.minecraft.player!.getScore();
      this.drawCenteredString(
        font,
        ss,
        Math.trunc(this.width / 2),
        Math.trunc(this.height / 4) + 32,
        0xffffff,
      );
    } else {
      glPushMatrix2();
      glScalef2(2, 2, 2);
      this.drawCenteredString(
        font,
        I18n.get('deathScreen.title'),
        Math.trunc(this.width / 4),
        Math.trunc(this.height / 8),
        0xffffff,
      );
      glPopMatrix2();
    }
    if (this._tick >= WAIT_TICKS) super.render(xm, ym, a);
  }

  protected override buttonClicked(button: Button): void {
    if (this._tick < WAIT_TICKS) return;
    if (button === this.bRespawn) {
      this.minecraft.player!.respawn();
      this.minecraft.setScreen(null);
    }
    if (button === this.bTitle) this.minecraft.leaveGame();
  }
}
