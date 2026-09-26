/**
 * 1:1 移植自 src/world/level/chunk/EmptyLevelChunk.h（S4）：世界范围之外的占位区块。
 * ChunkCache 对超出 0..15 的区块坐标返回它：读到的方块全是 invisible_bedrock（95），写入一律忽略。
 *
 * 【OMIT 跟着基类走】LevelChunk 里 OMIT 了实体相关的方法，这里对它们的重写也一并 OMIT（手册 R3：
 *   virtual 函数在整条继承链上一起 OMIT）。否则 `override` 找不到基类方法，noImplicitOverride 下编译报错；
 *   去掉 override 硬写进来，又会变成一个通过 LevelChunk 类型永远调不到的孤立方法。移植实体时两边一起恢复。
 * 【C++ 里本来就注释掉的】方块实体的 4 个重写、getEntitiesOfClass、countEntities、shouldSave（EmptyLevelChunk.h:72-108），不移植。
 */
import { Random } from '@mcpe/util';
import type { Level } from '../Level';
import type { LightLayer } from '../LightLayer';
import { Tile } from '../tile/Tile';
import { LevelChunk } from './LevelChunk';

export class EmptyLevelChunk extends LevelChunk {
  constructor(level: Level, x: number, z: number);
  constructor(level: Level, blocks: Uint8Array | null, x: number, z: number);
  constructor(level: Level, a: number | Uint8Array | null, b: number, c?: number) {
    if (typeof a === 'number') super(level, a, b);
    else super(level, a, b, c!);
    this.dontSave = true;
  }

  override isAt(x: number, z: number): boolean {
    return x === this.x && z === this.z;
  }

  override getHeightmap(_x: number, _z: number): number {
    return 0;
  }

  override recalcBlockLights(): void {}

  override recalcHeightmapOnly(): void {}

  override recalcHeightmap(): void {}

  override lightLava(): void {}

  override getTile(_x: number, _y: number, _z: number): number {
    return Tile.invisible_bedrock.id;
  }

  override setTileAndData(_x: number, _y: number, _z: number, _tile: number, _data: number): boolean {
    return true;
  }

  override setTile(_x: number, _y: number, _z: number, _tile: number): boolean {
    return true;
  }

  override getData(_x: number, _y: number, _z: number): number {
    return 0;
  }

  override setData(_x: number, _y: number, _z: number, _val: number): void {}

  override getBrightness(_layer: LightLayer, _x: number, _y: number, _z: number): number {
    return 7;
  }

  override setBrightness(_layer: LightLayer, _x: number, _y: number, _z: number, _brightness: number): void {}

  override getRawBrightness(_x: number, _y: number, _z: number, _skyDampen: number): number {
    return 7;
  }

  // OMIT(Entity): addEntity(e)  EmptyLevelChunk.h:96
  // OMIT(Entity): removeEntity(e)  EmptyLevelChunk.h:100
  // OMIT(Entity): removeEntity(e, yc)  EmptyLevelChunk.h:104

  override isSkyLit(_x: number, _y: number, _z: number): boolean {
    return false;
  }

  override skyBrightnessChanged(): void {}

  override load(): void {}

  override unload(): void {}

  override markUnsaved(): void {}

  // OMIT(Entity): getEntities(except, bb, es)  EmptyLevelChunk.h:145

  override setBlocks(_newBlocks: Uint8Array, _sub: number): void {}

  /** 与 LevelChunk 不同：C++ 在这里返回 len，而不是 p + len；照原样保留 */
  override getBlocksAndData(data: Uint8Array, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: number): number {
    const xs = x1 - x0;
    const ys = y1 - y0;
    const zs = z1 - z0;
    const s = xs * ys * zs;
    const len = s + ((s / 2) | 0) * 3;
    data.fill(Tile.invisible_bedrock.id, p, p + len); // memset：方块、数据、光照三段都填 95
    return len;
  }

  /** 与 LevelChunk 不同：什么都不写，返回的也是长度而不是 p + len */
  override setBlocksAndData(_data: Uint8Array, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, _p: number): number {
    const xs = x1 - x0;
    const ys = y1 - y0;
    const zs = z1 - z0;
    const s = xs * ys * zs;
    return s + ((s / 2) | 0) * 3;
  }

  /** C++ 在子类里把 LevelChunk::getRandom 原样又写了一遍，这里同样照写 */
  override getRandom(l: number): Random {
    const x = this.x, z = this.z;
    const sum =
      (this.level.getSeed() +
        Math.imul(Math.imul(x, x), 4987142) +
        Math.imul(x, 5947611) +
        Math.imul(Math.imul(z, z), 4392871) +
        Math.imul(z, 389711)) | 0;
    return new Random(sum ^ l);
  }

  override isEmpty(): boolean {
    return true;
  }
}
