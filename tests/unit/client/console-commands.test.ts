/**
 * 聊天与控制台（ConsoleScreen、CommandManager 与各命令）、首次启动的用户名界面（UsernameScreen）。
 * 钉住的 C++ 行为：
 * - 控制台：普通文字显示为 "<名字> 内容"；"/" 开头交给命令；空输入直接关闭；只收可打印 ASCII；退格删最后一个字；
 * - /help 列出 help、kick、op、ban（gimmieitems 的注册被注释掉）；/help <命令> 因为 getCommand 写反了，总说 not found；
 * - /op 等管理命令：不是管理员时拒绝；管理员 /op 别人把名字（小写）加进 ops；未知命令提示 not found；
 * - 用户名界面：文本框为空时 Done 不可用；填好后点 Done 写进选项并保存、关闭界面。
 */
import { describe, expect, it, vi } from 'vitest';
import { CommandManager, ConsoleScreen, GLES1, glSetContext, UsernameScreen } from '@mcpe/client';
import { OptionId } from '../../../packages/client/src/Options';
import { Keyboard } from '@mcpe/platform';

const makeMc = () => {
  const messages: string[] = [];
  const level = {
    ops: new Set<string>(),
    bannedPlayers: new Set<string>(),
    players: [] as unknown[],
  };
  const player = { name: 'Steve' };
  const mc = {
    level,
    player,
    messages,
    gui: { addMessage: (m: string) => messages.push(m) },
    setScreen: vi.fn(),
    font: {
      drawShadow: () => {},
      draw: () => {},
      width: (s: string) => s.length * 6,
      lineHeight: 10,
    },
    textures: { loadAndBindTexture: () => 1 },
    options: { set: vi.fn(), save: vi.fn(), getIntValue: () => 0, getBooleanValue: () => false },
    platform: () => ({ hideKeyboard: () => {}, showKeyboard: () => {} }),
    useTouchscreen: () => false,
    width: 960,
    height: 540,
    commandManager: () => cm,
  };
  const cm = new CommandManager();
  return mc;
};

function type(s: ConsoleScreen, text: string): void {
  const p = s as unknown as { charPressed(c: string): void };
  for (const ch of text) p.charPressed(ch);
}
const enter = (s: ConsoleScreen): void =>
  (s as unknown as { keyPressed(k: number): void }).keyPressed(Keyboard.KEY_RETURN);

describe('ConsoleScreen 与命令', () => {
  glSetContext(new GLES1(null));
  const open = (mc: ReturnType<typeof makeMc>): ConsoleScreen => {
    const s = new ConsoleScreen();
    s.init(mc as never, 320, 180);
    return s;
  };

  it('普通文字 → "<Steve> 内容"，然后关闭', () => {
    const mc = makeMc();
    const s = open(mc);
    type(s, 'hello world');
    enter(s);
    expect(mc.messages).toEqual(['<Steve> hello world']);
    expect(mc.setScreen).toHaveBeenCalledWith(null);
  });

  it('只收可打印 ASCII；退格删最后一个字；空输入直接关闭', () => {
    const mc = makeMc();
    const s = open(mc);
    type(s, 'ab\u00e9c');
    (s as unknown as { keyPressed(k: number): void }).keyPressed(Keyboard.KEY_BACKSPACE);
    enter(s);
    expect(mc.messages).toEqual(['<Steve> ab']);
    const s2 = open(mc);
    enter(s2);
    expect(mc.messages.length).toBe(1);
  });

  it('/help：列出 help、kick、op、ban；/help op 因为 getCommand 写反了，说 not found', () => {
    const mc = makeMc();
    const s = open(mc);
    type(s, '/help');
    enter(s);
    expect(mc.messages).toEqual(['List of all commands:', ' - help', ' - kick', ' - op', ' - ban']);
    const s2 = open(mc);
    type(s2, '/help op');
    enter(s2);
    expect(mc.messages[mc.messages.length - 1]).toBe('help: command op not found');
  });

  it('/op：不是管理员时拒绝；是管理员时把名字（小写）加进 ops；未知命令提示 not found', () => {
    const mc = makeMc();
    let s = open(mc);
    type(s, '/op Alex');
    enter(s);
    expect(mc.messages.pop()).toBe("You aren't enough priveleged to run this command");
    mc.level.ops.add('steve');
    s = open(mc);
    type(s, '/op Alex');
    enter(s);
    expect(mc.messages.pop()).toBe('op: successfully opped player Alex');
    expect(mc.level.ops.has('alex')).toBe(true);
    s = open(mc);
    type(s, '/fly');
    enter(s);
    expect(mc.messages.pop()).toBe('Command /fly not found');
  });
});

describe('UsernameScreen', () => {
  it('文本框为空时 Done 不可用；填好后点 Done 写进选项并保存、关闭界面', () => {
    glSetContext(new GLES1(null));
    const mc = makeMc();
    const s = new UsernameScreen();
    s.init(mc as never, 320, 180);
    const p = s as unknown as {
      _btnDone: { active: boolean };
      tUsername: { text: string };
      keyPressed(k: number): void;
      buttonClicked(b: unknown): void;
    };
    expect(p._btnDone.active).toBe(false);
    p.tUsername.text = 'Alex';
    p.keyPressed(Keyboard.KEY_A);
    expect(p._btnDone.active).toBe(true);
    p.buttonClicked(p._btnDone);
    expect(mc.options.set).toHaveBeenCalledWith(OptionId.OPTIONS_USERNAME, 'Alex');
    expect(mc.options.save).toHaveBeenCalled();
    expect(mc.setScreen).toHaveBeenCalledWith(null);
  });
});
