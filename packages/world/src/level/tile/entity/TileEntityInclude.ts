// ADAPTED(ESM)（S11 阶段 A）：把方块实体子类注入 TileEntityFactory，再执行 C++ 的 TileEntity::initTileEntities。
// NinecraftApp.init 调用这里的 initTileEntities()（与 TileInclude 的 initTiles 同一做法）。
// 阶段 C 加入 FurnaceTileEntity、NetherReactorTileEntity；S12 加入 ChestTileEntity。
import { SignTileEntity } from './SignTileEntity';
import { TileEntity, TileEntityFactory } from './TileEntity';

export function initTileEntities(): void {
  TileEntityFactory.classes = {
    Sign: SignTileEntity,
  };
  TileEntity.initTileEntities();
}
