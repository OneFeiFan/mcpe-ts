/**
 * 1:1 移植自 src/world/item/Item.h 与 Item.cpp（S3：物品注册表骨架）。
 *
 * 本轮只建骨架：基类、items[MAX_ITEMS] 注册表、全部 112 个静态物品字段的声明。
 * Item::initItems 本轮 OMIT，这些静态字段都是“访问即报错”的哨兵（见 Unregistered.ts），相当于 C++ 的 NULL。
 * 已移植的方块代码里有 Item.xxx.id 这样的引用（例如 getResource），只在拆方块等本轮没有的路径上执行。
 *
 * OMIT 的方法：参数含 ItemInstance、Player、Mob、Entity 的 12 个 virtual，以及用到 I18n 的 getDescription、getName。
 * 子类（TileItem 等）里对应的重写一并 OMIT。
 * 调用方式与 C++ 一致：Item::items[i] → Item.items[i]，Item::apple → Item.apple。
 */
import { LOGW } from '@mcpe/platform';
import { Random } from '@mcpe/util';
import { unregistered } from '../Unregistered';
import type { Entity } from '../entity/Entity';
import type { Mob } from '../entity/Mob';
import type { Player } from '../entity/player/Player';
import type { Level } from '../level/Level';
import type { Tile } from '../level/tile/Tile';
import { I18n } from '../locale/I18n';
import type { ItemInstance } from './ItemInstance';
import { UseAnim, type UseAnimation } from './UseAnim';

/** C++ 的嵌套类 Item::Tier（也可用 Item.Tier 取到） */
export class Tier {
  static readonly WOOD = new Tier(0, 59, 2, 0);
  static readonly STONE = new Tier(1, 131, 4, 1);
  static readonly IRON = new Tier(2, 250, 6, 2);
  static readonly EMERALD = new Tier(3, 1561, 8, 3);
  static readonly GOLD = new Tier(0, 32, 12, 0);

  private constructor(
    private readonly level: number,
    private readonly uses: number,
    private readonly speed: number,
    private readonly damage: number,
  ) {}

  getUses(): number {
    return this.uses;
  }

  getSpeed(): number {
    return this.speed;
  }

  getAttackDamageBonus(): number {
    return this.damage;
  }

  getLevel(): number {
    return this.level;
  }
}

type TierT = Tier;

export class Item {
  private static readonly MAX_STACK_SIZE = 64; // Container::LARGE_MAX_STACK_SIZE
  static readonly MAX_ITEMS = 512; // 32000
  static readonly ICON_COLUMNS = 16;
  static readonly ICON_DESCRIPTION_PREFIX = 'item.';
  static readonly Tier = Tier;

  static readonly items: (Item | null)[] = new Array<Item | null>(Item.MAX_ITEMS).fill(null);
  /** C++ 为 ShearsItem*；ShearsItem 移植后把类型改成它 */
  static shears: Item = unregistered<Item>('Item', 'shears');
  static shovel_iron: Item = unregistered<Item>('Item', 'shovel_iron');
  static pickAxe_iron: Item = unregistered<Item>('Item', 'pickAxe_iron');
  static hatchet_iron: Item = unregistered<Item>('Item', 'hatchet_iron');
  static flintAndSteel: Item = unregistered<Item>('Item', 'flintAndSteel');
  static apple: Item = unregistered<Item>('Item', 'apple');
  static bow: Item = unregistered<Item>('Item', 'bow');
  static arrow: Item = unregistered<Item>('Item', 'arrow');
  static coal: Item = unregistered<Item>('Item', 'coal');
  static emerald: Item = unregistered<Item>('Item', 'emerald');
  static ironIngot: Item = unregistered<Item>('Item', 'ironIngot');
  static goldIngot: Item = unregistered<Item>('Item', 'goldIngot');
  static sword_iron: Item = unregistered<Item>('Item', 'sword_iron');
  static sword_wood: Item = unregistered<Item>('Item', 'sword_wood');
  static shovel_wood: Item = unregistered<Item>('Item', 'shovel_wood');
  static pickAxe_wood: Item = unregistered<Item>('Item', 'pickAxe_wood');
  static hatchet_wood: Item = unregistered<Item>('Item', 'hatchet_wood');
  static sword_stone: Item = unregistered<Item>('Item', 'sword_stone');
  static shovel_stone: Item = unregistered<Item>('Item', 'shovel_stone');
  static pickAxe_stone: Item = unregistered<Item>('Item', 'pickAxe_stone');
  static hatchet_stone: Item = unregistered<Item>('Item', 'hatchet_stone');
  static sword_emerald: Item = unregistered<Item>('Item', 'sword_emerald');
  static shovel_emerald: Item = unregistered<Item>('Item', 'shovel_emerald');
  static pickAxe_emerald: Item = unregistered<Item>('Item', 'pickAxe_emerald');
  static hatchet_emerald: Item = unregistered<Item>('Item', 'hatchet_emerald');
  static stick: Item = unregistered<Item>('Item', 'stick');
  static bowl: Item = unregistered<Item>('Item', 'bowl');
  static mushroomStew: Item = unregistered<Item>('Item', 'mushroomStew');
  static sword_gold: Item = unregistered<Item>('Item', 'sword_gold');
  static shovel_gold: Item = unregistered<Item>('Item', 'shovel_gold');
  static pickAxe_gold: Item = unregistered<Item>('Item', 'pickAxe_gold');
  static hatchet_gold: Item = unregistered<Item>('Item', 'hatchet_gold');
  static string: Item = unregistered<Item>('Item', 'string');
  static feather: Item = unregistered<Item>('Item', 'feather');
  static sulphur: Item = unregistered<Item>('Item', 'sulphur');
  static hoe_wood: Item = unregistered<Item>('Item', 'hoe_wood');
  static hoe_stone: Item = unregistered<Item>('Item', 'hoe_stone');
  static hoe_iron: Item = unregistered<Item>('Item', 'hoe_iron');
  static hoe_emerald: Item = unregistered<Item>('Item', 'hoe_emerald');
  static hoe_gold: Item = unregistered<Item>('Item', 'hoe_gold');
  static seeds_wheat: Item = unregistered<Item>('Item', 'seeds_wheat');
  static wheat: Item = unregistered<Item>('Item', 'wheat');
  static bread: Item = unregistered<Item>('Item', 'bread');
  static helmet_cloth: Item = unregistered<Item>('Item', 'helmet_cloth');
  static chestplate_cloth: Item = unregistered<Item>('Item', 'chestplate_cloth');
  static leggings_cloth: Item = unregistered<Item>('Item', 'leggings_cloth');
  static boots_cloth: Item = unregistered<Item>('Item', 'boots_cloth');
  static helmet_chain: Item = unregistered<Item>('Item', 'helmet_chain');
  static chestplate_chain: Item = unregistered<Item>('Item', 'chestplate_chain');
  static leggings_chain: Item = unregistered<Item>('Item', 'leggings_chain');
  static boots_chain: Item = unregistered<Item>('Item', 'boots_chain');
  static helmet_iron: Item = unregistered<Item>('Item', 'helmet_iron');
  static chestplate_iron: Item = unregistered<Item>('Item', 'chestplate_iron');
  static leggings_iron: Item = unregistered<Item>('Item', 'leggings_iron');
  static boots_iron: Item = unregistered<Item>('Item', 'boots_iron');
  static helmet_diamond: Item = unregistered<Item>('Item', 'helmet_diamond');
  static chestplate_diamond: Item = unregistered<Item>('Item', 'chestplate_diamond');
  static leggings_diamond: Item = unregistered<Item>('Item', 'leggings_diamond');
  static boots_diamond: Item = unregistered<Item>('Item', 'boots_diamond');
  static helmet_gold: Item = unregistered<Item>('Item', 'helmet_gold');
  static chestplate_gold: Item = unregistered<Item>('Item', 'chestplate_gold');
  static leggings_gold: Item = unregistered<Item>('Item', 'leggings_gold');
  static boots_gold: Item = unregistered<Item>('Item', 'boots_gold');
  static flint: Item = unregistered<Item>('Item', 'flint');
  static porkChop_raw: Item = unregistered<Item>('Item', 'porkChop_raw');
  static porkChop_cooked: Item = unregistered<Item>('Item', 'porkChop_cooked');
  static painting: Item = unregistered<Item>('Item', 'painting');
  static apple_gold: Item = unregistered<Item>('Item', 'apple_gold');
  static sign: Item = unregistered<Item>('Item', 'sign');
  static door_wood: Item = unregistered<Item>('Item', 'door_wood');
  static bucket_empty: Item = unregistered<Item>('Item', 'bucket_empty');
  static bucket_water: Item = unregistered<Item>('Item', 'bucket_water');
  static bucket_lava: Item = unregistered<Item>('Item', 'bucket_lava');
  static minecart: Item = unregistered<Item>('Item', 'minecart');
  static saddle: Item = unregistered<Item>('Item', 'saddle');
  static door_iron: Item = unregistered<Item>('Item', 'door_iron');
  static redStone: Item = unregistered<Item>('Item', 'redStone');
  static snowBall: Item = unregistered<Item>('Item', 'snowBall');
  static boat: Item = unregistered<Item>('Item', 'boat');
  static leather: Item = unregistered<Item>('Item', 'leather');
  static milk: Item = unregistered<Item>('Item', 'milk');
  static brick: Item = unregistered<Item>('Item', 'brick');
  static clay: Item = unregistered<Item>('Item', 'clay');
  static reeds: Item = unregistered<Item>('Item', 'reeds');
  static paper: Item = unregistered<Item>('Item', 'paper');
  static book: Item = unregistered<Item>('Item', 'book');
  static slimeBall: Item = unregistered<Item>('Item', 'slimeBall');
  static minecart_chest: Item = unregistered<Item>('Item', 'minecart_chest');
  static minecart_furnace: Item = unregistered<Item>('Item', 'minecart_furnace');
  static egg: Item = unregistered<Item>('Item', 'egg');
  static compass: Item = unregistered<Item>('Item', 'compass');
  static fishingRod: Item = unregistered<Item>('Item', 'fishingRod');
  static clock: Item = unregistered<Item>('Item', 'clock');
  static yellowDust: Item = unregistered<Item>('Item', 'yellowDust');
  static fish_raw: Item = unregistered<Item>('Item', 'fish_raw');
  static fish_cooked: Item = unregistered<Item>('Item', 'fish_cooked');
  static melon: Item = unregistered<Item>('Item', 'melon');
  static seeds_melon: Item = unregistered<Item>('Item', 'seeds_melon');
  static dye_powder: Item = unregistered<Item>('Item', 'dye_powder');
  static bone: Item = unregistered<Item>('Item', 'bone');
  static sugar: Item = unregistered<Item>('Item', 'sugar');
  static cake: Item = unregistered<Item>('Item', 'cake');
  static bed: Item = unregistered<Item>('Item', 'bed');
  static diode: Item = unregistered<Item>('Item', 'diode');
  static beef_raw: Item = unregistered<Item>('Item', 'beef_raw');
  static beef_cooked: Item = unregistered<Item>('Item', 'beef_cooked');
  static chicken_raw: Item = unregistered<Item>('Item', 'chicken_raw');
  static chicken_cooked: Item = unregistered<Item>('Item', 'chicken_cooked');
  static netherbrick: Item = unregistered<Item>('Item', 'netherbrick');
  static netherQuartz: Item = unregistered<Item>('Item', 'netherQuartz');
  static record_01: Item = unregistered<Item>('Item', 'record_01');
  static record_02: Item = unregistered<Item>('Item', 'record_02');
  static camera: Item = unregistered<Item>('Item', 'camera');

  protected static random = new Random();

  readonly id: number;
  maxDamage = 32;
  /** C++ 没有初始化（未定义值）；这里取 0，TileItem 等会在构造时设置 */
  icon = 0;
  category = -1;
  protected maxStackSize = Item.MAX_STACK_SIZE;
  private _handEquipped = false;
  private _isStackedByData = false;
  private craftingRemainingItem: Item | null = null;
  private descriptionId = '';

  constructor(id: number) {
    this.id = 256 + id;
    if (Item.items[this.id] != null) LOGW(`Item conflict id @ ${this.id}! Id already used`);
    Item.items[this.id] = this;
  }

  // OMIT(Item): static initItems()  Item.cpp:160 —— 本轮不注册任何物品
  static teardownItems(): void {
    for (let i = 0; i < Item.MAX_ITEMS; ++i) if (Item.items[i]) Item.items[i] = null;
  }

  setIcon(icon: number): Item;
  setIcon(column: number, row: number): Item;
  setIcon(a: number, row?: number): Item {
    this.icon = row === undefined ? a : a + row * Item.ICON_COLUMNS;
    return this;
  }

  setMaxStackSize(max: number): Item {
    this.maxStackSize = max;
    return this;
  }

  canBeDepleted(): boolean {
    return this.maxDamage > 0 && !this._isStackedByData;
  }

  getIcon(_auxValue: number): number {
    return this.icon;
  }

  /** C++ 的两个重载（R10）：useOn(itemInstance, level, x, y, z, face) 与 useOn(itemInstance, player, level, x, y, z, face, clickX, clickY, clickZ) */
  useOn(itemInstance: ItemInstance, level: Level, x: number, y: number, z: number, face: number): boolean;
  useOn(itemInstance: ItemInstance, player: Player, level: Level, x: number, y: number, z: number, face: number, clickX: number, clickY: number, clickZ: number): boolean;
  useOn(...a: unknown[]): boolean {
    if (a.length <= 6) return this.useOn$6(a[0] as ItemInstance, a[1] as Level, a[2] as number, a[3] as number, a[4] as number, a[5] as number);
    return this.useOn$10(a[0] as ItemInstance, a[1] as Player, a[2] as Level, a[3] as number, a[4] as number, a[5] as number, a[6] as number, a[7] as number, a[8] as number, a[9] as number);
  }

  useOn$6(_itemInstance: ItemInstance, _level: Level, _x: number, _y: number, _z: number, _face: number): boolean {
    return false;
  }

  useOn$10(_itemInstance: ItemInstance, _player: Player, _level: Level, _x: number, _y: number, _z: number, _face: number, _clickX: number, _clickY: number, _clickZ: number): boolean {
    return false;
  }

  getUseDuration(_itemInstance: ItemInstance): number {
    return 0;
  }

  /** C++ 按值返回 *itemInstance 的副本 */
  useTimeDepleted(itemInstance: ItemInstance, _level: Level, _player: Player): ItemInstance {
    // DEFERRED(ItemInstance): return *itemInstance;（按值复制，阶段 C 改成 new ItemInstance(itemInstance)）
    return itemInstance;
  }

  getDestroySpeed(_itemInstance: ItemInstance, _tile: Tile): number {
    return 1;
  }

  use(itemInstance: ItemInstance, _level: Level, _player: Player): ItemInstance {
    return itemInstance;
  }

  getMaxStackSize(): number {
    return this.maxStackSize;
  }

  getLevelDataForAuxValue(_auxValue: number): number {
    return 0;
  }

  isStackedByData(): boolean {
    return this._isStackedByData;
  }

  setCategory(category: number): Item {
    this.category = category;
    return this;
  }

  getMaxDamage(): number {
    return this.maxDamage;
  }

  hurtEnemy(_itemInstance: ItemInstance, _mob: Mob): void {}

  mineBlock(_itemInstance: ItemInstance, _tile: number, _x: number, _y: number, _z: number): boolean {
    return false;
  }

  getAttackDamage(_entity: Entity): number {
    return 1;
  }

  canDestroySpecial(_tile: Tile): boolean {
    return false;
  }

  interactEnemy(_itemInstance: ItemInstance, _mob: Mob): void {}

  handEquipped(): Item {
    this._handEquipped = true;
    return this;
  }

  isHandEquipped(): boolean {
    return this._handEquipped;
  }

  isMirroredArt(): boolean {
    return false;
  }

  isFood(): boolean {
    return false;
  }

  isArmor(): boolean {
    return false;
  }

  setDescriptionId(id: string): Item {
    this.descriptionId = Item.ICON_DESCRIPTION_PREFIX + id;
    return this;
  }

  /** C++ 的两个重载：getDescription() 与 getDescription(const ItemInstance*)（R10：$0 / $1） */
  getDescription(instance?: ItemInstance | null): string {
    return instance === undefined ? this.getDescription$0() : this.getDescription$1(instance);
  }

  getDescription$0(): string {
    return I18n.get(this.getDescriptionId());
  }

  getDescription$1(instance: ItemInstance | null): string {
    return I18n.get(this.getDescriptionId(instance));
  }

  /** C++ 的两个重载：getDescriptionId() 与 getDescriptionId(const ItemInstance*)（R10：$0 / $1） */
  getDescriptionId(instance?: ItemInstance | null): string {
    return instance === undefined ? this.getDescriptionId$0() : this.getDescriptionId$1(instance);
  }

  getDescriptionId$0(): string {
    return this.descriptionId;
  }

  getDescriptionId$1(_instance: ItemInstance | null): string {
    return this.descriptionId;
  }

  setCraftingRemainingItem(craftingRemainingItem: Item): Item {
    if (this.maxStackSize > 1) LOGW('Max stack size must be 1 for items with crafting results');
    this.craftingRemainingItem = craftingRemainingItem;
    return this;
  }

  getCraftingRemainingItem(): Item | null {
    return this.craftingRemainingItem;
  }

  hasCraftingRemainingItem(): boolean {
    return this.craftingRemainingItem !== null;
  }

  getName(): string {
    return I18n.get(this.getDescriptionId() + '.name');
  }

  releaseUsing(_itemInstance: ItemInstance, _level: Level, _player: Player, _durationLeft: number): void {}

  getUseAnimation(): UseAnimation {
    return UseAnim.none;
  }

  protected setStackedByData(isStackedByData: boolean): Item {
    this._isStackedByData = isStackedByData;
    return this;
  }

  protected setMaxDamage(maxDamage: number): Item {
    this.maxDamage = maxDamage;
    return this;
  }
}

// C++ 的嵌套类型：同名命名空间只放类型别名，让 Item::Tier 在 TS 里照样写成 Item.Tier（作类型用）；作值用走类上的同名静态属性。
// eslint-disable-next-line @typescript-eslint/no-namespace -- 只含类型，编译后不产生任何代码
export declare namespace Item {
  type Tier = TierT;
}
