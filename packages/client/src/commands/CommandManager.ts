/**
 * 1:1 移植自 src/commands/CommandManager.hpp/.cpp：命令注册与分派（/help、/kick、/op、/ban；/gimmieitems 的注册被注释掉）。
 * execute：按空白切词（std::istringstream >>），第一个词是命令名，其余是参数。
 * 原样保留：getCommand 的判断写反了——找到时返回 nullptr；找不到时 C++ 解引用 end()（未定义行为），这里返回 null（ADAPTED(Safety)）。
 *   结果是 getCommand 总是 null。
 */
import type { Player } from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import type { Command } from './Command';
import { CommandBan } from './CommandBan';
import { CommandHelp } from './CommandHelp';
import { CommandKick } from './CommandKick';
import { CommandOp } from './CommandOp';

export class CommandManager {
  private m_commands: Command[] = [];

  constructor() {
    this.registerAllCommands();
  }

  private registerAllCommands(): void {
    this.m_commands.push(new CommandHelp());
    this.m_commands.push(new CommandKick());
    this.m_commands.push(new CommandOp());
    this.m_commands.push(new CommandBan());
    // m_commands.push_back(new CommandGimmieItems());（C++ 原注释）
  }

  getListAllCommands(): string[] {
    return this.m_commands.map((c) => c.getName());
  }

  execute(mc: Minecraft, player: Player, input: string): string {
    const words = input.split(/[ \t\n\v\f\r]+/).filter((w) => w.length > 0);
    const cmd = words[0] ?? '';
    const found = this.m_commands.find((c) => c.getName() === cmd);
    if (!found) {
      return 'Command /' + cmd + ' not found';
    }
    return found.execute(mc, player, words.slice(1));
  }

  getCommand(name: string): Command | null {
    const found = this.m_commands.find((c) => c.getName() === name);
    if (!found) {
      return null; // C++：return *it（it == end，未定义行为）
    }
    return null; // C++：找到时 return nullptr（判断写反了）
  }
}
