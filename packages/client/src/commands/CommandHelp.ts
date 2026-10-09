/**
 * 1:1 移植自 src/commands/CommandHelp.hpp/.cpp：/help 列出全部命令；/help <命令> 显示用法。
 * 原样保留：CommandManager::getCommand 的判断写反了（找到时返回 nullptr），所以 /help <存在的命令> 总是说“not found”。
 */
import type { Player } from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import { Command } from './Command';

export class CommandHelp extends Command {
  constructor() {
    super('help');
  }

  execute(mc: Minecraft, _player: Player, args: string[]): string {
    if (args.length === 0) {
      const cmds = mc.commandManager().getListAllCommands();
      let output = 'List of all commands:\n';
      for (const cmd of cmds) {
        output += ' - ' + cmd + '\n';
      }
      return output;
    }
    const cmd = mc.commandManager().getCommand(args[0]!);
    if (cmd !== null) {
      return cmd.help(mc);
    }
    return 'help: command ' + args[0] + ' not found';
  }

  help(_mc: Minecraft): string {
    return 'Usage: /help <command>';
  }
}
