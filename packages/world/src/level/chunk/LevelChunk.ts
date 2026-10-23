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
 * 实体的 6 个方法在 S12 阶段 A 补上；方块实体的 7 个方法在 S11 阶段 A 补上。
 * entityBlocks：S12 阶段 A 起由 addEntity / removeEntity 维护。
 *
 * 【C++ 的未初始化字段】构造 1 的 blocks / blocksLength 与两个构造函数的 loaded / minHeight 在 C++ 里没有初始化，
 * 这里取 null / 0 / false / 0（读未初始化值是未定义行为）。
 * LevelChunk.ChunkBlockCount 是 C++ 的零初始化静态变量（值为 0），创建区块前要先设成 32768
 * （NinecraftApp::init 里是 LevelChunk::ChunkBlockCount = LEVEL_HEIGHT * CHUNK_COLUMNS）。
 */
import { TileEntity } from '../tile/entity/TileEntity';
import { LOGE, LOGI, LOGW } from '@mcpe/platform';
import { Mth, Random } from '@mcpe/util';
import type { AABB } from '../../phys/AABB';
import type { Entity } from '../../entity/Entity';
import { Level } from '../Level';
import { LevelConstants } from '../LevelConstants';
import { LightLayer } from '../LightLayer';
import type { EntityTile } from '../tile/EntityTile';
import { Tile } from '../tile/Tile';
import { TilePos } from '../TilePos';
import { DataLayer } from './DataLayer';

// ADAPTED(Cpp): C++ 未初始化 blocks / blocksLength（构造 1）与 loaded / minHeight（两个构造函数）；
// TS 取 null / 0 / false / 0，避免读未初始化内存。
// OMIT(LevelChunk): ~LevelChunk()  LevelChunk.cpp:42 —— 函数体只有一行被注释掉的 //delete blocks;，JS 由 GC 接管（R3）。
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
  protected entityBlocks: Entity[][] = Array.from(
    { length: LevelChunk.EntityBlocksArraySize },
    () => [],
  );
  /**
   * TEMap = std::map<TilePos, TileEntity*>：按 TilePos::operator<（比较 hashCode）判等与排序，所以用 hashCode 作键。
   * C++ 里在 protected 段；外部只能通过 getTileEntityMap() 读取。
   */
  protected tileEntities = new Map<number, TileEntity>();

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
        level.removeTileEntity(xOffs, y, zOffs);
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
          if ((this.heightmap[(_z << 4) | _x]! & 0xff) < min)
            min = this.heightmap[(_z << 4) | _x]! & 0xff;
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
    LOGI('LevelChunk::setBlocks\n');
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
    const x = this.x,
      z = this.z;
    const sum =
      (this.level.getSeed() +
        Math.imul(Math.imul(x, x), 4987142) +
        Math.imul(x, 5947611) +
        Math.imul(Math.imul(z, z), 4392871) +
        Math.imul(z, 389711)) |
      0;
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

  addEntity(e: Entity): void {
    this.lastSaveHadEntities = true;
    const xc = Mth.floor(e.x / 16);
    const zc = Mth.floor(e.z / 16);
    if (xc !== this.x || zc !== this.z) {
      LOGE(`ERR: WRONG LOCATION : ${xc}, ${this.x}, ${zc}, ${this.z}`);
    }
    let yc = Mth.floor(e.y / 16);
    if (yc < 0) yc = 0;
    if (yc >= LevelChunk.EntityBlocksArraySize) yc = LevelChunk.EntityBlocksArraySize - 1;
    e.inChunk = true;
    e.xChunk = this.x;
    e.yChunk = yc;
    e.zChunk = this.z;
    this.entityBlocks[yc]!.push(e);
  }

  /** C++ 的 removeEntity(e) 以 e->yChunk 转调 removeEntity(e, yc)（R10 情形 A） */
  removeEntity(e: Entity, yc: number = e.yChunk): void {
    if (yc < 0) yc = 0;
    if (yc >= LevelChunk.EntityBlocksArraySize) yc = LevelChunk.EntityBlocksArraySize - 1;
    const list = this.entityBlocks[yc]!;
    let w = 0;
    for (let r = 0; r < list.length; r++) if (list[r] !== e) list[w++] = list[r]!; // std::remove + erase
    list.length = w;
  }

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
    // C++ 里把方块实体、实体从 level 移除的代码被注释掉了
  }

  markUnsaved(): void {
    this.unsaved = true;
  }

  getEntities(except: Entity | null, bb: AABB, es: Entity[]): void {
    let yc0 = Mth.floor((bb.y0 - 2) / 16);
    let yc1 = Mth.floor((bb.y1 + 2) / 16);
    if (yc0 < 0) yc0 = 0;
    if (yc1 >= LevelChunk.EntityBlocksArraySize) yc1 = LevelChunk.EntityBlocksArraySize - 1;
    for (let yc = yc0; yc <= yc1; yc++) {
      const entities = this.entityBlocks[yc]!;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i]!;
        if (e !== except && e.bb.intersects(bb)) {
          es.push(e);
        }
      }
    }
  }

  getEntitiesOfType(entityType: number, bb: AABB, list: Entity[]): void {
    const [yc0, yc1] = this.entityRange(bb);
    for (let yc = yc0; yc <= yc1; yc++) {
      const entities = this.entityBlocks[yc]!;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i]!;
        if (e.getEntityTypeId() === entityType) list.push(e);
      }
    }
  }

  getEntitiesOfClass(type: number, bb: AABB, list: Entity[]): void {
    const [yc0, yc1] = this.entityRange(bb);
    for (let yc = yc0; yc <= yc1; yc++) {
      const entities = this.entityBlocks[yc]!;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i]!;
        if (e.getCreatureBaseType() === type) list.push(e);
      }
    }
  }

  /** getEntitiesOfType 与 getEntitiesOfClass 里相同的 yc0、yc1 计算（C++ 里两处逐字相同） */
  private entityRange(bb: AABB): [number, number] {
    let yc0 = Mth.floor((bb.y0 - 2) / 16);
    let yc1 = Mth.floor((bb.y1 + 2) / 16);
    if (yc0 < 0) {
      yc0 = 0;
    } else if (yc0 >= LevelChunk.EntityBlocksArraySize) {
      yc0 = LevelChunk.EntityBlocksArraySize - 1;
    }
    if (yc1 >= LevelChunk.EntityBlocksArraySize) {
      yc1 = LevelChunk.EntityBlocksArraySize - 1;
    } else if (yc1 < 0) {
      yc1 = 0;
    }
    return [yc0, yc1];
  }

  countEntities(): number {
    let entityCount = 0;
    for (let yc = 0; yc < LevelChunk.EntityBlocksArraySize; yc++) {
      entityCount += this.entityBlocks[yc]!.length;
    }
    return entityCount;
  }

  getTileEntity(x: number, y: number, z: number): TileEntity | null {
    const pos = new TilePos(x, y, z).hashCode();
    const cit = this.tileEntities.get(pos);
    let tileEntity: TileEntity | null = null;
    if (cit === undefined) {
      const t = this.getTile(x, y, z);
      if (t <= 0 || !Tile.isEntityTile[t]) return null;
      if (tileEntity === null) {
        tileEntity = (Tile.tiles[t] as EntityTile).newTileEntity();
        this.level.setTileEntity(this.xt + x, y, this.zt + z, tileEntity);
      }
    } else {
      tileEntity = cit;
    }
    if (tileEntity !== null && tileEntity.isRemoved()) {
      // ADAPTED(Safety): C++ 在 cit 指向 end() 时也会 erase(cit)（未定义行为）；这里只在找到时删除
      if (cit !== undefined) this.tileEntities.delete(pos);
      return null;
    }
    return tileEntity;
  }

  /** C++ 的两个重载：hasTileEntityAt(x, y, z) 与 hasTileEntityAt(TileEntity*) */
  hasTileEntityAt(x: number, y: number, z: number): boolean;
  hasTileEntityAt(te: TileEntity): boolean;
  hasTileEntityAt(a: number | TileEntity, y?: number, z?: number): boolean {
    if (typeof a === 'number') return this.tileEntities.has(new TilePos(a, y!, z!).hashCode());
    return this.tileEntities.has(new TilePos(a.x & 15, a.y, a.z & 15).hashCode());
  }

  addTileEntity(te: TileEntity): void {
    const xx = te.x - this.xt;
    const yy = te.y;
    const zz = te.z - this.zt;
    this.setTileEntity(xx, yy, zz, te);
    if (this.loaded) {
      this.level.tileEntities.push(te);
    }
  }

  setTileEntity(x: number, y: number, z: number, tileEntity: TileEntity): void {
    tileEntity.setLevelAndPos(this.level, this.xt + x, y, this.zt + z);
    const t = this.getTile(x, y, z);
    if (t === 0 || !Tile.isEntityTile[t]) {
      LOGW(
        `Attempted to place a tile entity where there was no entity tile! ${tileEntity.x}, ${tileEntity.y}, ${tileEntity.z}\n`,
      );
      return;
    }
    tileEntity.clearRemoved();
    const key = new TilePos(x, y, z).hashCode();
    if (!this.tileEntities.has(key)) this.tileEntities.set(key, tileEntity); // std::map::insert 不覆盖已有键
  }

  removeTileEntity(x: number, y: number, z: number): void {
    if (this.loaded) {
      const pos = new TilePos(x, y, z).hashCode();
      const cit = this.tileEntities.get(pos);
      if (cit !== undefined) {
        // C++ 的 setRemoved 不是 virtual，这里经 TileEntity* 调用的是 TileEntity::setRemoved（ChestTileEntity 的同名函数不会被执行）
        TileEntity.prototype.setRemoved.call(cit);
        if (!this.level.isClientSide) {
          for (let i = 0; i < this.level.players.length; ++i) {
            this.level.players[i]!.tileEntityDestroyed(cit.runningId);
          }
        }
        this.tileEntities.delete(pos);
      }
    }
  }

  getBlocksAndData(
    data: Uint8Array,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    p: number,
  ): number {
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

  setBlocksAndData(
    data: Uint8Array,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    p: number,
  ): number {
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

  // ADAPTED(Cpp): C++ 返回 const TEMap&（按 hashCode 有序的活引用）；JS Map 没有只读引用，
  // 这里返回按 hashCode 排序的新 Map。
  getTileEntityMap(): ReadonlyMap<number, TileEntity> {
    return new Map([...this.tileEntities.entries()].sort((a, b) => a[0] - b[0]));
  }
}
