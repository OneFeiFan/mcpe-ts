/**
 * 1:1 移植自 src/client/gui/screens/InBedScreen.h 与 InBedScreen.cpp（睡觉界面）：只有一个“Leave Bed”大按钮（屏幕下方，半屏宽、0.2 屏高）。
 * 原样保留：init 里 `if (true)` 总是用 Touch::TButton；WAIT_TICKS 声明了但不用。
 * C++ 的无参 init() 是 initScreen（R10）。
 */
import {
  GL_BLEND,
  GL_ONE_MINUS_SRC_ALPHA,
  GL_SRC_ALPHA,
  glBlendFunc,
  glDisable,
  glEnable,
} from '../../renderer/gles';
import type { Button } from '../components/Button';
import { TButton } from '../components/Button';
import { Screen } from '../Screen';

const f = Math.fround;
export class InBedScreen extends Screen {
  private bWakeUp: Button | null = null;

  protected override initScreen(): void {
    this.bWakeUp = new TButton(1, 'Leave Bed'); // C++：if (true) Touch::TButton，else Button
    this.buttons.push(this.bWakeUp);
    this.tabButtons.push(this.bWakeUp);
  }

  override setupPositions(): void {
    const b = this.bWakeUp!;
    b.width = Math.trunc(this.width / 2);
    b.height = Math.trunc(f(this.height * f(0.2)));
    b.y = this.height - Math.trunc(b.height * 1.5);
    b.x = Math.trunc(this.width / 2) - Math.trunc(b.width / 2);
  }

  override render(xm: number, ym: number, a: number): void {
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    super.render(xm, ym, a);
    glDisable(GL_BLEND);
  }

  protected override buttonClicked(button: Button): void {
    if (button === this.bWakeUp) {
      this.minecraft.player!.stopSleepInBed(true, true, true);
      this.minecraft.setScreen(null);
    }
  }
}
