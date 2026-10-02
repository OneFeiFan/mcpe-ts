// FORWARD-DECL(EntityTile)：对应 src/world/level/tile/EntityTile.h。
// S11 由你完整移植：用真正的 class EntityTile（继承 Tile）整体替换本文件。
// 在此之前只有 LevelChunk.getTileEntity 用到它（把 Tile 强转成 EntityTile 再调用 newTileEntity）。
import type { TileEntity } from './entity/TileEntity';
import type { Tile } from './Tile';

export interface EntityTile extends Tile {
  newTileEntity(): TileEntity;
}
