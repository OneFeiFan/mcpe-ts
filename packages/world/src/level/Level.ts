/**
 * FORWARD-DECL(Level)：类 + 同名接口（手册 R2 的第二种前向声明），对应 src/world/level/Level.h。
 *
 *  - class 里是 Level.h / Level.cpp 的真实静态常量。它们在运行时就要用到，
 *    比如 Tile::setLightEmission 读 Level::MAX_BRIGHTNESS，纯接口做不到。
 *  - 同名 interface 声明实例成员，只列出 S3 已移植代码（Tile.cpp 与 16 个方块类，去掉 OMIT 的函数）用到的成员。
 *    成员名与 C++ 相同；C++ 的重载写成 TS 的重载签名。S4 的 LevelChunk 又补了 updateLight、lightColumnChanged、getHeightmap、getSeed。
 *  - S4 的单测用实现这个接口的测试替身即可（对象字面量就能满足类型）。
 *  - S5 移植 Level 正身时：删掉下面的 interface，在 class 里写入真实实现；调用方不用改。
 */
// FORWARD-DECL(Level)：类 + 同名接口，S5 移植正身时删除下面的 interface
import { SharedConstants } from '@mcpe/core';
import { LevelConstants } from './LevelConstants';
import type { LevelSource } from './LevelSource';
import type { LevelChunk } from './chunk/LevelChunk';
import type { LightLayer } from './LightLayer';
import type { Dimension } from './dimension/Dimension';

export class Level {
  static readonly MAX_TICK_TILES_PER_TICK = 100; // was 1000
  static readonly MAX_LEVEL_SIZE = 32000000;
  static readonly DEPTH = LevelConstants.LEVEL_HEIGHT; // Level.cpp
  static readonly SEA_LEVEL = Level.DEPTH / 2 - 1; // Level.cpp
  static readonly MAX_BRIGHTNESS = 15;
  static readonly TICKS_PER_DAY = SharedConstants.TicksPerSecond * 60 * 16; // 分支改成 16 分钟一天（原版 20 分钟）
  static readonly MIDDLE_OF_NIGHT_TIME = 12000;
  static readonly genDepthBits = 7;
  static readonly genDepthBitsPlusFour = Level.genDepthBits + 4;
  static readonly genDepth = 1 << Level.genDepthBits;
  static readonly genDepthMinusOne = Level.genDepth - 1;

  // S5 之前没有真实实现，禁止实例化
  private constructor() {}
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- 前向声明：S5 删除本接口
export interface Level extends LevelSource {
  isClientSide: boolean;
  noNeighborUpdate: boolean;
  dimension: Dimension;

  getRawBrightness(x: number, y: number, z: number): number;
  getRawBrightness(x: number, y: number, z: number, propagate: boolean): number;
  hasChunksAt(x: number, y: number, z: number, r: number): boolean;
  hasChunksAt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean;

  setTile(x: number, y: number, z: number, tile: number): boolean;
  setData(x: number, y: number, z: number, data: number): void;
  setDataNoUpdate(x: number, y: number, z: number, data: number): boolean;
  setTileAndData(x: number, y: number, z: number, tile: number, data: number): boolean;
  setTileAndDataNoUpdate(x: number, y: number, z: number, tile: number, data: number): boolean;
  setTilesDirty(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void;
  sendTileUpdated(x: number, y: number, z: number): void;
  updateNeighborsAt(x: number, y: number, z: number, tile: number): void;
  addToTickNextTick(x: number, y: number, z: number, tileId: number, tickDelay: number): void;

  // LevelChunk（S4）
  updateLight(layer: LightLayer, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void;
  updateLight(layer: LightLayer, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, join: boolean): void;
  lightColumnChanged(x: number, z: number, y0: number, y1: number): void;
  getHeightmap(x: number, z: number): number;
  getSeed(): number;

  // LightUpdate（S4）。getBrightness 在 C++ 里有两个重载：LevelSource 的 (x, y, z) 返回 float，这里的 (layer, x, y, z) 返回 int
  getBrightness(x: number, y: number, z: number): number;
  getBrightness(layer: LightLayer, x: number, y: number, z: number): number;
  setBrightness(layer: LightLayer, x: number, y: number, z: number, brightness: number): void;
  isSkyLit(x: number, y: number, z: number): boolean;
  updateLightIfOtherThan(layer: LightLayer, x: number, y: number, z: number, expected: number): void;
  getChunk(x: number, z: number): LevelChunk;

  // Dimension（S4）
  getTopTile(x: number, z: number): number;

  // Region、ChunkCache（S4）
  skyDarken: number;
  getTime(): number;

  addParticle(id: string, x: number, y: number, z: number, xd: number, yd: number, zd: number, data?: number): void;
  playSound(x: number, y: number, z: number, name: string, volume: number, pitch: number): void;
}
