/**
 * 选项界面：OptionsScreen、OptionsGroup、OptionsItem、Slider、KeyOption、TextOption、CreditsScreen。
 * 钉住的 C++ 行为：
 * - 5 个分类，各自的选项条目数照 generateOptionScreens（通用 2、游戏 11、控制 5 + 11 个按键、画面 11、调整 11）；
 * - addOptionItem 按选项类型建控件：布尔 → 开关、浮点 → 连续滑条、整数 → 分档滑条、字符串 → 文本框、"options.key…" → 按键按钮；
 * - 分档滑条松开时吸附到最近一档并写回选项；连续滑条按百分比写回；
 * - 按键按钮：点一下显示 "..."，再按一个键就绑定，Esc 取消；
 * - 关闭按钮：保存选项并关闭界面；
 * - 分类按钮切换当前分组。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  GLES1, glSetContext, KeyOption, OptionButton, Options, OptionsGroup, OptionsScreen, SliderFloat, SliderInt, TextOption,
} from '@mcpe/client';
import { OptionId } from '../../../packages/client/src/Options';
import { Keyboard, MouseAction } from '@mcpe/platform';
import { I18n } from '@mcpe/locale';

let options: Options;
const saved = vi.fn();
const mc = {
  options: null as unknown as Options,
  font: { draw: () => {}, width: (s: string) => s.length * 6, lineHeight: 10 },
  textures: { loadAndBindTexture: () => 1, getTemporaryTextureData: () => ({ w: 256, h: 256 }) },
  width: 960,
  height: 540,
  screen: null as unknown,
  setScreen: vi.fn(),
  useTouchscreen: () => false,
  platform: () => ({ showKeyboard: () => {}, hideKeyboard: () => {} }),
  isLevelGenerated: () => true,
  gui: { getColoredWidth: () => 10, drawColoredString: () => {} },
};

beforeAll(() => {
  glSetContext(new GLES1(null));
  vi.spyOn(I18n, 'get').mockImplementation(((k: string) => k) as never); // 标签直接用字符串 id
  options = new Options({ optionUpdated: () => {} } as never); // set() 会调 minecraft.optionUpdated，不能传 null
  vi.spyOn(options, 'save').mockImplementation(saved);
  mc.options = options;
});

function childrenOf(g: OptionsGroup): { children: { children: unknown[] }[] } {
  return g as unknown as { children: { children: unknown[] }[] };
}

describe('OptionsScreen', () => {
  function open(): OptionsScreen {
    const s = new OptionsScreen();
    mc.screen = s;
    s.init(mc as never, 320, 180);
    return s;
  }

  it('5 个分类，条目数与 C++ 的 generateOptionScreens 一致', () => {
    const s = open();
    const panes = (s as unknown as { optionPanes: OptionsGroup[] }).optionPanes;
    expect(panes.map((p) => childrenOf(p).children.length)).toEqual([2, 11, 5 + 11, 11, 11]);
  });

  it('分类按钮切换当前分组；默认选中第一个', () => {
    const s = open();
    const priv = s as unknown as { optionPanes: OptionsGroup[]; currentOptionsGroup: OptionsGroup; categoryButtons: { selected: boolean }[] };
    expect(priv.currentOptionsGroup).toBe(priv.optionPanes[0]);
    s.selectCategory(3);
    expect(priv.currentOptionsGroup).toBe(priv.optionPanes[3]);
    expect(priv.categoryButtons.map((b) => b.selected)).toEqual([false, false, false, true, false]);
  });

  it('关闭按钮：保存选项并关闭界面', () => {
    const s = open();
    saved.mockClear();
    mc.setScreen.mockClear();
    (s as unknown as { buttonClicked(b: unknown): void }).buttonClicked((s as unknown as { btnClose: unknown }).btnClose);
    expect(saved).toHaveBeenCalledTimes(1);
    expect(mc.setScreen).toHaveBeenCalledWith(null);
  });
});

describe('OptionsGroup.addOptionItem：按选项类型建控件', () => {
  const kindOf = (id: OptionId): unknown => {
    const g = new OptionsGroup('x');
    g.addOptionItem(id, mc as never);
    return childrenOf(g).children[0]!.children[0];
  };
  it('布尔 → 开关；浮点 → 连续滑条；整数 → 分档滑条；字符串 → 文本框；按键 → 按键按钮', () => {
    expect(kindOf(OptionId.OPTIONS_VIEW_BOBBING)).toBeInstanceOf(OptionButton);
    expect(kindOf(OptionId.OPTIONS_SENSITIVITY)).toBeInstanceOf(SliderFloat);
    expect(kindOf(OptionId.OPTIONS_VIEW_DISTANCE)).toBeInstanceOf(SliderInt);
    expect(kindOf(OptionId.OPTIONS_USERNAME)).toBeInstanceOf(TextOption);
    expect(kindOf(OptionId.OPTIONS_KEY_FORWARD)).toBeInstanceOf(KeyOption);
  });
});

describe('Slider', () => {
  it('分档滑条：松开时吸附到最近一档并写回（视距 0..4：远、普通、短、极短、Debug）', () => {
    const sl = new SliderInt(mc as never, OptionId.OPTIONS_VIEW_DISTANCE);
    sl.x = 0;
    sl.y = 0;
    sl.width = 100;
    sl.height = 20;
    (sl as unknown as { m_percentage: number }).m_percentage = 0.6; // 0.6 × 4 + 0.5 = 2.9 → 第 2 档
    sl.mouseReleased(mc as never, 50, 10, MouseAction.ACTION_LEFT);
    expect(options.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE)).toBe(2);
    expect((sl as unknown as { m_percentage: number }).m_percentage).toBe(0.5); // 吸附后 2 / 4
  });

  it('松开时鼠标不在滑条上：不写回', () => {
    const before = options.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE);
    const sl = new SliderInt(mc as never, OptionId.OPTIONS_VIEW_DISTANCE);
    sl.width = 100;
    (sl as unknown as { m_percentage: number }).m_percentage = 0;
    sl.mouseReleased(mc as never, 500, 500, MouseAction.ACTION_LEFT);
    expect(options.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE)).toBe(before);
  });
});

describe('KeyOption', () => {
  it('点一下显示 "..."，按 W 绑定；再点一下按 Esc 取消', () => {
    const k = new KeyOption(mc as never, OptionId.OPTIONS_KEY_JUMP);
    k.x = 0;
    k.y = 0;
    k.mouseClicked(mc as never, 5, 5, MouseAction.ACTION_LEFT);
    expect(k.msg).toBe('...');
    k.keyPressed(mc as never, 87);
    expect(options.getIntValue(OptionId.OPTIONS_KEY_JUMP)).toBe(87);
    expect(k.selected).toBe(false);
    k.mouseClicked(mc as never, 5, 5, MouseAction.ACTION_LEFT);
    k.keyPressed(mc as never, Keyboard.KEY_ESCAPE);
    expect(options.getIntValue(OptionId.OPTIONS_KEY_JUMP)).toBe(87);
    expect(k.msg).toBe(Keyboard.getKeyName(87));
  });
});
