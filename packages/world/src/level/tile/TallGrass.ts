import { Bush } from './Bush';
import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { Item } from '../../item/Item';
import { ItemInstance } from '../../item/ItemInstance';
import { GrassColor } from '../GrassColor';
import { FoliageColor } from '../FoliageColor';
import type { LevelSource } from '../LevelSource';
import type { Random } from '@mcpe/util';
import type { Player } from '../..';

export class TallGrass extends Bush {
  static readonly DEAD_SHRUB = 0;
  static readonly TALL_GRASS = 1;
  static readonly FERN = 3;

  /** C++ TallGrass::TallGrass(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.replaceable_plant);
    const ss = 0.4;
    this.setShape(0.5 - ss, 0, 0.5 - ss, 0.5 + ss, 0.8, 0.5 + ss);
  }

  /** C++ TallGrass::getTexture(int face, int data) */
  override getTexture(face: number): number;
  override getTexture(face: number, data: number): number;
  override getTexture(level: LevelSource, x: number, y: number, z: number, face: number): number;
  override getTexture(
    a: number | LevelSource,
    b?: number,
    c?: number,
    d?: number,
    e?: number,
  ): number {
    if (b === TallGrass.TALL_GRASS) return this.tex;
    if (b === TallGrass.FERN) return this.tex + 16 + 1;
    if (b === TallGrass.DEAD_SHRUB) return this.tex + 16;
    return this.tex;
  }

  /** C++ TallGrass::getColor() */
  getColorDefault(): number {
    const temp = 0.5;
    const rain = 1.0;
    if (GrassColor.useTint) {
      return GrassColor.get(temp, rain);
    }
    return 0x339933;
  }

  /** C++ TallGrass::getColor(int auxData) */
  getColorForData(auxData: number): number {
    // C++ 里有一个空 if: if(auxData == DEAD_SHRUB); 无操作，省略
    if (!FoliageColor.useTint && auxData === TallGrass.DEAD_SHRUB) {
      return 0xffffff;
    }
    return FoliageColor.getDefaultColor();
  }

  /** C++ TallGrass::getColor(LevelSource*, int, int, int) */
  override getColor(level: LevelSource, x: number, y: number, z: number): number {
    const d = level.getData(x, y, z);
    // C++ 里有一个空 if: if (d == DEAD_SHRUB); 无操作，省略

    const biomeSource = level.getBiomeSource();
    biomeSource.getBiomeBlock(x, z, 1, 1);

    const temp = biomeSource.temperatures![0]!;
    const rain = biomeSource.downfalls !== null ? biomeSource.downfalls[0] : 0;

    if (!GrassColor.useTint && d === TallGrass.DEAD_SHRUB) {
      return 0xffffff;
    }
    if (GrassColor.useTint) {
      return GrassColor.get(temp, rain!);
    }
    return 0x339933;
  }

  /** C++ TallGrass::getResource(int data, Random* random) */
  override getResource(_data: number, random: Random): number {
    if (random.nextInt(8) === 0) {
      return Item.seeds_wheat.id;
    }
    return -1;
  }

  /** C++ TallGrass::playerDestroy(Level*, Player*, int, int, int, int) */
  override playerDestroy(
    level: Level,
    player: Player,
    x: number,
    y: number,
    z: number,
    data: number,
  ): void {
    const selected = player.getSelectedItem();
    if (!level.isClientSide && selected !== null && selected.id === Item.shears.id) {
      const itemInstance = new ItemInstance(Tile.tallgrass, 1, data);
      this.popResource(level, x, y, z, itemInstance);
    } else {
      super.playerDestroy(level, player, x, y, z, data);
    }
  }
}
