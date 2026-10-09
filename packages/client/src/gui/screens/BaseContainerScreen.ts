/**
 * 1:1 移植自 src/client/gui/screens/BaseContainerScreen.h（熔炉与箱子界面）：容器界面的基类。
 * 打开时把菜单交给玩家（player->containerMenu）；玩家死了或被移除就关掉容器；Esc 也是关容器（closeContainer 会关界面）。
 */
import { Keyboard } from '@mcpe/platform';
import type { BaseContainerMenu } from '@mcpe/world';
import { Screen } from '../Screen';

export abstract class BaseContainerScreen extends Screen {
  protected menu: BaseContainerMenu;

  constructor(menu: BaseContainerMenu) {
    super();
    this.menu = menu;
  }

  protected override initScreen(): void {
    super.initScreen();
    this.minecraft.player!.containerMenu = this.menu;
  }

  override tick(): void {
    super.tick();
    const p = this.minecraft.player!;
    if (!p.isAlive() || p.removed) (p as unknown as { closeContainer(): void }).closeContainer();
  }

  protected override keyPressed(eventKey: number): void {
    if (eventKey === Keyboard.KEY_ESCAPE) {
      (this.minecraft.player! as unknown as { closeContainer(): void }).closeContainer();
    } else {
      super.keyPressed(eventKey);
    }
  }

  override closeOnPlayerHurt(): boolean {
    return true;
  }
}
