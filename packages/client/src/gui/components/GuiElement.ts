// 1:1 移植自 src/client/gui/components/GuiElement.h 与 GuiElement.cpp（S13 阶段 C：界面类的基础）
import type { Minecraft } from '../../Minecraft';
import { GuiComponent } from '../GuiComponent';

export class GuiElement extends GuiComponent {
  active: boolean;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(active = false, visible = true, x = 0, y = 0, width = 24, height = 24) {
    super();
    this.active = active;
    this.visible = visible;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  tick(_minecraft: Minecraft): void {}
  render(_minecraft: Minecraft, _xm: number, _ym: number): void {}
  setupPositions(): void {}
  mouseClicked(_minecraft: Minecraft, _x: number, _y: number, _buttonNum: number): void {}
  mouseReleased(_minecraft: Minecraft, _x: number, _y: number, _buttonNum: number): void {}
  keyPressed(_minecraft: Minecraft, _key: number): void {}
  charPressed(_minecraft: Minecraft, _key: string): void {}

  pointInside(x: number, y: number): boolean {
    if (x >= this.x && x < this.x + this.width) {
      if (y >= this.y && y < this.y + this.height) {
        return true;
      }
    }
    return false;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }
}
