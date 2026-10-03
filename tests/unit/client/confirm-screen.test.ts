import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GLES1, glSetContext } from '@mcpe/client';
import { Mouse, MouseAction } from '@mcpe/platform';
import type { Minecraft } from '../../../packages/client/src/Minecraft';
import type { Screen } from '../../../packages/client/src/gui/Screen';
import { ConfirmScreen } from '../../../packages/client/src/gui/screens/ConfirmScreen';

// ConfirmScreen（B8b-1）：一个"确定 / 取消"对话框。当前唯一的用户是选世界界面的
// Touch::DeleteWorldScreen（B8d 才移植）——它覆盖 postResult 来真正删世界。
//
// 点按钮这一路是真的走 Screen::mouseClicked → mouseReleased → buttonClicked 那条链
// （靠 Mouse.feed 注入事件 + Screen.updateEvents），不是直接调 postResult。

const MC_W = 640;
const MC_H = 480;

const fakeMinecraft = {
  width: MC_W,
  height: MC_H,
  font: { width: () => 0, height: () => 10, drawShadow: () => {} },
  textures: { loadAndBindTexture: () => 7 },
  isLevelGenerated: () => false,
  useTouchscreen: () => false,
  setScreen: () => {},
} as unknown as Minecraft;

type Btn = { id: number; msg: string; x: number; y: number; width: number; height: number };

/** Screen.buttons 是 protected，测试里掀开看一眼 */
function buttonsOf(s: ConfirmScreen): [Btn, Btn] {
  const b = (s as unknown as { buttons: Btn[] }).buttons;
  return [b[0]!, b[1]!];
}

/** 只当 parent 用：把 confirmResult 收到的调用记下来 */
function makeParent(): { parent: Screen; results: [boolean, number][] } {
  const results: [boolean, number][] = [];
  const parent = {
    confirmResult: (isOk: boolean, id: number) => results.push([isOk, id]),
  } as unknown as Screen;
  return { parent, results };
}

/** 造一个已经 init 好的对话框（按钮尺寸/位置都算好了） */
function makeScreen(
  id = 5,
  texts?: [string, string],
): { screen: ConfirmScreen; results: [boolean, number][] } {
  const { parent, results } = makeParent();
  const screen =
    texts === undefined
      ? new ConfirmScreen(parent, 'Are you sure?', 'It will be lost', id)
      : new ConfirmScreen(parent, 'Are you sure?', 'It will be lost', id, texts[0], texts[1]);
  screen.init(fakeMinecraft, MC_W, MC_H);
  return { screen, results };
}

/**
 * 走一遍真实点击：按下 + 抬起。
 * Screen.mouseEvent 会把坐标按 mc 尺寸缩放、再把 y 减 1；这里画布和界面一样大，所以只差那个 −1。
 */
function clickAt(screen: ConfirmScreen, x: number, y: number): void {
  Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_DOWN, x, y + 1);
  screen.updateEvents();
  Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_UP, x, y + 1);
  screen.updateEvents();
}

beforeAll(() => {
  glSetContext(new GLES1(null)); // 无头模式：只维护状态与矩阵
});

// Mouse 的事件队列是全局的，每个用例开工前清空
beforeEach(() => {
  Mouse.reset();
});

describe('client/ConfirmScreen', () => {
  it('两个按钮的文字默认是 Ok / Cancel，传了就用传的', () => {
    const [aYes, aNo] = buttonsOf(makeScreen().screen);
    expect([aYes.msg, aNo.msg]).toEqual(['Ok', 'Cancel']);
    expect([aYes.id, aNo.id]).toEqual([0, 1]);

    const [bYes, bNo] = buttonsOf(makeScreen(5, ['Delete', 'Keep']).screen);
    expect([bYes.msg, bNo.msg]).toEqual(['Delete', 'Keep']);
  });

  it('两个按钮都是 120×24，左右对称地分在中间线两边', () => {
    const [yes, no] = buttonsOf(makeScreen().screen);
    expect(yes.width).toBe(120);
    expect(yes.height).toBe(24);
    expect(yes.x).toBe(MC_W / 2 - 120 - 4);
    expect(no.x).toBe(MC_W / 2 + 4);
    expect(yes.y).toBe(MC_H / 6 + 72);
    expect(no.y).toBe(MC_H / 6 + 72);
  });

  it('点"确定"报 true，点"取消"报 false，两边都带上自己的 id', () => {
    const a = makeScreen(42);
    const [aYes] = buttonsOf(a.screen);
    clickAt(a.screen, aYes.x + 5, aYes.y + 5);
    expect(a.results).toEqual([[true, 42]]);

    const b = makeScreen(43);
    const [, bNo] = buttonsOf(b.screen);
    clickAt(b.screen, bNo.x + 5, bNo.y + 5);
    expect(b.results).toEqual([[false, 43]]);
  });

  it('点在按钮外面什么都不报', () => {
    const { screen, results } = makeScreen();
    clickAt(screen, 5, 5);
    expect(results).toEqual([]);
  });

  it('返回键松开时按"取消"处理，按下时不动', () => {
    const { screen, results } = makeScreen(7);
    expect(screen.handleBackEvent(true)).toBe(true);
    expect(results, '按下不算').toEqual([]);

    expect(screen.handleBackEvent(false)).toBe(true);
    expect(results).toEqual([[false, 7]]);
  });

  it('奇数尺寸时 width/2、height/6 向零截断', () => {
    const { parent } = makeParent();
    const screen = new ConfirmScreen(parent, 'a', 'b', 1);
    screen.init(fakeMinecraft, 641, 481);
    const [yes, no] = buttonsOf(screen);
    expect(yes.x).toBe(Math.trunc(641 / 2) - 124); // 320 - 124 = 196
    expect(no.x).toBe(Math.trunc(641 / 2) + 4);
    expect(yes.y).toBe(Math.trunc(481 / 6) + 72); // 80 + 72 = 152
  });

  it('render 跑得通（背景 + 两行标题 + 两个按钮）', () => {
    const { screen } = makeScreen();
    expect(() => screen.render(0, 0, 1)).not.toThrow();
  });
});
