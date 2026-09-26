/**
 * 1:1 移植自 src/world/level/chunk/LevelChunk.h 与 LevelChunk.cpp（S4）。
 *
 * 数组布局与 C++ 相同：blocks[x << 11 | z << 7 | y]，heightmap[z << 4 | x]，updateMap[x | z << 4]。
 * heightmap 是 C++ 的 char*（有符号），用 Int8Array；高度最大 127，与无符号读法结果相同。
 *
 * 【三档规则】
 *  - getRandom 在“种子 → 世界”的链上（地物、刷怪都用它），整数运算逐位与 C++ 一致（Math.imul 与 | 0）。
 *  - 高度图与天空光的重算是整数逻辑，本来就与 C++ 一致。
 *
 * 【OMIT】实体与方块实体相关的 13 个方法；setTileAndData 里客户端删除方块实体的一句 DEFERRED(TileEntity)。
 * entityBlocks 仍然保留（countEntities 要用），里面始终为空。
 *
 * 【C++ 的未初始化字段】loaded、minHeight 在 C++ 构造函数里没有初始化，这里取 false、0。
 * LevelChunk.ChunkBlockCount 是 C++ 的未初始化静态变量（值为 0），创建区块前要先设成 32768
 * （NinecraftApp::init 里是 LevelChunk::ChunkBlockCount = LEVEL_HEIGHT * CHUNK_COLUMNS）。
 */
import { Random } from '@mcpe/util';
import type { Entity } from '../../entity/Entity';
import { Level } from '../Level';
import { LevelConstants } from '../LevelConstants';
import { LightLayer } from '../LightLayer';
import { Tile } from '../tile/Tile';
import { DataLayer } from './DataLayer';

export class LevelChunk {
  static touchedSky = false;
  static ChunkBlockCount = 0;
  static readonly UpdateMapBitShift = 4; // power of (LevelConstants::LEVEL_HEIGHT / 8) == 16
  protected static readonly EntityBlocksArraySize = 128 / 16;

  readonly ChunkSize: number = LevelChunk.ChunkBlockCount;
  blocksLength = 0; // ? needed or not? (i.e. are all chunks the same size?)
  loaded = false;
  level: Level;
  data: DataLayer;
  skyLight: DataLayer;
  blockLight: DataLayer;
  heightmap!: Int8Array; // [LevelConstants::CHUNK_COLUMNS]
  updateMap!: Uint8Array; // marks regions within block columns that have been modified
  minHeight = 0;
  x: number;
  z: number;
  xt: number;
  zt: number;
  terrainPopulated = false;
  unsaved = false;
  dontSave = false;
  createdFromSave = false;
  lastSaveHadEntities = false;
  lastSaveTime = 0;
  protected blocks: Uint8Array | null;
  protected entityBlocks: Entity[][] = Array.from({ length: LevelChunk.EntityBlocksArraySize }, () => []);
  // OMIT(TileEntity): TEMap tileEntities;  LevelChunk.h:140（只被已 OMIT 的方块实体方法使用）

  constructor(level: Level, x: number, z: number);
  /** blocks 可以为 null：C++ 的 unsigned char* 允许 NULL，ChunkCache 就是这样创建 EmptyLevelChunk 的 */
  constructor(level: Level, blocks: Uint8Array | null, x: number, z: number);
  constructor(level: Level, a: number | Uint8Array | null, b: number, c?: number) {
    this.level = level;
    if (typeof a === 'number') {
      this.x = a;
      this.z = b;
      this.blocks = null;
      this.data = new DataLayer();
      this.skyLight = new DataLayer();
      this.blockLight = new DataLayer();
    } else {
      this.x = b;
      this.z = c!;
      this.blocks = a;
      this.data = new DataLayer(LevelChunk.ChunkBlockCount);
      this.skyLight = new DataLayer(LevelChunk.ChunkBlockCount);
      this.blockLight = new DataLayer(LevelChunk.ChunkBlockCount);
      this.blocksLength = LevelChunk.ChunkBlockCount;
    }
    this.xt = this.x * LevelConstants.CHUNK_WIDTH;
    this.zt = this.z * LevelConstants.CHUNK_DEPTH;
    this.init();
  }

  init(): void {
    this.heightmap = new Int8Array(LevelConstants.CHUNK_COLUMNS);
    this.updateMap = new Uint8Array(LevelConstants.CHUNK_COLUMNS);
    this.terrainPopulated = false;
    this.dontSave = false;
    this.unsaved = false;
    this.lastSaveHadEntities = false;
    this.createdFromSave = false;
    this.lastSaveTime = 0;
    // memset(heightmap / updateMap, 0, 256)：新建的 TypedArray 已是 0
  }

  setTileAndData(x: number, y: number, z: number, tile_: number, data_: number): boolean {
    const blocks = this.blocks!;
    const level = this.level;
    const tile = tile_ & 0xff;
    const oldHeight = this.heightmap[(z << 4) | x]!;
    const old = blocks[(x << 11) | (z << 7) | y]!;
    if (old === tile && this.data.get(x, y, z) === data_) return false;
    const xOffs = this.xt + x;
    const zOffs = this.zt + z;
    blocks[(x << 11) | (z << 7) | y] = tile;
    if (old !== 0) {
      if (!level.isClientSide) {
        Tile.tiles[old]!.onRemove(level, xOffs, y, zOffs);
      } else if (old !== tile && Tile.isEntityTile[old]) {
        // DEFERRED(TileEntity): level->removeTileEntity(xOffs, y, zOffs);
      }
    }
    this.data.set(x, y, z, data_);
    if (!level.dimension.hasCeiling) {
      if (Tile.lightBlock[tile] !== 0) {
        if (y >= oldHeight) {
          this.recalcHeight(x, y + 1, z);
        }
      } else {
        if (y === oldHeight - 1) {
          this.recalcHeight(x, y, z);
        }
      }
      level.updateLight(LightLayer.Sky, xOffs, y, zOffs, xOffs, y, zOffs);
    }
    level.updateLight(LightLayer.Block, xOffs, y, zOffs, xOffs, y, zOffs);
    this.lightGaps(x, z);
    if (!level.isClientSide && tile !== 0) {
      Tile.tiles[tile]!.onPlace(level, xOffs, y, zOffs);
    }
    this.unsaved = true;
    this.updateMap[x | (z << 4)]! |= 1 << (y >> LevelChunk.UpdateMapBitShift);
    return true;
  }

  setTile(x: number, y: number, z: number, tile_: number): boolean {
    const blocks = this.blocks!;
    const level = this.level;
    const tile = tile_ & 0xff;
    const oldHeight = this.heightmap[(z << 4) | x]! & 0xff;
    const old = blocks[(x << 11) | (z << 7) | y]! & 0xff;
    if (old === tile_) return false;
    const xOffs = this.xt + x;
    const zOffs = this.zt + z;
    blocks[(x << 11) | (z << 7) | y] = tile & 0xff;
    if (old !== 0) {
      Tile.tiles[old]!.onRemove(level, xOffs, y, zOffs);
    }
    this.data.set(x, y, z, 0);
    if (Tile.lightBlock[tile & 0xff] !== 0) {
      if (y >= oldHeight) {
        this.recalcHeight(x, y + 1, z);
      }
    } else {
      if (y === oldHeight - 1) {
        this.recalcHeight(x, y, z);
      }
    }
    level.updateLight(LightLayer.Sky, xOffs, y, zOffs, xOffs, y, zOffs);
    level.updateLight(LightLayer.Block, xOffs, y, zOffs, xOffs, y, zOffs);
    this.lightGaps(x, z);
    if (tile_ !== 0) {
      if (!level.isClientSide) Tile.tiles[tile_]!.onPlace(level, xOffs, y, zOffs);
    }
    this.unsaved = true;
    this.updateMap[x | (z << 4)]! |= 1 << (y >> LevelChunk.UpdateMapBitShift);
    return true;
  }

  setTileRaw(x: number, y: number, z: number, tile: number): void {
    this.blocks![(x << 11) | (z << 7) | y] = tile;
  }

  getData(x: number, y: number, z: number): number {
    return this.data.get(x, y, z);
  }

  recalcHeightmapOnly(): void {
    const blocks = this.blocks!;
    let min = Level.DEPTH - 1;
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++) {
        let y = Level.DEPTH - 1;
        const p = (x << 11) | (z << 7);
        while (y > 0 && Tile.lightBlock[blocks[p + y - 1]! & 0xff] === 0) y--;
        this.heightmap[(z << 4) | x] = y;
        if (y < min) min = y;
      }
    this.minHeight = min;
  }

  recalcHeightmap(): void {
    const blocks = this.blocks!;
    let min = Level.DEPTH - 1;
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++) {
        let y = Level.DEPTH - 1;
        const p = (x << 11) | (z << 7);
        while (y > 0 && Tile.lightBlock[blocks[p + y - 1]! & 0xff] === 0) y--;
        this.heightmap[(z << 4) | x] = y;
        if (y < min) min = y;
        if (!this.level.dimension.hasCeiling) {
          let br = Level.MAX_BRIGHTNESS;
          let yy = Level.DEPTH - 1;
          do {
            br -= Tile.lightBlock[blocks[p + yy]! & 0xff]!;
            if (br > 0) {
              this.skyLight.set(x, yy, z, br);
            }
            yy--;
          } while (yy > 0 && br > 0);
        }
      }
    this.minHeight = min;
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++) {
        this.lightGaps(x, z);
      }
  }

  private recalcHeight(x: number, yStart: number, z: number): void {
    const blocks = this.blocks!;
    const level = this.level;
    const yOld = this.heightmap[(z << 4) | x]! & 0xff;
    let y = yOld;
    if (yStart > yOld) y = yStart;
    const p = (x << 11) | (z << 7);
    while (y > 0 && Tile.lightBlock[blocks[p + y - 1]! & 0xff] === 0) y--;
    if (y === yOld) return;
    const xOffs = this.xt + x;
    const zOffs = this.zt + z;
    level.lightColumnChanged(xOffs, zOffs, y, yOld);
    this.heightmap[(z << 4) | x] = y;
    if (y < this.minHeight) {
      this.minHeight = y;
    } else {
      let min = Level.DEPTH - 1;
      for (let _x = 0; _x < 16; _x++)
        for (let _z = 0; _z < 16; _z++) {
          if ((this.heightmap[(_z << 4) | _x]! & 0xff) < min) min = this.heightmap[(_z << 4) | _x]! & 0xff;
        }
      this.minHeight = min;
    }
    if (y < yOld) {
      for (let yy = y; yy < yOld; yy++) {
        this.skyLight.set(x, yy, z, 15);
      }
    } else {
      level.updateLight(LightLayer.Sky, xOffs, yOld, zOffs, xOffs, y, zOffs);
      for (let yy = yOld; yy < y; yy++) {
        this.skyLight.set(x, yy, z, 0);
      }
    }
    let br = 15;
    const y0 = y;
    while (y > 0 && br > 0) {
      y--;
      let block = Tile.lightBlock[this.getTile(x, y, z)]!;
      if (block === 0) block = 1;
      br -= block;
      if (br < 0) br = 0;
      this.skyLight.set(x, y, z, br);
    }
    while (y > 0 && Tile.lightBlock[this.getTile(x, y - 1, z)] === 0) y--;
    if (y !== y0) {
      level.updateLight(LightLayer.Sky, xOffs - 1, y, zOffs - 1, xOffs + 1, y0, zOffs + 1);
    }
  }

  skyBrightnessChanged(): void {
    const x0 = this.xt;
    const y0 = this.minHeight - 16;
    const z0 = this.zt;
    const x1 = this.xt + 16;
    const y1 = Level.DEPTH - 1;
    const z1 = this.zt + 16;
    this.level.setTilesDirty(x0, y0, z0, x1, y1, z1);
  }

  shouldSave(_force: boolean): boolean {
    if (this.dontSave) return false;
    // C++ 里按时间与实体判断的部分被注释掉了
    return this.unsaved;
  }

  setBlocks(newBlocks: Uint8Array, sub: number): void {
    const blocks = this.blocks!;
    for (let i = 0; i < 128 * 16 * 4; i++) {
      blocks[sub * 128 * 16 * 4 + i] = newBlocks[i]!;
    }
    for (let x = sub * 4; x < sub * 4 + 4; x++) {
      for (let z = 0; z < 16; z++) {
        this.recalcHeight(x, 0, z);
      }
    }
    const { xt, zt, level } = this;
    level.updateLight(LightLayer.Sky, xt + sub * 4, 0, zt, xt + sub * 4 + 4, 128, zt + 16);
    level.updateLight(LightLayer.Block, xt + sub * 4, 0, zt, xt + sub * 4 + 4, 128, zt + 16);
    level.setTilesDirty(xt + sub * 4, 0, zt, xt + sub * 4 + 4, 128, zt);
  }

  /** 种子链：与 C++ 的整数回绕逐位一致（Random 只用低 32 位） */
  getRandom(l: number): Random {
    const x = this.x, z = this.z;
    const sum =
      (this.level.getSeed() +
        Math.imul(Math.imul(x, x), 4987142) +
        Math.imul(x, 5947611) +
        Math.imul(Math.imul(z, z), 4392871) +
        Math.imul(z, 389711)) | 0;
    return new Random(sum ^ l);
  }

  private lightGap(x: number, z: number, source: number): void {
    const height = this.level.getHeightmap(x, z);
    if (height > source) {
      this.level.updateLight(LightLayer.Sky, x, source, z, x, height, z);
    } else if (height < source) {
      this.level.updateLight(LightLayer.Sky, x, height, z, x, source, z);
    }
  }

  clearUpdateMap(): void {
    this.updateMap.fill(0);
    this.unsaved = false;
  }

  deleteBlockData(): void {
    this.blocks = null;
  }

  isAt(x: number, z: number): boolean {
    return x === this.x && z === this.z;
  }

  getHeightmap(x: number, z: number): number {
    return this.heightmap[(z << 4) | x]! & 0xff;
  }

  getBlockData(): Uint8Array | null {
    return this.blocks;
  }

  recalcBlockLights(): void {}

  private lightGaps(x: number, z: number): void {
    const height = this.getHeightmap(x, z);
    const xOffs = this.xt + x;
    const zOffs = this.zt + z;
    this.lightGap(xOffs - 1, zOffs, height);
    this.lightGap(xOffs + 1, zOffs, height);
    this.lightGap(xOffs, zOffs - 1, height);
    this.lightGap(xOffs, zOffs + 1, height);
  }

  getTile(x: number, y: number, z: number): number {
    return this.blocks![(x << 11) | (z << 7) | y]! & 0xff;
  }

  setData(x: number, y: number, z: number, val: number): void {
    this.data.set(x, y, z, val);
  }

  getBrightness(layer: LightLayer, x: number, y: number, z: number): number {
    if (layer === LightLayer.Sky) return this.skyLight.get(x, y, z);
    else if (layer === LightLayer.Block) return this.blockLight.get(x, y, z);
    else return 0;
  }

  setBrightness(layer: LightLayer, x: number, y: number, z: number, brightness: number): void {
    if (layer === LightLayer.Sky) this.skyLight.set(x, y, z, brightness);
    else if (layer === LightLayer.Block) this.blockLight.set(x, y, z, brightness);
  }

  getRawBrightness(x: number, y: number, z: number, skyDampen: number): number {
    let light = this.skyLight.get(x, y, z);
    if (light > 0) LevelChunk.touchedSky = true;
    light -= skyDampen;
    const block = this.blockLight.get(x, y, z);
    if (block > light) light = block;
    return light;
  }

  // OMIT(Entity): addEntity(e)  LevelChunk.cpp:409
  // OMIT(Entity): removeEntity(e)  LevelChunk.cpp:429
  // OMIT(Entity): removeEntity(e, yc)  LevelChunk.cpp:434

  isSkyLit(x: number, y: number, z: number): boolean {
    return y >= (this.heightmap[(z << 4) | x]! & 0xff);
  }

  lightLava(): void {}

  load(): void {
    this.loaded = true;
    // C++ 里把方块实体、实体加回 level 的代码被注释掉了
  }

  unload(): void {
    this.loaded = false;
  }

  markUnsaved(): void {
    this.unsaved = true;
  }

  // OMIT(Entity): getEntities(except, bb, es)  LevelChunk.cpp:473
  // OMIT(Entity): getEntitiesOfType(entityType, bb, list)  LevelChunk.cpp:490
  // OMIT(Entity): getEntitiesOfClass(type, bb, list)  LevelChunk.cpp:515

  countEntities(): number {
    let entityCount = 0;
    for (let yc = 0; yc < LevelChunk.EntityBlocksArraySize; yc++) {
      entityCount += this.entityBlocks[yc]!.length;
    }
    return entityCount;
  }

  // OMIT(TileEntity): getTileEntity(x, y, z)  LevelChunk.cpp:550
  // OMIT(TileEntity): hasTileEntityAt(x, y, z)  LevelChunk.cpp:582
  // OMIT(TileEntity): hasTileEntityAt(te)  LevelChunk.cpp:586
  // OMIT(TileEntity): addTileEntity(te)  LevelChunk.cpp:591
  // OMIT(TileEntity): setTileEntity(x, y, z, tileEntity)  LevelChunk.cpp:602
  // OMIT(TileEntity): removeTileEntity(x, y, z)  LevelChunk.cpp:616

  getBlocksAndData(data: Uint8Array, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: number): number {
    const blocks = this.blocks!;
    let len = y1 - y0;
    for (let x = x0; x < x1; x++)
      for (let z = z0; z < z1; z++) {
        const slot = (x << 11) | (z << 7) | y0;
        data.set(blocks.subarray(slot, slot + len), p);
        p += len;
      }
    len = ((y1 - y0) / 2) | 0;
    for (const layer of [this.data.data!, this.blockLight.data!, this.skyLight.data!]) {
      for (let x = x0; x < x1; x++)
        for (let z = z0; z < z1; z++) {
          const slot = ((x << 11) | (z << 7) | y0) >> 1;
          data.set(layer.subarray(slot, slot + len), p);
          p += len;
        }
    }
    return p;
  }

  setBlocksAndData(data: Uint8Array, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, p: number): number {
    const blocks = this.blocks!;
    let len = y1 - y0;
    for (let x = x0; x < x1; x++)
      for (let z = z0; z < z1; z++) {
        const slot = (x << 11) | (z << 7) | y0;
        blocks.set(data.subarray(p, p + len), slot);
        p += len;
      }
    this.recalcHeightmapOnly();
    len = ((y1 - y0) / 2) | 0;
    for (const layer of [this.data.data!, this.blockLight.data!, this.skyLight.data!]) {
      for (let x = x0; x < x1; x++)
        for (let z = z0; z < z1; z++) {
          const slot = ((x << 11) | (z << 7) | y0) >> 1;
          layer.set(data.subarray(p, p + len), slot);
          p += len;
        }
    }
    return p;
  }

  isEmpty(): boolean {
    return false;
  }

  // OMIT(TileEntity): getTileEntityMap()  LevelChunk.cpp:715
}
