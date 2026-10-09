/**
 * 1:1 移植自 src/world/level/biome/Biome.h 与 Biome.cpp（S4）。替换原来的 FORWARD-DECL(Biome)。
 *
 * 【注册表】initBiomes 由 BiomeInclude.ts 注入子类构造器调用（与 Tile、Material 同一模式），本文件不 import 子类。
 *
 * 【三档规则】_getBiome / getBiome / recalc 决定世界生成时每一列用哪个生物群系，属于“种子 → 世界”的链，
 *   按 C++ 的 float 语义逐位计算：参数与中间结果 fround，比较用 float 常量（例如 0.95f 比 0.95 略小，
 *   直接和 double 比较会在边界上选错群系）。天空颜色、草色只影响画面，按 JS 数值计算。
 *
 * getTreeFeature、getGrassFeature 与子类的重写在“地物生成”这一步移植。
 * 【DEFERRED】recalc 里把沙漠、冰原的地表换成沙子的两行：sand 未注册。移植 HeavyTile（沙子）时恢复。
 */
import type { Random } from '@mcpe/util';
import { TallGrass } from '../tile/TallGrass';
import type { Feature } from '../levelgen/feature/Feature';
import { TreeFeature } from '../levelgen/feature/TreeFeature';
import { TallgrassFeature } from '../levelgen/feature/TallgrassFeature';
import { LOGE } from '@mcpe/platform';
import { Color, f2i, Mth, WeighedRandomItem } from '@mcpe/util';
import { MobTypes } from '../../entity/EntityTypes';
import { MobCategory } from '../../entity/MobCategory';
import { unregistered } from '../../Unregistered';
import { GrassColor } from '../GrassColor';
import { Tile } from '../tile/Tile';

const f = Math.fround;

/** C++ 的嵌套类 Biome::MobSpawnerData（也可用 Biome.MobSpawnerData 取到） */
export class MobSpawnerData extends WeighedRandomItem {
  mobClassId: number;
  minCount: number;
  maxCount: number;

  constructor();
  constructor(mobClassId: number, probabilityWeight: number, minCount: number, maxCount: number);
  constructor(
    mobClassId?: number,
    probabilityWeight?: number,
    minCount?: number,
    maxCount?: number,
  ) {
    super(probabilityWeight);
    this.mobClassId = mobClassId ?? 0;
    this.minCount = minCount ?? 0;
    this.maxCount = maxCount ?? 0;
  }
}

export type MobList = MobSpawnerData[];

type MobSpawnerDataT = MobSpawnerData;
type MobListT = MobList;

/** initBiomes 需要的子类构造器，由 BiomeInclude.ts 传入（只写构造签名，不依赖子类文件） */
export interface BiomeClasses {
  readonly RainforestBiome: new () => Biome;
  readonly SwampBiome: new () => Biome;
  readonly ForestBiome: new () => Biome;
  readonly FlatBiome: new () => Biome;
  readonly TaigaBiome: new () => Biome;
}

export class Biome {
  static readonly MobSpawnerData = MobSpawnerData;

  // C++ 初值为 NULL：这里用访问即报错的哨兵代替（见 Unregistered.ts），initBiomes 后全部是真正的群系
  static rainForest: Biome = unregistered<Biome>('Biome', 'rainForest');
  static swampland: Biome = unregistered<Biome>('Biome', 'swampland');
  static seasonalForest: Biome = unregistered<Biome>('Biome', 'seasonalForest');
  static forest: Biome = unregistered<Biome>('Biome', 'forest');
  static savanna: Biome = unregistered<Biome>('Biome', 'savanna');
  static shrubland: Biome = unregistered<Biome>('Biome', 'shrubland');
  static taiga: Biome = unregistered<Biome>('Biome', 'taiga');
  static desert: Biome = unregistered<Biome>('Biome', 'desert');
  static plains: Biome = unregistered<Biome>('Biome', 'plains');
  static iceDesert: Biome = unregistered<Biome>('Biome', 'iceDesert');
  static tundra: Biome = unregistered<Biome>('Biome', 'tundra');

  protected static _emptyMobList: MobList = [];
  static defaultTotalEnemyWeight = 0;
  static defaultTotalFriendlyWeight = 0;
  private static map: Biome[] = new Array<Biome>(64 * 64);

  name = '';
  /** C++ 没有初始化 color、temperature、downfall（未定义值）；这里取 0 */
  color = 0;
  topMaterial: number; // char
  material: number; // char
  leafColor = 0x4ee031;
  temperature = 0;
  downfall = 0;

  protected _enemies: MobList = [];
  protected _friendlies: MobList = [];
  protected _waterFriendlies: MobList = [];

  protected constructor() {
    this.topMaterial = Tile.grass.id;
    this.material = Tile.dirt.id;
    this._friendlies.push(new MobSpawnerData(MobTypes.Sheep, 12, 2, 3));
    this._friendlies.push(new MobSpawnerData(MobTypes.Pig, 10, 1, 3));
    this._friendlies.push(new MobSpawnerData(MobTypes.Chicken, 10, 2, 4));
    this._friendlies.push(new MobSpawnerData(MobTypes.Cow, 8, 2, 3));
    this._enemies.push(new MobSpawnerData(MobTypes.Spider, 8, 2, 3));
    this._enemies.push(new MobSpawnerData(MobTypes.Zombie, 12, 2, 4));
    this._enemies.push(new MobSpawnerData(MobTypes.Skeleton, 6, 1, 3));
    this._enemies.push(new MobSpawnerData(MobTypes.Creeper, 4, 1, 1));
    Biome.defaultTotalEnemyWeight = 0;
    for (const it of this._enemies) Biome.defaultTotalEnemyWeight += it.randomWeight;
    Biome.defaultTotalFriendlyWeight = 0;
    for (const it of this._friendlies) Biome.defaultTotalFriendlyWeight += it.randomWeight;
  }

  protected setName(name: string): Biome {
    this.name = name;
    return this;
  }

  protected setLeafColor(leafColor: number): Biome {
    this.leafColor = leafColor;
    return this;
  }

  protected setColor(color: number): Biome {
    this.color = color;
    return this;
  }

  protected setSnowCovered(): Biome {
    return this;
  }

  protected clearMobs(friendlies = true, waterFriendlies = true, enemies = true): Biome {
    if (friendlies) this._friendlies.length = 0;
    if (waterFriendlies) this._waterFriendlies.length = 0;
    if (enemies) this._enemies.length = 0;
    return this;
  }

  static recalc(): void {
    for (let a = 0; a < 64; a++) {
      for (let b = 0; b < 64; b++) {
        Biome.map[a + b * 64] = Biome._getBiome(f(a / 63), f(b / 63));
      }
    }
    Biome.desert.topMaterial = Biome.desert.material = (Tile.sand.id << 24) >> 24; // (char) Tile::sand->id
    Biome.iceDesert.topMaterial = Biome.iceDesert.material = (Tile.sand.id << 24) >> 24;
  }

  /** 由 BiomeInclude.ts 的 initBiomes() 调用；要在 initTiles 之后（构造函数读 Tile.grass、Tile.dirt） */
  static initBiomes(c: BiomeClasses): void {
    Biome.rainForest = new c.RainforestBiome()
      .setColor(0x08fa36)
      .setName('Rainforest')
      .setLeafColor(0x1ff458);
    Biome.swampland = new c.SwampBiome()
      .setColor(0x07f9b2)
      .setName('Swampland')
      .setLeafColor(0x8baf48);
    Biome.seasonalForest = new Biome().setColor(0x9be023).setName('Seasonal Forest');
    Biome.forest = new c.ForestBiome().setColor(0x056621).setName('Forest').setLeafColor(0x4eba31);
    Biome.savanna = new c.FlatBiome().setColor(0xd9e023).setName('Savanna');
    Biome.shrubland = new Biome().setColor(0xa1ad20).setName('Shrubland');
    Biome.taiga = new c.TaigaBiome()
      .setColor(0x2eb153)
      .setName('Taiga')
      .setSnowCovered()
      .setLeafColor(0x7bb731);
    Biome.desert = new c.FlatBiome()
      .setColor(0xfa9418)
      .clearMobs(true, true, false)
      .setName('Desert');
    Biome.plains = new c.FlatBiome().setColor(0xffd910).setName('Plains');
    Biome.iceDesert = new c.FlatBiome()
      .setColor(0xffed93)
      .clearMobs(true, false, false)
      .setName('Ice Desert')
      .setSnowCovered()
      .setLeafColor(0xc4d339);
    Biome.tundra = new Biome()
      .setColor(0x57ebf9)
      .setName('Tundra')
      .setSnowCovered()
      .setLeafColor(0xc4d339);
    Biome.recalc();
  }

  static teardownBiomes(): void {
    for (const name of [
      'rainForest',
      'swampland',
      'seasonalForest',
      'forest',
      'savanna',
      'shrubland',
      'taiga',
      'desert',
      'plains',
      'iceDesert',
      'tundra',
    ] as const)
      Biome[name] = unregistered<Biome>('Biome', name);
  }

  /** C++ `Feature* Biome::getTreeFeature(Random*)`：原样保留——先取一次 nextInt(10)（原来返回 BasicTree 的分支被注释掉，成了空的 if） */
  getTreeFeature(random: Random): Feature | null {
    if (random.nextInt(10) === 0) {
      // return new BasicTree(false); // temporarily disabled（C++ 原注释）
    }
    return new TreeFeature(false);
  }

  /** C++ `Feature* Biome::getGrassFeature(Random*)` */
  getGrassFeature(_random: Random): Feature | null {
    return new TallgrassFeature(Tile.tallgrass.id, TallGrass.TALL_GRASS);
  }

  static getBiome(temperature: number, downfall: number): Biome {
    const a = f2i(f(f(temperature) * 63));
    const b = f2i(f(f(downfall) * 63));
    return Biome.map[a + b * 64]!;
  }

  static _getBiome(temperature: number, downfall: number): Biome {
    temperature = f(temperature);
    downfall = f(f(downfall) * temperature);
    if (temperature < f(0.1)) {
      return Biome.tundra;
    } else if (downfall < f(0.2)) {
      if (temperature < f(0.5)) {
        return Biome.tundra;
      } else if (temperature < f(0.95)) {
        return Biome.savanna;
      } else {
        return Biome.desert;
      }
    } else if (downfall > f(0.5) && temperature < f(0.7)) {
      return Biome.swampland;
    } else if (temperature < f(0.5)) {
      return Biome.taiga;
    } else if (temperature < f(0.97)) {
      if (downfall < f(0.35)) {
        return Biome.shrubland;
      } else {
        return Biome.forest;
      }
    } else {
      if (downfall < f(0.45)) {
        return Biome.plains;
      } else if (downfall < f(0.9)) {
        return Biome.seasonalForest;
      } else {
        return Biome.rainForest;
      }
    }
  }

  adjustScale(scale: number): number {
    return scale;
  }

  adjustDepth(depth: number): number {
    return depth;
  }

  getSkyColor(temp: number): number {
    temp /= 3;
    if (temp < -1) temp = -1;
    if (temp > 1) temp = 1;
    return Color.getHSBColor(224 / 360.0 - temp * 0.05, 0.5 + temp * 0.1, 1.0).getRGB();
  }

  getGrassColor(): number {
    const temp = Mth.clamp(this.getTemperature(), 0.0, 1.0);
    const rain = Mth.clamp(this.getDownfall(), 0.0, 1.0);
    return GrassColor.get(temp, rain);
  }

  getDownfall(): number {
    return this.downfall;
  }

  getTemperature(): number {
    return this.temperature;
  }

  getMobs(category: MobCategory): MobList {
    if (category === MobCategory.monster) return this._enemies;
    if (category === MobCategory.creature) return this._friendlies;
    if (category === MobCategory.waterCreature) return this._waterFriendlies;
    LOGE('Unknown MobCategory!');
    return Biome._emptyMobList;
  }

  getCreatureProbability(): number {
    return f(0.08);
  }

  /** ADAPTED(Test)：只给测试用，C++ 的 map 是 private */
  static _mapForTest(): readonly Biome[] {
    return Biome.map;
  }
}

// C++ 的嵌套类型：同名命名空间只放类型别名，让 Biome::MobList、Biome::MobSpawnerData 在 TS 里照样写成 Biome.MobList、Biome.MobSpawnerData（作类型用）；作值用走类上的同名静态属性。
// eslint-disable-next-line @typescript-eslint/no-namespace -- 只含类型，编译后不产生任何代码
export declare namespace Biome {
  type MobSpawnerData = MobSpawnerDataT;
  type MobList = MobListT;
}
