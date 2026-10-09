// 1:1 移植自 src/client/gui/components/SmallButton.h/.cpp：150×20 的小按钮，可附带一个选项（R10：三个构造函数重载 → create / sized / withOption）
import type { Option } from '../../Option';
import { Button } from './Button';

export class SmallButton extends Button {
  private option: Option | null = null;

  /** C++ SmallButton(int id, int x, int y, const std::string& msg) */
  constructor(id: number, x: number, y: number, msg: string, w = 150, h = 20) {
    super(id, msg, x, y, w, h);
  }

  /** C++ SmallButton(int id, int x, int y, int width, int height, const std::string& msg) */
  static override sized(id: number, x: number, y: number, width: number, height: number, msg: string): SmallButton {
    return new SmallButton(id, x, y, msg, width, height);
  }

  /** C++ SmallButton(int id, int x, int y, Option* item, const std::string& msg) */
  static withOption(id: number, x: number, y: number, item: Option, msg: string): SmallButton {
    const b = new SmallButton(id, x, y, msg);
    b.option = item;
    return b;
  }

  getOption(): Option | null {
    return this.option;
  }
}
