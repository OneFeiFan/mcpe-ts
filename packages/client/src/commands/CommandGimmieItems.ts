/**
 * 1:1 移植自 src/commands/CommandGimmieItems.hpp/.cpp：/gimmieitems——允许作弊时给一套调试物品。
 * 原样保留：CommandManager::registerAllCommands 里注册它的那一行被注释掉了，这一版里用不了。
 */
import { DyePowderItem, Item, ItemInstance, Tile, type Player } from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import { Command } from './Command';

export class CommandGimmieItems extends Command {
  constructor() {
    super('gimmieitems');
  }

  execute(mc: Minecraft, player: Player, _args: string[]): string {
    if (mc.level !== null) {
      if (mc.level.getLevelData().getAllowCheats()) {
        const inv = player.inventory;
        inv.add(new ItemInstance(Item.ironIngot, 64));
        inv.add(new ItemInstance(Item.ironIngot, 34));
        inv.add(new ItemInstance(Tile.stonecutterBench));
        inv.add(new ItemInstance(Tile.workBench));
        inv.add(new ItemInstance(Tile.furnace));
        inv.add(new ItemInstance(Tile.wood, 54));
        inv.add(new ItemInstance(Item.stick, 14));
        inv.add(new ItemInstance(Item.coal, 31));
        inv.add(new ItemInstance(Tile.sand, 6));
        inv.add(new ItemInstance(Item.dye_powder, 23, DyePowderItem.PURPLE));
        return 'Grant debug items. Have fun!';
      } else {
        return 'Cheats are not allowed!';
      }
    }
    return 'World not loaded';
  }

  help(_mc: Minecraft): string {
    return 'Usage: /gimmieitems';
  }
}
