/**
 * ADAPTED（ES 模块）：对应 src/world/level/tile/TileInclude.h。
 * C++ 的 Tile.cpp 直接 #include 全部子类，再在 initTiles() 里 new。ES 模块里若基类 import 子类、子类又 extends 基类，
 * 加载时会触发 TDZ 错误；所以由这里集中 import 全部已移植的子类，再注入给 Tile.initTiles（与 MaterialInclude 同一模式）。
 * 调用方一律用这里导出的 initTiles()，初始化顺序照 NinecraftApp::init：initMaterials → MobCategory → initTiles。
 *
 * 以后每移植一个新的方块类：在这里 import 并加进对象，在 Tile.ts 的 TileClasses 里加上构造签名，
 * 再把 Tile.initTiles 里对应的 DEFERRED(Tile) 行恢复成代码。
 */
import { Tile, type TileClasses } from './Tile';
import { BedTile } from './BedTile';
import { DirtTile } from './DirtTile';
import { FarmTile } from './FarmTile';
import { FireTile } from './FireTile';
import { GrassTile } from './GrassTile';
import { InvisibleTile } from './InvisibleTile';
import { LeafTile } from './LeafTile';
import { LiquidTileDynamic } from './LiquidTileDynamic';
import { LiquidTileStatic } from './LiquidTileStatic';
import { StoneSlabTile } from './StoneSlabTile';
import { StoneTile } from './StoneTile';
import { TopSnowTile } from './TopSnowTile';
import { LeafTileItem } from '../../item/LeafTileItem';
import { StoneSlabTileItem } from '../../item/StoneSlabTileItem';
import { TileItem } from '../../item/TileItem';
import { CactusTile } from './CactusTile';
import { ChestTile } from './ChestTile';
import { CropTile } from './CropTile';
import { DoorTile } from './DoorTile';
import { FenceGateTile } from './FenceGateTile';
import { FurnaceTile } from './FurnaceTile';
import { StairTile } from './StairTile';
import { StonecutterTile } from './StonecutterTile';
import { TallGrass } from './TallGrass';
import { WebTile } from './WebTile';
import { WorkbenchTile } from './WorkbenchTile';
import { AuxDataTileItem } from '../../item/AuxDataTileItem';
import { BookshelfTile } from './BookshelfTile';
import { Bush } from './Bush';
import { CarriedTile } from './CarriedTile';
import { ClayTile } from './ClayTile';
import { ClothTile } from './ClothTile';
import { ClothTileItem } from '../../item/ClothTileItem';
import { FenceTile } from './FenceTile';
import { GlassTile } from './GlassTile';
import { GravelTile } from './GravelTile';
import { HeavyTile } from './HeavyTile';
import { IceTile } from './IceTile';
import { LadderTile } from './LadderTile';
import { LightGemTile } from './LightGemTile';
import { MelonTile } from './MelonTile';
import { MetalTile } from './MetalTile';
import { MultiTextureTile } from './MultiTextureTile';
import { Mushroom } from './Mushroom';
import { ObsidianTile } from './ObsidianTile';
import { OreTile } from './OreTile';
import { QuartzBlockTile } from './QuartzBlockTile';
import { RedStoneOreTile } from './RedStoneOreTile';
import { ReedTile } from './ReedTile';
import { SandStoneTile } from './SandStoneTile';
import { Sapling } from './Sapling';
import { SaplingTileItem } from '../../item/SaplingTileItem';
import { SignTile } from './SignTile';
import { SnowTile } from './SnowTile';
import { StemTile } from './StemTile';
import { ThinFenceTile } from './ThinFenceTile';
import { TntTile } from './TntTile';
import { TorchTile } from './TorchTile';
import { TrapDoorTile } from './TrapDoorTile';
import { TreeTile } from './TreeTile';

/** 全部已移植的方块类与特殊 TileItem 类（测试可以在它的基础上替换个别类） */
export const TILE_CLASSES: TileClasses = {
  CactusTile, ChestTile, CropTile, DoorTile, FenceGateTile, FurnaceTile, StairTile, StonecutterTile, TallGrass, WebTile, WorkbenchTile,
    StoneTile, GrassTile, DirtTile, LiquidTileDynamic, LiquidTileStatic, LeafTile, BedTile, StoneSlabTile,
    FireTile, FarmTile, InvisibleTile, TopSnowTile, TileItem, StoneSlabTileItem, LeafTileItem,
    AuxDataTileItem, BookshelfTile, Bush, CarriedTile, ClayTile, ClothTile, ClothTileItem, FenceTile, GlassTile, GravelTile, HeavyTile, IceTile, LadderTile, LightGemTile, MelonTile, MetalTile, MultiTextureTile, Mushroom, ObsidianTile, OreTile, QuartzBlockTile, RedStoneOreTile, ReedTile, SandStoneTile, Sapling, SaplingTileItem, SignTile, SnowTile, StemTile, ThinFenceTile, TntTile, TorchTile, TrapDoorTile, TreeTile,
};

export function initTiles(): void {
  Tile.initTiles(TILE_CLASSES);
}
