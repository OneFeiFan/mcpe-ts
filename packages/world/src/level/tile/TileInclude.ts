/**
 * ADAPTED（ES 模块）：对应 src/world/level/tile/TileInclude.h。
 * C++ 的 Tile.cpp 直接 #include 全部子类，再在 initTiles() 里 new。ES 模块里若基类 import 子类、子类又 extends 基类，
 * 加载时会触发 TDZ 错误；所以由这里集中 import 全部已移植的子类，再注入给 Tile.initTiles（与 MaterialInclude 同一模式）。
 * 调用方一律用这里导出的 initTiles()，初始化顺序照 NinecraftApp::init：initMaterials → MobCategory → initTiles。
 *
 * 以后每移植一个新的方块类：在这里 import 并加进对象，在 Tile.ts 的 TileClasses 里加上构造签名，
 * 再把 Tile.initTiles 里对应的 DEFERRED(Tile) 行恢复成代码。
 */
import { Tile } from './Tile';
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

export function initTiles(): void {
  Tile.initTiles({
    StoneTile, GrassTile, DirtTile, LiquidTileDynamic, LiquidTileStatic, LeafTile, BedTile, StoneSlabTile,
    FireTile, FarmTile, InvisibleTile, TopSnowTile, TileItem, StoneSlabTileItem, LeafTileItem,
  });
}
