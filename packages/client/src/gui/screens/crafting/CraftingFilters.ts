// 1:1 移植自 src/client/gui/screens/crafting/CraftingFilters.h/.cpp：哪些配方产物属于切石机（石质、沙质方块，除青金石块、熔炉、切石机本身、木台阶）
import { Material, StoneSlabTile, Tile, type ItemInstance } from '@mcpe/world';

export const CraftingFilters = {
  isStonecutterItem(ins: ItemInstance): boolean {
    const item = ins.getItem()!;
    if (item.id < 0 || item.id >= 256) return false;
    const tile = Tile.tiles[item.id];
    if (!tile) return false;
    if (tile === Tile.lapisBlock || tile === Tile.furnace || tile === Tile.stonecutterBench)
      return false;
    if (tile === Tile.stoneSlabHalf && ins.getAuxValue() === StoneSlabTile.WOOD_SLAB) return false;
    return tile.material === Material.stone || tile.material === Material.sand;
  },
};
