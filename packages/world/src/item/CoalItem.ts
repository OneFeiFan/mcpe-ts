// 1:1 移植自 src/world/item/CoalItem.h
import { Item } from './Item';
import { ItemInstance } from './ItemInstance';

export class CoalItem extends Item {
  static readonly STONE_COAL = 0;
  static readonly CHAR_COAL = 1;

  constructor(id: number) {
    super(id);
    this.setStackedByData(true);
    this.setMaxDamage(0);
  }

  /** C++ CoalItem::getDescriptionId(ItemInstance* instance) */
  override getDescriptionId(instance: ItemInstance): string;
  override getDescriptionId(): string;
  override getDescriptionId(instance?: ItemInstance): string {
    if (instance === undefined) {
      return super.getDescriptionId();
    }
    if (instance.getAuxValue() === CoalItem.CHAR_COAL) {
      return Item.ICON_DESCRIPTION_PREFIX + 'charcoal';
    }
    return Item.ICON_DESCRIPTION_PREFIX + 'coal';
  }
}
