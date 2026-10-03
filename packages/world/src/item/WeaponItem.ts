import { Item, Tier } from './Item';
import { ItemInstance } from './ItemInstance';
import { Entity } from '../entity/Entity';
import { Level } from '../level/Level';
import { Tile } from '../level/tile/Tile';
import type { Player } from '..';
import type { Mob } from '../entity/Mob';

export class WeaponItem extends Item {
  private readonly damage: number;
  private readonly tier: Tier;

  /** C++ WeaponItem::WeaponItem(int id, const Item::Tier& tier) */
  constructor(id: number, tier: Tier) {
    super(id);
    this.tier = tier;
    this.maxStackSize = 1;
    this.setMaxDamage(tier.getUses());
    // 基准是 4，不是 3/2/1
    this.damage = 4 + tier.getAttackDamageBonus();
  }

  /** C++ WeaponItem::getDestroySpeed(ItemInstance*, Tile*) */
  override getDestroySpeed(_itemInstance: ItemInstance, tile: Tile | null): number {
    if (tile!.id === Tile.web.id) {
      // 蛛网：剑可以快速砍开
      return 15;
    }
    // 注意：不回退父类，硬编码 1.5
    return 1.5;
  }

  /** C++ WeaponItem::hurtEnemy(ItemInstance*, Mob*) */
  override hurtEnemy(itemInstance: ItemInstance, _mob: Mob): void {
    itemInstance.hurt(1);
  }

  /** C++ WeaponItem::mineBlock(ItemInstance*, int, int, int, int) */
  override mineBlock(
    itemInstance: ItemInstance,
    _tile: number,
    _x: number,
    _y: number,
    _z: number,
  ): boolean {
    itemInstance.hurt(2);
    return true;
  }

  /** C++ WeaponItem::getAttackDamage(Entity*) */
  override getAttackDamage(_entity: Entity): number {
    return this.damage;
  }

  /** C++ WeaponItem::isHandEquipped() */
  override isHandEquipped(): boolean {
    return true;
  }

  /** C++ WeaponItem::getUseDuration(ItemInstance*) */
  override getUseDuration(_itemInstance: ItemInstance): number {
    return 20 * 60 * 60; // Block for a maximum of one hour!
  }

  /** C++ WeaponItem::use(ItemInstance*, Level*, Player*) */
  override use(instance: ItemInstance, _level: Level, _player: Player): ItemInstance {
    // C++: player->startUsingItem(instance, getUseDuration(instance)); //@todo
    return instance;
  }

  /** C++ WeaponItem::canDestroySpecial(const Tile*) */
  override canDestroySpecial(tile: Tile | null): boolean {
    return tile!.id === Tile.web.id;
  }
}
