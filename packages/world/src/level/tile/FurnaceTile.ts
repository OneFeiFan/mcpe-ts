// 1:1 移植自 src/world/level/tile/FurnaceTile.h 与 FurnaceTile.cpp
import { getEpochTimeS } from '@mcpe/platform';
import { EntityTile } from './EntityTile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import { TileEntity, TileEntityFactory, TileEntityType } from './entity/TileEntity';
import { FurnaceTileEntity } from './entity/FurnaceTileEntity';
import { ItemEntity } from '../../entity/item/ItemEntity';
import { ItemInstance } from '../../item/ItemInstance';
import { Facing } from '../../Facing';
import { Tile } from './Tile';
import { ParticleType } from '../../entity/EntityTypes';
import { Random, Mth } from '@mcpe/util';
import type { Player } from '../..';
import type { Mob } from '../../entity/Mob';

export interface LevelSource {
  getData(x: number, y: number, z: number): number;
}

export class FurnaceTile extends EntityTile {
  /** C++ FurnaceTile::noDrop — static */
  private static noDrop = false;

  /** C++ FurnaceTile::random — per-instance RNG */
  private readonly random = new Random(getEpochTimeS());

  private readonly lit: boolean;

  /** C++ FurnaceTile::FurnaceTile(int id, bool lit) */
  constructor(id: number, lit: boolean) {
    super(id, Material.stone);
    this.lit = lit;
    this.tex = 13 + 16 * 2;
  }

  /** C++ FurnaceTile::getResource(int, Random*) */
  override getResource(_data: number, _random: Random): number {
    return Tile.furnace.id;
  }

  /** C++ FurnaceTile::onPlace(Level*, int, int, int) */
  override onPlace(level: Level, x: number, y: number, z: number): void {
    super.onPlace(level, x, y, z);
    this.recalcLockDir(level, x, y, z);
  }

  /** C++ FurnaceTile::getTexture(LevelSource*, int, int, int, int) */
  override getTextureAt(level: LevelSource, x: number, y: number, z: number, face: number): number {
    if (face === 1) return this.tex + 17;
    if (face === 0) return this.tex + 17;

    const lockDir = level.getData(x, y, z);
    if (face !== lockDir) return this.tex;
    if (this.lit) return this.tex + 16;
    return this.tex - 1;
  }

  /** C++ FurnaceTile::getTexture(int face) */
  override getTextureForFace(face: number): number {
    if (face === 1) return this.tex + 17;
    if (face === 0) return this.tex + 17;
    if (face === 3) return this.tex - 1;
    return this.tex;
  }

  /** C++ FurnaceTile::animateTick(Level*, int, int, int, Random*) */
  override animateTick(level: Level, xt: number, yt: number, zt: number, random: Random): void {
    if (!this.lit) return;

    const dir = level.getData(xt, yt, zt);

    const x = xt + 0.5;
    // 注意：恰好一次 nextFloat 用于 y 偏移
    const y = yt + 0.0 + (random.nextFloat() * 6) / 16.0;
    const z = zt + 0.5;
    const r = 0.52;
    // 第二次 nextFloat
    const ss = random.nextFloat() * 0.6 - 0.3;

    if (dir === 4) {
      level.addParticle(ParticleType.smoke, x - r, y, z + ss, 0, 0, 0);
      level.addParticle(ParticleType.flame, x - r, y, z + ss, 0, 0, 0);
    } else if (dir === 5) {
      level.addParticle(ParticleType.smoke, x + r, y, z + ss, 0, 0, 0);
      level.addParticle(ParticleType.flame, x + r, y, z + ss, 0, 0, 0);
    } else if (dir === 2) {
      level.addParticle(ParticleType.smoke, x + ss, y, z - r, 0, 0, 0);
      level.addParticle(ParticleType.flame, x + ss, y, z - r, 0, 0, 0);
    } else if (dir === 3) {
      level.addParticle(ParticleType.smoke, x + ss, y, z + r, 0, 0, 0);
      level.addParticle(ParticleType.flame, x + ss, y, z + r, 0, 0, 0);
    }
  }

  /** C++ FurnaceTile::use(Level*, int, int, int, Player*) */
  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    if (level.isClientSide) return true;

    const furnace = level.getTileEntity(x, y, z) as FurnaceTileEntity | null;
    if (furnace !== null) player.openFurnace(furnace);
    return true;
  }

  /** C++ FurnaceTile::setLit(bool, Level*, int, int, int) — static */
  static setLit(lit: boolean, level: Level, x: number, y: number, z: number): void {
    const data = level.getData(x, y, z);
    const te = level.getTileEntity(x, y, z);

    FurnaceTile.noDrop = true;
    if (lit) level.setTile(x, y, z, Tile.furnace_lit.id);
    else level.setTile(x, y, z, Tile.furnace.id);
    FurnaceTile.noDrop = false;

    level.setData(x, y, z, data);

    // C++: LOGI("lit? %d @ %d, %d, %d\n", lit, x, y, z) — 日志，TS 里可省

    if (te !== null) {
      te.clearRemoved();
      level.setTileEntity(x, y, z, te);
    }
  }

  /** C++ FurnaceTile::newTileEntity() */
  newTileEntity(): TileEntity {
    return TileEntityFactory.createTileEntity(TileEntityType.Furnace)!;
  }

  /** C++ FurnaceTile::setPlacedBy(Level*, int, int, int, Mob*) */
  override setPlacedBy(level: Level, x: number, y: number, z: number, by: Mob): void {
    const dir = Mth.floor((by.yRot * 4) / 360 + 0.5) & 3;

    if (dir === 0) level.setData(x, y, z, Facing.NORTH);
    if (dir === 1) level.setData(x, y, z, Facing.EAST);
    if (dir === 2) level.setData(x, y, z, Facing.SOUTH);
    if (dir === 3) level.setData(x, y, z, Facing.WEST);
  }

  /** C++ FurnaceTile::onRemove(Level*, int, int, int) */
  override onRemove(level: Level, x: number, y: number, z: number): void {
    if (!FurnaceTile.noDrop && !level.isClientSide) {
      const container = level.getTileEntity(x, y, z) as FurnaceTileEntity | null;
      if (container !== null) {
        for (let i = 0; i < container.getContainerSize(); i++) {
          const item = container.getItem(i);
          if (item) {
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

  /** C++ FurnaceTile::recalcLockDir(Level*, int, int, int) — private */
  private recalcLockDir(level: Level, x: number, y: number, z: number): void {
    if (level.isClientSide) return;

    const n = level.getTile(x, y, z - 1);
    const s = level.getTile(x, y, z + 1);
    const w = level.getTile(x - 1, y, z);
    const e = level.getTile(x + 1, y, z);

    let lockDir = 3;
    if (Tile.solid[e] === true && Tile.solid[w] !== true) lockDir = 4;
    else if (Tile.solid[w] === true && Tile.solid[e] !== true) lockDir = 5;
    else if (Tile.solid[s] === true && Tile.solid[n] !== true) lockDir = 2;
    else if (Tile.solid[n] === true && Tile.solid[s] !== true) lockDir = 3;

    level.setData(x, y, z, lockDir);
  }
}
