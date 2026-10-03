// ADAPTED(ESM)（S11 阶段 C）：把物品子类注入 Item.initItems（C++ 的 Item.cpp 直接 #include 全部子类）。与 TileInclude 同一做法。
import { ArmorItem } from './ArmorItem';
import { BowItem } from './BowItem';
import { BowlFoodItem } from './BowlFoodItem';
import { CameraItem } from './CameraItem';
import { CoalItem } from './CoalItem';
import { DyePowderItem } from './DyePowderItem';
import { EggItem } from './EggItem';
import { FoodItem } from './FoodItem';
import { HangingEntityItem } from './HangingEntityItem';
import { PickaxeItem } from './PickaxeItem';
import { SeedItem } from './SeedItem';
import { ShovelItem } from './ShovelItem';
import { SnowballItem } from './SnowballItem';
import { BedItem } from './BedItem';
import { DoorItem } from './DoorItem';
import { FlintAndSteelItem } from './FlintAndSteelItem';
import { HoeItem } from './HoeItem';
import { ShearsItem } from './ShearsItem';
import { SignItem } from './SignItem';
import { TilePlanterItem } from './TilePlanterItem';
import { WeaponItem } from './WeaponItem';
import { HatchetItem } from './HatchetItem';
import { Item, type ItemClasses } from './Item';

export const ITEM_CLASSES: ItemClasses = {
  HatchetItem,
  BedItem,
  DoorItem,
  FlintAndSteelItem,
  HoeItem,
  ShearsItem,
  SignItem,
  TilePlanterItem,
  WeaponItem,
  ArmorItem,
  BowItem,
  BowlFoodItem,
  CameraItem,
  CoalItem,
  DyePowderItem,
  EggItem,
  FoodItem,
  HangingEntityItem,
  PickaxeItem,
  SeedItem,
  ShovelItem,
  SnowballItem,
};

export function initItems(): void {
  Item.initItems(ITEM_CLASSES);
}
