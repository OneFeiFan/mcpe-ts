import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLES1, glSetContext } from '@mcpe/client';
import { I18n } from '@mcpe/locale';
import { Keyboard, Mouse, MouseAction } from '@mcpe/platform';
import { Util } from '@mcpe/util';
import { GameType, LevelSettings } from '@mcpe/world';
import type { LevelSummary, LevelStorageSource, LevelSummaryList } from '@mcpe/world';
import type { Minecraft } from '../../../packages/client/src/Minecraft';
import { OptionId } from '../../../packages/client/src/Options';
import { SimpleChooseLevelScreen } from '../../../packages/client/src/gui/screens/SimpleChooseLevelScreen';
import { ScreenId } from '../../../packages/client/src/gui/screens/ScreenChooser';

// SimpleChooseLevelScreen（B8e）：新建世界那一屏。
//
// ⚠ 点「Create」会走 minecraft.selectLevel()，而那条路在真环境里**会抛**（世界生成没移植）。
// 这里的 selectLevel 是个记录用的替身，所以能测"传给它的参数对不对"。
//
// 【不要断言 I18n 的字面结果】本地化表是启动时才加载的，单测里可能没装。凡是跟 I18n 有关的
// 断言一律拿 I18n.get(键) 自己当期望值 —— 既稳定，也仍然说明"取的是那个键"。

const WIDTH = 854;
const HEIGHT = 480;

type Btn = { id: number; msg: string; x: number; y: number; width: number; height: number };
/** TextBox 在测试里要看的字段 */
type Box = { text: string; focused: boolean; x: number; y: number; width: number; height: number };

function makeLevel(id: string, name: string, lastPlayed: number, gameType = 0): LevelSummary {
  return { id, name, lastPlayed, gameType, sizeOnDisk: 0 };
}

function makeScreen(
  levelName = 'World',
  levels: LevelSummary[] = [],
  menuStyle = 0,
): {
  screen: SimpleChooseLevelScreen;
  selectLevel: ReturnType<typeof vi.fn>;
  setScreens: number[];
  setScreenCalls: unknown[];
  buttons: Btn[];
  textBoxes: Box[];
} {
  const selectLevel = vi.fn();
  const setScreens: number[] = [];
  const setScreenCalls: unknown[] = [];
  const levelSource = {
    getLevelList: (dest: LevelSummaryList) => {
      for (const l of levels) dest.push(l);
    },
  } as unknown as LevelStorageSource;
  const mc = {
    width: WIDTH,
    height: HEIGHT,
    font: { width: (s: string) => s.length * 6, height: () => 10, drawShadow: () => {} },
    platform: () => ({ showKeyboard: () => {}, hideKeyboard: () => {} }),
    textures: { loadAndBindTexture: () => 7, getTemporaryTextureData: () => null },
    options: { getIntValue: (id: number) => (id === OptionId.OPTIONS_MENU_STYLE ? menuStyle : 0) },
    getLevelSource: () => levelSource,
    screenChooser: { setScreen: (id: number) => setScreens.push(id) },
    setScreen: (s: unknown) => setScreenCalls.push(s),
    selectLevel,
    isLevelGenerated: () => false,
    useTouchscreen: () => true,
  } as unknown as Minecraft;
  const screen = new SimpleChooseLevelScreen(levelName);
  screen.init(mc, WIDTH, HEIGHT);
  return {
    screen,
    selectLevel,
    setScreens,
    setScreenCalls,
    buttons: (screen as unknown as { buttons: Btn[] }).buttons,
    textBoxes: (screen as unknown as { textBoxes: Box[] }).textBoxes,
  };
}

function raw(screen: SimpleChooseLevelScreen): {
  bGamemode: Btn;
  bCheats: Btn;
  bBack: Btn;
  bCreate: Btn;
  bHeader: Btn;
  gamemode: number;
  cheatsEnabled: boolean;
  hasChosen: boolean;
  tLevelName: Box;
  tSeed: Box;
} {
  return screen as unknown as never;
}

const click = (s: SimpleChooseLevelScreen, b: unknown) =>
  (s as unknown as { buttonClicked(b: unknown): void }).buttonClicked.call(s, b);
const key = (s: SimpleChooseLevelScreen, k: number) =>
  (s as unknown as { keyPressed(k: number): void }).keyPressed.call(s, k);
const mouseClick = (s: SimpleChooseLevelScreen, x: number, y: number, b: number) =>
  (s as unknown as { mouseClicked(x: number, y: number, b: number): void }).mouseClicked.call(
    s,
    x,
    y,
    b,
  );

beforeAll(() => {
  glSetContext(new GLES1(null)); // 无头模式：只维护状态与矩阵
});

beforeEach(() => {
  Mouse.reset();
});

describe('client/SimpleChooseLevelScreen', () => {
  it('init 之后：5 个按钮、2 个输入框，世界名取 I18n 的默认值', () => {
    const { screen, buttons, textBoxes } = makeScreen();
    expect(buttons.map((b) => b.id)).toEqual([0, 2, 1, 4, 3]); // header/back/gamemode/cheats/create
    expect(textBoxes.length).toBe(2);
    expect(raw(screen).tLevelName.text).toBe(I18n.get('selectWorld.newWorld'));
    expect(raw(screen).gamemode).toBe(GameType.Survival);
    expect(raw(screen).cheatsEnabled).toBe(false);
  });

  it('默认构造参数存下来了但没人用（C++ 里那个 levelName 是死字段）', () => {
    const { screen } = makeScreen('World-');
    expect((screen as unknown as { levelName: string }).levelName).toBe('World-');
  });

  it('菜单风格 2 才用经典按钮，其余用触屏按钮', () => {
    const touch = makeScreen('W', [], 0);
    expect(touch.buttons.find((b) => b.id === 3)!.msg).toBe(I18n.get('selectWorld.create'));
    const classic = makeScreen('W', [], 2);
    expect(classic.buttons.find((b) => b.id === 3)!.msg).toBe(I18n.get('Create'));
  });

  it('setupPositions：返回贴右上、标题占满左边、两个输入框居中、Create 贴底居中', () => {
    const { screen, buttons } = makeScreen();
    const s = raw(screen);
    const back = buttons.find((b) => b.id === 2)!;
    const header = buttons.find((b) => b.id === 0)!;
    const create = buttons.find((b) => b.id === 3)!;
    expect(back.x).toBe(WIDTH - back.width);
    expect(header.x).toBe(0);
    expect(header.width).toBe(WIDTH - back.width);
    expect(s.tLevelName.width).toBe(200);
    expect(s.tLevelName.x).toBe(Math.trunc(WIDTH / 2) - 100);
    expect(s.tLevelName.y).toBe(back.height + 20);
    expect(s.tSeed.x).toBe(s.tLevelName.x);
    expect(s.tSeed.y).toBe(s.tLevelName.y + 30);
    expect(create.width).toBe(100);
    expect(create.y).toBe(HEIGHT - 20 - create.height);
  });

  describe('两个切换按钮', () => {
    it('游戏模式在 Survival ↔ Creative 之间翻，文字也跟着换', () => {
      const { screen } = makeScreen();
      const s = raw(screen);
      click(screen, s.bGamemode);
      expect(s.gamemode).toBe(GameType.Creative);
      expect(s.bGamemode.msg).toBe('Creative mode');
      click(screen, s.bGamemode);
      expect(s.gamemode).toBe(GameType.Survival);
      expect(s.bGamemode.msg).toBe('Survival mode');
    });

    it('作弊开关跟着翻', () => {
      const { screen } = makeScreen();
      const s = raw(screen);
      click(screen, s.bCheats);
      expect(s.cheatsEnabled).toBe(true);
      expect(s.bCheats.msg).toBe('Cheats: On');
      click(screen, s.bCheats);
      expect(s.cheatsEnabled).toBe(false);
      expect(s.bCheats.msg).toBe('Cheats: Off');
    });
  });

  describe('Create', () => {
    it('世界名是空的就什么都不发生', () => {
      const { screen, selectLevel } = makeScreen();
      raw(screen).tLevelName.text = '';
      click(screen, raw(screen).bCreate);
      expect(selectLevel).not.toHaveBeenCalled();
      expect(raw(screen).hasChosen).toBe(false);
    });

    it('有名字就叫 selectLevel，并把当前模式和作弊一起传进去', () => {
      const { screen, selectLevel } = makeScreen('World');
      const s = raw(screen);
      s.tLevelName.text = 'My World';
      click(screen, s.bGamemode); // 切到 Creative
      click(screen, s.bCheats); // 打开作弊
      click(screen, s.bCreate);

      expect(selectLevel).toHaveBeenCalledTimes(1);
      const [id, name, settings] = selectLevel.mock.calls[0]!;
      expect(id).toBe('My World');
      expect(name).toBe('My World');
      expect(settings).toBeInstanceOf(LevelSettings);
      expect((settings as LevelSettings).getGameType()).toBe(GameType.Creative);
      expect((settings as LevelSettings).getAllowCheats()).toBe(true);
      // 种子留空 → 用当前时间戳（C++ 的 getEpochTimeS），是个整数就行
      expect(Number.isInteger((settings as LevelSettings).getSeed())).toBe(true);
      expect(s.hasChosen).toBe(true);
    });

    it('种子能当整数读就用它，读不出来就取 hashCode', () => {
      const a = makeScreen('W');
      raw(a.screen).tLevelName.text = 'W';
      raw(a.screen).tSeed.text = '  12345abc';
      click(a.screen, raw(a.screen).bCreate);
      expect((a.selectLevel.mock.calls[0]![2] as LevelSettings).getSeed()).toBe(12345);

      const b = makeScreen('W');
      raw(b.screen).tLevelName.text = 'W';
      raw(b.screen).tSeed.text = 'hello';
      click(b.screen, raw(b.screen).bCreate);
      expect((b.selectLevel.mock.calls[0]![2] as LevelSettings).getSeed()).toBe(
        Util.hashCode('hello'),
      );
    });

    it('世界名撞了会在 id 后面加横线去重', () => {
      const { screen, selectLevel } = makeScreen('World', [
        makeLevel('My World', 'A', 1),
        makeLevel('My World-', 'B', 2),
      ]);
      raw(screen).tLevelName.text = 'My World';
      click(screen, raw(screen).bCreate);
      expect(selectLevel.mock.calls[0]![0]).toBe('My World--');
    });

    it('点过一次之后整个界面就不再响应', () => {
      const { screen, selectLevel, setScreens } = makeScreen('W');
      const s = raw(screen);
      s.tLevelName.text = 'W';
      click(screen, s.bCreate);
      expect(selectLevel).toHaveBeenCalledTimes(1);

      click(screen, s.bCreate);
      click(screen, s.bGamemode);
      click(screen, s.bBack);
      expect(selectLevel).toHaveBeenCalledTimes(1);
      expect(setScreens, 'hasChosen 之后连返回都不理').toEqual([]);
    });
  });

  describe('返回', () => {
    it('Back 按钮 / ESC / 返回键松开，都回起始菜单', () => {
      const a = makeScreen();
      click(a.screen, raw(a.screen).bBack);
      expect(a.setScreens).toEqual([ScreenId.SCREEN_STARTMENU]);

      const b = makeScreen();
      key(b.screen, Keyboard.KEY_ESCAPE);
      expect(b.setScreens).toEqual([ScreenId.SCREEN_STARTMENU]);

      const c = makeScreen();
      expect(c.screen.handleBackEvent(true)).toBe(true);
      expect(c.setScreens, '按下不动').toEqual([]);
      expect(c.screen.handleBackEvent(false)).toBe(true);
      expect(c.setScreens).toEqual([ScreenId.SCREEN_STARTMENU]);
    });
  });

  describe('点输入框', () => {
    it('点世界名就它聚焦、另一个失焦', () => {
      const { screen } = makeScreen();
      const s = raw(screen);
      mouseClick(screen, s.tLevelName.x + 5, s.tLevelName.y + 5, MouseAction.ACTION_LEFT);
      expect(s.tLevelName.focused).toBe(true);
      expect(s.tSeed.focused).toBe(false);
    });

    it('点种子框就反过来', () => {
      const { screen } = makeScreen();
      const s = raw(screen);
      mouseClick(screen, s.tSeed.x + 5, s.tSeed.y + 5, MouseAction.ACTION_LEFT);
      expect(s.tSeed.focused).toBe(true);
      expect(s.tLevelName.focused).toBe(false);
    });

    it('点别处两个都失焦；右键什么都不做', () => {
      const { screen } = makeScreen();
      const s = raw(screen);
      mouseClick(screen, s.tLevelName.x + 5, s.tLevelName.y + 5, MouseAction.ACTION_LEFT);
      mouseClick(screen, 2, 2, MouseAction.ACTION_LEFT);
      expect(s.tLevelName.focused).toBe(false);

      mouseClick(screen, s.tLevelName.x + 5, s.tLevelName.y + 5, MouseAction.ACTION_RIGHT);
      expect(s.tLevelName.focused, '右键不碰文本框').toBe(false);
    });
  });

  it('render 跑得通（两种模式各一次）', () => {
    const { screen } = makeScreen();
    expect(() => screen.render(0, 0, 1)).not.toThrow();
    click(screen, raw(screen).bGamemode);
    expect(() => screen.render(0, 0, 1)).not.toThrow();
  });
});
