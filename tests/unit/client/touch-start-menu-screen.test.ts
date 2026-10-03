import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GLES1, glSetContext } from '@mcpe/client';
import { MouseAction } from '@mcpe/platform';
import type { Minecraft } from '../../../packages/client/src/Minecraft';
import { OptionId } from '../../../packages/client/src/Options';
import { LargeImageButton } from '../../../packages/client/src/gui/components/LargeImageButton';
import { TouchStartMenuScreen } from '../../../packages/client/src/gui/screens/TouchStartMenuScreen';
import { ScreenId } from '../../../packages/client/src/gui/screens/ScreenChooser';

// TouchStartMenuScreen（B8c）：菜单风格 0 下的起始菜单。
//
// 三个大按钮是**依次取 touchgui.png 里竖排的三块 75×75**（constructor 里那段
// “用完就 defSrc.y += defSrc.h”），顺序是 options → host → join，所以取图坐标会
// 是 26 / 101 / 176。这一条最容易抄错，单独立了用例。

const MC_W = 854;
const MC_H = 480;

type Btn = { id: number; x: number; y: number; width: number; height: number; active: boolean };

function makeMinecraft(
  username = '',
  overrides: Partial<{ quit: () => void; openURL: (u: string) => void }> = {},
): {
  mc: Minecraft;
  setScreens: number[];
  quit: ReturnType<typeof vi.fn>;
  openURL: ReturnType<typeof vi.fn>;
} {
  const setScreens: number[] = [];
  const quit = vi.fn(overrides.quit);
  const openURL = vi.fn(overrides.openURL);
  const mc = {
    width: MC_W,
    height: MC_H,
    font: { width: () => 0, height: () => 10, drawShadow: () => {} },
    options: { getStringValue: (id: number) => (id === OptionId.OPTIONS_USERNAME ? username : '') },
    platform: () => ({ openURL }),
    screenChooser: { setScreen: (id: number) => setScreens.push(id) },
    textures: {
      loadTexture: () => 3,
      getTemporaryTextureData: () => ({ w: 256, h: 64 }),
      bind: () => {},
      loadAndBindTexture: () => 3,
    },
    useTouchscreen: () => true,
    isLevelGenerated: () => false,
    setScreen: () => {},
    quit,
  } as unknown as Minecraft;
  return { mc, setScreens, quit, openURL };
}

function makeScreen(username = ''): {
  screen: TouchStartMenuScreen;
  setScreens: number[];
  quit: ReturnType<typeof vi.fn>;
  openURL: ReturnType<typeof vi.fn>;
  buttons: Btn[];
} {
  const { mc, setScreens, quit, openURL } = makeMinecraft(username);
  const screen = new TouchStartMenuScreen();
  screen.init(mc, MC_W, MC_H);
  const buttons = (screen as unknown as { buttons: Btn[] }).buttons;
  return { screen, setScreens, quit, openURL, buttons };
}

function parts(screen: TouchStartMenuScreen): {
  bHost: LargeImageButton;
  bJoin: LargeImageButton;
  bOptions: LargeImageButton;
  bQuit: Btn;
} {
  return screen as unknown as {
    bHost: LargeImageButton;
    bJoin: LargeImageButton;
    bOptions: LargeImageButton;
    bQuit: Btn;
  };
}

/** ImageButton 的 _imageDef 是 protected */
function srcYOf(b: LargeImageButton): number {
  const def = (b as unknown as { _imageDef: { getSrc: () => { y: number } | null } })._imageDef;
  return def.getSrc()!.y;
}

beforeAll(() => {
  glSetContext(new GLES1(null)); // 无头模式：只维护状态与矩阵
});

describe('client/TouchStartMenuScreen', () => {
  it('三个大按钮都是 75×75，依次取 touchgui.png 竖排的三块', () => {
    const { screen } = makeScreen();
    const { bHost, bJoin, bOptions } = parts(screen);

    for (const b of [bHost, bJoin, bOptions]) {
      expect(b.width).toBe(75);
      expect(b.height).toBe(75);
      expect(b.active).toBe(true);
    }
    // 构造函数的顺序：options(y=26) → host(101) → join(176)
    expect(srcYOf(bOptions)).toBe(26);
    expect(srcYOf(bHost)).toBe(101);
    expect(srcYOf(bJoin)).toBe(176);
  });

  it('关闭按钮是 34×26，且按下不缩放', () => {
    const { screen, buttons } = makeScreen();
    const bQuit = parts(screen).bQuit;
    expect(bQuit.width).toBe(34);
    expect(bQuit.height).toBe(26);
    expect((bQuit as unknown as { scaleWhenPressed: boolean }).scaleWhenPressed).toBe(false);
    expect(buttons.length, '三个大按钮 + 关闭按钮').toBe(4);
  });

  it('setupPositions：三个大按钮横排在 2 + height/3 那一行，关闭按钮贴右上', () => {
    const { screen } = makeScreen();
    const { bHost, bJoin, bOptions, bQuit } = parts(screen);
    const yBase = 2 + Math.trunc(MC_H / 3);
    const bw = 75;
    const spacing = (MC_W - 3 * bw) / 4;

    expect([bHost.y, bJoin.y, bOptions.y]).toEqual([yBase, yBase, yBase]);
    expect(bJoin.x).toBe(0 * bw + Math.trunc(1 * spacing));
    expect(bHost.x).toBe(1 * bw + Math.trunc(2 * spacing));
    expect(bOptions.x).toBe(2 * bw + Math.trunc(3 * spacing));
    expect(bQuit.x).toBe(MC_W - 34);
    expect(bQuit.y).toBe(0);
  });

  it('用户名空的时候显示 unknown', () => {
    expect((makeScreen('').screen as unknown as { username: string }).username).toBe(
      'Username: unknown',
    );
    expect((makeScreen('Steve').screen as unknown as { username: string }).username).toBe(
      'Username: Steve',
    );
  });

  it('“开始游戏”打开选世界界面', () => {
    const { screen, setScreens } = makeScreen();
    const { bHost } = parts(screen);
    (screen as unknown as { buttonClicked: (b: unknown) => void }).buttonClicked(bHost);
    expect(setScreens).toEqual([ScreenId.SCREEN_SELECTWORLD]);
  });

  it('“加入游戏”和“选项”现在什么都不做（联机 / 选项界面都没移植）', () => {
    const { screen, setScreens } = makeScreen();
    const { bJoin, bOptions } = parts(screen);
    const click = (screen as unknown as { buttonClicked: (b: unknown) => void }).buttonClicked;
    click.call(screen, bJoin);
    click.call(screen, bOptions);
    expect(setScreens).toEqual([]);
  });

  it('右上角的关闭按钮会退出游戏', () => {
    const { screen, quit } = makeScreen();
    const { bQuit } = parts(screen);
    (screen as unknown as { buttonClicked: (b: unknown) => void }).buttonClicked(bQuit);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('返回键直接退出，不看按下还是抬起', () => {
    const { screen, quit } = makeScreen();
    expect(screen.handleBackEvent(true)).toBe(true);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(screen.handleBackEvent(false)).toBe(true);
    expect(quit).toHaveBeenCalledTimes(2);
  });

  it('这不是游戏内界面', () => {
    expect(makeScreen().screen.isInGameScreen()).toBe(false);
  });

  describe('右下角的 github 链接', () => {
    // 命中区：x ∈ [2, 2 + 10 + 字体宽度]，y ∈ [height-10, height]
    it('点在图标/地址那一条上就打开浏览器', () => {
      const { screen, openURL } = makeScreen();
      const click = (
        screen as unknown as { mouseClicked: (x: number, y: number, b: number) => void }
      ).mouseClicked;
      click.call(screen, 2, MC_H - 5, MouseAction.ACTION_LEFT);
      expect(openURL).toHaveBeenCalledWith(
        'https://gitea.sffempire.ru/Kolyah35/minecraft-pe-0.6.1',
      );
    });

    it('点别处不打开浏览器', () => {
      const { screen, openURL } = makeScreen();
      const click = (
        screen as unknown as { mouseClicked: (x: number, y: number, b: number) => void }
      ).mouseClicked;
      click.call(screen, 400, 200, MouseAction.ACTION_LEFT);
      expect(openURL).not.toHaveBeenCalled();
    });
  });

  it('render 跑得通（背景 + 用户名 + 标题图 + 版本号 + 版权 + 按钮）', () => {
    const { screen } = makeScreen();
    expect(() => screen.render(0, 0, 1)).not.toThrow();
  });
});
