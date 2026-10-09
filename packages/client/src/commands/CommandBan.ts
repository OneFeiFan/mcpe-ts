/**
 * 1:1 移植自 src/commands/CommandBan.hpp/.cpp：/ban <玩家>——只有管理员能用；在线的踢掉，名字加进 level.bannedPlayers。
 * 原样保留：已封禁时的提示 `args[0] + "already banned!"` 少一个空格。
 * ADAPTED(Safety)：C++ 先 `*it == mc.player` 再判断 `it != end()`——找不到玩家时解引用 end()（未定义行为）。这里找不到时跳过这一句。
 * 断开连接属于联机：DEFERRED(Network)。
 */
import type { Player } from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import { asciiLower, Command } from './Command';

export class CommandBan extends Command {
  constructor() {
    super('ban');
  }

  execute(mc: Minecraft, player: Player, args: string[]): string {
    if (!this.isPlayerOp(mc, player)) {
      return "You aren't enough priveleged to run this command";
    }
    if (args.length === 0) {
      return this.help(mc);
    }
    const nicknameLower = asciiLower(args[0]!);
    const level = mc.level!;
    const target = level.players.find((p) => asciiLower(p.name) === nicknameLower);
    if (target && target === mc.player) {
      return "ban: you can't ban urself lol";
    }
    if (target) {
      level.removePlayer(target);
      target.remove();
      // DEFERRED(Network): mc.raknetInstance->getPeer()->CloseConnection(target->owner, true);
    } else {
      for (const banned of level.bannedPlayers) {
        if (nicknameLower === banned) {
          return args[0] + 'already banned!';
        }
      }
    }
    level.bannedPlayers.add(nicknameLower);
    return 'ban: successfully banned player ' + args[0];
  }

  help(_mc: Minecraft): string {
    return 'Usage: /ban <player>';
  }
}
