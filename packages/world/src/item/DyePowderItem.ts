/**
 * 1:1 移植自 src/world/item/DyePowderItem.h 与 DyePowderItem.cpp（S11 阶段 A，部分移植）。
 * OreTile、ClothTileItem 读它的常量，所以先给出。
 * 部分（useOn 里骨粉催熟的分支）：
 *  - 骨粉催熟：树苗、茎（S11 阶段 C）、作物与长草（S12 阶段 C）已全部恢复。
 *  - interactEnemy 给羊染色（任务单 H6 起恢复）。
 * C++ 的 COLOR_RGB 第 7、8 项相同（0x287697），照原样保留。
 */
import { Mth } from '@mcpe/util';
import type { Mob } from '../entity/Mob';
import type { Player } from '../entity/player/Player';
import type { Level } from '../level/Level';
import type { CropTile } from '../level/tile/CropTile';
import type { Sapling } from '../level/tile/Sapling';
import { TallGrass } from '../level/tile/TallGrass';
import type { StemTile } from '../level/tile/StemTile';
import { Tile } from '../level/tile/Tile';
import { ClothTile } from '../level/tile/ClothTile';
import { MobTypes } from '../entity/EntityTypes';
import type { Sheep } from '../entity/animal/Sheep';
import { Item } from './Item';
import type { ItemInstance } from './ItemInstance';

export class DyePowderItem extends Item {
  static readonly COLOR_DESCS: readonly string[] = [
    'black',
    'red',
    'green',
    'brown',
    'blue',
    'purple',
    'cyan',
    'silver',
    'gray',
    'pink',
    'lime',
    'yellow',
    'lightBlue',
    'magenta',
    'orange',
    'white',
  ];
  static readonly COLOR_RGB: readonly number[] = [
    0x1e1b1b, 0xb3312c, 0x3b511a, 0x51301a, 0x253192, 0x7b2fbe, 0x287697, 0x287697, 0x434343,
    0xd88198, 0x41cd34, 0xdecf2a, 0x6689d3, 0xc354cd, 0xeb8844, 0xf0f0f0,
  ];
  static readonly BLACK = 0;
  static readonly RED = 1;
  static readonly GREEN = 2;
  static readonly BROWN = 3;
  static readonly BLUE = 4;
  static readonly PURPLE = 5;
  static readonly CYAN = 6;
  static readonly SILVER = 7;
  static readonly GRAY = 8;
  static readonly PINK = 9;
  static readonly LIME = 10;
  static readonly YELLOW = 11;
  static readonly LIGHT_BLUE = 12;
  static readonly MAGENTA = 13;
  static readonly ORANGE = 14;
  static readonly WHITE = 15;

  constructor(id: number) {
    super(id);
    this.setStackedByData(true);
    this.setMaxDamage(0);
  }

  override getIconForAux(itemAuxValue: number): number {
    const colorValue = Mth.clamp(itemAuxValue, 0, 15);
    return this.icon + (colorValue % 8) * Item.ICON_COLUMNS + ((colorValue / 8) | 0);
  }

  override getDescriptionIdForInstance(itemInstance: ItemInstance | null): string {
    const colorValue = Mth.clamp(itemInstance!.getAuxValue(), 0, 15);
    return super.getDescriptionIdForItem() + '.' + DyePowderItem.COLOR_DESCS[colorValue]!;
  }

  override useOnByPlayer(
    itemInstance: ItemInstance,
    _player: Player,
    level: Level,
    x: number,
    y: number,
    z: number,
    _face: number,
    _clickX: number,
    _clickY: number,
    _clickZ: number,
  ): boolean {
    const random = Item.random;
    if (itemInstance.getAuxValue() === DyePowderItem.WHITE) {
      const tile = level.getTile(x, y, z);
      if (tile === Tile.sapling.id) {
        if (!level.isClientSide) {
          (Tile.sapling as Sapling).growTree(level, x, y, z, level.random);
        }
        itemInstance.count--;
        return true;
      } else if (tile === Tile.melonStem.id) {
        if (!level.isClientSide) {
          (Tile.tiles[tile] as StemTile).growCropsToMax(level, x, y, z);
        }
        itemInstance.count--;
        return true;
      } else if (tile === Tile.crops.id) {
        if (!level.isClientSide) {
          (Tile.crops as CropTile).growCropsToMax(level, x, y, z);
        }
        itemInstance.count--;
      } else if (tile === Tile.grass.id) {
        if (!level.isClientSide) {
          for (let j = 0; j < 32; j++) {
            let xx = x;
            let yy = y + 1;
            let zz = z;
            let continueMainLoop = false;
            for (let i = 0; i < ((j / 16) | 0); i++) {
              xx += random.nextInt(3) - 1;
              yy += (((random.nextInt(3) - 1) * random.nextInt(3)) / 2) | 0;
              zz += random.nextInt(3) - 1;
              if (
                level.getTile(xx, yy - 1, zz) !== Tile.grass.id ||
                level.isSolidBlockingTile(xx, yy, zz)
              ) {
                continueMainLoop = true;
                break;
              }
            }
            if (continueMainLoop) continue;
            if (level.getTile(xx, yy, zz) === 0) {
              if (random.nextInt(10) !== 0) {
                level.setTileAndData(xx, yy, zz, Tile.tallgrass.id, TallGrass.TALL_GRASS);
              } else if (random.nextInt(3) !== 0) {
                level.setTile(xx, yy, zz, Tile.flower.id);
              } else {
                level.setTile(xx, yy, zz, Tile.rose.id);
              }
            }
          }
        }
        itemInstance.count--;
        return true;
      }
    }
    return false;
  }

  override interactEnemy(itemInstance: ItemInstance, mob: Mob): void {
    if (mob.getEntityTypeId() === MobTypes.Sheep) {
      const sheep = mob as Sheep;
      const newColor = ClothTile.getTileDataForItemAuxValue(itemInstance.getAuxValue());
      if (!sheep.isSheared() && sheep.getColor() !== newColor) {
        sheep.setColor(newColor);
        itemInstance.count--;
      }
    }
  }
}
