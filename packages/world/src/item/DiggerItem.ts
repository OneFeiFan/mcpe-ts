// 1:1 移植自 src/world/item/DiggerItem.h
import { Item, Tier } from './Item';
import { ItemInstance } from './ItemInstance';
import { Tile } from '../level/tile/Tile';
import type { Entity } from '../entity/Entity';
import type { Mob } from '../entity/Mob';

export class DiggerItem extends Item {
  protected speed: number;
  protected readonly tier: Tier;
  protected tiles: Tile[] = [];

  private attackDamage: number;
  private readonly _bTiles = new Uint8Array(256);

  constructor(id: number, attackDamage: number, tier: Tier, tiles: Tile[] = []) {
    super(id);
    this.speed = tier.getSpeed();
    this.tier = tier;

    this.setTiles(tiles);

    this.maxStackSize = 1;
    this.setMaxDamage(tier.getUses());
    this.attackDamage = attackDamage + tier.getAttackDamageBonus();
  }

  /** C++ DiggerItem::getDestroySpeed(ItemInstance*, Tile*) */
  override getDestroySpeed(_itemInstance: ItemInstance, tile: Tile): number {
    if (this.hasTile(tile)) return this.speed;
    return 1;
  }

  /** C++ DiggerItem::hurtEnemy(ItemInstance*, Mob*) */
  override hurtEnemy(itemInstance: ItemInstance, _mob: Mob): void {
    itemInstance.hurt(2);
  }

  /** C++ DiggerItem::mineBlock(ItemInstance*, int, int, int, int) */
  override mineBlock(
    itemInstance: ItemInstance,
    _tile: number,
    _x: number,
    _y: number,
    _z: number,
  ): boolean {
    itemInstance.hurt(1);
    return true;
  }

  /** C++ DiggerItem::getAttackDamage(Entity*) */
  override getAttackDamage(_entity: Entity): number {
    return this.attackDamage;
  }

  /** C++ DiggerItem::isHandEquipped() */
  override isHandEquipped(): boolean {
    return true;
  }

  /** C++ DiggerItem::setTiles(const TileList&) */
  setTiles(tiles: Tile[]): void {
    this._bTiles.fill(0);
    for (const tile of tiles) {
      this._bTiles[tile.id] = 1;
    }
    this.tiles = tiles;
  }

  /** C++ DiggerItem::hasTile(Tile*) */
  protected hasTile(tile: Tile | null): boolean {
    return tile !== null && this._bTiles[tile.id] === 1;
  }
}
