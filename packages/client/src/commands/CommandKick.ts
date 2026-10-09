/**
 * 1:1 移植自 src/commands/CommandKick.hpp/.cpp：/kick <玩家>——只有管理员能用；把玩家移出世界并断开连接。
 * 断开连接（raknetInstance->getPeer()->CloseConnection）属于联机：DEFERRED(Network)。
 */
import type { Player } from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import { asciiLower, Command } from './Command';

export class CommandKick extends Command {
  constructor() {
    super('kick');
  }

  execute(mc: Minecraft, player: Player, args: string[]): string {
    if (!this.isPlayerOp(mc, player)) {
      return "You aren't enough priveleged to run this command";
    }
    if (args.length === 0) {
      return this.help(mc);
    }
    const nicknameLower = asciiLower(args[0]!);
    const target = mc.level!.players.find((p) => asciiLower(p.name) === nicknameLower);
    if (!target) {
      return "kick: can't find player with name " + args[0];
    }
    if (target === mc.player) {
      return "kick: you can't kick urself lol";
    }
    mc.level!.removePlayer(target);
    target.remove();
    // DEFERRED(Network): mc.raknetInstance->getPeer()->CloseConnection(target->owner, true);
    return 'kick: successfully kicked player ' + args[0];
  }

  help(_mc: Minecraft): string {
    return 'Usage: /kick <player>';
  }
}
