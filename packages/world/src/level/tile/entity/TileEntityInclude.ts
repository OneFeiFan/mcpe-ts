// ADAPTED(ESM)（S11 阶段 A）：把方块实体子类注入 TileEntityFactory，再执行 C++ 的 TileEntity::initTileEntities。
// NinecraftApp.init 调用这里的 initTileEntities()（与 TileInclude 的 initTiles 同一做法）。
// S12 阶段 A 加入 FurnaceTileEntity、ChestTileEntity；阶段 C 加入 NetherReactorTileEntity。
import { ChestTileEntity } from './ChestTileEntity';
import { FurnaceTileEntity } from './FurnaceTileEntity';
import { NetherReactorTileEntity } from './NetherReactorTileEntity';
import { SignTileEntity } from './SignTileEntity';
import { TileEntity, TileEntityFactory } from './TileEntity';

export function initTileEntities(): void {
  TileEntityFactory.classes = {
    Sign: SignTileEntity,
    Furnace: FurnaceTileEntity,
    Chest: ChestTileEntity,
    NetherReactor: NetherReactorTileEntity,
  };
  TileEntity.initTileEntities();
}
