/**
 * TextEditScreen（告示牌编辑界面）—— 对应 packages/client/src/gui/screens/TextEditScreen.ts。
 * 钉住 C++ 的按键规则：
 * - 退格：当前行非空删最后一个字；为空则跳到上一行（0 再往上回到 3）；
 * - 回车：下一行，3 之后回到 0；
 * - 输入字符：加上之后长度 < 16 才接受（最多 15 个字）；
 * - 关闭（按钮或返回键）：setChanged、收起键盘、关闭界面。
 */
import { describe, expect, it, vi } from 'vitest';
import { TextEditScreen } from '@mcpe/client';
import { Keyboard } from '@mcpe/platform';
import type { SignTileEntity } from '@mcpe/world';

function make() {
  const sign = {
    messages: ['', '', '', ''],
    selectedLine: -1,
    setChanged: vi.fn(),
  } as unknown as SignTileEntity & { setChanged: ReturnType<typeof vi.fn> };
  const platform = { showKeyboard: vi.fn(), hideKeyboard: vi.fn() };
  const mc = { platform: () => platform, setScreen: vi.fn(), font: null, width: 960, height: 540 };
  const s = new TextEditScreen(sign);
  s.init(mc as never, 320, 180);
  const key = (k: number) => (s as unknown as { keyPressed(k: number): void }).keyPressed(k);
  const ch = (c: string) => (s as unknown as { charPressed(c: string): void }).charPressed(c);
  const line = () => (s as unknown as { line: number }).line;
  return { s, sign, platform, mc, key, ch, line };
}

describe('TextEditScreen', () => {
  it('打开时叫出键盘；关闭按钮放在右上角 19×19', () => {
    const { s, platform } = make();
    expect(platform.showKeyboard).toHaveBeenCalledTimes(1);
    const btn = (
      s as unknown as { btnClose: { x: number; y: number; width: number; height: number } }
    ).btnClose;
    expect([btn.x, btn.y, btn.width, btn.height]).toEqual([320 - 19, 0, 19, 19]);
  });

  it('输入字符：最多 15 个（加上后长度 < 16 才接受）', () => {
    const { sign, ch } = make();
    for (const c of 'abcdefghijklmnopq') ch(c);
    expect(sign.messages[0]).toBe('abcdefghijklmno');
  });

  it('回车换到下一行，3 之后回到 0', () => {
    const { key, line } = make();
    for (let i = 0; i < 4; i++) key(Keyboard.KEY_RETURN);
    expect(line()).toBe(0);
    key(Keyboard.KEY_RETURN);
    expect(line()).toBe(1);
  });

  it('退格：非空删一个字；为空跳到上一行，0 再往上是 3', () => {
    const { sign, key, ch, line } = make();
    ch('h');
    ch('i');
    key(Keyboard.KEY_BACKSPACE);
    expect(sign.messages[0]).toBe('h');
    key(Keyboard.KEY_BACKSPACE);
    expect(sign.messages[0]).toBe('');
    expect(line()).toBe(0);
    key(Keyboard.KEY_BACKSPACE);
    expect(line()).toBe(3);
  });

  it('关闭：setChanged、收起键盘、关闭界面', () => {
    const { s, sign, platform, mc } = make();
    expect(s.handleBackEvent(true)).toBe(true);
    expect(sign.setChanged).toHaveBeenCalledTimes(1);
    expect(platform.hideKeyboard).toHaveBeenCalledTimes(1);
    expect(mc.setScreen).toHaveBeenCalledWith(null);
  });
});
