// 1:1 移植自 src/world/level/tile/BedTile.h 与 BedTile.cpp（S3）
import { BedSleepingResult, type Player } from '../../entity/player/Player';
import { Mth } from '@mcpe/util';
import { ItemInstance } from '../../item/ItemInstance';
import type { Random } from '@mcpe/util';
import { Direction } from '../../Direction';
import { Facing } from '../../Facing';
import { Item } from '../../item/Item';
import type { Pos } from '../../Pos';
import type { Level } from '../Level';
import type { LevelSource } from '../LevelSource';
import { Material } from '../material/Material';
import { DirectionalTile } from './DirectionalTile';
import { Tile } from './Tile';

export class BedTile extends DirectionalTile {
  static readonly HEAD_PIECE_DATA = 0x8;
  static readonly OCCUPIED_DATA = 0x4;
  static readonly HEAD_DIRECTION_OFFSETS: readonly (readonly [number, number])[] = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ];

  constructor(id: number) {
    super(id, 6 + 8 * 16, Material.cloth);
    this.setShape();
  }

  /**
   * C++ `bool BedTile::use(Level*, int x, int y, int z, Player* player)`：右键床。
   * 正在睡这张床就起床；找到床头那一格；不能重生的维度（下界）里用床会把床炸掉；床被别人占着就提示；
   * 否则 startSleepInBed，按结果提示“只能在夜里睡觉”“附近有怪物”。
   * 原样保留：炸床那段算了床的中心 xc/yc/zc 却不用，爆炸位置用的是另一半床的坐标；y 加的是 HEAD_DIRECTION_OFFSETS 的第二个分量（本应是 z）。
   */
  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    if (player.isSleeping()) {
      let dimensionsMatch = player.bedPosition.x === x ? 1 : 0;
      dimensionsMatch += player.bedPosition.y === y ? 1 : 0;
      dimensionsMatch += player.bedPosition.z === z ? 1 : 0;
      let maxDistance = Mth.abs(player.bedPosition.x - x);
      maxDistance = Mth.Max(maxDistance, Mth.abs(player.bedPosition.y - y));
      maxDistance = Mth.Max(maxDistance, Mth.abs(player.bedPosition.z - z));
      if (dimensionsMatch >= 2 && maxDistance < 3) {
        player.stopSleepInBed(false, true, true);
        return true;
      }
    }
    if (level.isClientSide) return true;
    let data = level.getData(x, y, z);
    if (!BedTile.isHeadPiece(data)) {
      const direction = DirectionalTile.getDirection(data);
      x += BedTile.HEAD_DIRECTION_OFFSETS[direction]![0];
      z += BedTile.HEAD_DIRECTION_OFFSETS[direction]![1];
      if (level.getTile(x, y, z) !== this.id) {
        return true;
      }
      data = level.getData(x, y, z);
    }
    if (!level.dimension!.mayRespawn()) {
      level.setTile(x, y, z, 0);
      const direction = DirectionalTile.getDirection(data);
      x += BedTile.HEAD_DIRECTION_OFFSETS[direction]![0];
      y += BedTile.HEAD_DIRECTION_OFFSETS[direction]![1];
      if (level.getTile(x, y, z) === this.id) {
        level.setTile(x, y, z, 0);
      }
      level.explode(null, Math.fround(x + 0.5), Math.fround(y + 0.5), Math.fround(z + 0.5), 5, true);
      return true;
    }
    if (BedTile.isOccupied(data)) {
      let sleepingPlayer: Player | null = null;
      for (const p of level.players) {
        if (p.isSleeping()) {
          const pos = p.bedPosition;
          if (pos.x === x && pos.y === y && pos.z === z) {
            sleepingPlayer = p;
            break;
          }
        }
      }
      if (sleepingPlayer === null) {
        BedTile.setOccupied(level, x, y, z, false);
      } else {
        sleepingPlayer.displayClientMessage('This bed is occupied');
        return true;
      }
    }
    const result = player.startSleepInBed(x, y, z);
    if (result === BedSleepingResult.OK) {
      BedTile.setOccupied(level, x, y, z, true);
      return true;
    }
    if (result === BedSleepingResult.NOT_POSSIBLE_NOW) {
      player.displayClientMessage('You can only sleep at night');
    } else if (result === BedSleepingResult.NOT_SAFE) {
      player.displayClientMessage('You may not rest now, there are monsters nearby');
    }
    return true;
  }

  static setOccupied(level: Level, x: number, y: number, z: number, occupied: boolean): void {
    let data = level.getData(x, y, z);
    if (occupied) {
      data |= BedTile.OCCUPIED_DATA;
    } else {
      data &= ~BedTile.OCCUPIED_DATA;
    }
    level.setData(x, y, z, data);
  }

  /** C++ getTexture(int face, int data) */
  override getTextureForData(face: number, data: number): number {
    if (face === Facing.DOWN) {
      return Tile.wood.tex;
    }
    const direction = DirectionalTile.getDirection(data);
    const tileFacing = Direction.RELATIVE_DIRECTION_FACING[direction]![face]!;
    if (BedTile.isHeadPiece(data)) {
      if (tileFacing === Facing.NORTH) {
        return this.tex + 2 + 16;
      }
      if (tileFacing === Facing.EAST || tileFacing === Facing.WEST) {
        return this.tex + 1 + 16;
      }
      return this.tex + 1;
    } else {
      if (tileFacing === Facing.SOUTH) {
        return this.tex - 1 + 16;
      }
      if (tileFacing === Facing.EAST || tileFacing === Facing.WEST) {
        return this.tex + 16;
      }
      return this.tex;
    }
  }

  override getRenderShape(): number {
    return Tile.SHAPE_BED;
  }

  override isCubeShaped(): boolean {
    return false;
  }

  override isSolidRender(): boolean {
    return false;
  }

  override neighborChanged(level: Level, x: number, y: number, z: number, _type: number): void {
    const data = level.getData(x, y, z);
    const direction = DirectionalTile.getDirection(data);
    const off = BedTile.HEAD_DIRECTION_OFFSETS[direction]!;
    if (BedTile.isHeadPiece(data)) {
      if (level.getTile(x - off[0], y, z - off[1]) !== this.id) {
        level.setTile(x, y, z, 0);
      }
    } else {
      if (level.getTile(x + off[0], y, z + off[1]) !== this.id) {
        level.setTile(x, y, z, 0);
        if (!level.isClientSide) {
          this.popResource(level, x, y, z, new ItemInstance(Item.bed));
        }
      }
    }
  }

  override getResource(data: number, _random: Random): number {
    if (BedTile.isHeadPiece(data)) {
      return 0;
    }
    return Item.bed.id; // 依赖未注册：Item.bed（只被已 OMIT 的 spawnResources 调用）
  }

  /** @param position 输出参数（C++ 的 Pos&），找到时写入站立位置 */
  static findStandUpPosition(
    level: Level,
    x: number,
    y: number,
    z: number,
    skipCount: number,
    position: Pos,
  ): boolean {
    const data = level.getData(x, y, z);
    const direction = DirectionalTile.getDirection(data);
    const off = BedTile.HEAD_DIRECTION_OFFSETS[direction]!;
    for (let step = 0; step <= 1; ++step) {
      const startX = x - off[0] * step - 1;
      const startZ = z - off[1] * step - 1;
      const endX = startX + 2;
      const endZ = startZ + 2;
      for (let standX = startX; standX <= endX; ++standX) {
        for (let standZ = startZ; standZ <= endZ; ++standZ) {
          if (
            level.isSolidBlockingTile(standX, y - 1, standZ) &&
            level.isEmptyTile(standX, y, standZ) &&
            level.isEmptyTile(standX, y + 1, standZ)
          ) {
            if (skipCount > 0) {
              skipCount--;
              continue;
            }
            position.set(standX, y, standZ);
            return true;
          }
        }
      }
    }
    return false;
  }

  override spawnResources(
    level: Level,
    x: number,
    y: number,
    z: number,
    data: number,
    _odds = 1,
  ): void {
    if (!BedTile.isHeadPiece(data)) {
      this.popResource(level, x, y, z, new ItemInstance(Item.bed));
    }
  }

  override updateShape(_level: LevelSource, _x: number, _y: number, _z: number): void {
    this.setShape();
  }

  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }

  /**
   * C++ 的 BedTile 新增了无参的 setShape()，并且遮蔽了 Tile 的 6 参数版本。
   * TS 只能有一个 setShape：无参时设为床的形状，有参时照常转给 Tile。
   */
  override setShape(): void;
  override setShape(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void;
  override setShape(
    x0?: number,
    y0?: number,
    z0?: number,
    x1?: number,
    y1?: number,
    z1?: number,
  ): void {
    if (x0 === undefined) super.setShape(0, 0, 0, 1, 9.0 / 16.0, 1);
    else super.setShape(x0, y0!, z0!, x1!, y1!, z1!);
  }

  static isHeadPiece(data: number): boolean {
    return (data & BedTile.HEAD_PIECE_DATA) !== 0;
  }

  static isOccupied(data: number): boolean {
    return (data & BedTile.OCCUPIED_DATA) !== 0;
  }
}
