/**
 * FORWARD-DECL(Gui)：类 + 同名接口（手册 R2），对应 src/client/gui/Gui.h。
 * S8 只用到静态的 GuiScale（createConfig 读它）；静态值照 Gui.cpp 第 33–35 行。其余部分在 S9 / S11。
 */
const f = Math.fround;

// FORWARD-DECL(Gui)
export class Gui {
  static InvGuiScale = f(1.0 / 3.0);
  static GuiScale = f(1.0 / Gui.InvGuiScale);
  static readonly DropTicks = 40.0;

  protected constructor() {}
}
