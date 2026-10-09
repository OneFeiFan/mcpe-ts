/**
 * 1:1 移植自 src/client/gui/screens/ScreenChooser.h 与 ScreenChooser.cpp（S13 阶段 C 起，陆续补齐）。
 * 菜单风格 0：触屏版的起始菜单、选世界、物品选择；风格 1、2：经典版（StartMenuScreen、ClassicSelectWorldScreen、
 *   IngameBlockSelectionScreen）。暂停界面与控制台两种风格相同。加入游戏、按 IP 加入是联机界面（DEFERRED(Network)），
 *   createScreen 对它们返回 null——与 C++ 走到 default 分支相同。
 */
import { ConsoleScreen } from './ConsoleScreen';
import { IngameBlockSelectionScreen } from './IngameBlockSelectionScreen';
import { ClassicSelectWorldScreen } from './SelectWorldScreen';
import { StartMenuScreen } from './StartMenuScreen';
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
        case ScreenId.SCREEN_CONSOLE:
          screen = new ConsoleScreen();
          break;
        // DEFERRED(Network): SCREEN_JOINGAME、SCREEN_JOINBYIP（联机界面）
        default:
          break;
      }
    } else {
      // 经典菜单风格（1 = Xperia、2 = Java）：StartMenuScreen、SelectWorldScreen、IngameBlockSelectionScreen（经典版，
      // TS 里选世界界面导出为 ClassicSelectWorldScreen）。暂停界面两种风格相同。
      switch (id) {
        case ScreenId.SCREEN_STARTMENU:
          screen = new StartMenuScreen();
          break;
        case ScreenId.SCREEN_SELECTWORLD:
          screen = new ClassicSelectWorldScreen();
          break;
        case ScreenId.SCREEN_PAUSE:
          screen = new PauseScreen(false);
          break;
        case ScreenId.SCREEN_PAUSEPREV:
          screen = new PauseScreen(true);
          break;
        case ScreenId.SCREEN_BLOCKSELECTION:
          screen = new IngameBlockSelectionScreen();
          break;
        case ScreenId.SCREEN_CONSOLE:
          screen = new ConsoleScreen();
          break;
        // DEFERRED(Network): SCREEN_JOINGAME、SCREEN_JOINBYIP（联机界面）
        default:
          break;
      }
    }
    return screen;
  }

  setScreen(id: number): Screen | null {
    const screen = this.createScreen(id);
    this._mc.setScreen(screen);
    return screen;
  }
}
