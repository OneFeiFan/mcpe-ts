/**
 * 1:1 移植自 src/client/gui/screens/ScreenChooser.h 与 ScreenChooser.cpp（S13 阶段 C 起，陆续补齐）。
 * 部分：已移植物品选择界面（默认菜单风格 0 → Touch::IngameBlockSelectionScreen）、暂停界面、
 *   起始菜单（B8c → Touch::StartMenuScreen）、选世界界面（B8d-3 → Touch::SelectWorldScreen）。
 *   加入游戏、按 IP 加入、控制台界面，以及菜单风格非 0 时的经典界面都未移植（DEFERRED(Gui)），
 *   createScreen 对它们返回 null ——与 C++ 走到 default 分支相同。
 */
import type { Minecraft } from '../../Minecraft';
import { OptionId } from '../../Options';
import type { Screen } from '../Screen';
import { PauseScreen } from './PauseScreen';
import { TouchIngameBlockSelectionScreen } from './TouchIngameBlockSelectionScreen';
import { TouchStartMenuScreen } from './TouchStartMenuScreen';
import { SelectWorldScreen } from './TouchSelectWorldScreen';

export const ScreenId = {
  SCREEN_NONE: 0,
  SCREEN_STARTMENU: 1,
  SCREEN_JOINGAME: 2,
  SCREEN_PAUSE: 3,
  SCREEN_PAUSEPREV: 4,
  SCREEN_SELECTWORLD: 5,
  SCREEN_BLOCKSELECTION: 6,
  SCREEN_JOINBYIP: 7,
  SCREEN_CONSOLE: 8,
} as const;

export class ScreenChooser {
  private _mc: Minecraft;

  constructor(mc: Minecraft) {
    this._mc = mc;
  }

  createScreen(id: number): Screen | null {
    let screen: Screen | null = null;
    if (this._mc.options.getIntValue(OptionId.OPTIONS_MENU_STYLE) === 0) {
      switch (id) {
        case ScreenId.SCREEN_STARTMENU:
          screen = new TouchStartMenuScreen();
          break;
        case ScreenId.SCREEN_SELECTWORLD:
          screen = new SelectWorldScreen();
          break;
        case ScreenId.SCREEN_PAUSE:
          screen = new PauseScreen(false);
          break;
        case ScreenId.SCREEN_PAUSEPREV:
          screen = new PauseScreen(true);
          break;
        case ScreenId.SCREEN_BLOCKSELECTION:
          screen = new TouchIngameBlockSelectionScreen();
          break;
        // DEFERRED(Gui): SCREEN_JOINGAME、SCREEN_JOINBYIP、SCREEN_CONSOLE
        default:
          break;
      }
    } else {
      // 经典菜单风格：暂停界面相同；其余（StartMenuScreen、IngameBlockSelectionScreen 等）DEFERRED(Gui)
      if (id === ScreenId.SCREEN_PAUSE) screen = new PauseScreen(false);
      else if (id === ScreenId.SCREEN_PAUSEPREV) screen = new PauseScreen(true);
    }
    return screen;
  }

  setScreen(id: number): Screen | null {
    const screen = this.createScreen(id);
    this._mc.setScreen(screen);
    return screen;
  }
}
