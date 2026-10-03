import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GLES1, glSetContext } from '@mcpe/client';
import { Keyboard, MouseAction } from '@mcpe/platform';
import type { Minecraft } from '../../../packages/client/src/Minecraft';
import { Font } from '../../../packages/client/src/gui/Font';
import { TextBox } from '../../../packages/client/src/gui/components/TextBox';

// TextBox（B8b-2）：新建世界界面的"世界名""种子"两个输入框（B8e 才移植）。
//
// 【这一层测不到的东西】`platform()->showKeyboard()` 在网页版上会去 focus 一个隐藏 <input>
// （apps/web/src/AppPlatform_web.ts，ADAPTED(Web)）。单测跑在 node 环境、没有 document，
// 那段走不进来 —— 这里只断言"确实调了 showKeyboard"。隐藏 input 本身等 B8e 有屏可看时在浏览器里验。

function makePlatform(): {
  platform: { showKeyboard: () => void; hideKeyboard: () => void };
  shown: () => number;
  hidden: () => number;
} {
  const show = vi.fn();
  const hide = vi.fn();
  return {
    platform: { showKeyboard: show, hideKeyboard: hide },
    shown: () => show.mock.calls.length,
    hidden: () => hide.mock.calls.length,
  };
}

function makeMinecraft(platform: unknown): Minecraft {
  return {
    height: 480,
    font: { width: () => 0, height: () => 10, drawShadow: () => {} },
    platform: () => platform,
  } as unknown as Minecraft;
}

beforeAll(() => {
  glSetContext(new GLES1(null)); // 无头模式：只维护状态与矩阵
});

describe('client/TextBox', () => {
  it('默认尺寸是 24 × (DefaultLineHeight + 4)', () => {
    const t = new TextBox(0, 'World name');
    expect(t.width).toBe(24);
    expect(t.height).toBe(Font.DefaultLineHeight + 4);
    expect(t.hint).toBe('World name');
    expect(t.text).toBe('');
    expect(t.focused).toBe(false);
  });

  describe('焦点', () => {
    it('第一次聚焦才叫键盘，并且把光标重置', () => {
      const { platform, shown } = makePlatform();
      const mc = makeMinecraft(platform);
      const t = new TextBox(0, 'hint');
      t.blinkTicks = 9;
      t.blink = true;

      t.setFocus(mc);
      expect(t.focused).toBe(true);
      expect(t.blinkTicks).toBe(0);
      expect(t.blink).toBe(false);
      expect(shown()).toBe(1);

      t.setFocus(mc); // 已经聚焦了，什么都不做
      expect(shown()).toBe(1);
    });

    it('失焦时收起键盘并返回 true；本来就没焦点则返回 false、也不叫收键盘', () => {
      const { platform, hidden } = makePlatform();
      const mc = makeMinecraft(platform);
      const t = new TextBox(0, 'hint');

      expect(t.loseFocus(mc)).toBe(false);
      expect(hidden()).toBe(0);

      t.setFocus(mc);
      expect(t.loseFocus(mc)).toBe(true);
      expect(t.focused).toBe(false);
      expect(hidden()).toBe(1);
    });

    it('点框里聚焦、点框外失焦，且只认左键', () => {
      const { platform, shown, hidden } = makePlatform();
      const mc = makeMinecraft(platform);
      const t = new TextBox(0, 'hint', 10, 10, 100, 20);

      t.mouseClicked(mc, 50, 15, MouseAction.ACTION_LEFT);
      expect(t.focused).toBe(true);
      expect(shown()).toBe(1);

      t.mouseClicked(mc, 500, 500, MouseAction.ACTION_LEFT);
      expect(t.focused).toBe(false);
      expect(hidden()).toBe(1);

      t.mouseClicked(mc, 50, 15, MouseAction.ACTION_RIGHT);
      expect(t.focused, '右键不管').toBe(false);
      expect(shown()).toBe(1);
    });
  });

  describe('输入', () => {
    it('只收 ASCII 32–126', () => {
      const { platform } = makePlatform();
      const mc = makeMinecraft(platform);
      const t = new TextBox(0, 'hint');
      t.setFocus(mc);

      t.charPressed(mc, 'a');
      t.charPressed(mc, ' ');
      t.charPressed(mc, '~'); // 126，上界
      expect(t.text).toBe('a ~');
    });

    it('127 与控制字符被挡掉', () => {
      const { platform } = makePlatform();
      const mc = makeMinecraft(platform);
      const t = new TextBox(0, 'hint');
      t.setFocus(mc);

      t.charPressed(mc, '\u007f'); // 127，上界外
      t.charPressed(mc, '\u0001'); // 控制字符
      t.charPressed(mc, '\u0000');
      expect(t.text).toBe('');
    });

    /**
     * 【全角字符会被截成一个随机的 ASCII】C++ 的形参是 `char`，超过一个字节的码位在 gcc 上
     * 只保留**低 8 位**。所以：
     *   'ÿ'(255) → 0xFF → 当成有符号 char 是 −1 → 被 c >= 32 挡掉；
     *   '中'(20013 = 0x4E2D) → 低 8 位 0x2D = 45 = '-' → **是合法可打印字符，会被收下**。
     * 看着像 bug，但 C++ 就这么干。`(x << 24) >> 24` 正是 (char) 强转：先丢掉高位、再按有符号解释。
     */
    it('超过一个字节的码位按低 8 位算：ÿ 被挡，中 变成减号', () => {
      const { platform } = makePlatform();
      const mc = makeMinecraft(platform);
      const t = new TextBox(0, 'hint');
      t.setFocus(mc);

      t.charPressed(mc, 'ÿ'); // 255 → −1 → 挡掉
      expect(t.text).toBe('');

      t.charPressed(mc, '中'); // 20013 → 低 8 位 45 = '-' → 收下
      expect(t.text).toBe('-');
    });

    it('没聚焦时不收', () => {
      const { platform } = makePlatform();
      const mc = makeMinecraft(platform);
      const t = new TextBox(0, 'hint');
      t.charPressed(mc, 'a');
      expect(t.text).toBe('');
    });

    it('最多 256 个字符', () => {
      const { platform } = makePlatform();
      const mc = makeMinecraft(platform);
      const t = new TextBox(0, 'hint');
      t.setFocus(mc);
      t.text = 'a'.repeat(256);
      t.charPressed(mc, 'b');
      expect(t.text.length).toBe(256);
    });
  });

  describe('退格', () => {
    it('删掉最后一个字符', () => {
      const { platform } = makePlatform();
      const mc = makeMinecraft(platform);
      const t = new TextBox(0, 'hint');
      t.setFocus(mc);
      t.text = 'abc';

      t.keyPressed(mc, Keyboard.KEY_BACKSPACE);
      expect(t.text).toBe('ab');
    });

    it('空的时候按退格不出事，别的键不删，没聚焦也不删', () => {
      const { platform } = makePlatform();
      const mc = makeMinecraft(platform);
      const t = new TextBox(0, 'hint');

      t.keyPressed(mc, Keyboard.KEY_BACKSPACE); // 空 + 没聚焦
      expect(t.text).toBe('');

      t.setFocus(mc);
      t.keyPressed(mc, Keyboard.KEY_BACKSPACE); // 空
      expect(t.text).toBe('');

      t.text = 'ab';
      t.keyPressed(mc, Keyboard.KEY_RETURN);
      expect(t.text).toBe('ab');

      t.loseFocus(mc);
      t.keyPressed(mc, Keyboard.KEY_BACKSPACE);
      expect(t.text).toBe('ab');
    });
  });

  it('光标每 5 拍闪一次', () => {
    const { platform } = makePlatform();
    const mc = makeMinecraft(platform);
    const t = new TextBox(0, 'hint');

    for (let i = 0; i < 4; i++) t.tick(mc);
    expect(t.blink, '第 4 拍还没到').toBe(false);
    t.tick(mc);
    expect(t.blink).toBe(true);
    expect(t.blinkTicks, '翻完清零').toBe(0);
    for (let i = 0; i < 5; i++) t.tick(mc);
    expect(t.blink).toBe(false);
  });

  it('render 跑得通，而且那个临时塞进去的光标不会被留下', () => {
    const { platform } = makePlatform();
    const mc = makeMinecraft(platform);
    const t = new TextBox(0, 'World name', 10, 20, 200, 14);

    expect(() => t.render(mc, 0, 0)).not.toThrow();

    t.setFocus(mc);
    t.text = 'abc';
    t.blink = true; // 让光标那一支跑起来（render 里 text += '_' 画完再 slice 回来）
    expect(() => t.render(mc, 0, 0)).not.toThrow();
    expect(t.text, '画完要还原').toBe('abc');
  });
});
