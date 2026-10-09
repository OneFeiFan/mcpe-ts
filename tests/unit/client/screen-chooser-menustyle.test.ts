/**
 * 回归：选项里把“菜单风格”改成 1（Xperia）或 2（Java）后启动黑屏、日志停在 Reloading-options（起始菜单曾为 null）。
 * 经典界面移植后：风格 0 用触屏版，风格 1、2 用经典版（StartMenuScreen、ClassicSelectWorldScreen、IngameBlockSelectionScreen）。
 */
import { describe, expect, it } from 'vitest';
import {
  ClassicSelectWorldScreen, ConsoleScreen, IngameBlockSelectionScreen, PauseScreen, ScreenChooser, ScreenId, StartMenuScreen,
  TouchIngameBlockSelectionScreen, TouchStartMenuScreen,
} from '@mcpe/client';

const chooserFor = (style: number): ScreenChooser => new ScreenChooser({ options: { getIntValue: () => style } } as never);

describe('ScreenChooser 的三种菜单风格', () => {
  for (const style of [0, 1, 2]) {
    it(`菜单风格 ${style}：起始菜单、物品选择、暂停界面、选世界都不是 null`, () => {
      const c = chooserFor(style);
      expect(c.createScreen(ScreenId.SCREEN_STARTMENU)).toBeInstanceOf(style === 0 ? TouchStartMenuScreen : StartMenuScreen);
      expect(c.createScreen(ScreenId.SCREEN_BLOCKSELECTION)).toBeInstanceOf(style === 0 ? TouchIngameBlockSelectionScreen : IngameBlockSelectionScreen);
      if (style !== 0) expect(c.createScreen(ScreenId.SCREEN_SELECTWORLD)).toBeInstanceOf(ClassicSelectWorldScreen);
      expect(c.createScreen(ScreenId.SCREEN_CONSOLE)).toBeInstanceOf(ConsoleScreen);
      expect(c.createScreen(ScreenId.SCREEN_PAUSE)).toBeInstanceOf(PauseScreen);
      expect(c.createScreen(ScreenId.SCREEN_SELECTWORLD)).not.toBeNull();
    });
  }
});
