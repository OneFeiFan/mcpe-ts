// 1:1 移植自 src/world/level/tile/ChestTile.h 与 ChestTile.cpp
import { getEpochTimeS } from '@mcpe/platform';
import { EntityTile } from './EntityTile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { TileEntity, TileEntityFactory, TileEntityType } from './entity/TileEntity';
import { ItemEntity } from '../../entity/item/ItemEntity';
import { ItemInstance } from '../../item/ItemInstance';
import { Facing } from '../../Facing';
import { Tile } from './Tile';
import { Random, Mth } from '@mcpe/util';
import type { ChestTileEntity, Player } from '../..';
import type { Mob } from '../../entity/Mob';

export interface LevelSource {
  getData(x: number, y: number, z: number): number;
}

export class ChestTile extends EntityTile {
  static readonly EVENT_SET_OPEN_COUNT = 1;

  /** C++ private Random random — ChestTile 自己的随机源 */
  private readonly random = new Random(getEpochTimeS());

  /** C++ ChestTile::ChestTile(int id) */
  constructor(id: number) {
    super(id, Material.wood);
    this.tex = 10 + 16;
    const m = 0.025;
    this.setShape(m, 0, m, 1 - m, 1 - m - m, 1 - m);
  }

  /** C++ ChestTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ ChestTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ ChestTile::getRenderShape() */
  override getRenderShape(): number {
    return super.getRenderShape();
    // C++ 里 return Tile::SHAPE_ENTITYTILE_ANIMATED; 被注释掉了
  }

  /** C++ ChestTile::onPlace(Level*, int, int, int) */
  override onPlace(level: Level, x: number, y: number, z: number): void {
    super.onPlace(level, x, y, z);
    this.recalcLockDir(level, x, y, z);
    // C++ fullchest 逻辑全部被注释掉
  }

  /** C++ ChestTile::setPlacedBy(Level*, int, int, int, Mob*) */
  override setPlacedBy(level: Level, x: number, y: number, z: number, by: Mob): void {
    const n = level.getTile(x, y, z - 1);
    const s = level.getTile(x, y, z + 1);
    const w = level.getTile(x - 1, y, z);
    const e = level.getTile(x + 1, y, z);

    let facing = 0;
    const dir = Mth.floor((by.yRot * 4) / 360 + 0.5) & 3;

    if (dir === 0) facing = Facing.NORTH;
    if (dir === 1) facing = Facing.EAST;
    if (dir === 2) facing = Facing.SOUTH;
    if (dir === 3) facing = Facing.WEST;

    if (n !== this.id && s !== this.id && w !== this.id && e !== this.id) {
      level.setData(x, y, z, facing);
    } else {
      if ((n === this.id || s === this.id) && (facing === Facing.WEST || facing === Facing.EAST)) {
        if (n === this.id) level.setData(x, y, z - 1, facing);
        else level.setData(x, y, z + 1, facing);
        level.setData(x, y, z, facing);
      }
      if (
        (w === this.id || e === this.id) &&
        (facing === Facing.NORTH || facing === Facing.SOUTH)
      ) {
        if (w === this.id) level.setData(x - 1, y, z, facing);
        else level.setData(x + 1, y, z, facing);
        level.setData(x, y, z, facing);
      }
    }
  }

  /** C++ ChestTile::recalcLockDir(Level*, int, int, int) */
  recalcLockDir(level: Level, x: number, y: number, z: number): void {
    if (level.isClientSide) return;

    const n = level.getTile(x, y, z - 1);
    const s = level.getTile(x, y, z + 1);
    const w = level.getTile(x - 1, y, z);
    const e = level.getTile(x + 1, y, z);

    let lockDir = 4;
    // C++ fullchest 逻辑全部被注释掉
    {
      lockDir = level.getData(x, y, z);
      if (
        (lockDir === Facing.NORTH && Tile.solid[n] === true) ||
        (lockDir === Facing.SOUTH && Tile.solid[s] === true) ||
        (lockDir === Facing.WEST && Tile.solid[w] === true) ||
        (lockDir === Facing.EAST && Tile.solid[e] === true)
      ) {
        if (Tile.solid[n] === true && Tile.solid[s] !== true) lockDir = Facing.SOUTH;
        if (Tile.solid[s] === true && Tile.solid[n] !== true) lockDir = Facing.NORTH;
        if (Tile.solid[w] === true && Tile.solid[e] !== true) lockDir = Facing.EAST;
        if (Tile.solid[e] === true && Tile.solid[w] !== true) lockDir = Facing.WEST;
      }
    }

    level.setData(x, y, z, lockDir);
  }

  /** C++ ChestTile::getTexture(LevelSource*, int, int, int, int) */
  override getTextureAt(level: LevelSource, x: number, y: number, z: number, face: number): number {
    if (face === 1) return this.tex - 1;
    if (face === 0) return this.tex - 1;

    // C++ fullchest 逻辑全部被注释掉

    const lockDir = level.getData(x, y, z);
    return face === lockDir ? this.tex + 1 : this.tex;
  }

  /** C++ ChestTile::getTexture(int face) */
  override getTextureForFace(face: number): number {
    if (face === 1) return this.tex - 1;
    if (face === 0) return this.tex - 1;
    if (face === 3) return this.tex + 1;
    return this.tex;
  }

  /** C++ ChestTile::mayPlace(Level*, int, int, int, unsigned char) */
  override mayPlace(level: Level, x: number, y: number, z: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face: number): boolean;
  override mayPlace(level: Level, x: number, y: number, z: number, face?: number): boolean {
    let chestCount = 0;
    if (level.getTile(x - 1, y, z) === this.id) chestCount++;
    if (level.getTile(x + 1, y, z) === this.id) chestCount++;
    if (level.getTile(x, y, z - 1) === this.id) chestCount++;
    if (level.getTile(x, y, z + 1) === this.id) chestCount++;

    // fullchest 禁用
    if (chestCount > 0) return false;
    return true;
  }

  /** C++ ChestTile::neighborChanged(Level*, int, int, int, int) */
  override neighborChanged(level: Level, x: number, y: number, z: number, type: number): void {
    super.neighborChanged(level, x, y, z, type);
    this.recalcLockDir(level, x, y, z);
    const te = level.getTileEntity(x, y, z);
    if (te !== null) te.clearCache();
  }

  /** C++ ChestTile::onRemove(Level*, int, int, int) */
  override onRemove(level: Level, x: number, y: number, z: number): void {
    if (!level.isClientSide) {
      const te = level.getTileEntity(x, y, z);
      if (te !== null && te.type === TileEntityType.Chest) {
        const container = te as ChestTileEntity;
        for (let i = 0; i < container.getContainerSize(); i++) {
          const item = container.getItem(i);
          if (item !== null) {
            const xo = this.random.nextFloat() * 0.8 + 0.1;
            const yo = this.random.nextFloat() * 0.8 + 0.1;
            const zo = this.random.nextFloat() * 0.8 + 0.1;

            while (item.count > 0) {
              let count = this.random.nextInt(21) + 10;
              if (count > item.count) count = item.count;
              item.count -= count;

              const itemEntity = new ItemEntity(
                level,
                x + xo,
                y + yo,
                z + zo,
                new ItemInstance(item.id, count, item.getAuxValue()),
              );
              const pow = 0.05;
              itemEntity.xd = this.random.nextGaussian() * pow;
              itemEntity.yd = this.random.nextGaussian() * pow + 0.2;
              itemEntity.zd = this.random.nextGaussian() * pow;
              level.addEntity(itemEntity);
            }
          }
        }
      }
    }
    super.onRemove(level, x, y, z);
  }

  /** C++ ChestTile::use(Level*, int, int, int, Player*) */
  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    const te = level.getTileEntity(x, y, z);
    if (!TileEntity.isType(te, TileEntityType.Chest)) return true;

    const chest = te as ChestTileEntity;

    if (level.isSolidBlockingTile(x, y + 1, z)) return true;

    // C++ fullchest 逻辑全部被注释掉

    if (level.isClientSide) return true;

    player.openContainer(chest);
    return true;
  }

  /** C++ ChestTile::newTileEntity() */
  newTileEntity(): TileEntity {
    return TileEntityFactory.createTileEntity(TileEntityType.Chest)!;
  }

  /** C++ ChestTile::isFullChest(Level*, int, int, int) — private */
  private isFullChest(_level: Level, _x: number, _y: number, _z: number): boolean {
    return false; // @fullchest
  }
}
