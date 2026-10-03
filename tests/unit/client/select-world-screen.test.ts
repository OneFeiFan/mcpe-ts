import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLES1, glSetContext } from '@mcpe/client';
import { Mouse, MouseAction } from '@mcpe/platform';
import type { LevelSummary, LevelStorageSource, LevelSummaryList } from '@mcpe/world';
import type { Minecraft } from '../../../packages/client/src/Minecraft';
import { ScreenId } from '../../../packages/client/src/gui/screens/ScreenChooser';
import {
  SelectWorldScreen,
  TouchDeleteWorldScreen,
  TouchWorldSelectionList,
} from '../../../packages/client/src/gui/screens/TouchSelectWorldScreen';

// Touch::SelectWorldScreen（B8d-3）：选世界界面外层屏（B8d-2 已经把它的列表移植好了）。
//
// 这里盯的三件事：
//   ① loadLevelSource 要**按 lastPlayed 倒序**排（C++ 的 operator< 是个反着的比较）；
//   ② isIndexValid 把最后那张 "Create new" 排除在外（所以删除按钮在它上面是灰的）；
//   ③ 返回键/Back 都是回起始菜单，"Create new" 那条路还没接（SimpleChooseLevelScreen 是 B8e）。

const WIDTH = 854;
const HEIGHT = 480;

function makeLevel(id: string, name: string, lastPlayed: number, gameType = 0): LevelSummary {
  return { id, name, lastPlayed, gameType, sizeOnDisk: 0 };
}

function makeScreen(levels: LevelSummary[] = []): {
  screen: SelectWorldScreen;
  deleteLevel: ReturnType<typeof vi.fn>;
  setScreens: number[];
  setScreenCalls: unknown[];
} {
  const deleteLevel = vi.fn();
  const setScreens: number[] = [];
  const setScreenCalls: unknown[] = [];
  const levelSource = {
    getLevelList: (dest: LevelSummaryList) => {
      for (const l of levels) dest.push(l);
    },
    deleteLevel,
  } as unknown as LevelStorageSource;
  const mc = {
    width: WIDTH,
    height: HEIGHT,
    font: { width: (s: string) => s.length * 6, height: () => 10, drawShadow: () => {} },
    platform: () => ({ getDateString: (s: number) => `date(${s})` }),
    textures: { loadAndBindTexture: () => 7, getTemporaryTextureData: () => null },
    options: {
      getIntValue: () => -1, // 左右键的键值取不到，keyPressed 那条分支就走不到
    },
    getLevelSource: () => levelSource,
    screenChooser: { setScreen: (id: number) => setScreens.push(id) },
    setScreen: (s: unknown) => setScreenCalls.push(s),
    selectLevel: () => {},
    isLevelGenerated: () => false,
    useTouchscreen: () => true,
  } as unknown as Minecraft;
  const screen = new SelectWorldScreen();
  screen.init(mc, WIDTH, HEIGHT);
  return { screen, deleteLevel, setScreens, setScreenCalls };
}

/** 按钮的公共形状：位置 + 尺寸 + id + 亮不亮 */
type BtnGeom = { id: number; x: number; y: number; width: number; height: number; active: boolean };

function raw(screen: SelectWorldScreen): {
  worldsList: TouchWorldSelectionList;
  bDelete: BtnGeom;
  bCreate: BtnGeom;
  bBack: BtnGeom;
  bHeader: BtnGeom;
  _hasStartedLevel: boolean;
  _mouseHasBeenUp: boolean;
} {
  return screen as unknown as never;
}

function click(screen: SelectWorldScreen, button: unknown): void {
  (screen as unknown as { buttonClicked(b: unknown): void }).buttonClicked.call(screen, button);
}

beforeAll(() => {
  glSetContext(new GLES1(null)); // 无头模式：只维护状态与矩阵
});

beforeEach(() => {
  Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_UP, 0, 0);
  Mouse.reset();
});

describe('client/SelectWorldScreen', () => {
  it('init 之后列表建好、4 个按钮就位', () => {
    const { screen } = makeScreen([makeLevel('a', 'A', 1)]);
    const s = raw(screen);
    expect(s.worldsList).toBeInstanceOf(TouchWorldSelectionList);
    const buttons = (screen as unknown as { buttons: { id: number }[] }).buttons;
    const tabs = (screen as unknown as { tabButtons: { id: number }[] }).tabButtons;
    expect(buttons.map((b) => b.id)).toEqual([1, 2, 3, 0]); // delete/create/back/header
    expect(tabs.length, 'tabButtons 是 4 个（含只进 tab 的 bWorldView）').toBe(4);
  });

  describe('loadLevelSource', () => {
    it('按 lastPlayed 倒序排（最近玩的在前）', () => {
      const { screen } = makeScreen([
        makeLevel('old', 'Old', 100),
        makeLevel('new', 'New', 900),
        makeLevel('mid', 'Mid', 500),
      ]);
      expect(raw(screen).worldsList.levels.map((l) => l.id)).toEqual(['new', 'mid', 'old']);
    });

    /** C++ 的 `LevelStorageSource::TempLevelId` 是联机用的临时存档，不进列表 */
    it('剔掉临时世界 _LastJoinedServer', () => {
      const { screen } = makeScreen([
        makeLevel('a', 'A', 1),
        makeLevel('_LastJoinedServer', 'Temp', 999),
      ]);
      expect(raw(screen).worldsList.levels.map((l) => l.id)).toEqual(['a']);
    });
  });

  describe('getUniqueLevelName', () => {
    const unique = (screen: SelectWorldScreen, name: string) =>
      (screen as unknown as { getUniqueLevelName(n: string): string }).getUniqueLevelName.call(
        screen,
        name,
      );

    it('没重名就用原名', () => {
      const { screen } = makeScreen([makeLevel('a', 'A', 1)]);
      expect(unique(screen, 'World')).toBe('World');
    });

    it('重名就一直往后加 "-"', () => {
      const { screen } = makeScreen([makeLevel('World', 'W1', 1), makeLevel('World-', 'W2', 2)]);
      expect(unique(screen, 'World')).toBe('World--');
    });
  });

  it('setupPositions：返回在左、新建在右、标题夹在中间、删除贴底居中', () => {
    const { screen } = makeScreen();
    const s = raw(screen);
    expect(s.bBack.x).toBe(0);
    expect(s.bCreate.x).toBe(WIDTH - (s.bCreate as unknown as { width: number }).width);
    expect(s.bHeader.x).toBe((s.bBack as unknown as { width: number }).width);
    expect(s.bHeader.width).toBe(
      WIDTH -
        ((s.bBack as unknown as { width: number }).width +
          (s.bCreate as unknown as { width: number }).width),
    );
    expect((s as unknown as { bDelete: { x: number; y: number } }).bDelete.y).toBe(HEIGHT - 30);
  });

  describe('isIndexValid', () => {
    it('世界能选，最后那张 "Create new" 不算', () => {
      const { screen } = makeScreen([makeLevel('a', 'A', 1), makeLevel('b', 'B', 2)]);
      expect(screen.isIndexValid(0)).toBe(true);
      expect(screen.isIndexValid(1)).toBe(true);
      expect(screen.isIndexValid(2), '第 2 项是 Create new').toBe(false);
      expect(screen.isIndexValid(-1)).toBe(false);
    });

    it('一个世界都没有时连 0 都不算', () => {
      const { screen } = makeScreen();
      expect(screen.isIndexValid(0)).toBe(false);
    });
  });

  /**
   * 【不能直接改 selectedItem 来测】`tick()` 第一件事就是 `worldsList.tick()`，
   * 而那个会把 `selectedItem` **按滚动位置重新算一遍** —— 从外面硬设的值当场被覆盖。
   * 所以这里用 `xo`（滚动偏移）来摆位置：`xo = -367` 让第 0 张居中，`-247` 让第 1 张居中。
   */
  it('tick 跟着当前选中的是不是世界，开关删除按钮', () => {
    const { screen } = makeScreen([makeLevel('a', 'A', 1)]);
    const s = raw(screen);

    (s.worldsList as unknown as { xo: number }).xo = -367; // 第 0 张（世界）居中
    screen.tick();
    expect(s.worldsList.selectedItem).toBe(0);
    expect(s.bDelete.active).toBe(true);

    (s.worldsList as unknown as { xo: number }).xo = -247; // 第 1 张（Create new）居中
    screen.tick();
    expect(s.worldsList.selectedItem).toBe(1);
    expect(s.bDelete.active).toBe(false);
  });

  describe('按钮', () => {
    it('Back 回起始菜单', () => {
      const { screen, setScreens } = makeScreen();
      click(screen, raw(screen).bBack);
      expect(setScreens).toEqual([ScreenId.SCREEN_STARTMENU]);
    });

    it('Delete 在选中一个世界时打开删除确认框', () => {
      const { screen, setScreenCalls } = makeScreen([makeLevel('a', 'A', 1)]);
      raw(screen).worldsList.selectedItem = 0;
      click(screen, raw(screen).bDelete);
      expect(setScreenCalls.length).toBe(1);
      expect(setScreenCalls[0]).toBeInstanceOf(TouchDeleteWorldScreen);
    });

    it('Delete 选中的是 "Create new" 时什么都不做', () => {
      const { screen, setScreenCalls } = makeScreen([makeLevel('a', 'A', 1)]);
      raw(screen).worldsList.selectedItem = 1;
      click(screen, raw(screen).bDelete);
      expect(setScreenCalls).toEqual([]);
    });

    it('"Create new" 现在不打开任何东西（新建世界界面是 B8e）', () => {
      const { screen, setScreenCalls, setScreens } = makeScreen([makeLevel('a', 'A', 1)]);
      click(screen, raw(screen).bCreate);
      expect(setScreenCalls).toEqual([]);
      expect(setScreens).toEqual([]);
    });
  });

  it('返回键松开时回起始菜单，按下时不动', () => {
    const { screen, setScreens } = makeScreen();
    expect(screen.handleBackEvent(true)).toBe(true);
    expect(setScreens).toEqual([]);
    expect(screen.handleBackEvent(false)).toBe(true);
    expect(setScreens).toEqual([ScreenId.SCREEN_STARTMENU]);
  });

  it('这是游戏内界面（世界列表在背后还画着世界）', () => {
    expect(makeScreen().screen.isInGameScreen()).toBe(true);
  });

  describe('滚轮', () => {
    it('往上滚选前一个，往下滚选后一个，并把 selectedItem 同步过去', () => {
      const { screen } = makeScreen([makeLevel('a', 'A', 1), makeLevel('b', 'B', 2)]);
      const s = raw(screen);
      s.worldsList.selectedItem = 1;

      (
        screen as unknown as { mouseWheel(dx: number, dy: number, x: number, y: number): void }
      ).mouseWheel.call(screen, 0, 1, 0, 0);
      expect(s.worldsList.selectedItem).toBe(0);

      (
        screen as unknown as { mouseWheel(dx: number, dy: number, x: number, y: number): void }
      ).mouseWheel.call(screen, 0, -1, 0, 0);
      expect(s.worldsList.selectedItem).toBe(1);
    });

    it('dy 为 0 时不动', () => {
      const { screen } = makeScreen([makeLevel('a', 'A', 1)]);
      const s = raw(screen);
      s.worldsList.selectedItem = 0;
      (
        screen as unknown as { mouseWheel(dx: number, dy: number, x: number, y: number): void }
      ).mouseWheel.call(screen, 0, 0, 0, 0);
      expect(s.worldsList.selectedItem).toBe(0);
    });
  });

  it('render 跑得通（第一次用 (0,0)、之后才用真实指针位置）', () => {
    const { screen } = makeScreen([makeLevel('a', 'A', 1)]);
    expect(() => screen.render(0, 0, 1)).not.toThrow();
    expect(raw(screen)._mouseHasBeenUp, '鼠标没按着 → 下一次就用真实坐标了').toBe(true);
  });
});

describe('client/TouchDeleteWorldScreen', () => {
  function makeDelete(level: LevelSummary): {
    screen: TouchDeleteWorldScreen;
    deleteLevel: ReturnType<typeof vi.fn>;
    setScreens: number[];
  } {
    const deleteLevel = vi.fn();
    const setScreens: number[] = [];
    const mc = {
      width: WIDTH,
      height: HEIGHT,
      font: { width: () => 0, height: () => 10, drawShadow: () => {} },
      textures: { loadAndBindTexture: () => 7 },
      isLevelGenerated: () => false,
      useTouchscreen: () => false,
      setScreen: () => {},
      getLevelSource: () => ({ deleteLevel }) as unknown as LevelStorageSource,
      screenChooser: { setScreen: (id: number) => setScreens.push(id) },
    } as unknown as Minecraft;
    const screen = new TouchDeleteWorldScreen(level);
    screen.init(mc, WIDTH, HEIGHT);
    return { screen, deleteLevel, setScreens };
  }

  const post = (screen: TouchDeleteWorldScreen, ok: boolean) =>
    (screen as unknown as { postResult(b: boolean): void }).postResult.call(screen, ok);

  it('两个按钮的文字是 Delete / Cancel', () => {
    const { screen } = makeDelete(makeLevel('a', 'A', 1));
    const buttons = (screen as unknown as { buttons: { msg: string }[] }).buttons;
    expect(buttons.map((b) => b.msg)).toEqual(['Delete', 'Cancel']);
  });

  it('点确定才真删，并且都回选世界界面', () => {
    const a = makeDelete(makeLevel('world-a', 'A', 1));
    post(a.screen, true);
    expect(a.deleteLevel).toHaveBeenCalledWith('world-a');
    expect(a.setScreens).toEqual([ScreenId.SCREEN_SELECTWORLD]);

    const b = makeDelete(makeLevel('world-b', 'B', 1));
    post(b.screen, false);
    expect(b.deleteLevel, '取消不删').not.toHaveBeenCalled();
    expect(b.setScreens).toEqual([ScreenId.SCREEN_SELECTWORLD]);
  });
});
