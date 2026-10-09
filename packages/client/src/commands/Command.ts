/**
 * 1:1 移植自 src/commands/Command.hpp 与 Command.cpp（聊天与控制台）：斜杠命令的基类。
 * isPlayerOp：玩家名转小写后在 level.ops 里。C++ 的 ::tolower 只处理 ASCII，这里同样只转 A–Z。
 */
import type { Player } from '@mcpe/world';
import type { Minecraft } from '../Minecraft';

/** C++ std::transform(..., ::tolower)：只转 ASCII 大写字母 */
export function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

export abstract class Command {
  protected readonly m_name: string;

  protected constructor(name: string) {
    this.m_name = name;
  }

  getName(): string {
    return this.m_name;
  }

  isPlayerOp(mc: Minecraft, player: Player): boolean {
    return mc.level!.ops.has(asciiLower(player.name));
  }

  abstract execute(mc: Minecraft, player: Player, args: string[]): string;
  abstract help(mc: Minecraft): string;
}
