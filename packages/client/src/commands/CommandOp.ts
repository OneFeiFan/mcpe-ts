// 1:1 移植自 src/commands/CommandOp.hpp/.cpp：/op <玩家>——只有管理员能用；把名字（小写）加进 level.ops
import type { Player } from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import { asciiLower, Command } from './Command';

export class CommandOp extends Command {
  constructor() {
    super('op');
  }

  execute(mc: Minecraft, player: Player, args: string[]): string {
    if (!this.isPlayerOp(mc, player)) {
      return "You aren't enough priveleged to run this command";
    }
    if (args.length === 0) {
      return this.help(mc);
    }
    const nicknameLower = asciiLower(args[0]!);
    if (mc.level!.ops.has(nicknameLower)) {
      return 'op: player ' + args[0] + ' already opped';
    }
    mc.level!.ops.add(nicknameLower);
    return 'op: successfully opped player ' + args[0];
  }

  help(_mc: Minecraft): string {
    return 'Usage: /op <player>';
  }
}
