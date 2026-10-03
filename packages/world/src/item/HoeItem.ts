import { Item, Tier } from './Item';
import { ItemInstance } from './ItemInstance';
import { Level } from '../level/Level';
import { Tile } from '../level/tile/Tile';
import { ItemEntity } from '../entity/item/ItemEntity';
import type { Player } from '..';

export class HoeItem extends Item {
  protected tier: Tier;

  /** C++ HoeItem::HoeItem(int id, Tier tier) — note: Tier passed BY VALUE */
  constructor(id: number, tier: Tier) {
    super(id);
    this.tier = tier;
    this.maxStackSize = 1;
    this.setMaxDamage(tier.getUses());
  }

  /** C++ HoeItem::useOn(ItemInstance*, Player*, Level*, int, int, int, int, float, float, float) */
  override useOnByPlayer(
    itemInstance: ItemInstance,
    _player: Player,
    level: Level,
    x: number,
    y: number,
    z: number,
    face: number,
    _clickX: number,
    _clickY: number,
    _clickZ: number,
  ): boolean {
    // C++ 里 player.mayBuild 检查被注释掉了，不要加

    const targetType = level.getTile(x, y, z);
    const above = level.getTile(x, y + 1, z);

    // 复刻 C++ 的 && / || 优先级 bug：
    //   face != 0 && above == 0 && targetType == grass || targetType == dirt
    // 等价于：
    //   (face != 0 && above == 0 && targetType == grass) || (targetType == dirt)
    // 只要 targetType 是 dirt，条件就为真，不检查 face 和 above。
    // 第一档要求逐位一致，必须保留。
    if (
      (face !== 0 && above === 0 && targetType === Tile.grass.id) ||
      targetType === Tile.dirt.id
    ) {
      const tile = Tile.farmland;

      level.playSound(
        x + 0.5,
        y + 0.5,
        z + 0.5,
        tile.soundType!.getStepSound(),
        (tile.soundType!.getVolume() + 1) / 2,
        tile.soundType!.getPitch() * 0.8,
      );

      // hurt 在 isClientSide 检查之前，客户端也会扣耐久
      itemInstance.hurt(1);

      if (level.isClientSide) return true;

      level.setTile(x, y, z, tile.id);

      if (targetType === Tile.grass.id && level.random.nextInt(8) === 0) {
        const s = 0.7;
        const xo = level.random.nextFloat() * s + (1 - s) * 0.5;
        // 注意：C++ 里 yo 是 * 2.5f，不是 * 0.5f。疑似 bug，按原样保留。
        const yo = level.random.nextFloat() * s + (1 - s) * 2.5;
        const zo = level.random.nextFloat() * s + (1 - s) * 0.5;

        const item = new ItemEntity(
          level,
          x + xo,
          y + yo,
          z + zo,
          new ItemInstance(Item.seeds_wheat),
        );
        item.throwTime = 10;
        level.addEntity(item);
      }

      return true;
    }

    return false;
  }

  /** C++ HoeItem::isHandEquipped() */
  override isHandEquipped(): boolean {
    return true;
  }
}
