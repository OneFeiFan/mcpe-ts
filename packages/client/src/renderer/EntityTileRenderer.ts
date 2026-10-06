/**
 * 1:1 移植自 src/client/renderer/EntityTileRenderer.h 与 EntityTileRenderer.cpp（方块的“实体形态”，TileRenderer::renderTile 的 SHAPE_ENTITYTILE_ANIMATED 分支）。
 * ⚠ 原版行为：它拿一个默认构造的 ChestTileEntity 交给分派器；这一版 C++ 的 ChestTileEntity 不设 rendererId（TR_DEFAULT_RENDERER），
 *   分派器找不到渲染器，所以什么都不画。ChestTile 也不用这个形状（ChestTile.cpp:29 被注释掉）。照原样移植。
 * C++ 的 static instance 在程序启动时 new；这里在第一次访问时创建（ChestTileEntity 的构造依赖已注册的方块，不能在模块加载时创建，ADAPTED(ESM)）。
 */
import { ChestTileEntity, type Tile } from '@mcpe/world';
import { TileEntityRenderDispatcher } from './tileentity/TileEntityRenderDispatcher';

export class EntityTileRenderer {
  private static _instance: EntityTileRenderer | null = null;
  chest = new ChestTileEntity();

  static get instance(): EntityTileRenderer {
    if (!EntityTileRenderer._instance) EntityTileRenderer._instance = new EntityTileRenderer();
    return EntityTileRenderer._instance;
  }

  render(_tile: Tile, _data: number, _brightness: number): void {
    TileEntityRenderDispatcher.getInstance().renderAt(this.chest, 0, 0, 0, 0);
  }
}
