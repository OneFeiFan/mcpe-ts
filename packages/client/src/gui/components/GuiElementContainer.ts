// 1:1 移植自 src/client/gui/components/GuiElementContainer.h 与 .cpp（选项界面）：把事件和绘制依次转给子元素
import type { Minecraft } from '../../Minecraft';
import { GuiElement } from './GuiElement';

export class GuiElementContainer extends GuiElement {
  protected children: GuiElement[] = [];

  constructor(active = false, visible = true, x = 0, y = 0, width = 24, height = 24) {
    super(active, visible, x, y, width, height);
  }

  override render(minecraft: Minecraft, xm: number, ym: number): void {
    for (const c of this.children) c.render(minecraft, xm, ym);
  }

  override setupPositions(): void {
    for (const c of this.children) c.setupPositions();
  }

  addChild(element: GuiElement): void {
    this.children.push(element);
  }

  removeChild(element: GuiElement): void {
    const i = this.children.indexOf(element);
    if (i >= 0) this.children.splice(i, 1);
  }

  containsPointInChildren(x: number, y: number): boolean {
    for (const child of this.children) {
      if (child === null || !child.visible) continue;
      if (child.pointInside(x, y)) return true;
      if (child instanceof GuiElementContainer && child.containsPointInChildren(x, y)) return true;
    }
    return false;
  }

  override tick(minecraft: Minecraft): void {
    for (const c of this.children) c.tick(minecraft);
  }

  override mouseClicked(minecraft: Minecraft, x: number, y: number, buttonNum: number): void {
    for (const c of this.children) c.mouseClicked(minecraft, x, y, buttonNum);
  }

  override mouseReleased(minecraft: Minecraft, x: number, y: number, buttonNum: number): void {
    for (const c of this.children) c.mouseReleased(minecraft, x, y, buttonNum);
  }

  override keyPressed(minecraft: Minecraft, key: number): void {
    for (const c of this.children) c.keyPressed(minecraft, key);
  }

  override charPressed(minecraft: Minecraft, key: string): void {
    for (const c of this.children) c.charPressed(minecraft, key);
  }
}
