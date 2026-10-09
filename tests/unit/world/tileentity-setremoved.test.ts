/**
 * 回归（审核 C1）：C++ 的 TileEntity::setRemoved 不是 virtual。Level::removeTileEntity 与 LevelChunk::removeTileEntity
 * 都经 TileEntity* 调用它，所以原版从不执行 ChestTileEntity::setRemoved（clearCache + checkNeighbors）。
 * TS 里同名方法会派发到子类，两个调用点因此写成 TileEntity.prototype.setRemoved.call。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ChestTileEntity, initItems, initTileEntities, type Level, Tile } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

let level: Level;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
});

describe('TileEntity.setRemoved 的非虚语义', () => {
  it('破坏箱子：方块实体被标为已移除，但不执行 ChestTileEntity 自己的 setRemoved', () => {
    level.setTile(130, 64, 130, Tile.chest.id);
    const te = level.getTileEntity(130, 64, 130) as ChestTileEntity;
    expect(te).toBeInstanceOf(ChestTileEntity);
    const own = vi.spyOn(ChestTileEntity.prototype, 'setRemoved');
    level.setTile(130, 64, 130, 0);
    expect(te.isRemoved()).toBe(true);
    expect(own).not.toHaveBeenCalled();
    own.mockRestore();
  });
});
