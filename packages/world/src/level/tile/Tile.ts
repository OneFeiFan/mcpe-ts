/**
 * 1:1 移植自 src/world/level/tile/Tile.h 与 Tile.cpp（S3）。
 *
 * 【注册表】initTiles 由 TileInclude.ts 注入子类构造器调用（与 MaterialInclude 同一模式，手册 R7）：
 *   本文件只 `import type` 自身之外的方块类型，不 import 任何子类文件，避免 ES 模块循环依赖。
 *   C++ 的 89 条方块赋值中注册 88 条（S3 的 27 条 + S11 的 48 条 + S12 的 13 条）；NetherReactor 一条在 S12 阶段 C 后半补上，标 DEFERRED(Tile)；
 *   8 条特殊 TileItem 全部注册。
 *   未注册的静态字段是“访问即报错”的哨兵（见 Unregistered.ts），相当于 C++ 的 NULL，但报错信息写明是哪个字段。
 *   与手册初版相比多注册了 topSnow：本文件的 shouldRenderFace 会直接读 topSnow.id，不注册就会空指针。
 *
 * 【C++ 重载的 virtual】TS 同名方法只能有一个实现。getTexture、mayPick、mayPlace、getSignal 这四组重载写成：
 *   - 同名的分派方法，调用处与 C++ 完全一样：tile.getTexture(face)、tile.getTexture(level, x, y, z, face)；
 *   - 每个 C++ 重载对应一个按区分参数命名的实现方法（R10 情形 B），子类重写 C++ 的哪个重载，就重写对应的实现方法：
 *       getTexture(int face)                                 → getTextureForFace
 *       getTexture(int face, int data)                       → getTextureForData
 *       getTexture(LevelSource*, int x, int y, int z, face)  → getTextureAt
 *       mayPick()                → mayPickBasic        mayPick(int data, bool liquid)                → mayPickWithData
 *       mayPlace(level, x, y, z) → mayPlaceAt       mayPlace(level, x, y, z, unsigned char face)  → mayPlaceOnFace
 *       getSignal(level, x, y, z) → getSignalAt     getSignal(level, x, y, z, int dir)           → getSignalInDirection
 *   分派方法本身不要在子类里重写。
 *
 * 【可见性】C++ 的 protected 构造器方法（setDestroyTime 等）与 private 的 init、setCategory 在 TS 里保持同样的可见性；
 *   initTiles 是 Tile 的静态方法，所以能调用它们。
 *
 * 【S11 阶段 A】签名含 Player、Entity、Mob 的 virtual 与 getName 已补全（参数类型是前向声明）；spawnResources（两个重载合并为带默认参数的一个）
 *   与 popResource 保留全部随机数调用；生成掉落物实体在 S12 阶段 C 恢复（经 Entity.ts 的 createItemEntity）。
 *
 * 【数值】按手册三档规则属于“结构一致、数值放宽”：形状、摧毁时间等按 JS 数值计算，不做 float 舍入。
 */
import { LOGE, LOGW } from '@mcpe/platform';
import type { AuxDataTileItem } from '../../item/AuxDataTileItem';
import type { BookshelfTile } from './BookshelfTile';
import type { Bush } from './Bush';
import type { CarriedTile } from './CarriedTile';
import type { ClayTile } from './ClayTile';
import type { ClothTile } from './ClothTile';
import type { ClothTileItem } from '../../item/ClothTileItem';
import type { FenceTile } from './FenceTile';
import type { GlassTile } from './GlassTile';
import type { GravelTile } from './GravelTile';
import type { HeavyTile } from './HeavyTile';
import type { IceTile } from './IceTile';
import type { LadderTile } from './LadderTile';
import type { LightGemTile } from './LightGemTile';
import type { MelonTile } from './MelonTile';
import type { MetalTile } from './MetalTile';
import type { MultiTextureTile } from './MultiTextureTile';
import type { Mushroom } from './Mushroom';
import type { ObsidianTile } from './ObsidianTile';
import type { OreTile } from './OreTile';
import type { QuartzBlockTile } from './QuartzBlockTile';
import type { RedStoneOreTile } from './RedStoneOreTile';
import type { ReedTile } from './ReedTile';
import type { SandStoneTile } from './SandStoneTile';
import type { Sapling } from './Sapling';
import type { SaplingTileItem } from '../../item/SaplingTileItem';
import type { SignTile } from './SignTile';
import type { SnowTile } from './SnowTile';
import type { StemTile } from './StemTile';
import type { ThinFenceTile } from './ThinFenceTile';
import type { TntTile } from './TntTile';
import type { TorchTile } from './TorchTile';
import type { TrapDoorTile } from './TrapDoorTile';
import type { TreeTile } from './TreeTile';
import type { CactusTile } from './CactusTile';
import type { ChestTile } from './ChestTile';
import type { CropTile } from './CropTile';
import type { DoorTile } from './DoorTile';
import type { FenceGateTile } from './FenceGateTile';
import type { FurnaceTile } from './FurnaceTile';
import type { StairTile } from './StairTile';
import type { StonecutterTile } from './StonecutterTile';
import type { TallGrass } from './TallGrass';
import type { WebTile } from './WebTile';
import type { WorkbenchTile } from './WorkbenchTile';
import type { NetherReactor } from './NetherReactor';
import { TileEntityType } from './entity/TileEntity';
import type { Random } from '@mcpe/util';
import { Facing } from '../../Facing';
import { unregistered } from '../../Unregistered';
import { Item } from '../../item/Item';
import { ItemCategory } from '../../item/ItemCategory';
import { AABB } from '../../phys/AABB';
import { HitResult } from '../../phys/HitResult';
import { Vec3 } from '../../phys/Vec3';
import { Level } from '../Level';
import { GameType } from '../LevelSettings';
import type { Entity } from '../../entity/Entity';
import type { Mob } from '../../entity/Mob';
import type { Player } from '../../entity/player/Player';
import { ItemInstance } from '../../item/ItemInstance';
import { createItemEntity } from '../../entity/Entity';
import { LevelConstants } from '../LevelConstants';
import type { LevelSource } from '../LevelSource';
import { Material } from '../material/Material';
import type { FireTile } from './FireTile';
import type { LeafTile } from './LeafTile';
import { I18n } from '@mcpe/locale';

/** C++ 的嵌套类 Tile::SoundType（也可用 Tile.SoundType 取到） */
export class SoundType {
  readonly volume: number;
  readonly pitch: number;
  readonly breakSound: string;
  readonly stepSound: string;

  constructor(name: string, volume: number, pitch: number);
  constructor(name: string, breakSound: string, volume: number, pitch: number);
  constructor(name: string, a: number | string, b: number, c?: number) {
    if (typeof a === 'number') {
      this.volume = a;
      this.pitch = b;
      this.breakSound = 'step.' + name;
    } else {
      this.volume = b;
      this.pitch = c!;
      this.breakSound = a;
    }
    this.stepSound = 'step.' + name;
  }

  getVolume(): number {
    return this.volume;
  }

  getPitch(): number {
    return this.pitch;
  }

  getBreakSound(): string {
    return this.breakSound;
  }

  getStepSound(): string {
    return this.stepSound;
  }
}

/**
 * initTiles 需要的子类与物品类构造器，由 TileInclude.ts 传入。
 * 只写构造签名（结构化类型），所以本文件不依赖任何子类文件。
 */
export interface TileClasses {
  readonly StoneTile: new (id: number, tex: number) => Tile;
  readonly GrassTile: new (id: number) => Tile;
  readonly DirtTile: new (id: number, tex: number) => Tile;
  readonly LiquidTileDynamic: new (id: number, material: Material) => Tile;
  readonly LiquidTileStatic: new (id: number, material: Material) => Tile;
  readonly LeafTile: new (id: number, tex: number) => Tile;
  readonly BedTile: new (id: number) => Tile;
  readonly StoneSlabTile: new (id: number, fullSize: boolean) => Tile;
  readonly FireTile: new (id: number, tex: number) => Tile;
  readonly FarmTile: new (id: number) => Tile;
  readonly InvisibleTile: new (id: number, tex: number, material: Material) => Tile;
  readonly TopSnowTile: new (id: number, tex: number) => Tile;
  readonly TileItem: new (id: number) => Item;
  readonly StoneSlabTileItem: new (id: number) => Item;
  readonly LeafTileItem: new (id: number) => Item;
  // S12 阶段 C 注册的类
  readonly NetherReactor: typeof NetherReactor;
  readonly CactusTile: typeof CactusTile;
  readonly ChestTile: typeof ChestTile;
  readonly CropTile: typeof CropTile;
  readonly DoorTile: typeof DoorTile;
  readonly FenceGateTile: typeof FenceGateTile;
  readonly FurnaceTile: typeof FurnaceTile;
  readonly StairTile: typeof StairTile;
  readonly StonecutterTile: typeof StonecutterTile;
  readonly TallGrass: typeof TallGrass;
  readonly WebTile: typeof WebTile;
  readonly WorkbenchTile: typeof WorkbenchTile;
  // S11 阶段 C 注册的类（import type，不形成运行时循环）
  readonly AuxDataTileItem: typeof AuxDataTileItem;
  readonly BookshelfTile: typeof BookshelfTile;
  readonly Bush: typeof Bush;
  readonly CarriedTile: typeof CarriedTile;
  readonly ClayTile: typeof ClayTile;
  readonly ClothTile: typeof ClothTile;
  readonly ClothTileItem: typeof ClothTileItem;
  readonly FenceTile: typeof FenceTile;
  readonly GlassTile: typeof GlassTile;
  readonly GravelTile: typeof GravelTile;
  readonly HeavyTile: typeof HeavyTile;
  readonly IceTile: typeof IceTile;
  readonly LadderTile: typeof LadderTile;
  readonly LightGemTile: typeof LightGemTile;
  readonly MelonTile: typeof MelonTile;
  readonly MetalTile: typeof MetalTile;
  readonly MultiTextureTile: typeof MultiTextureTile;
  readonly Mushroom: typeof Mushroom;
  readonly ObsidianTile: typeof ObsidianTile;
  readonly OreTile: typeof OreTile;
  readonly QuartzBlockTile: typeof QuartzBlockTile;
  readonly RedStoneOreTile: typeof RedStoneOreTile;
  readonly ReedTile: typeof ReedTile;
  readonly SandStoneTile: typeof SandStoneTile;
  readonly Sapling: typeof Sapling;
  readonly SaplingTileItem: typeof SaplingTileItem;
  readonly SignTile: typeof SignTile;
  readonly SnowTile: typeof SnowTile;
  readonly StemTile: typeof StemTile;
  readonly ThinFenceTile: typeof ThinFenceTile;
  readonly TntTile: typeof TntTile;
  readonly TorchTile: typeof TorchTile;
  readonly TrapDoorTile: typeof TrapDoorTile;
  readonly TreeTile: typeof TreeTile;
}

/** Tile.cpp:61 的文件内常量（SandStoneTile 用） */
const SANDSTONE_TEXTURES: readonly number[] = [0 + 16 * 12, 5 + 16 * 14, 6 + 16 * 14];
const SANDSTONE_TEXTURE_COUNT = 3;
/** Tile.cpp:137 的文件内常量（MultiTextureTile 用） */
const STONE_BRICK_TEXTURES: readonly number[] = [6 + 16 * 3, 4 + 16 * 6, 5 + 16 * 6];
const STONE_BRICK_TEXTURE_COUNT = 3;

type SoundTypeT = SoundType;

export class Tile {
  private static readonly TILE_DESCRIPTION_PREFIX = 'tile.';

  static readonly SoundType = SoundType;
  static readonly SOUND_NORMAL = new SoundType('stone', 1, 1);
  static readonly SOUND_WOOD = new SoundType('wood', 1, 1);
  static readonly SOUND_GRAVEL = new SoundType('gravel', 1, 1);
  static readonly SOUND_GRASS = new SoundType('grass', 0.5, 1);
  static readonly SOUND_STONE = new SoundType('stone', 1, 1);
  static readonly SOUND_METAL = new SoundType('stone', 1, 1.5);
  static readonly SOUND_GLASS = new SoundType('stone', 'random.glass', 1, 1);
  static readonly SOUND_CLOTH = new SoundType('cloth', 1, 1);
  static readonly SOUND_SAND = new SoundType('sand', 'step.gravel', 1, 1); // 未定义 PRE_ANDROID23 的分支
  static readonly SOUND_SILENT = new SoundType('', 0, 0);

  static readonly SHAPE_INVISIBLE = -1;
  static readonly SHAPE_BLOCK = 0;
  static readonly SHAPE_CROSS_TEXTURE = 1;
  static readonly SHAPE_TORCH = 2;
  static readonly SHAPE_FIRE = 3;
  static readonly SHAPE_WATER = 4;
  static readonly SHAPE_RED_DUST = 5;
  static readonly SHAPE_ROWS = 6;
  static readonly SHAPE_DOOR = 7;
  static readonly SHAPE_LADDER = 8;
  static readonly SHAPE_RAIL = 9;
  static readonly SHAPE_STAIRS = 10;
  static readonly SHAPE_FENCE = 11;
  static readonly SHAPE_LEVER = 12;
  static readonly SHAPE_CACTUS = 13;
  static readonly SHAPE_BED = 14;
  static readonly SHAPE_DIODE = 15;
  static readonly SHAPE_IRON_FENCE = 18;
  static readonly SHAPE_STEM = 19;
  static readonly SHAPE_FENCE_GATE = 21;
  static readonly SHAPE_ENTITYTILE_ANIMATED = 22;

  static readonly NUM_BLOCK_TYPES = 256;
  static readonly tiles: (Tile | null)[] = new Array<Tile | null>(Tile.NUM_BLOCK_TYPES).fill(null);
  static readonly sendTileData: boolean[] = new Array<boolean>(Tile.NUM_BLOCK_TYPES).fill(false);
  static readonly shouldTick: boolean[] = new Array<boolean>(Tile.NUM_BLOCK_TYPES).fill(false);
  static readonly solid: boolean[] = new Array<boolean>(Tile.NUM_BLOCK_TYPES).fill(false);
  static readonly isEntityTile: boolean[] = new Array<boolean>(Tile.NUM_BLOCK_TYPES).fill(false);
  static readonly lightBlock = new Int32Array(Tile.NUM_BLOCK_TYPES);
  /** C++ 初值 {true, false}：只有 0 号（空气）为 true */
  static readonly translucent: boolean[] = [
    true,
    ...new Array<boolean>(Tile.NUM_BLOCK_TYPES - 1).fill(false),
  ];
  static readonly lightEmission = new Int32Array(Tile.NUM_BLOCK_TYPES);

  // ---- 118 个静态方块字段。C++ 初值为 NULL：这里用 Unregistered.ts 的哨兵代替（访问即报错，信息写明字段名），
  //      initTiles 里移植的那些会被覆盖成真正的方块，DEFERRED 的保持哨兵
  static rock: Tile = unregistered<Tile>('Tile', 'rock');
  static grass: Tile = unregistered<Tile>('Tile', 'grass');
  static dirt: Tile = unregistered<Tile>('Tile', 'dirt');
  static stoneBrick: Tile = unregistered<Tile>('Tile', 'stoneBrick');
  static wood: Tile = unregistered<Tile>('Tile', 'wood');
  static sapling: Tile = unregistered<Tile>('Tile', 'sapling');
  static unbreakable: Tile = unregistered<Tile>('Tile', 'unbreakable');
  static water: Tile = unregistered<Tile>('Tile', 'water');
  static calmWater: Tile = unregistered<Tile>('Tile', 'calmWater');
  static lava: Tile = unregistered<Tile>('Tile', 'lava');
  static calmLava: Tile = unregistered<Tile>('Tile', 'calmLava');
  static sand: Tile = unregistered<Tile>('Tile', 'sand');
  static gravel: Tile = unregistered<Tile>('Tile', 'gravel');
  static goldOre: Tile = unregistered<Tile>('Tile', 'goldOre');
  static ironOre: Tile = unregistered<Tile>('Tile', 'ironOre');
  static coalOre: Tile = unregistered<Tile>('Tile', 'coalOre');
  static treeTrunk: Tile = unregistered<Tile>('Tile', 'treeTrunk');
  static leaves: LeafTile = unregistered<LeafTile>('Tile', 'leaves');
  static sponge: Tile = unregistered<Tile>('Tile', 'sponge');
  static web: Tile = unregistered<Tile>('Tile', 'web');
  static glass: Tile = unregistered<Tile>('Tile', 'glass');
  static thinGlass: Tile = unregistered<Tile>('Tile', 'thinGlass');
  static lapisOre: Tile = unregistered<Tile>('Tile', 'lapisOre');
  static lapisBlock: Tile = unregistered<Tile>('Tile', 'lapisBlock');
  static dispenser: Tile = unregistered<Tile>('Tile', 'dispenser');
  static sandStone: Tile = unregistered<Tile>('Tile', 'sandStone');
  static musicBlock: Tile = unregistered<Tile>('Tile', 'musicBlock');
  static bed: Tile = unregistered<Tile>('Tile', 'bed');
  static unused_27: Tile = unregistered<Tile>('Tile', 'unused_27');
  static unused_28: Tile = unregistered<Tile>('Tile', 'unused_28');
  static unused_29: Tile = unregistered<Tile>('Tile', 'unused_29');
  static unused_30: Tile = unregistered<Tile>('Tile', 'unused_30');
  static tallgrass: Tile = unregistered<Tile>('Tile', 'tallgrass');
  static unused_32: Tile = unregistered<Tile>('Tile', 'unused_32');
  static unused_33: Tile = unregistered<Tile>('Tile', 'unused_33');
  static unused_34: Tile = unregistered<Tile>('Tile', 'unused_34');
  static unused_36: Tile = unregistered<Tile>('Tile', 'unused_36');
  static cloth: Tile = unregistered<Tile>('Tile', 'cloth');
  static flower: Tile = unregistered<Tile>('Tile', 'flower');
  static rose: Tile = unregistered<Tile>('Tile', 'rose');
  static mushroom1: Tile = unregistered<Tile>('Tile', 'mushroom1');
  static mushroom2: Tile = unregistered<Tile>('Tile', 'mushroom2');
  static goldBlock: Tile = unregistered<Tile>('Tile', 'goldBlock');
  static ironBlock: Tile = unregistered<Tile>('Tile', 'ironBlock');
  static stoneSlab: Tile = unregistered<Tile>('Tile', 'stoneSlab');
  static stoneSlabHalf: Tile = unregistered<Tile>('Tile', 'stoneSlabHalf');
  static redBrick: Tile = unregistered<Tile>('Tile', 'redBrick');
  static tnt: Tile = unregistered<Tile>('Tile', 'tnt');
  static bookshelf: Tile = unregistered<Tile>('Tile', 'bookshelf');
  static mossStone: Tile = unregistered<Tile>('Tile', 'mossStone');
  static obsidian: Tile = unregistered<Tile>('Tile', 'obsidian');
  static torch: Tile = unregistered<Tile>('Tile', 'torch');
  static fire: FireTile = unregistered<FireTile>('Tile', 'fire');
  static mobSpawner: Tile = unregistered<Tile>('Tile', 'mobSpawner');
  static stairs_wood: Tile = unregistered<Tile>('Tile', 'stairs_wood');
  static chest: Tile = unregistered<Tile>('Tile', 'chest');
  static redStoneDust: Tile = unregistered<Tile>('Tile', 'redStoneDust');
  static emeraldOre: Tile = unregistered<Tile>('Tile', 'emeraldOre');
  static emeraldBlock: Tile = unregistered<Tile>('Tile', 'emeraldBlock');
  static workBench: Tile = unregistered<Tile>('Tile', 'workBench');
  static stonecutterBench: Tile = unregistered<Tile>('Tile', 'stonecutterBench');
  static crops: Tile = unregistered<Tile>('Tile', 'crops');
  static farmland: Tile = unregistered<Tile>('Tile', 'farmland');
  static furnace: Tile = unregistered<Tile>('Tile', 'furnace');
  static furnace_lit: Tile = unregistered<Tile>('Tile', 'furnace_lit');
  static sign: Tile = unregistered<Tile>('Tile', 'sign');
  static door_wood: Tile = unregistered<Tile>('Tile', 'door_wood');
  static ladder: Tile = unregistered<Tile>('Tile', 'ladder');
  static rail: Tile = unregistered<Tile>('Tile', 'rail');
  static stairs_stone: Tile = unregistered<Tile>('Tile', 'stairs_stone');
  static wallSign: Tile = unregistered<Tile>('Tile', 'wallSign');
  static lever: Tile = unregistered<Tile>('Tile', 'lever');
  static pressurePlate_stone: Tile = unregistered<Tile>('Tile', 'pressurePlate_stone');
  static door_iron: Tile = unregistered<Tile>('Tile', 'door_iron');
  static pressurePlate_wood: Tile = unregistered<Tile>('Tile', 'pressurePlate_wood');
  static redStoneOre: Tile = unregistered<Tile>('Tile', 'redStoneOre');
  static redStoneOre_lit: Tile = unregistered<Tile>('Tile', 'redStoneOre_lit');
  static notGate_off: Tile = unregistered<Tile>('Tile', 'notGate_off');
  static notGate_on: Tile = unregistered<Tile>('Tile', 'notGate_on');
  static button: Tile = unregistered<Tile>('Tile', 'button');
  static topSnow: Tile = unregistered<Tile>('Tile', 'topSnow');
  static ice: Tile = unregistered<Tile>('Tile', 'ice');
  static snow: Tile = unregistered<Tile>('Tile', 'snow');
  static cactus: Tile = unregistered<Tile>('Tile', 'cactus');
  static clay: Tile = unregistered<Tile>('Tile', 'clay');
  static reeds: Tile = unregistered<Tile>('Tile', 'reeds');
  static recordPlayer: Tile = unregistered<Tile>('Tile', 'recordPlayer');
  static fence: Tile = unregistered<Tile>('Tile', 'fence');
  static stairs_brick: Tile = unregistered<Tile>('Tile', 'stairs_brick');
  static fenceGate: Tile = unregistered<Tile>('Tile', 'fenceGate');
  static pumpkin: Tile = unregistered<Tile>('Tile', 'pumpkin');
  static hellRock: Tile = unregistered<Tile>('Tile', 'hellRock');
  static hellSand: Tile = unregistered<Tile>('Tile', 'hellSand');
  static lightGem: Tile = unregistered<Tile>('Tile', 'lightGem');
  static portalTile: Tile = unregistered<Tile>('Tile', 'portalTile');
  static litPumpkin: Tile = unregistered<Tile>('Tile', 'litPumpkin');
  static cake: Tile = unregistered<Tile>('Tile', 'cake');
  static diode_off: Tile = unregistered<Tile>('Tile', 'diode_off');
  static diode_on: Tile = unregistered<Tile>('Tile', 'diode_on');
  static trapdoor: Tile = unregistered<Tile>('Tile', 'trapdoor');
  static stoneBrickSmooth: Tile = unregistered<Tile>('Tile', 'stoneBrickSmooth');
  static grass_carried: Tile = unregistered<Tile>('Tile', 'grass_carried');
  static leaves_carried: LeafTile = unregistered<LeafTile>('Tile', 'leaves_carried');
  static melon: Tile = unregistered<Tile>('Tile', 'melon');
  static melonStem: Tile = unregistered<Tile>('Tile', 'melonStem');
  static netherReactor: Tile = unregistered<Tile>('Tile', 'netherReactor');
  static glowingObsidian: Tile = unregistered<Tile>('Tile', 'glowingObsidian');
  static stairs_stoneBrickSmooth: Tile = unregistered<Tile>('Tile', 'stairs_stoneBrickSmooth');
  static netherBrick: Tile = unregistered<Tile>('Tile', 'netherBrick');
  static netherrack: Tile = unregistered<Tile>('Tile', 'netherrack');
  static stairs_netherBricks: Tile = unregistered<Tile>('Tile', 'stairs_netherBricks');
  static stairs_sandStone: Tile = unregistered<Tile>('Tile', 'stairs_sandStone');
  static quartzBlock: Tile = unregistered<Tile>('Tile', 'quartzBlock');
  static stairs_quartz: Tile = unregistered<Tile>('Tile', 'stairs_quartz');
  static invisible_bedrock: Tile = unregistered<Tile>('Tile', 'invisible_bedrock');
  static info_updateGame1: Tile = unregistered<Tile>('Tile', 'info_updateGame1');
  static info_updateGame2: Tile = unregistered<Tile>('Tile', 'info_updateGame2');
  static info_reserved6: Tile = unregistered<Tile>('Tile', 'info_reserved6');

  protected static readonly RENDERLAYER_OPAQUE = 0;
  protected static readonly RENDERLAYER_ALPHATEST = 1;
  protected static readonly RENDERLAYER_BLEND = 2;

  /** 由 TileInclude.ts 的 initTiles() 调用；c 是全部已移植的子类构造器 */
  static initTiles(c: TileClasses): void {
    Tile.rock = new c.StoneTile(1, 1)
      .init()
      .setDestroyTime(1.5)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stone');
    Tile.grass = new c.GrassTile(2)
      .init()
      .setDestroyTime(0.6)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('grass');
    Tile.dirt = new c.DirtTile(3, 2)
      .init()
      .setDestroyTime(0.5)
      .setSoundType(Tile.SOUND_GRAVEL)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('dirt');
    Tile.stoneBrick = new Tile(4, 16, Material.stone)
      .init()
      .setDestroyTime(2.0)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stonebrick');
    Tile.wood = new Tile(5, 4, Material.wood)
      .init()
      .setDestroyTime(2.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('wood');
    Tile.sapling = new c.Sapling(6, 15)
      .init()
      .setDestroyTime(0.0)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('sapling');
    Tile.unbreakable = new Tile(7, 17, Material.stone)
      .init()
      .setDestroyTime(-1)
      .setExplodeable(6000000)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('bedrock');
    Tile.water = new c.LiquidTileDynamic(8, Material.water)
      .init()
      .setDestroyTime(100.0)
      .setLightBlock(3)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('water');
    Tile.calmWater = new c.LiquidTileStatic(9, Material.water)
      .init()
      .setDestroyTime(100.0)
      .setLightBlock(3)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('water');
    Tile.lava = new c.LiquidTileDynamic(10, Material.lava)
      .init()
      .setDestroyTime(0.0)
      .setLightEmission(1.0)
      .setLightBlock(255)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('lava');
    Tile.calmLava = new c.LiquidTileStatic(11, Material.lava)
      .init()
      .setDestroyTime(100.0)
      .setLightEmission(1.0)
      .setLightBlock(255)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('lava');
    Tile.sand = new c.HeavyTile(12, 18)
      .init()
      .setDestroyTime(0.5)
      .setSoundType(Tile.SOUND_SAND)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('sand');
    Tile.gravel = new c.GravelTile(13, 19)
      .init()
      .setDestroyTime(0.6)
      .setSoundType(Tile.SOUND_GRAVEL)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('gravel');
    Tile.goldOre = new c.OreTile(14, 32)
      .init()
      .setDestroyTime(3.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('oreGold');
    Tile.ironOre = new c.OreTile(15, 33)
      .init()
      .setDestroyTime(3.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('oreIron');
    Tile.coalOre = new c.OreTile(16, 34)
      .init()
      .setDestroyTime(3.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('oreCoal');
    Tile.treeTrunk = new c.TreeTile(17)
      .init()
      .setDestroyTime(2.0)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('log');
    Tile.leaves = new c.LeafTile(18, 4 + 3 * 16)
      .init()
      .setDestroyTime(0.2)
      .setLightBlock(1)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('leaves') as LeafTile;
    Tile.glass = new c.GlassTile(20, 49, Material.glass, false)
      .init()
      .setDestroyTime(0.3)
      .setSoundType(Tile.SOUND_GLASS)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('glass');
    Tile.lapisOre = new c.OreTile(21, 10 * 16)
      .init()
      .setDestroyTime(3.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('oreLapis');
    Tile.lapisBlock = new Tile(22, 9 * 16, Material.stone)
      .init()
      .setDestroyTime(3.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('blockLapis');
    Tile.sandStone = new c.SandStoneTile(24, SANDSTONE_TEXTURES, SANDSTONE_TEXTURE_COUNT)
      .init()
      .setSoundType(Tile.SOUND_STONE)
      .setDestroyTime(0.8)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('sandStone');
    Tile.bed = new c.BedTile(26)
      .init()
      .setDestroyTime(0.2)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('bed');
    Tile.web = new c.WebTile(30, 11)
      .init()
      .setLightBlock(1)
      .setDestroyTime(4.0)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('web');
    Tile.tallgrass = new c.TallGrass(31, 2 * 16 + 7)
      .init()
      .setDestroyTime(0.0)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('tallgrass');
    Tile.cloth = new c.ClothTile(35)
      .init()
      .setDestroyTime(0.8)
      .setSoundType(Tile.SOUND_CLOTH)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('cloth');
    Tile.flower = new c.Bush(37, 13)
      .init()
      .setDestroyTime(0.0)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('flower');
    Tile.rose = new c.Bush(38, 12)
      .init()
      .setDestroyTime(0.0)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('rose');
    Tile.mushroom1 = new c.Mushroom(39, 13 + 16)
      .init()
      .setDestroyTime(0.0)
      .setSoundType(Tile.SOUND_GRASS)
      .setLightEmission(2 / 16.0)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('mushroom');
    Tile.mushroom2 = new c.Mushroom(40, 12 + 16)
      .init()
      .setDestroyTime(0.0)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('mushroom');
    Tile.goldBlock = new c.MetalTile(41, 39 - 16)
      .init()
      .setDestroyTime(3.0)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_METAL)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('blockGold');
    Tile.ironBlock = new c.MetalTile(42, 38 - 16)
      .init()
      .setDestroyTime(5.0)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_METAL)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('blockIron');
    Tile.stoneSlab = new c.StoneSlabTile(43, true)
      .init()
      .setDestroyTime(2.0)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stoneSlab');
    Tile.stoneSlabHalf = new c.StoneSlabTile(44, false)
      .init()
      .setDestroyTime(2.0)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stoneSlab');
    Tile.redBrick = new Tile(45, 7, Material.stone)
      .init()
      .setDestroyTime(2.0)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('brick');
    Tile.tnt = new c.TntTile(46, 8)
      .init()
      .setDestroyTime(0.0)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Tools)
      .setDescriptionId('tnt');
    Tile.bookshelf = new c.BookshelfTile(47, 35)
      .init()
      .setDestroyTime(1.5)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('bookshelf');
    Tile.mossStone = new Tile(48, 36, Material.stone)
      .init()
      .setDestroyTime(2.0)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stoneMoss');
    Tile.obsidian = new c.ObsidianTile(49, 37, false)
      .init()
      .setDestroyTime(10.0)
      .setExplodeable(2000)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('obsidian');
    Tile.torch = new c.TorchTile(50, 5 * 16)
      .init()
      .setDestroyTime(0.0)
      .setLightEmission(15 / 16.0)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Tools)
      .setDescriptionId('torch');
    Tile.stairs_wood = new c.StairTile(53, Tile.wood)
      .init()
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stairsWood');
    Tile.chest = new c.ChestTile(54)
      .init()
      .setCategory(ItemCategory.Structures)
      .setDestroyTime(2.5)
      .setSoundType(Tile.SOUND_WOOD)
      .setDescriptionId('chest');
    Tile.emeraldOre = new c.OreTile(56, 16 * 3 + 2)
      .init()
      .setDestroyTime(3.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('oreDiamond');
    Tile.emeraldBlock = new c.MetalTile(57, 40 - 16)
      .init()
      .setDestroyTime(5.0)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_METAL)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('blockDiamond');
    Tile.workBench = new c.WorkbenchTile(58)
      .init()
      .setDestroyTime(2.5)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('workbench');
    Tile.crops = new c.CropTile(59, 8 + 5 * 16)
      .init()
      .setDestroyTime(0.0)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('crops');
    Tile.farmland = new c.FarmTile(60)
      .init()
      .setDestroyTime(0.6)
      .setSoundType(Tile.SOUND_GRAVEL)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('farmland');
    Tile.furnace = new c.FurnaceTile(61, false)
      .init()
      .setDestroyTime(3.5)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('furnace');
    Tile.furnace_lit = new c.FurnaceTile(62, true)
      .init()
      .setDestroyTime(3.5)
      .setSoundType(Tile.SOUND_STONE)
      .setLightEmission(14 / 16.0)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('furnace');
    Tile.sign = new c.SignTile(63, TileEntityType.Sign, true)
      .init()
      .setDestroyTime(1.0)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('sign');
    Tile.door_wood = new c.DoorTile(64, Material.wood)
      .init()
      .setDestroyTime(3.0)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('doorWood');
    Tile.ladder = new c.LadderTile(65, 3 + 5 * 16)
      .init()
      .setDestroyTime(0.4)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('ladder');
    Tile.stairs_stone = new c.StairTile(67, Tile.stoneBrick)
      .init()
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stairsStone');
    Tile.wallSign = new c.SignTile(68, TileEntityType.Sign, false)
      .init()
      .setDestroyTime(1.0)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('sign');
    Tile.door_iron = new c.DoorTile(71, Material.metal)
      .init()
      .setDestroyTime(5.0)
      .setSoundType(Tile.SOUND_METAL)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('doorIron');
    Tile.redStoneOre = new c.RedStoneOreTile(73, 16 * 3 + 3, false)
      .init()
      .setDestroyTime(3.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Mechanisms)
      .setDescriptionId('oreRedstone');
    Tile.redStoneOre_lit = new c.RedStoneOreTile(74, 16 * 3 + 3, true)
      .init()
      .setDestroyTime(3.0)
      .setLightEmission(10 / 16.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Mechanisms)
      .setDescriptionId('oreRedstone');
    Tile.topSnow = new c.TopSnowTile(78, 16 * 4 + 2)
      .init()
      .setDestroyTime(0.1)
      .setSoundType(Tile.SOUND_CLOTH)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('snow');
    Tile.ice = new c.IceTile(79, 16 * 4 + 3)
      .init()
      .setDestroyTime(0.5)
      .setLightBlock(3)
      .setSoundType(Tile.SOUND_GLASS)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('ice');
    Tile.snow = new c.SnowTile(80, 16 * 4 + 2)
      .init()
      .setDestroyTime(0.2)
      .setSoundType(Tile.SOUND_CLOTH)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('snow');
    Tile.cactus = new c.CactusTile(81, 16 * 4 + 6)
      .init()
      .setDestroyTime(0.4)
      .setSoundType(Tile.SOUND_CLOTH)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('cactus');
    Tile.clay = new c.ClayTile(82, 16 * 4 + 8)
      .init()
      .setDestroyTime(0.6)
      .setSoundType(Tile.SOUND_GRAVEL)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('clay');
    Tile.reeds = new c.ReedTile(83, 16 * 4 + 9)
      .init()
      .setDestroyTime(0.0)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('reeds');
    Tile.fence = new c.FenceTile(85, 4)
      .init()
      .setDestroyTime(2.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('fence');
    Tile.netherrack = new Tile(87, 7 + 6 * 16, Material.stone)
      .init()
      .setDestroyTime(0.4)
      .setSoundType(Tile.SOUND_STONE)
      .setDescriptionId('hellrock');
    Tile.lightGem = new c.LightGemTile(89, 9 + 16 * 6, Material.glass)
      .init()
      .setDestroyTime(0.3)
      .setCategory(ItemCategory.Structures)
      .setSoundType(Tile.SOUND_GLASS)
      .setLightEmission(1.0)
      .setDescriptionId('lightgem');
    Tile.invisible_bedrock = new c.InvisibleTile(95, 0, Material.stone)
      .init()
      .setDestroyTime(-1)
      .setExplodeable(6000000);
    Tile.trapdoor = new c.TrapDoorTile(96, Material.wood)
      .init()
      .setDestroyTime(3.0)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('trapdoor');
    Tile.stoneBrickSmooth = new c.MultiTextureTile(
      98,
      STONE_BRICK_TEXTURES,
      STONE_BRICK_TEXTURE_COUNT,
      Material.stone,
    )
      .init()
      .setDestroyTime(1.5)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stonebricksmooth');
    Tile.thinGlass = new c.ThinFenceTile(102, 1 + 3 * 16, 4 + 9 * 16, Material.glass, false)
      .init()
      .setDestroyTime(0.3)
      .setSoundType(Tile.SOUND_GLASS)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('thinGlass');
    Tile.melon = new c.MelonTile(103)
      .init()
      .setDestroyTime(1.0)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.FoodArmor)
      .setDescriptionId('melon');
    Tile.melonStem = new c.StemTile(105, Tile.melon)
      .init()
      .setDestroyTime(0.0)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.FoodArmor)
      .setDescriptionId('pumpkinStem');
    Tile.fenceGate = new c.FenceGateTile(107, 4)
      .init()
      .setDestroyTime(2.0)
      .setExplodeable(5)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('fenceGate');
    Tile.stairs_brick = new c.StairTile(108, Tile.redBrick)
      .init()
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stairsBrick');
    Tile.stairs_stoneBrickSmooth = new c.StairTile(109, Tile.stoneBrickSmooth)
      .init()
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stairsStoneBrickSmooth');
    Tile.netherBrick = new Tile(112, 0 + 14 * 16, Material.stone)
      .init()
      .setDestroyTime(2.0)
      .setExplodeable(10)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('netherBrick');
    Tile.stairs_netherBricks = new c.StairTile(114, Tile.netherBrick)
      .init()
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stairsNetherBrick');
    Tile.stairs_sandStone = new c.StairTile(128, Tile.sandStone)
      .init()
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stairsSandStone');
    Tile.quartzBlock = new c.QuartzBlockTile(155)
      .init()
      .setSoundType(Tile.SOUND_STONE)
      .setDestroyTime(0.8)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('quartzBlock');
    Tile.stairs_quartz = new c.StairTile(156, Tile.quartzBlock)
      .init()
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stairsQuartz');
    Tile.stonecutterBench = new c.StonecutterTile(245)
      .init()
      .setDestroyTime(2.5)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stonecutter');
    Tile.glowingObsidian = new c.ObsidianTile(246, 10 + 16 * 13, true)
      .init()
      .setDestroyTime(10.0)
      .setLightEmission(14 / 16.0)
      .setExplodeable(2000)
      .setSoundType(Tile.SOUND_STONE)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('glowingobsidian');
    Tile.netherReactor = new c.NetherReactor(247, 10 + 14 * 16, Material.metal)
      .init()
      .setDestroyTime(3.0)
      .setSoundType(Tile.SOUND_METAL)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('netherreactor');
    Tile.info_updateGame1 = new Tile(248, 252, Material.dirt)
      .init()
      .setDestroyTime(1.0)
      .setSoundType(Tile.SOUND_GRAVEL)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('info_update');
    Tile.info_updateGame2 = new Tile(249, 253, Material.dirt)
      .init()
      .setDestroyTime(1.0)
      .setSoundType(Tile.SOUND_GRAVEL)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('info_update');
    Tile.grass_carried = new c.CarriedTile(253, 3, 12 * 16 + 12).init().setDescriptionId('grass');
    Tile.leaves_carried = new c.LeafTile(254, 11 + 14 * 16)
      .init()
      .setDestroyTime(0.2)
      .setLightBlock(1)
      .setSoundType(Tile.SOUND_GRASS)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('leaves') as LeafTile;
    Tile.info_reserved6 = new Tile(255, Material.dirt).init();
    Tile.fire = new c.FireTile(51, 1 * 16 + 15)
      .init()
      .setDestroyTime(0.0)
      .setLightEmission(1.0)
      .setSoundType(Tile.SOUND_WOOD)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('fire') as FireTile;
    Item.items[Tile.cloth.id] = new c.ClothTileItem(Tile.cloth.id - 256)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('cloth');
    Item.items[Tile.treeTrunk.id] = new c.AuxDataTileItem(Tile.treeTrunk.id - 256, Tile.treeTrunk)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('log');
    Item.items[Tile.stoneBrickSmooth.id] = new c.AuxDataTileItem(
      Tile.stoneBrickSmooth.id - 256,
      Tile.stoneBrickSmooth,
    )
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stonebricksmooth');
    Item.items[Tile.stoneSlabHalf.id] = new c.StoneSlabTileItem(Tile.stoneSlabHalf.id - 256)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('stoneSlab');
    Item.items[Tile.sapling.id] = new c.SaplingTileItem(Tile.sapling.id - 256)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('sapling');
    Item.items[Tile.leaves.id] = new c.LeafTileItem(Tile.leaves.id - 256)
      .setCategory(ItemCategory.Decorations)
      .setDescriptionId('leaves');
    Item.items[Tile.sandStone.id] = new c.AuxDataTileItem(Tile.sandStone.id - 256, Tile.sandStone)
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('sandStone');
    Item.items[Tile.quartzBlock.id] = new c.AuxDataTileItem(
      Tile.quartzBlock.id - 256,
      Tile.quartzBlock,
    )
      .setCategory(ItemCategory.Structures)
      .setDescriptionId('quartzBlock');

    for (let i = 0; i < 256; i++) {
      const tile = Tile.tiles[i];
      if (tile != null) {
        if (Item.items[i] == null) {
          Item.items[i] = new c.TileItem(i - 256);
          Item.items[i]!.category = tile.category;
        }
        // Check for missing category
        if (Item.items[i]!.category === -1)
          LOGE(`Error: Missing category for tile ${tile.id}: ${tile.getDescriptionId()}`);
      }
    }
  }

  static teardownTiles(): void {
    for (let i = 0; i < 256; ++i) if (Tile.tiles[i]) Tile.tiles[i] = null;
  }

  static transformToValidBlockId(blockId: number, x = 0, y = 0, z = 0): number {
    if (blockId !== 0 && Tile.tiles[blockId] == null)
      return ((x + y + z) & 1) === 1 ? Tile.info_updateGame1.id : Tile.info_updateGame2.id;
    return blockId;
  }

  // ---------------------------------------------------------------- 实例
  tex: number;
  readonly id: number;
  xx0 = 0;
  yy0 = 0;
  zz0 = 0;
  xx1 = 1;
  yy1 = 1;
  zz1 = 1;
  soundType: SoundType = Tile.SOUND_NORMAL;
  gravity = 1.0;
  readonly material: Material;
  friction = 0.6;
  /** C++ 构造函数没有初始化这两个字段（未定义值）；这里取 0 */
  destroySpeed = 0;
  explosionResistance = 0;
  category = -1;
  protected tmpBB = new AABB(0, 0, 0, 1, 1, 1);
  private descriptionId = '';

  constructor(id: number, material: Material);
  constructor(id: number, tex: number, material: Material);
  constructor(id: number, a: number | Material, b?: Material) {
    this.id = id;
    if (typeof a === 'number') {
      this.tex = a;
      this.material = b!;
    } else {
      this.tex = 1;
      this.material = a;
    }
    if (Tile.tiles[id]) LOGW(`Slot ${id} is already occupied when adding ${this.constructor.name}`);
  }

  isCubeShaped(): boolean {
    return true;
  }

  getRenderShape(): number {
    return Tile.SHAPE_BLOCK;
  }

  setShape(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.xx0 = x0;
    this.yy0 = y0;
    this.zz0 = z0;
    this.xx1 = x1;
    this.yy1 = y1;
    this.zz1 = z1;
  }

  updateShape(_level: LevelSource, _x: number, _y: number, _z: number): void {}

  updateDefaultShape(): void {}

  addLights(_level: Level, _x: number, _y: number, _z: number): void {}

  getBrightness(level: LevelSource, x: number, y: number, z: number): number {
    return level.getBrightness(x, y, z);
  }

  static isFaceVisible(level: Level, x: number, y: number, z: number, f: number): boolean {
    switch (f) {
      case Facing.DOWN:
        y--;
        break;
      case Facing.UP:
        y++;
        break;
      case Facing.NORTH:
        z--;
        break;
      case Facing.SOUTH:
        z++;
        break;
      case Facing.WEST:
        x--;
        break;
      case Facing.EAST:
        x++;
        break;
    }
    return !level.isSolidRenderTile(x, y, z);
  }

  shouldRenderFace(level: LevelSource, x: number, y: number, z: number, face: number): boolean {
    if (face === 0 && y === -1) return false;
    // For fixed size worlds //@todo: external constants rather than magic numbers
    const W = LevelConstants.CHUNK_CACHE_WIDTH;
    const xz = W === 16 ? 256 : ((W * W) / (((((W * W) / 256) | 0) / 2) | 0)) | 0; // 与 C++ 一样逐步整数除
    if (face === 2 && z === -1) return false;
    if (face === 3 && z === xz) return false;
    if (face === 4 && x === -1) return false;
    if (face === 5 && x === xz) return false;
    // Common
    if (face === 0 && this.yy0 > 0) return true;
    if (face === 1 && this.yy1 < 1) return true;
    if (face === 2 && this.zz0 > 0) return true;
    if (face === 3 && this.zz1 < 1) return true;
    if (face === 4 && this.xx0 > 0) return true;
    if (face === 5 && this.xx1 < 1) return true;
    const t = Tile.tiles[level.getTile(x, y, z)];
    if (!t) return true;
    if (face === 1 && t.id === Tile.topSnow.id) return false;
    return !t.isSolidRender();
  }

  // ---- getTexture：三个 C++ 重载
  getTexture(face: number): number;
  getTexture(face: number, data: number): number;
  getTexture(level: LevelSource, x: number, y: number, z: number, face: number): number;
  getTexture(a: number | LevelSource, b?: number, c?: number, d?: number, e?: number): number {
    if (typeof a !== 'number') return this.getTextureAt(a, b!, c!, d!, e!);
    return b === undefined ? this.getTextureForFace(a) : this.getTextureForData(a, b);
  }

  /** C++ getTexture(int face) */
  getTextureForFace(_face: number): number {
    return this.tex;
  }

  /** C++ getTexture(int face, int data) */
  getTextureForData(face: number, _data: number): number {
    return this.getTextureForFace(face);
  }

  /** C++ getTexture(LevelSource* level, int x, int y, int z, int face) */
  getTextureAt(level: LevelSource, x: number, y: number, z: number, face: number): number {
    return this.getTextureForData(face, level.getData(x, y, z));
  }

  getAABB(_level: Level, x: number, y: number, z: number): AABB | null {
    const bb = this.tmpBB;
    bb.x0 = x + this.xx0;
    bb.y0 = y + this.yy0;
    bb.z0 = z + this.zz0;
    bb.x1 = x + this.xx1;
    bb.y1 = y + this.yy1;
    bb.z1 = z + this.zz1;
    return bb; // 与 C++ 一样返回共享的 tmpBB，调用方需要时自己 copy()
  }

  addAABBs(level: Level, x: number, y: number, z: number, box: AABB, boxes: AABB[]): void {
    const aabb = this.getAABB(level, x, y, z);
    if (aabb != null && box.intersects(aabb)) boxes.push(aabb.copy()); // push_back(*aabb) 是拷贝
  }

  getTileAABB(_level: Level, x: number, y: number, z: number): AABB {
    return new AABB(
      x + this.xx0,
      y + this.yy0,
      z + this.zz0,
      x + this.xx1,
      y + this.yy1,
      z + this.zz1,
    );
  }

  isSolidRender(): boolean {
    return true;
  }

  // ---- mayPick：两个 C++ 重载
  mayPick(): boolean;
  mayPick(data: number, liquid: boolean): boolean;
  mayPick(data?: number, liquid?: boolean): boolean {
    return data === undefined ? this.mayPickBasic() : this.mayPickWithData(data, liquid!);
  }

  /** C++ mayPick() */
  mayPickBasic(): boolean {
    return true;
  }

  /** C++ mayPick(int data, bool liquid) */
  mayPickWithData(_data: number, _liquid: boolean): boolean {
    return this.mayPickBasic();
  }

  // ---- mayPlace：两个 C++ 重载
  mayPlace(level: Level, x: number, y: number, z: number): boolean;
  mayPlace(level: Level, x: number, y: number, z: number, face: number): boolean;
  mayPlace(level: Level, x: number, y: number, z: number, face?: number): boolean {
    return face === undefined
      ? this.mayPlaceAt(level, x, y, z)
      : this.mayPlaceOnFace(level, x, y, z, face);
  }

  /** C++ mayPlace(Level* level, int x, int y, int z) */
  mayPlaceAt(level: Level, x: number, y: number, z: number): boolean {
    const t = level.getTile(x, y, z);
    return t === 0 || Tile.tiles[t]!.material.isReplaceable();
  }

  /** C++ mayPlace(Level* level, int x, int y, int z, unsigned char face) */
  mayPlaceOnFace(level: Level, x: number, y: number, z: number, _face: number): boolean {
    return this.mayPlaceAt(level, x, y, z);
  }

  getTickDelay(): number {
    return 10;
  }

  tick(_level: Level, _x: number, _y: number, _z: number, _random: Random): void {}

  animateTick(_level: Level, _x: number, _y: number, _z: number, _random: Random): void {}

  destroy(_level: Level, _x: number, _y: number, _z: number, _data: number): void {}

  neighborChanged(_level: Level, _x: number, _y: number, _z: number, _type: number): void {}

  onPlace(_level: Level, _x: number, _y: number, _z: number): void {}

  onRemove(_level: Level, _x: number, _y: number, _z: number): void {}

  getResource(_data: number, _random: Random): number {
    return this.id;
  }

  getResourceCount(_random: Random): number {
    return 1;
  }

  getDestroyProgress(player: Player): number {
    if (this.destroySpeed < 0) return 0;
    if (!player.canDestroy(this)) return 1 / this.destroySpeed / 100.0;
    return player.getDestroySpeed(this) / this.destroySpeed / 30.0;
  }

  /**
   * C++ 的两个重载：spawnResources(level, x, y, z, data) 只是以 odds = 1.0f 转调另一个；没有子类重写前者，
   * 所以写成一个带默认参数的方法（R10 情形 A）。随机数的调用次数与顺序和 C++ 相同；生成掉落物实体的语句在 S12 恢复。
   */
  spawnResources(level: Level, x: number, y: number, z: number, data: number, odds = 1): void {
    if (level.isClientSide) return;
    const count = this.getResourceCount(level.random);
    for (let i = 0; i < count; i++) {
      if (level.random.nextFloat() > odds) continue;
      const type = this.getResource(data, level.random);
      if (type <= 0) continue;
      const s = 0.7;
      const xo = level.random.nextFloat() * s + (1 - s) * 0.5;
      const yo = level.random.nextFloat() * s + (1 - s) * 0.5;
      const zo = level.random.nextFloat() * s + (1 - s) * 0.5;
      const item = createItemEntity(
        level,
        x + xo,
        y + yo,
        z + zo,
        new ItemInstance(type, 1, this.getSpawnResourcesAuxValue(data)),
      );
      item.throwTime = 10;
      level.addEntity(item);
    }
  }

  popResource(level: Level, x: number, y: number, z: number, itemInstance: ItemInstance): void {
    if (level.isClientSide || level.getLevelData().getGameType() === GameType.Creative) return;
    const s = 0.7;
    const xo = level.random.nextFloat() * s + (1 - s) * 0.5;
    const yo = level.random.nextFloat() * s + (1 - s) * 0.5;
    const zo = level.random.nextFloat() * s + (1 - s) * 0.5;
    const item = createItemEntity(level, x + xo, y + yo, z + zo, itemInstance);
    item.throwTime = 10;
    level.addEntity(item);
  }

  spawnBurnResources(_level: Level, _x: number, _y: number, _z: number): boolean {
    return false;
  }

  getExplosionResistance(_source: Entity | null): number {
    return this.explosionResistance / 5.0;
  }

  clip(level: Level, xt: number, yt: number, zt: number, A: Vec3, B: Vec3): HitResult {
    this.updateShape(level, xt, yt, zt);

    const a = A.sub(xt, yt, zt);
    const b = B.sub(xt, yt, zt);

    const xh0 = new Vec3(),
      xh1 = new Vec3(),
      yh0 = new Vec3(),
      yh1 = new Vec3(),
      zh0 = new Vec3(),
      zh1 = new Vec3();

    let bxh0 = a.clipX(b, this.xx0, xh0);
    let bxh1 = a.clipX(b, this.xx1, xh1);

    let byh0 = a.clipY(b, this.yy0, yh0);
    let byh1 = a.clipY(b, this.yy1, yh1);

    let bzh0 = a.clipZ(b, this.zz0, zh0);
    let bzh1 = a.clipZ(b, this.zz1, zh1);

    if (!bxh0 || !this.containsX(xh0)) bxh0 = false;
    if (!bxh1 || !this.containsX(xh1)) bxh1 = false;
    if (!byh0 || !this.containsY(yh0)) byh0 = false;
    if (!byh1 || !this.containsY(yh1)) byh1 = false;
    if (!bzh0 || !this.containsZ(zh0)) bzh0 = false;
    if (!bzh1 || !this.containsZ(zh1)) bzh1 = false;

    let closest: Vec3 | null = null;
    const d = (v: Vec3): number => a.distanceToSqr(v.x, v.y, v.z);
    if (bxh0 && (closest == null || d(xh0) < d(closest))) closest = xh0;
    if (bxh1 && (closest == null || d(xh1) < d(closest))) closest = xh1;
    if (byh0 && (closest == null || d(yh0) < d(closest))) closest = yh0;
    if (byh1 && (closest == null || d(yh1) < d(closest))) closest = yh1;
    if (bzh0 && (closest == null || d(zh0) < d(closest))) closest = zh0;
    if (bzh1 && (closest == null || d(zh1) < d(closest))) closest = zh1;

    if (closest == null) return new HitResult();

    let face = -1;
    if (closest === xh0) face = 4;
    if (closest === xh1) face = 5;
    if (closest === yh0) face = 0;
    if (closest === yh1) face = 1;
    if (closest === zh0) face = 2;
    if (closest === zh1) face = 3;

    return new HitResult(xt, yt, zt, face, closest.add(xt, yt, zt));
  }

  wasExploded(_level: Level, _x: number, _y: number, _z: number): void {}

  getRenderLayer(): number {
    return Tile.RENDERLAYER_OPAQUE;
  }

  use(_level: Level, _x: number, _y: number, _z: number, _player: Player): boolean {
    return false;
  }

  stepOn(_level: Level, _x: number, _y: number, _z: number, _entity: Entity): void {}

  fallOn(
    _level: Level,
    _x: number,
    _y: number,
    _z: number,
    _entity: Entity,
    _fallDistance: number,
  ): void {}

  getPlacedOnFaceDataValue(
    _level: Level,
    _x: number,
    _y: number,
    _z: number,
    _face: number,
    _clickX: number,
    _clickY: number,
    _clickZ: number,
    itemValue: number,
  ): number {
    return itemValue;
  }

  setPlacedBy(_level: Level, _x: number, _y: number, _z: number, _by: Mob): void {}

  prepareRender(_level: Level, _x: number, _y: number, _z: number): void {}

  attack(_level: Level, _x: number, _y: number, _z: number, _player: Player): void {}

  /** current 是 C++ 的 Vec3& 引用：子类直接改它的分量 */
  handleEntityInside(
    _level: Level,
    _x: number,
    _y: number,
    _z: number,
    _e: Entity,
    _current: Vec3,
  ): void {}

  getColor(_level: LevelSource, _x: number, _y: number, _z: number): number {
    return 0xffffff;
  }

  isSignalSource(): boolean {
    return false;
  }

  // ---- getSignal：两个 C++ 重载
  getSignal(level: LevelSource, x: number, y: number, z: number): boolean;
  getSignal(level: LevelSource, x: number, y: number, z: number, dir: number): boolean;
  getSignal(level: LevelSource, x: number, y: number, z: number, dir?: number): boolean {
    return dir === undefined
      ? this.getSignalAt(level, x, y, z)
      : this.getSignalInDirection(level, x, y, z, dir);
  }

  /** C++ getSignal(LevelSource* level, int x, int y, int z) */
  getSignalAt(_level: LevelSource, _x: number, _y: number, _z: number): boolean {
    return false;
  }

  /** C++ getSignal(LevelSource* level, int x, int y, int z, int dir) */
  getSignalInDirection(
    _level: LevelSource,
    _x: number,
    _y: number,
    _z: number,
    _dir: number,
  ): boolean {
    return false;
  }

  getDirectSignal(_level: Level, _x: number, _y: number, _z: number, _dir: number): boolean {
    return false;
  }

  entityInside(_level: Level, _x: number, _y: number, _z: number, _entity: Entity): void {}

  playerDestroy(
    level: Level,
    _player: Player,
    x: number,
    y: number,
    z: number,
    data: number,
  ): void {
    this.spawnResources(level, x, y, z, data);
  }

  canSurvive(_level: Level, _x: number, _y: number, _z: number): boolean {
    return true;
  }

  getName(): string {
    return I18n.get(this.getDescriptionId() + '.name');
  }

  getDescriptionId(): string {
    return this.descriptionId;
  }

  setDescriptionId(id: string): Tile {
    this.descriptionId = Tile.TILE_DESCRIPTION_PREFIX + id;
    return this;
  }

  triggerEvent(_level: Level, _x: number, _y: number, _z: number, _b0: number, _b1: number): void {}

  // ---------------------------------------------------------------- protected
  protected setSoundType(soundType: SoundType): Tile {
    this.soundType = soundType;
    return this;
  }

  protected setLightBlock(i: number): Tile {
    Tile.lightBlock[this.id] = i;
    return this;
  }

  protected setLightEmission(f: number): Tile {
    Tile.lightEmission[this.id] = (Level.MAX_BRIGHTNESS * f) | 0; // (int) 截断
    return this;
  }

  protected setExplodeable(explosionResistance: number): Tile {
    this.explosionResistance = explosionResistance * 3;
    return this;
  }

  protected setDestroyTime(destroySpeed: number): Tile {
    this.destroySpeed = destroySpeed;
    if (this.explosionResistance < destroySpeed * 5) this.explosionResistance = destroySpeed * 5;
    return this;
  }

  protected setTicking(tick: boolean): void {
    Tile.shouldTick[this.id] = tick;
  }

  /** Returns the item instance's auxValue when a TileItem is spawned from this Tile. */
  protected getSpawnResourcesAuxValue(_data: number): number {
    return 0;
  }

  // ---------------------------------------------------------------- private
  private init(): Tile {
    Tile.tiles[this.id] = this;
    this.setShape(this.xx0, this.yy0, this.zz0, this.xx1, this.yy1, this.zz1); // @attn
    Tile.solid[this.id] = this.isSolidRender();
    Tile.lightBlock[this.id] = this.isSolidRender() ? 255 : 0;
    Tile.translucent[this.id] = !this.material.blocksLight();
    return this;
  }

  private setCategory(category: number): Tile {
    this.category = category;
    return this;
  }

  private containsX(v: Vec3): boolean {
    return v.y >= this.yy0 && v.y <= this.yy1 && v.z >= this.zz0 && v.z <= this.zz1;
  }

  private containsY(v: Vec3): boolean {
    return v.x >= this.xx0 && v.x <= this.xx1 && v.z >= this.zz0 && v.z <= this.zz1;
  }

  private containsZ(v: Vec3): boolean {
    return v.x >= this.xx0 && v.x <= this.xx1 && v.y >= this.yy0 && v.y <= this.yy1;
  }
}

// C++ 的嵌套类型：同名命名空间只放类型别名，让 Tile::SoundType 在 TS 里照样写成 Tile.SoundType（作类型用）；作值用走类上的同名静态属性。
// eslint-disable-next-line @typescript-eslint/no-namespace -- 只含类型，编译后不产生任何代码
export declare namespace Tile {
  type SoundType = SoundTypeT;
}
