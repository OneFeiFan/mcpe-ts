// FORWARD-DECL(Screen)：对应 src/client/gui/Screen.h。demo 没有任何界面（mc.screen 始终为 null），
// 这里只列出 Minecraft、GameRenderer 保留下来的代码里读到的成员。
import type { IntRectangle } from './components/ImageButton';

export interface Screen {
  passEvents: boolean;
  renderGameBehind(): boolean;
  hasClippingArea(out: IntRectangle): boolean;
  render(xm: number, ym: number, a: number): void;
  isInGameScreen(): boolean;
  setSize(width: number, height: number): void;
  tick(): void;
  updateEvents(): void;
}
