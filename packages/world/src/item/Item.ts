/**
 * 1:1 移植自 src/world/item/Item.h 与 Item.cpp（S3：物品注册表骨架）。
 *
 * 本轮只建骨架：基类、items[MAX_ITEMS] 注册表、全部 112 个静态物品字段的声明。
 * Item::initItems 在 S11 阶段 C 移植；S12 才有的物品字段仍是“访问即报错”的哨兵（见 Unregistered.ts），相当于 C++ 的 NULL。
 * 已移植的方块代码里有 Item.xxx.id 这样的引用（例如 getResource），只在拆方块等本轮没有的路径上执行。
 *
 * OMIT 的方法：参数含 ItemInstance、Player、Mob、Entity 的 12 个 virtual，以及用到 I18n 的 getDescription、getName。
 * 子类（TileItem 等）里对应的重写一并 OMIT。
 * 调用方式与 C++ 一致：Item::items[i] → Item.items[i]，Item::apple → Item.apple。
 */
import type { HatchetItem } from './HatchetItem';
import { Material } from '../level/material/Material';
import type { BedItem } from './BedItem';
import type { DoorItem } from './DoorItem';
import type { FlintAndSteelItem } from './FlintAndSteelItem';
import type { HoeItem } from './HoeItem';
import type { ShearsItem } from './ShearsItem';
import type { SignItem } from './SignItem';
import type { TilePlanterItem } from './TilePlanterItem';
import type { WeaponItem } from './WeaponItem';
import type { ArmorItem } from './ArmorItem';
import type { BowItem } from './BowItem';
import type { BowlFoodItem } from './BowlFoodItem';
import type { CameraItem } from './CameraItem';
import type { CoalItem } from './CoalItem';
import type { DyePowderItem } from './DyePowderItem';
import type { EggItem } from './EggItem';
import type { FoodItem } from './FoodItem';
import type { HangingEntityItem } from './HangingEntityItem';
import type { PickaxeItem } from './PickaxeItem';
import type { SeedItem } from './SeedItem';
import type { ShovelItem } from './ShovelItem';
import type { SnowballItem } from './SnowballItem';
import { EntityTypes } from '../entity/EntityTypes';
import { ItemCategory } from './ItemCategory';
import { Tile } from '../level/tile/Tile';
import { LOGE, LOGW } from '@mcpe/platform';
import { Random } from '@mcpe/util';
import { unregistered } from '../Unregistered';
import type { Entity } from '../entity/Entity';
import type { Mob } from '../entity/Mob';
import type { Player } from '../entity/player/Player';
import type { Level } from '../level/Level';
import { ItemInstance } from './ItemInstance';
import { UseAnim } from './UseAnim';
import { I18n } from '@mcpe/locale';

/** C++ 的嵌套类 Item::Tier（也可用 Item.Tier 取到） */

/** ItemInclude.ts 注入的子类构造器（import type，不形成运行时循环） */
export interface ItemClasses {
  readonly HatchetItem: typeof HatchetItem;
  readonly BedItem: typeof BedItem;
  readonly DoorItem: typeof DoorItem;
  readonly FlintAndSteelItem: typeof FlintAndSteelItem;
  readonly HoeItem: typeof HoeItem;
  readonly ShearsItem: typeof ShearsItem;
  readonly SignItem: typeof SignItem;
  readonly TilePlanterItem: typeof TilePlanterItem;
  readonly WeaponItem: typeof WeaponItem;
  readonly ArmorItem: typeof ArmorItem;
  readonly BowItem: typeof BowItem;
  readonly BowlFoodItem: typeof BowlFoodItem;
  readonly CameraItem: typeof CameraItem;
  readonly CoalItem: typeof CoalItem;
  readonly DyePowderItem: typeof DyePowderItem;
  readonly EggItem: typeof EggItem;
  readonly FoodItem: typeof FoodItem;
  readonly HangingEntityItem: typeof HangingEntityItem;
  readonly PickaxeItem: typeof PickaxeItem;
  readonly SeedItem: typeof SeedItem;
  readonly ShovelItem: typeof ShovelItem;
  readonly SnowballItem: typeof SnowballItem;
}

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

  private static isInited = false;

  /**
   * C++ Item::initItems（S11 阶段 C）。子类构造器由 ItemInclude.ts 注入（ADAPTED(ESM)，与 TileInclude 同一做法）。
   * 全部 C++ 的物品赋值都已注册（S11 72 个，S12 补上 23 个）。
   */
  static initItems(c: ItemClasses): void {
    if (Item.isInited) return;
    Item.isInited = true;
    Item.shovel_iron = new c.ShovelItem(0, Tier.IRON).setIcon(2, 5).setCategory(ItemCategory.Tools).setDescriptionId('shovelIron');
    Item.pickAxe_iron = new c.PickaxeItem(1, Tier.IRON).setIcon(2, 6).setCategory(ItemCategory.Tools).setDescriptionId('pickaxeIron');
    Item.hatchet_iron = new c.HatchetItem(2, Tier.IRON).setIcon(2, 7).setCategory(ItemCategory.Tools).setDescriptionId('hatchetIron');
    Item.flintAndSteel = new c.FlintAndSteelItem(3).setIcon(5, 0).setCategory(ItemCategory.Tools).setDescriptionId('flintAndSteel');
    Item.apple = new c.FoodItem(4, 4, false).setIcon(10, 0).setCategory(ItemCategory.FoodArmor).setDescriptionId('apple');
    Item.bow = new c.BowItem(5).setIcon(5, 1).setCategory(ItemCategory.Tools).setDescriptionId('bow');
    Item.arrow = new Item(6).setIcon(5, 2).setCategory(ItemCategory.Tools).setDescriptionId('arrow');
    Item.coal = new c.CoalItem(7).setIcon(7, 0).setCategory(ItemCategory.Tools).setDescriptionId('coal');
    Item.emerald = new Item(8).setIcon(7, 3).setCategory(ItemCategory.Decorations).setDescriptionId('emerald');
    Item.ironIngot = new Item(9).setIcon(7, 1).setCategory(ItemCategory.Decorations).setDescriptionId('ingotIron');
    Item.goldIngot = new Item(10).setIcon(7, 2).setCategory(ItemCategory.Decorations).setDescriptionId('ingotGold');
    Item.sword_iron = new c.WeaponItem(11, Tier.IRON).setIcon(2, 4).setCategory(ItemCategory.Tools).setDescriptionId('swordIron');
    Item.sword_wood = new c.WeaponItem(12, Tier.WOOD).setIcon(0, 4).setCategory(ItemCategory.Tools).setDescriptionId('swordWood');
    Item.shovel_wood = new c.ShovelItem(13, Tier.WOOD).setIcon(0, 5).setCategory(ItemCategory.Tools).setDescriptionId('shovelWood');
    Item.pickAxe_wood = new c.PickaxeItem(14, Tier.WOOD).setIcon(0, 6).setCategory(ItemCategory.Tools).setDescriptionId('pickaxeWood');
    Item.hatchet_wood = new c.HatchetItem(15, Tier.WOOD).setIcon(0, 7).setCategory(ItemCategory.Tools).setDescriptionId('hatchetWood');
    Item.sword_stone = new c.WeaponItem(16, Tier.STONE).setIcon(1, 4).setCategory(ItemCategory.Tools).setDescriptionId('swordStone');
    Item.shovel_stone = new c.ShovelItem(17, Tier.STONE).setIcon(1, 5).setCategory(ItemCategory.Tools).setDescriptionId('shovelStone');
    Item.pickAxe_stone = new c.PickaxeItem(18, Tier.STONE).setIcon(1, 6).setCategory(ItemCategory.Tools).setDescriptionId('pickaxeStone');
    Item.hatchet_stone = new c.HatchetItem(19, Tier.STONE).setIcon(1, 7).setCategory(ItemCategory.Tools).setDescriptionId('hatchetStone');
    Item.sword_emerald = new c.WeaponItem(20, Tier.EMERALD).setIcon(3, 4).setCategory(ItemCategory.Tools).setDescriptionId('swordDiamond');
    Item.shovel_emerald = new c.ShovelItem(21, Tier.EMERALD).setIcon(3, 5).setCategory(ItemCategory.Tools).setDescriptionId('shovelDiamond');
    Item.pickAxe_emerald = new c.PickaxeItem(22, Tier.EMERALD).setIcon(3, 6).setCategory(ItemCategory.Tools).setDescriptionId('pickaxeDiamond');
    Item.hatchet_emerald = new c.HatchetItem(23, Tier.EMERALD).setIcon(3, 7).setCategory(ItemCategory.Tools).setDescriptionId('hatchetDiamond');
    Item.stick = new Item(24).setIcon(5, 3).handEquipped().setCategory(ItemCategory.Structures).setDescriptionId('stick');
    Item.bowl = new Item(25).setIcon(7, 4).setCategory(ItemCategory.FoodArmor).setDescriptionId('bowl');
    Item.mushroomStew = new c.BowlFoodItem(26, 8).setIcon(8, 4).setCategory(ItemCategory.FoodArmor).setDescriptionId('mushroomStew');
    Item.sword_gold = new c.WeaponItem(27, Tier.GOLD).setIcon(4, 4).setCategory(ItemCategory.Tools).setDescriptionId('swordGold');
    Item.shovel_gold = new c.ShovelItem(28, Tier.GOLD).setIcon(4, 5).setCategory(ItemCategory.Tools).setDescriptionId('shovelGold');
    Item.pickAxe_gold = new c.PickaxeItem(29, Tier.GOLD).setIcon(4, 6).setCategory(ItemCategory.Tools).setDescriptionId('pickaxeGold');
    Item.hatchet_gold = new c.HatchetItem(30, Tier.GOLD).setIcon(4, 7).setCategory(ItemCategory.Tools).setDescriptionId('hatchetGold');
    Item.string = new Item(31).setIcon(8, 0).setCategory(ItemCategory.Tools).setDescriptionId('string');
    Item.feather = new Item(32).setIcon(8, 1).setCategory(ItemCategory.Tools).setDescriptionId('feather');
    Item.sulphur = new Item(33).setIcon(8, 2).setCategory(ItemCategory.Tools).setDescriptionId('sulphur');
    Item.hoe_wood = new c.HoeItem(34, Tier.WOOD).setIcon(0, 8).setCategory(ItemCategory.Tools).setDescriptionId('hoeWood');
    Item.hoe_stone = new c.HoeItem(35, Tier.STONE).setIcon(1, 8).setCategory(ItemCategory.Tools).setDescriptionId('hoeStone');
    Item.hoe_iron = new c.HoeItem(36, Tier.IRON).setIcon(2, 8).setCategory(ItemCategory.Tools).setDescriptionId('hoeIron');
    Item.hoe_emerald = new c.HoeItem(37, Tier.EMERALD).setIcon(3, 8).setCategory(ItemCategory.Tools).setDescriptionId('hoeDiamond');
    Item.hoe_gold = new c.HoeItem(38, Tier.GOLD).setIcon(4, 8).setCategory(ItemCategory.Tools).setDescriptionId('hoeGold');
    Item.seeds_wheat = new c.SeedItem(39, Tile.crops.id, Tile.farmland.id).setIcon(9, 0).setCategory(ItemCategory.FoodArmor).setDescriptionId('seeds');
    Item.wheat = new Item(40).setIcon(9, 1).setCategory(ItemCategory.FoodArmor).setDescriptionId('wheat');
    Item.bread = new c.FoodItem(41, 5, false).setIcon(9, 2).setCategory(ItemCategory.FoodArmor).setDescriptionId('bread');
    Item.helmet_cloth = new c.ArmorItem(42, c.ArmorItem.CLOTH, 0, c.ArmorItem.SLOT_HEAD).setIcon(0, 0).setCategory(ItemCategory.FoodArmor).setDescriptionId('helmetCloth');
    Item.chestplate_cloth = new c.ArmorItem(43, c.ArmorItem.CLOTH, 0, c.ArmorItem.SLOT_TORSO).setIcon(0, 1).setCategory(ItemCategory.FoodArmor).setDescriptionId('chestplateCloth');
    Item.leggings_cloth = new c.ArmorItem(44, c.ArmorItem.CLOTH, 0, c.ArmorItem.SLOT_LEGS).setIcon(0, 2).setCategory(ItemCategory.FoodArmor).setDescriptionId('leggingsCloth');
    Item.boots_cloth = new c.ArmorItem(45, c.ArmorItem.CLOTH, 0, c.ArmorItem.SLOT_FEET).setIcon(0, 3).setCategory(ItemCategory.FoodArmor).setDescriptionId('bootsCloth');
    Item.helmet_chain = new c.ArmorItem(46, c.ArmorItem.CHAIN, 1, c.ArmorItem.SLOT_HEAD).setIcon(1, 0).setCategory(ItemCategory.FoodArmor).setDescriptionId('helmetChain');
    Item.chestplate_chain = new c.ArmorItem(47, c.ArmorItem.CHAIN, 1, c.ArmorItem.SLOT_TORSO).setIcon(1, 1).setCategory(ItemCategory.FoodArmor).setDescriptionId('chestplateChain');
    Item.leggings_chain = new c.ArmorItem(48, c.ArmorItem.CHAIN, 1, c.ArmorItem.SLOT_LEGS).setIcon(1, 2).setCategory(ItemCategory.FoodArmor).setDescriptionId('leggingsChain');
    Item.boots_chain = new c.ArmorItem(49, c.ArmorItem.CHAIN, 1, 3).setIcon(1, 3).setCategory(ItemCategory.FoodArmor).setDescriptionId('bootsChain');
    Item.helmet_iron = new c.ArmorItem(50, c.ArmorItem.IRON, 2, c.ArmorItem.SLOT_HEAD).setIcon(2, 0).setCategory(ItemCategory.FoodArmor).setDescriptionId('helmetIron');
    Item.chestplate_iron = new c.ArmorItem(51, c.ArmorItem.IRON, 2, c.ArmorItem.SLOT_TORSO).setIcon(2, 1).setCategory(ItemCategory.FoodArmor).setDescriptionId('chestplateIron');
    Item.leggings_iron = new c.ArmorItem(52, c.ArmorItem.IRON, 2, c.ArmorItem.SLOT_LEGS).setIcon(2, 2).setCategory(ItemCategory.FoodArmor).setDescriptionId('leggingsIron');
    Item.boots_iron = new c.ArmorItem(53, c.ArmorItem.IRON, 2, c.ArmorItem.SLOT_FEET).setIcon(2, 3).setCategory(ItemCategory.FoodArmor).setDescriptionId('bootsIron');
    Item.helmet_diamond = new c.ArmorItem(54, c.ArmorItem.DIAMOND, 3, c.ArmorItem.SLOT_HEAD).setIcon(3, 0).setCategory(ItemCategory.FoodArmor).setDescriptionId('helmetDiamond');
    Item.chestplate_diamond = new c.ArmorItem(55, c.ArmorItem.DIAMOND, 3, c.ArmorItem.SLOT_TORSO).setIcon(3, 1).setCategory(ItemCategory.FoodArmor).setDescriptionId('chestplateDiamond');
    Item.leggings_diamond = new c.ArmorItem(56, c.ArmorItem.DIAMOND, 3, c.ArmorItem.SLOT_LEGS).setIcon(3, 2).setCategory(ItemCategory.FoodArmor).setDescriptionId('leggingsDiamond');
    Item.boots_diamond = new c.ArmorItem(57, c.ArmorItem.DIAMOND, 3, c.ArmorItem.SLOT_FEET).setIcon(3, 3).setCategory(ItemCategory.FoodArmor).setDescriptionId('bootsDiamond');
    Item.helmet_gold = new c.ArmorItem(58, c.ArmorItem.GOLD, 4, c.ArmorItem.SLOT_HEAD).setIcon(4, 0).setCategory(ItemCategory.FoodArmor).setDescriptionId('helmetGold');
    Item.chestplate_gold = new c.ArmorItem(59, c.ArmorItem.GOLD, 4, c.ArmorItem.SLOT_TORSO).setIcon(4, 1).setCategory(ItemCategory.FoodArmor).setDescriptionId('chestplateGold');
    Item.leggings_gold = new c.ArmorItem(60, c.ArmorItem.GOLD, 4, c.ArmorItem.SLOT_LEGS).setIcon(4, 2).setCategory(ItemCategory.FoodArmor).setDescriptionId('leggingsGold');
    Item.boots_gold = new c.ArmorItem(61, c.ArmorItem.GOLD, 4, c.ArmorItem.SLOT_FEET).setIcon(4, 3).setCategory(ItemCategory.FoodArmor).setDescriptionId('bootsGold');
    Item.flint = new Item(62).setIcon(6, 0).setCategory(ItemCategory.Tools).setDescriptionId('flint');
    Item.porkChop_raw = new c.FoodItem(63, 3, true).setIcon(7, 5).setCategory(ItemCategory.FoodArmor).setDescriptionId('porkchopRaw');
    Item.porkChop_cooked = new c.FoodItem(64, 8, true).setIcon(8, 5).setCategory(ItemCategory.FoodArmor).setDescriptionId('porkchopCooked');
    Item.painting = new c.HangingEntityItem(65, EntityTypes.IdPainting).setIcon(10, 1).setCategory(ItemCategory.Decorations).setDescriptionId('painting');
    Item.sign = new c.SignItem(67).setIcon(10, 2).setCategory(ItemCategory.Decorations).setDescriptionId('sign');
    Item.door_wood = new c.DoorItem(68, Material.wood).setIcon(11, 2).setCategory(ItemCategory.Structures).setDescriptionId('doorWood');
    Item.door_iron = new c.DoorItem(74, Material.metal).setIcon(12, 2).setCategory(ItemCategory.Structures).setDescriptionId('doorIron');
    Item.snowBall = new c.SnowballItem(76).setIcon(14, 0).setCategory(ItemCategory.Decorations).setDescriptionId('snowball');
    Item.leather = new Item(78).setIcon(7, 6).setCategory(ItemCategory.Tools).setDescriptionId('leather');
    Item.brick = new Item(80).setIcon(6, 1).setCategory(ItemCategory.Structures).setDescriptionId('brick');
    Item.clay = new Item(81).setIcon(9, 3).setCategory(ItemCategory.Structures).setDescriptionId('clay');
    Item.reeds = new c.TilePlanterItem(82, Tile.reeds).setIcon(11, 1).setCategory(ItemCategory.FoodArmor).setDescriptionId('reeds');
    Item.paper = new Item(83).setIcon(10, 3).setCategory(ItemCategory.Decorations).setDescriptionId('paper');
    Item.book = new Item(84).setIcon(11, 3).setCategory(ItemCategory.Decorations).setDescriptionId('book');
    Item.slimeBall = new Item(85).setIcon(14, 1).setCategory(ItemCategory.Decorations).setDescriptionId('slimeball');
    Item.egg = new c.EggItem(88).setIcon(12, 0).setCategory(ItemCategory.FoodArmor).setDescriptionId('egg');
    Item.compass = new Item(89).setIcon(6, 3).setCategory(ItemCategory.Tools).setDescriptionId('compass');
    Item.clock = new Item(91).setIcon(6, 4).setCategory(ItemCategory.Tools).setDescriptionId('clock');
    Item.yellowDust = new Item(92).setIcon(9, 4).setCategory(ItemCategory.Tools).setDescriptionId('yellowDust');
    Item.dye_powder = new c.DyePowderItem(95).setIcon(14, 4).setCategory(ItemCategory.Decorations).setDescriptionId('dyePowder');
    Item.bone = new Item(96).setIcon(12, 1).setCategory(ItemCategory.Tools).setDescriptionId('bone').handEquipped();
    Item.sugar = new Item(97).setIcon(13, 0).setCategory(ItemCategory.FoodArmor).setDescriptionId('sugar').handEquipped();
    Item.bed = new c.BedItem(99).setMaxStackSize(1).setIcon(13, 2).setCategory(ItemCategory.Structures).setDescriptionId('bed');
    Item.shears = new c.ShearsItem(103).setIcon(13, 5).setCategory(ItemCategory.Tools).setDescriptionId('shears');
    Item.melon = new c.FoodItem(104, 2, false).setIcon(13, 6).setCategory(ItemCategory.FoodArmor).setDescriptionId('melon');
    Item.seeds_melon = new c.SeedItem(106, Tile.melonStem.id, Tile.farmland.id).setIcon(14, 3).setCategory(ItemCategory.FoodArmor).setDescriptionId('seeds_melon');
    Item.beef_raw = new c.FoodItem(107, 3,  true).setIcon(9, 6).setCategory(ItemCategory.FoodArmor).setDescriptionId('beefRaw');
    Item.beef_cooked = new c.FoodItem(108, 8,  true).setIcon(10, 6).setCategory(ItemCategory.FoodArmor).setDescriptionId('beefCooked');
    Item.chicken_raw = new c.FoodItem(109, 2,  true).setIcon(9, 7).setCategory(ItemCategory.FoodArmor).setDescriptionId('chickenRaw');
    Item.chicken_cooked = new c.FoodItem(110, 6,  true).setIcon(10, 7).setCategory(ItemCategory.FoodArmor).setDescriptionId('chickenCooked');
    Item.netherbrick = new Item(149).setIcon(5, 9).setDescriptionId('netherbrickItem').setCategory(ItemCategory.Structures);
    Item.netherQuartz = new Item(150).setIcon(5, 10).setDescriptionId('netherquartz').setCategory(ItemCategory.Mechanisms);
    Item.camera = new c.CameraItem(200).setIcon(2, 15).setCategory(ItemCategory.Decorations).setDescriptionId('camera');
    for (let i = 256; i < Item.MAX_ITEMS; ++i) {
      if (Item.items[i] && Item.items[i]!.category === -1) LOGE(`Error: Missing category for item ${Item.items[i]!.id}: ${Item.items[i]!.getDescriptionId()}`);
    }
  }

  /** ADAPTED(Test)：测试用；C++ 的 isInited 是函数内静态变量 */
  static resetInitedForTest(): void {
    Item.isInited = false;
  }
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

  getIcon(itemAuxValue: number): number;
  // C++ Item::getIcon(const ItemInstance* itemInstance)
  getIcon(itemInstance: ItemInstance): number;
  getIcon(a: number | ItemInstance): number {
    if (typeof a === "number") return this.getIconForAux(a);
    return this.getIconForInstance(a);
  }

  getIconForAux(_auxValue: number): number {
    return this.icon;
  }

  getIconForInstance(_itemInstance: ItemInstance): number {
    return this.getIconForAux(_itemInstance.getAuxValue());
  }

  /** C++ 的两个重载（R10）：useOn(itemInstance, level, x, y, z, face) 与 useOn(itemInstance, player, level, x, y, z, face, clickX, clickY, clickZ) */
  useOn(itemInstance: ItemInstance, level: Level, x: number, y: number, z: number, face: number): boolean;
  useOn(itemInstance: ItemInstance, player: Player, level: Level, x: number, y: number, z: number, face: number, clickX: number, clickY: number, clickZ: number): boolean;
  useOn(...a: unknown[]): boolean {
    if (a.length <= 6) return this.useOnWithoutPlayer(a[0] as ItemInstance, a[1] as Level, a[2] as number, a[3] as number, a[4] as number, a[5] as number);
    return this.useOnByPlayer(a[0] as ItemInstance, a[1] as Player, a[2] as Level, a[3] as number, a[4] as number, a[5] as number, a[6] as number, a[7] as number, a[8] as number, a[9] as number);
  }

  useOnWithoutPlayer(_itemInstance: ItemInstance, _level: Level, _x: number, _y: number, _z: number, _face: number): boolean {
    return false;
  }

  useOnByPlayer(_itemInstance: ItemInstance, _player: Player, _level: Level, _x: number, _y: number, _z: number, _face: number, _clickX: number, _clickY: number, _clickZ: number): boolean {
    return false;
  }

  getUseDuration(_itemInstance: ItemInstance): number {
    return 0;
  }

  /** C++ 按值返回 *itemInstance 的副本 */
  useTimeDepleted(itemInstance: ItemInstance, _level: Level, _player: Player): ItemInstance {
    return new ItemInstance(itemInstance); // C++ 按值返回 *itemInstance 的副本
  }

  /** C++ 调用处可能传 NULL（Inventory::getDestroySpeed） */
  getDestroySpeed(_itemInstance: ItemInstance | null, _tile: Tile): number {
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
    return instance === undefined ? this.getDescriptionForItem() : this.getDescriptionForInstance(instance);
  }

  getDescriptionForItem(): string {
    return I18n.get(this.getDescriptionId());
  }

  getDescriptionForInstance(instance: ItemInstance | null): string {
    return I18n.get(this.getDescriptionId(instance));
  }

  /** C++ 的两个重载：getDescriptionId() 与 getDescriptionId(const ItemInstance*)（R10：$0 / $1） */
  getDescriptionId(instance?: ItemInstance | null): string {
    return instance === undefined ? this.getDescriptionIdForItem() : this.getDescriptionIdForInstance(instance);
  }

  getDescriptionIdForItem(): string {
    return this.descriptionId;
  }

  getDescriptionIdForInstance(_instance: ItemInstance | null): string {
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

  getUseAnimation(): UseAnim.UseAnimation {
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
