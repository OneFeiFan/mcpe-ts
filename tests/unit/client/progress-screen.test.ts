import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GLES1, glSetContext } from '@mcpe/client';
import { Keyboard } from '@mcpe/platform';
import type { Minecraft } from '../../../packages/client/src/Minecraft';
import { ProgressScreen } from '../../../packages/client/src/gui/screens/ProgressScreen';

// ProgressScreen（B8d-1）：「正在生成世界」那张加载屏。
//
// 最要紧的一条是 **render 里会自己 setScreen(null)** —— 世界一生成好就关屏。
// 还有一条是 keyPressed 是**故意留空的重写**（盖掉基类，免得按 ESC 关掉加载屏）。

function makeScreen(opts: { generated?: boolean; statusId?: number; pct?: number } = {}): {
  screen: ProgressScreen;
  setScreen: ReturnType<typeof vi.fn>;
  drawn: string[];
} {
  const drawn: string[] = [];
  const setScreen = vi.fn();
  const mc = {
    width: 854,
    height: 480,
    isLevelGenerated: () => opts.generated ?? false,
    setScreen,
    progressStagePercentage: opts.pct ?? -1,
    getProgressMessage: () => 'Building terrain',
    getProgressStatusId: () => opts.statusId ?? 1,
    font: {
      width: (s: string) => s.length * 6,
      height: () => 10,
      drawShadow: (s: string) => drawn.push(s),
    },
    textures: { loadAndBindTexture: () => 7 },
    useTouchscreen: () => false,
  } as unknown as Minecraft;
  const screen = new ProgressScreen();
  screen.init(mc, 854, 480);
  return { screen, setScreen, drawn };
}

beforeAll(() => {
  glSetContext(new GLES1(null)); // 无头模式：只维护状态与矩阵
});

describe('client/ProgressScreen', () => {
  it('世界已经生成好时，render 第一件事就是把自己关掉', () => {
    const { screen, setScreen, drawn } = makeScreen({ generated: true });
    screen.render(0, 0, 1);
    expect(setScreen).toHaveBeenCalledWith(null);
    expect(drawn, '一个字都不画').toEqual([]);
  });

  it('没生成好就画背景 + 两行字', () => {
    const { screen, setScreen, drawn } = makeScreen({ generated: false });
    expect(() => screen.render(0, 0, 1)).not.toThrow();
    expect(setScreen).not.toHaveBeenCalled();
    expect(drawn).toEqual(['Generating world', 'Building terrain']);
  });

  it('进度百分比 >= 0 时才画进度条', () => {
    const a = makeScreen({ pct: -1 });
    const b = makeScreen({ pct: 50 });
    // 进度条那一段是纯 GL 画矩形，画没画看不出来 —— 这里只确认两条分支都不炸，
    // 真正的样子靠浏览器场景看截图。
    expect(() => a.screen.render(0, 0, 1)).not.toThrow();
    expect(() => b.screen.render(0, 0, 1)).not.toThrow();
  });

  it('状态 id 为 0（正在找服务器）时多画一个风车字符，别的 id 不画', () => {
    const locating = makeScreen({ statusId: 0 });
    locating.screen.render(0, 0, 1);
    expect(locating.drawn.length, '标题 + 状态 + 风车').toBe(3);
    expect(['-', '\\', '|', '/']).toContain(locating.drawn[2]);

    const normal = makeScreen({ statusId: 1 });
    normal.screen.render(0, 0, 1);
    expect(normal.drawn.length).toBe(2);
  });

  it('这不是游戏内界面', () => {
    expect(makeScreen().screen.isInGameScreen()).toBe(false);
  });

  /** C++ 里是 `virtual void keyPressed(int eventKey) {}` —— 空的重写，就是不让 ESC 生效 */
  it('按 ESC 不会关掉加载屏（基类会关，这里特意盖成空的）', () => {
    const { screen, setScreen } = makeScreen();
    const keyPressed = (screen as unknown as { keyPressed: (k: number) => void }).keyPressed;
    keyPressed.call(screen, Keyboard.KEY_ESCAPE);
    expect(setScreen).not.toHaveBeenCalled();
  });

  it('tick 累计拍数，不炸', () => {
    const { screen, setScreen } = makeScreen({ statusId: 1 });
    for (let i = 0; i < 250; i++) screen.tick();
    screen.tick();
    // 251 拍已经过了 10 秒那条线（10 × 20 = 200），但那条分支是 DEFERRED(Gui)，
    // 而且 statusId != 0 也不该进 —— 两种情况下都不该动 setScreen
    expect(setScreen).not.toHaveBeenCalled();
  });
});
