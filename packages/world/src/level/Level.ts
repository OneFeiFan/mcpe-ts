/**
 * 1:1 移植自 src/world/level/Level.h 与 Level.cpp（S5）。替换原来的 FORWARD-DECL(Level)。
 *
 * 【PORT-CUT】
 *  - _init：new PathFinder() → DEFERRED(PathFinder)
 *  - tick：MobSpawner 整块 → DEFERRED(MobSpawner)；三处 SetTimePacket 发送与实体数据同步循环 → DEFERRED(Network)
 *  - mayPlace：调用已 OMIT 的 isUnobstructed（检查实体是否挡住）的一句 → DEFERRED(Entity)。没有实体时那一句恒为“不挡”，结果相同。
 * 【OMIT】实体、玩家、寻路、爆炸、刷怪相关的 32 个函数（见各处标记）；方块实体的 4 个函数在 S11 阶段 A 补上。析构函数不移植（R3）。
 *   C++ 里 addEntities、ensureAdded、removeAllPendingEntityRemovals 整段在注释里，awakenAllPlayers 只有声明没有定义，都不算。
 *
 * 【C++ 的重载】hasChunksAt、getBrightness、playSound 写成一个方法，按参数个数或第一个参数的类型分派；
 *   getRawBrightness、updateLight、addParticle 的另一个重载只差一个带默认值的参数或参数类型，写成可选参数或联合类型。
 * 【容器】计划刻用 TickDataSet（std::set<TickNextTickData>）；_chunksToPoll 是 std::set<ChunkPos>，按 operator<（比较 hashCode）的顺序遍历；
 *   _lightUpdates 是 LightUpdate[]（updateLights 里 C++ 先拷贝 back() 再 pop_back()，TS 直接 pop()）。
 * 【三档规则】tickTiles 的随机数（_randValue 的线性同余）按 int 回绕；其余是方块逻辑与渲染用的颜色，按 JS 数值计算。
 * 【C++ 的未初始化字段】difficulty 没有初始化（由 Minecraft 设置），这里取 0。
 */
import { SharedConstants } from '@mcpe/core';
import { LOGI } from '@mcpe/platform';
import { Mth, Random, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH, Util } from '@mcpe/util';
import type { Entity } from '../entity/Entity';
import type { ParticleType } from '../entity/EntityTypes';
import type { Player } from '../entity/player/Player';
import { Facing } from '../Facing';
import type { AABB } from '../phys/AABB';
import { HitResult } from '../phys/HitResult';
import { Vec3 } from '../phys/Vec3';
import { Pos } from '../Pos';
import type { Biome } from './biome/Biome';
import type { BiomeSource } from './biome/BiomeSource';
import { ChunkCache } from './chunk/ChunkCache';
import type { ChunkSource } from './chunk/ChunkSource';
import type { LevelChunk } from './chunk/LevelChunk';
import { ChunkPos } from './ChunkPos';
import { type Dimension, DimensionFactory } from './dimension/Dimension';
import { LevelConstants } from './LevelConstants';
import type { LevelListener } from './LevelListener';
import type { LevelSettings } from './LevelSettings';
import type { LevelSource } from './LevelSource';
import { LightLayer } from './LightLayer';
import { LightUpdate } from './LightUpdate';
import { Material } from './material/Material';
import { LevelData } from './storage/LevelData';
import type { LevelStorage } from './storage/LevelStorage';
import { TickDataSet, TickNextTickData } from './TickNextTickData';
import type { TileEntity } from './tile/entity/TileEntity';
import { Tile } from './tile/Tile';

/** C++ 的 struct AdventureSettings */
export class AdventureSettings {
  doTickTime = true;
  noPvP = false;
  noPvM = false;
  noMvP = false;
  immutableWorld = false;
  showNameTags = true;
}

/** C++ 的 struct PRInfo（待移除的玩家），只被已 OMIT 的函数使用 */
interface PRInfo {
  e: Entity;
  ticks: number;
}

/** Level::tickTiles 里的 static const int pollChunkOffsets[] */
const pollChunkOffsets: readonly number[] = [
  -1, -4, 0, -4, 1, -4, -2, -3, -1, -3, 0, -3, 1, -3, 2, -3, -3, -2,
  -2, -2, -1, -2, 0, -2, 1, -2, 2, -2, 3, -2, -4, -1, -3, -1, -2, -1,
  -1, -1, 0, -1, 1, -1, 2, -1, 3, -1, 4, -1, -4, 0, -3, 0, -2, 0, -1, 0,
  0, 0, 1, 0, 2, 0, 3, 0, 4, 0, -4, 1, -3, 1, -2, 1, -1, 1, 0, 1, 1, 1,
  2, 1, 3, 1, 4, 1, -3, 2, -2, 2, -1, 2, 0, 2, 1, 2, 2, 2, 3, 2, -2, 3,
  -1, 3, 0, 3, 1, 3, 2, 3, -1, 4, 0, 4, 1, 4,
];

/** Level.cpp 的文件内静态变量 static int maxLoop（所有 Level 共用） */
let maxLoop = 0;

export class Level implements LevelSource {
  private static readonly MAX_TICK_TILES_PER_TICK = 100; // was 1000
  static readonly MAX_LEVEL_SIZE = 32000000;
  static readonly DEPTH = LevelConstants.LEVEL_HEIGHT;
  static readonly SEA_LEVEL = Level.DEPTH / 2 - 1;
  static readonly MAX_BRIGHTNESS = 15;
  static readonly TICKS_PER_DAY = SharedConstants.TicksPerSecond * 60 * 16; // 分支改成 16 分钟一天（原版 20 分钟）
  static readonly MIDDLE_OF_NIGHT_TIME = 12000;
  static readonly genDepthBits = 7;
  static readonly genDepthBitsPlusFour = Level.genDepthBits + 4;
  static readonly genDepth = 1 << Level.genDepthBits;
  static readonly genDepthMinusOne = Level.genDepth - 1;

  // ---------------------------------------------------------------- public 字段
  instaTick = false;
  isClientSide = false;
  isGeneratingTerrain = false;
  difficulty = 0;
  adventureSettings = new AdventureSettings();
  entities: Entity[] = [];
  entityIdLookup = new Map<number, Entity>();
  tileEntities: TileEntity[] = [];
  pendingTileEntities: TileEntity[] = [];
  updatingTileEntities = false;
  players: Player[] = [];
  skyDarken = 0;
  noNeighborUpdate = false;
  dimension!: Dimension;
  /** FORWARD-DECL(IRakNetInstance)：网络未移植，只在 DEFERRED(Network) 的语句里用到 */
  raknetInstance: unknown = null;
  random = new Random(1);
  ops = new Set<string>();
  bannedPlayers = new Set<string>();
  /** 只被已 OMIT 的 getCubes 使用 */
  boxes: AABB[] = [];

  // ---------------------------------------------------------------- protected
  protected isFindingSpawn = false;
  protected _listeners: LevelListener[] = [];
  protected _chunkSource!: ChunkSource;
  protected readonly levelStorage: LevelStorage | null;
  protected levelData = new LevelData();
  protected allPlayersAreSleeping = false;
  protected _spawnFriendlies = true;
  protected _spawnEnemies = true;
  protected _randValue = 42184323;
  protected _addend = 1013904223;

  // ---------------------------------------------------------------- private（与 Level.h 一一对应；带“只被 OMIT 使用”的字段照样保留）
  private _es: Entity[] = []; // 只被已 OMIT 的 getEntities 使用
  private _tickNextTickSet = new TickDataSet();
  private _chunksToPoll = new Map<number, ChunkPos>(); // std::set<ChunkPos>，键是 hashCode
  private _lightUpdates: LightUpdate[] = [];
  private _pendingEntityData = new Map<number, Entity>(); // 只被已 OMIT 的函数使用
  private _updateLights = true;
  private _maxRecurse = 0;
  private _isNew = false;
  private _nightMode = false;
  private _pathFinder: unknown = null; // 对应 _init 里那句延后的 new PathFinder()
  private _lastSavedPlayerTime = 0; // @attn: @time: clock starts on 0 now, change if not
  private _pendingPlayerRemovals: PRInfo[] = []; // 只被已 OMIT 的函数使用

  constructor(levelStorage: LevelStorage | null, levelName: string, settings: LevelSettings, generatorVersion: number, fixedDimension: Dimension | null = null) {
    this.levelStorage = levelStorage;
    this._init(levelName, settings, generatorVersion, fixedDimension);
  }

  // 析构函数 ~Level 不移植（R3）

  _init(levelName: string, settings: LevelSettings, generatorVersion: number, fixedDimension: Dimension | null): void {
    this.isGeneratingTerrain = false;
    const preparedData = this.levelStorage!.prepareLevel(this); // C++ 在 levelStorage 为 NULL 时这里就会崩溃
    this._isNew = preparedData === null;
    if (preparedData === null) {
      this.levelData.assign(new LevelData(settings, levelName, generatorVersion)); // levelData = LevelData(...)
    } else {
      this.levelData.assign(preparedData); // levelData = *preparedData
      this.levelData.setLevelName(levelName);
    }
    if (fixedDimension !== null) {
      this.dimension = fixedDimension;
    } else {
      this.dimension = DimensionFactory.createDefaultDimension(this.levelData)!;
    }
    this.dimension.init(this);
    this._chunkSource = this.createChunkSource();
    // DEFERRED(PathFinder): _pathFinder = new PathFinder();
    this._nightMode = false;
    this.updateSkyBrightness();
  }

  /*protected*/
  protected createChunkSource(): ChunkSource {
    if (!this.levelStorage) {
      LOGI('no level data, calling dimension->createRandomLevelSource');
      return this.dimension.createRandomLevelSource(); //@note
    }
    const chunkStorage = this.levelStorage.createChunkStorage(this.dimension);
    return new ChunkCache(this, chunkStorage, this.dimension.createRandomLevelSource());
  }

  // OMIT(Entity): checkAndHandleWater(box, material, e)  Level.cpp:126
  // OMIT(Player): getNearestPlayer(source, maxDist)  Level.cpp:165
  // OMIT(Player): getNearestPlayer(x, y, z, maxDist)  Level.cpp:170

  tick(): void {
    // DEFERRED(MobSpawner): if (!isClientSide && levelData.getSpawnMobs()) { static int _mobSpawnTick = 0; const int MobSpawnInterval = 2; if (++_mobSpawnTick >= MobSpawnInterval) { _mobSpawnTick = 0; TIMER_PUSH("mobSpawner"); MobSpawner::tick(this, _spawnEnemies && difficulty > Difficulty::PEACEFUL, _spawnFriendlies && (levelData.getTime() % 400) < MobSpawnInterval); TIMER_POP(); } }
    TIMER_PUSH('chunkSource');
    this._chunkSource.tick();

    this.updateSkyDarken();
    if (this._nightMode) {
      let curTime = this.levelData.getTime();
      if (curTime % Level.TICKS_PER_DAY !== Level.MIDDLE_OF_NIGHT_TIME) {
        if (curTime % Level.TICKS_PER_DAY < Level.MIDDLE_OF_NIGHT_TIME && (curTime + 20) % Level.TICKS_PER_DAY > Level.MIDDLE_OF_NIGHT_TIME) {
          curTime = Level.MIDDLE_OF_NIGHT_TIME;
          // DEFERRED(Network): SetTimePacket packet(curTime); raknetInstance->send(packet);
        } else {
          curTime += 20;
          if (curTime % 20 === 0) {
            // DEFERRED(Network): SetTimePacket packet(curTime); raknetInstance->send(packet);
          }
        }
        this.setTime(curTime % Level.TICKS_PER_DAY);
      }
    } else {
      const time = this.levelData.getTime() + 1;
      this.levelData.setTime(time);
      if ((time & 255) === 0) {
        // DEFERRED(Network): SetTimePacket packet(time); raknetInstance->send(packet);
      }
    }
    TIMER_POP_PUSH('tickPending');
    this.tickPendingTicks(false);

    TIMER_POP_PUSH('tickTiles');
    this.tickTiles();

    TIMER_POP_PUSH('sendEntityData');
    // DEFERRED(Network): for (unsigned int i = 0; i < entities.size(); ++i) { Entity* e = entities[i]; SynchedEntityData* data = e->getEntityData(); if (data && data->isDirty()) { SetEntityDataPacket packet(e->entityId, *data); raknetInstance->send(packet); } }
    TIMER_POP();
  }

  /*protected*/
  private tickTiles(): void {
    this._chunksToPoll.clear();
    const pollChunkOffsetsSize = pollChunkOffsets.length;

    TIMER_PUSH('buildList');
    for (let i = 0; i < this.players.length; i++) {
      const player = this.players[i]!;
      const xx = Mth.floor(player.x / 16);
      const zz = Mth.floor(player.z / 16);
      for (let j = 0; j < pollChunkOffsetsSize; j += 2) {
        const xp = xx + pollChunkOffsets[j]!;
        const zp = zz + pollChunkOffsets[j + 1]!;
        if (xp >= 0 && xp < LevelConstants.CHUNK_CACHE_WIDTH && zp >= 0 && zp < LevelConstants.CHUNK_CACHE_WIDTH) {
          const cp = new ChunkPos(xp, zp);
          this._chunksToPoll.set(cp.hashCode(), cp);
        }
      }
    }
    TIMER_POP();

    TIMER_PUSH('loop');
    const order = [...this._chunksToPoll.keys()].sort((a, b) => a - b); // std::set 按 operator<，即按 hashCode 升序
    for (const key of order) {
      const cp = this._chunksToPoll.get(key)!;
      const xo = cp.x * 16;
      const zo = cp.z * 16;

      TIMER_PUSH('getChunk');
      const lc = this.getChunk(cp.x, cp.z);
      TIMER_POP_PUSH('tickChunk');
      // C++ 里 lc->tick() 与情境音效的一段都被注释掉了

      TIMER_POP_PUSH('tickTiles');
      for (let i = 0; i < 20; i++) { //@todo: CHUNK_TILE_TICK_COUNT
        this._randValue = (Math.imul(this._randValue, 3) + this._addend) | 0;
        const val = this._randValue >> 2;
        const x = val & 15;
        const z = (val >> 8) & 15;
        const y = (val >> 16) & 127;
        const id = lc.getTile(x, y, z);
        if (Tile.shouldTick[id]) {
          Tile.tiles[id]!.tick(this, x + xo, y, z + zo, this.random);
        }
      }
      TIMER_POP();
    }
    TIMER_POP();
  }

  tickPendingTicks(force: boolean): boolean {
    let count = this._tickNextTickSet.size();
    if (count > Level.MAX_TICK_TILES_PER_TICK) count = Level.MAX_TICK_TILES_PER_TICK;
    for (let i = 0; i < count; i++) {
      const td = this._tickNextTickSet.begin()!;
      if (!force && td.delay > this.levelData.getTime()) {
        break;
      }
      const r = 8;
      if (this.hasChunksAt(td.x - r, td.y - r, td.z - r, td.x + r, td.y + r, td.z + r)) {
        const id = this.getTile(td.x, td.y, td.z);
        if (id === td.tileId && id > 0) {
          Tile.tiles[id]!.tick(this, td.x, td.y, td.z, this.random);
        }
      }
      this._tickNextTickSet.erase(td);
    }
    return this._tickNextTickSet.size() !== 0;
  }

  // OMIT(Player): loadPlayer(player, doAddPlayer)  Level.cpp:364
  // OMIT(PathFinder): findPath(path, from, to, maxDist, canOpenDoors, avoidWater)  Level.cpp:381
  // OMIT(PathFinder): findPath(path, from, xBest, yBest, zBest, maxDist, canOpenDoors, avoidWater)  Level.cpp:404

  /**
   * Sets the initial spawn, created this method so we could do a special
   * location for the demo version.
   * 注意：random.nextInt(32) - random.nextInt(32) 两个操作数的求值顺序在 C++ 里是未指定的；这里按从左到右。
   * 只有第一个出生点不合法时才会走到循环里（demo 的平台上第一次就合法）。
   */
  setInitialSpawn(): void {
    this.isFindingSpawn = true;
    let xSpawn = ((LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_WIDTH) / 2) | 0;
    const ySpawn = 64;
    let zSpawn = ((LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_DEPTH) / 2) | 0;
    while (!this.dimension.isValidSpawn(xSpawn, zSpawn)) {
      xSpawn += this.random.nextInt(32) - this.random.nextInt(32);
      zSpawn += this.random.nextInt(32) - this.random.nextInt(32);
      if (xSpawn < 4) xSpawn += 32;
      if (xSpawn >= LevelConstants.LEVEL_WIDTH - 4) xSpawn -= 32;
      if (zSpawn < 4) zSpawn += 32;
      if (zSpawn >= LevelConstants.LEVEL_DEPTH - 4) zSpawn -= 32;
    }
    this.levelData.setSpawn(xSpawn, ySpawn, zSpawn);
    this.isFindingSpawn = false;
  }

  validateSpawn(): void {
    if (this.levelData.getYSpawn() <= 0) {
      this.levelData.setYSpawn(64);
    }
    let xSpawn = this.levelData.getXSpawn();
    let zSpawn = this.levelData.getZSpawn();
    while (this.getTopTile(xSpawn, zSpawn) === 0 || this.getTopTile(xSpawn, zSpawn) === Tile.invisible_bedrock.id) {
      xSpawn += this.random.nextInt(8) - this.random.nextInt(8);
      zSpawn += this.random.nextInt(8) - this.random.nextInt(8);
      if (xSpawn < 4) xSpawn += 8;
      if (xSpawn >= LevelConstants.LEVEL_WIDTH - 4) xSpawn -= 8;
      if (zSpawn < 4) zSpawn += 8;
      if (zSpawn >= LevelConstants.LEVEL_DEPTH - 4) zSpawn -= 8;
    }
    this.levelData.setXSpawn(xSpawn);
    this.levelData.setZSpawn(zSpawn);
  }

  getTopTile(x: number, z: number): number {
    let y = 63;
    while (!this.isEmptyTile(x, y + 1, z)) {
      y++;
    }
    return this.getTile(x, y, z);
  }

  getTopTileY(x: number, z: number): number {
    let y = 63;
    while (!this.isEmptyTile(x, y + 1, z)) {
      y++;
    }
    return y;
  }

  saveLevelData(): void {
    this.levelStorage!.saveLevelData(this.levelData, this.players);
  }

  getTile(x: number, y: number, z: number): number {
    if (y < 0) return 0;
    if (y >= Level.DEPTH) return 0;
    return this.getChunk(x >> 4, z >> 4).getTile(x & 15, y, z & 15);
  }

  isEmptyTile(x: number, y: number, z: number): boolean {
    return this.getTile(x, y, z) === 0;
  }

  hasChunkAt(x: number, y: number, z: number): boolean {
    if (y < 0 || y >= Level.DEPTH) return false;
    return this.hasChunk(x >> 4, z >> 4);
  }

  hasChunksAt(x: number, y: number, z: number, r: number): boolean;
  hasChunksAt(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean;
  hasChunksAt(a: number, b: number, c: number, d: number, e?: number, g?: number): boolean {
    if (e === undefined) return this.hasChunksAt(a - d, b - d, c - d, a + d, b + d, c + d);
    let x0 = a, z0 = c, x1 = d, z1 = g!;
    const y0 = b, y1 = e;
    if (y1 < 0 || y0 >= Level.DEPTH) return false;
    x0 >>= 4;
    z0 >>= 4;
    x1 >>= 4;
    z1 >>= 4;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        if (!this.hasChunk(x, z)) return false;
    return true;
  }

  hasChunk(x: number, z: number): boolean {
    return this._chunkSource.hasChunk(x, z);
  }

  getChunkAt(x: number, z: number): LevelChunk {
    return this.getChunk(x >> 4, z >> 4);
  }

  getChunk(x: number, z: number): LevelChunk {
    return this._chunkSource.getChunk(x, z);
  }

  setTileAndDataNoUpdate(x: number, y: number, z: number, tile: number, data: number): boolean {
    if (y < 0) return false;
    if (y >= Level.DEPTH) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    return c.setTileAndData(x & 15, y, z & 15, tile, data);
  }

  setTileNoUpdate(x: number, y: number, z: number, tile: number): boolean {
    if (y < 0) return false;
    if (y >= Level.DEPTH) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    return c.setTile(x & 15, y, z & 15, tile);
  }

  getMaterial(x: number, y: number, z: number): Material {
    const t = this.getTile(x, y, z);
    if (t === 0) return Material.air;
    return Tile.tiles[t]!.material;
  }

  getData(x: number, y: number, z: number): number {
    if (y < 0) return 0;
    if (y >= Level.DEPTH) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    x &= 15;
    z &= 15;
    return c.getData(x, y, z);
  }

  setData(x: number, y: number, z: number, data: number): void {
    if (this.setDataNoUpdate(x, y, z, data)) {
      this.tileUpdated(x, y, z, this.getTile(x, y, z));
    }
  }

  setDataNoUpdate(x: number, y: number, z: number, data: number): boolean {
    if (y < 0) return false;
    if (y >= Level.DEPTH) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    x &= 15;
    z &= 15;
    if (c.getData(x, y, z) !== data) {
      c.setData(x, y, z, data);
      return true;
    }
    return false;
  }

  setTile(x: number, y: number, z: number, tile: number): boolean {
    if (this.setTileNoUpdate(x, y, z, tile)) {
      this.tileUpdated(x, y, z, tile);
      return true;
    }
    return false;
  }

  setTileAndData(x: number, y: number, z: number, tile: number, data: number): boolean {
    if (this.setTileAndDataNoUpdate(x, y, z, tile, data)) {
      this.tileUpdated(x, y, z, tile);
      return true;
    }
    return false;
  }

  sendTileUpdated(x: number, y: number, z: number): void {
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.tileChanged(x, y, z);
    }
  }

  /*protected*/
  protected tileUpdated(x: number, y: number, z: number, tile: number): void {
    this.sendTileUpdated(x, y, z);
    this.updateNeighborsAt(x, y, z, tile);
  }

  lightColumnChanged(x: number, z: number, y0: number, y1: number): void {
    if (y0 > y1) {
      const tmp = y1;
      y1 = y0;
      y0 = tmp;
    }
    this.setTilesDirty(x, y0, z, x, y1, z);
  }

  setTileDirty(x: number, y: number, z: number): void {
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.setTilesDirty(x, y, z, x, y, z);
    }
  }

  setTilesDirty(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.setTilesDirty(x0, y0, z0, x1, y1, z1);
    }
  }

  swap(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): void {
    const t1 = this.getTile(x1, y1, z1);
    const d1 = this.getData(x1, y1, z1);
    const t2 = this.getTile(x2, y2, z2);
    const d2 = this.getData(x2, y2, z2);
    this.setTileAndDataNoUpdate(x1, y1, z1, t2, d2);
    this.setTileAndDataNoUpdate(x2, y2, z2, t1, d1);
    this.updateNeighborsAt(x1, y1, z1, t2);
    this.updateNeighborsAt(x2, y2, z2, t1);
  }

  updateNeighborsAt(x: number, y: number, z: number, tile: number): void {
    this.neighborChanged(x - 1, y, z, tile);
    this.neighborChanged(x + 1, y, z, tile);
    this.neighborChanged(x, y - 1, z, tile);
    this.neighborChanged(x, y + 1, z, tile);
    this.neighborChanged(x, y, z - 1, tile);
    this.neighborChanged(x, y, z + 1, tile);
  }

  /*private*/
  private neighborChanged(x: number, y: number, z: number, type: number): void {
    if (this.noNeighborUpdate || this.isClientSide) return;
    const tile = Tile.tiles[this.getTile(x, y, z)];
    if (tile != null) tile.neighborChanged(this, x, y, z, type);
  }

  canSeeSky(x: number, y: number, z: number): boolean {
    return this.getChunk(x >> 4, z >> 4).isSkyLit(x & 15, y, z & 15);
  }

  getRawBrightness(x: number, y: number, z: number, propagate = true): number {
    if (propagate) {
      const id = this.getTile(x, y, z);
      if (id === Tile.stoneSlabHalf.id || id === Tile.farmland.id) {
        let br = this.getRawBrightness(x, y + 1, z, false);
        const br1 = this.getRawBrightness(x + 1, y, z, false);
        const br2 = this.getRawBrightness(x - 1, y, z, false);
        const br3 = this.getRawBrightness(x, y, z + 1, false);
        const br4 = this.getRawBrightness(x, y, z - 1, false);
        if (br1 > br) br = br1;
        if (br2 > br) br = br2;
        if (br3 > br) br = br3;
        if (br4 > br) br = br4;
        return br;
      }
    }
    if (y < 0) return 0;
    if (y >= Level.DEPTH) {
      let br = Level.MAX_BRIGHTNESS - this.skyDarken;
      if (br < 0) br = 0;
      return br;
    }
    const c = this.getChunk(x >> 4, z >> 4);
    x &= 15;
    z &= 15;
    return c.getRawBrightness(x, y, z, this.skyDarken);
  }

  isSkyLit(x: number, y: number, z: number): boolean {
    if (y < 0) return false;
    if (y >= Level.DEPTH) return true;
    if (!this.hasChunk(x >> 4, z >> 4)) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    x &= 15;
    z &= 15;
    return c.isSkyLit(x, y, z);
  }

  getHeightmap(x: number, z: number): number {
    if (!this.hasChunk(x >> 4, z >> 4)) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    return c.getHeightmap(x & 15, z & 15);
  }

  getBiomeSource(): BiomeSource {
    return this.dimension.biomeSource;
  }

  getBiome(x: number, z: number): Biome {
    return this.dimension.biomeSource.getBiome(x, z)!;
  }

  updateLightIfOtherThan(layer: LightLayer, x: number, y: number, z: number, expected: number): void {
    if (this.dimension.hasCeiling && layer === LightLayer.Sky) return;
    if (!this.hasChunkAt(x, y, z)) return;
    if (layer === LightLayer.Sky) {
      if (this.isSkyLit(x, y, z)) expected = 15;
    } else if (layer === LightLayer.Block) {
      const t = this.getTile(x, y, z);
      if (Tile.lightEmission[t]! > expected) expected = Tile.lightEmission[t]!;
    }
    if (this.getBrightness(layer, x, y, z) !== expected) {
      this.updateLight(layer, x, y, z, x, y, z);
    }
  }

  /** C++ 的两个重载：float getBrightness(x, y, z)（LevelSource）与 int getBrightness(const LightLayer&, x, y, z) */
  getBrightness(x: number, y: number, z: number): number;
  getBrightness(layer: LightLayer, x: number, y: number, z: number): number;
  getBrightness(a: number | LightLayer, b: number, c: number, d?: number): number {
    if (typeof a === 'number') {
      return this.dimension.brightnessRamp[this.getRawBrightness(a, b, c)]!;
    }
    const layer = a, x = b, y = c, z = d!;
    if (y < 0 || y >= Level.DEPTH) {
      return layer.surrounding;
    }
    const xc = x >> 4;
    const zc = z >> 4;
    if (!this.hasChunk(xc, zc)) return 0;
    const ch = this.getChunk(xc, zc);
    return ch.getBrightness(layer, x & 15, y, z & 15);
  }

  setBrightness(layer: LightLayer, x: number, y: number, z: number, brightness: number): void {
    if (y < 0) return;
    if (y >= Level.DEPTH) return;
    if (!this.hasChunk(x >> 4, z >> 4)) return;
    const c = this.getChunk(x >> 4, z >> 4);
    c.setBrightness(layer, x & 15, y, z & 15, brightness);
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.tileBrightnessChanged(x, y, z);
    }
  }

  isDay(): boolean {
    return this.skyDarken < 4;
  }

  clip(A: Vec3, b: Vec3, liquid = false, solidOnly = false): HitResult {
    // ADAPTED(Perf): 省略 static Stopwatch sw; SwStartStopper w(sw);（只用于性能统计，不影响结果）
    if (A.x !== A.x || A.y !== A.y || A.z !== A.z) return new HitResult(); //@kludge This is actually a way to do it
    if (b.x !== b.x || b.y !== b.y || b.z !== b.z) return new HitResult();

    const a = new Vec3(A.x, A.y, A.z);

    const xTile1 = Mth.floor(b.x);
    const yTile1 = Mth.floor(b.y);
    const zTile1 = Mth.floor(b.z);

    let xTile0 = Mth.floor(a.x);
    let yTile0 = Mth.floor(a.y);
    let zTile0 = Mth.floor(a.z);

    let maxIterations = 200;
    while (maxIterations-- >= 0) {
      if (a.x !== a.x || a.y !== a.y || a.z !== a.z) return new HitResult();
      if (xTile0 === xTile1 && yTile0 === yTile1 && zTile0 === zTile1) return new HitResult();

      let xClip = 999;
      let yClip = 999;
      let zClip = 999;

      if (xTile1 > xTile0) xClip = xTile0 + 1.0;
      if (xTile1 < xTile0) xClip = xTile0 + 0.0;

      if (yTile1 > yTile0) yClip = yTile0 + 1.0;
      if (yTile1 < yTile0) yClip = yTile0 + 0.0;

      if (zTile1 > zTile0) zClip = zTile0 + 1.0;
      if (zTile1 < zTile0) zClip = zTile0 + 0.0;

      let xDist = 999;
      let yDist = 999;
      let zDist = 999;

      const xd = b.x - a.x;
      const yd = b.y - a.y;
      const zd = b.z - a.z;

      if (xClip !== 999) xDist = (xClip - a.x) / xd;
      if (yClip !== 999) yDist = (yClip - a.y) / yd;
      if (zClip !== 999) zDist = (zClip - a.z) / zd;

      let face = 0;
      if (xDist < yDist && xDist < zDist) {
        if (xTile1 > xTile0) face = 4;
        else face = 5;
        a.x = xClip;
        a.y += yd * xDist;
        a.z += zd * xDist;
      } else if (yDist < zDist) {
        if (yTile1 > yTile0) face = 0;
        else face = 1;
        a.x += xd * yDist;
        a.y = yClip;
        a.z += zd * yDist;
      } else {
        if (zTile1 > zTile0) face = 2;
        else face = 3;
        a.x += xd * zDist;
        a.y += yd * zDist;
        a.z = zClip;
      }

      const tPos = new Vec3(a.x, a.y, a.z);
      xTile0 = tPos.x = Mth.floor(a.x);
      if (face === 5) {
        xTile0--;
        tPos.x++;
      }
      yTile0 = tPos.y = Mth.floor(a.y);
      if (face === 1) {
        yTile0--;
        tPos.y++;
      }
      zTile0 = tPos.z = Mth.floor(a.z);
      if (face === 3) {
        zTile0--;
        tPos.z++;
      }

      const t = this.getTile(xTile0, yTile0, zTile0);
      const data = this.getData(xTile0, yTile0, zTile0);
      const tile = Tile.tiles[t];

      if (solidOnly && tile != null && tile.getAABB(this, xTile0, yTile0, zTile0) == null) {
        // No collision
      } else if (t > 0 && tile!.mayPick(data, liquid)) {
        if (xTile0 >= 0 && zTile0 >= 0 && xTile0 < LevelConstants.LEVEL_WIDTH && zTile0 < LevelConstants.LEVEL_WIDTH) {
          const r = tile!.clip(this, xTile0, yTile0, zTile0, a, b);
          if (r.isHit()) return r;
        }
      }
    }
    return new HitResult();
  }

  /** C++ 的两个重载：playSound(Entity*, name, volume, pitch) 与 playSound(x, y, z, name, volume, pitch) */
  playSound(entity: Entity, name: string, volume: number, pitch: number): void;
  playSound(x: number, y: number, z: number, name: string, volume: number, pitch: number): void;
  playSound(a: Entity | number, b: string | number, c: number, d: number | string, e?: number, g?: number): void {
    if (typeof a !== 'number') {
      const entity = a, name = b as string, volume = c, pitch = d as number;
      for (let i = 0; i < this._listeners.length; i++) {
        this._listeners[i]!.playSound(name, entity.x, entity.y - entity.heightOffset, entity.z, volume, pitch);
      }
      return;
    }
    const x = a, y = b as number, z = c, name = d as string, volume = e!, pitch = g!;
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.playSound(name, x, y, z, volume, pitch);
    }
  }

  levelEvent(source: Player | null, type: number, x: number, y: number, z: number, data: number): void {
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.levelEvent(source, type, x, y, z, data);
    }
  }

  tileEvent(x: number, y: number, z: number, b0: number, b1: number): void {
    const t = this.getTile(x, y, z);
    if (t > 0) Tile.tiles[t]!.triggerEvent(this, x, y, z, b0, b1);
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.tileEvent(x, y, z, b0, b1);
    }
  }

  /** C++ 的两个重载：id 是 std::string 或 ParticleType::Id，都原样转给监听器 */
  addParticle(id: string | ParticleType.Id, x: number, y: number, z: number, xd: number, yd: number, zd: number, data = 0): void {
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.addParticle(id, x, y, z, xd, yd, zd, data);
    }
  }

  // OMIT(Entity): addEntity(e)  Level.cpp:1007
  // OMIT(Entity): getEntity(entityId)  Level.cpp:1035
  // OMIT(Entity): entityAdded(e)  Level.cpp:1051
  // OMIT(Entity): entityRemoved(e)  Level.cpp:1058
  // OMIT(Mob): getMob(entityId)  Level.cpp:1064
  // OMIT(Entity): removeEntity(e)  Level.cpp:1070
  tileEntityChanged(x: number, y: number, z: number, te: TileEntity): void {
    if (this.hasChunkAt(x, y, z)) {
      this.getChunkAt(x, z).markUnsaved();
    }
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.tileEntityChanged(x, y, z, te);
    }
  }
  // OMIT(MobSpawner): getRandomMobSpawnAt(mobCategory, x, y, z)  Level.cpp:1103

  addListener(listener: LevelListener): void {
    this._listeners.push(listener);
  }

  removeListener(listener: LevelListener): void {
    const it = this._listeners.indexOf(listener);
    // C++ 在找不到时对 end() 调用 erase，是未定义行为；这里找不到就什么都不做
    if (it >= 0) this._listeners.splice(it, 1);
  }

  // OMIT(Entity): getCubes(source, box)  Level.cpp:1122

  getSkyDarken(a: number): number {
    const td = this.getTimeOfDay(a);
    let br = 1 - (Mth.cos(td * Mth.PI * 2) * 2 + 0.5);
    if (br < 0.0) br = 0.0;
    if (this.dimension.FogType === 1) {
      if (br > 1.0) br = 1.0; //@ uses the normal javasky color ramp when java sky type is choosen,
    } else {
      if (br > 0.8) br = 0.8; //@note; was 1.0f
    }
    return (br * 11) | 0;
  }

  getSkyColor(source: Entity, a: number): Vec3 {
    const td = this.getTimeOfDay(a);
    let br = Mth.cos(td * Mth.PI * 2) * 2 + 0.5;
    if (br < 0.0) br = 0.0;
    if (this.dimension.FogType === 1) {
      if (br > 1.0) br = 1.0;
    } else {
      if (br > 0.8) br = 0.8; //@note; was 1.0f
    }
    const xx = Mth.floor(source.x);
    const zz = Mth.floor(source.z);
    const temp = this.getBiomeSource().getTemperature(xx, zz); // C++ 在判断雾类型之前就无条件读取
    let skyColor: number;
    if (this.dimension.FogType === 1) { // 1 is java styled fog which should use temperatures!
      skyColor = this.getBiomeSource().getBiome(xx, zz)!.getSkyColor(temp);
    } else { // otherwise default to the normal pocket edition skycolor
      skyColor = 0x3070ff;
    }
    let r = ((skyColor >> 16) & 0xff) / 255.0;
    let g = ((skyColor >> 8) & 0xff) / 255.0;
    let b = (skyColor & 0xff) / 255.0;
    r *= br;
    g *= br;
    b *= br;
    return new Vec3(r, g, b);
  }

  getCloudColor(a: number): Vec3 {
    const td = this.getTimeOfDay(a);
    let br = Mth.cos(td * Mth.PI * 2) * 2.0 + 0.5;
    if (br < 0.0) br = 0.0;
    if (br > 1.0) br = 1.0;
    const cloudColor = 0xffffff;
    let r = ((cloudColor >> 16) & 0xff) / 255.0;
    let g = ((cloudColor >> 8) & 0xff) / 255.0;
    let b = (cloudColor & 0xff) / 255.0;

    const rainLevel = 0; //getRainLevel(a);
    if (rainLevel > 0) {
      const mid = (r * 0.3 + g * 0.59 + b * 0.11) * 0.6;
      const ba = 1 - rainLevel * 0.95;
      r = r * ba + mid * (1 - ba);
      g = g * ba + mid * (1 - ba);
      b = b * ba + mid * (1 - ba);
    }

    r *= br * 0.9 + 0.1;
    g *= br * 0.9 + 0.1;
    b *= br * 0.85 + 0.15;

    const thunderLevel = 0; //getThunderLevel(a);
    if (thunderLevel > 0) {
      const mid = (r * 0.3 + g * 0.59 + b * 0.11) * 0.2;
      const ba = 1 - thunderLevel * 0.95;
      r = r * ba + mid * (1 - ba);
      g = g * ba + mid * (1 - ba);
      b = b * ba + mid * (1 - ba);
    }
    return new Vec3(r, g, b);
  }

  getTimeOfDay(a: number): number {
    return this.dimension.getTimeOfDay(this.levelData.getTime(), a);
  }

  getSunAngle(a: number): number {
    const td = this.getTimeOfDay(a);
    return td * Mth.PI * 2;
  }

  getFogColor(a: number): Vec3 {
    const td = this.getTimeOfDay(a);
    return this.dimension.getFogColor(td, a);
  }

  getTopSolidBlock(x: number, z: number): number {
    const levelChunk = this.getChunkAt(x, z);
    let y = Level.DEPTH - 1;
    while (this.getMaterial(x, y, z).blocksMotion() && y > 0) {
      y--;
    }
    x &= 15;
    z &= 15;
    while (y > 0) {
      const t = levelChunk.getTile(x, y, z);
      if (t === 0 || !Tile.tiles[t]!.material.blocksMotion() || Tile.tiles[t]!.material === Material.leaves) {
        y--;
      } else {
        return y + 1;
      }
    }
    return -1;
  }

  getLightDepth(x: number, z: number): number {
    return this.getChunkAt(x, z).getHeightmap(x & 15, z & 15);
  }

  getStarBrightness(a: number): number {
    const td = this.getTimeOfDay(a);
    let br = 1 - (Mth.cos(td * Mth.PI * 2) * 2 + 0.75);
    if (br < 0) br = 0;
    if (br > 1) br = 1;
    return br * br * 0.5;
  }

  addToTickNextTick(x: number, y: number, z: number, tileId: number, tickDelay: number): void {
    const td = new TickNextTickData(x, y, z, tileId);
    const r = 8;
    if (this.instaTick) {
      if (this.hasChunksAt(td.x - r, td.y - r, td.z - r, td.x + r, td.y + r, td.z + r)) {
        const id = this.getTile(td.x, td.y, td.z);
        if (id === td.tileId && id > 0) {
          Tile.tiles[id]!.tick(this, td.x, td.y, td.z, this.random);
        }
      }
      return;
    }
    if (this.hasChunksAt(x - r, y - r, z - r, x + r, y + r, z + r)) {
      if (tileId > 0) {
        td.setDelay(tickDelay + this.levelData.getTime());
      }
      if (!this._tickNextTickSet.has(td)) { // _tickNextTickSet.find(td) == end()：永远成立，见 TickNextTickData.ts
        this._tickNextTickSet.insert(td);
      }
    }
  }

  // OMIT(Entity): tickEntities()  Level.cpp:1356
  // OMIT(Mob): setZombieAi(zombies)  Level.cpp:1507（同文件的 DistanceEntitySorter 只给它用，一并不移植）
  // OMIT(Entity): tick(e)  Level.cpp:1526
  // OMIT(Entity): tick(e, actual)  Level.cpp:1530
  // OMIT(Entity): isUnobstructed(aabb)  Level.cpp:1582

  containsAnyLiquid(box: AABB): boolean {
    let x0 = Mth.floor(box.x0);
    const x1 = Mth.floor(box.x1 + 1);
    let y0 = Mth.floor(box.y0);
    const y1 = Mth.floor(box.y1 + 1);
    let z0 = Mth.floor(box.z0);
    const z1 = Mth.floor(box.z1 + 1);
    if (box.x0 < 0) x0--;
    if (box.y0 < 0) y0--;
    if (box.z0 < 0) z0--;
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const tile = Tile.tiles[this.getTile(x, y, z)];
          if (tile != null && tile.material.isLiquid()) {
            return true;
          }
        }
    return false;
  }

  containsFireTile(box: AABB): boolean {
    const x0 = Mth.floor(box.x0);
    const x1 = Mth.floor(box.x1 + 1);
    const y0 = Mth.floor(box.y0);
    const y1 = Mth.floor(box.y1 + 1);
    const z0 = Mth.floor(box.z0);
    const z1 = Mth.floor(box.z1 + 1);
    if (this.hasChunksAt(x0, y0, z0, x1, y1, z1)) {
      for (let x = x0; x < x1; x++)
        for (let y = y0; y < y1; y++)
          for (let z = z0; z < z1; z++) {
            const t = this.getTile(x, y, z);
            if (t === Tile.fire.id || t === Tile.lava.id || t === Tile.calmLava.id) {
              return true;
            }
          }
    }
    return false;
  }

  containsMaterial(box: AABB, material: Material): boolean {
    const x0 = Mth.floor(box.x0);
    const x1 = Mth.floor(box.x1 + 1);
    const y0 = Mth.floor(box.y0);
    const y1 = Mth.floor(box.y1 + 1);
    const z0 = Mth.floor(box.z0);
    const z1 = Mth.floor(box.z1 + 1);
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const tile = Tile.tiles[this.getTile(x, y, z)];
          if (tile != null && tile.material === material) {
            return true;
          }
        }
    return false;
  }

  containsLiquid(box: AABB, material: Material): boolean {
    const x0 = Mth.floor(box.x0);
    const x1 = Mth.floor(box.x1 + 1);
    const y0 = Mth.floor(box.y0);
    const y1 = Mth.floor(box.y1 + 1);
    const z0 = Mth.floor(box.z0);
    const z1 = Mth.floor(box.z1 + 1);
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const tile = Tile.tiles[this.getTile(x, y, z)];
          if (tile != null && tile.material === material) {
            const data = this.getData(x, y, z);
            let yh1 = y + 1;
            if (data < 8) {
              yh1 = y + 1.0 - data / 8.0;
            }
            if (yh1 >= box.y0) {
              return true;
            }
          }
        }
    return false;
  }

  // OMIT(Explosion): explode(source, x, y, z, r)  Level.cpp:1684
  // OMIT(Explosion): explode(source, x, y, z, r, fire)  Level.cpp:1689

  getSeenPercent(center: Vec3, bb: AABB): number {
    const f = Math.fround; // 循环步长按 float 累加，迭代次数与 C++ 一致
    const xs = f(1.0 / ((bb.x1 - bb.x0) * 2 + 1));
    const ys = f(1.0 / ((bb.y1 - bb.y0) * 2 + 1));
    const zs = f(1.0 / ((bb.z1 - bb.z0) * 2 + 1));
    let hits = 0;
    let count = 0;
    for (let xx = 0; xx <= 1; xx = f(xx + xs))
      for (let yy = 0; yy <= 1; yy = f(yy + ys))
        for (let zz = 0; zz <= 1; zz = f(zz + zs)) {
          const x = bb.x0 + (bb.x1 - bb.x0) * xx;
          const y = bb.y0 + (bb.y1 - bb.y0) * yy;
          const z = bb.z0 + (bb.z1 - bb.z0) * zz;
          if (!this.clip(new Vec3(x, y, z), center).isHit()) hits++;
          count++;
        }
    return hits / count;
  }

  isSolidBlockingTile(x: number, y: number, z: number): boolean {
    const tile = Tile.tiles[this.getTile(x, y, z)];
    if (tile == null) return false;
    return tile.material.isSolidBlocking() && tile.isCubeShaped();
  }

  isSolidRenderTile(x: number, y: number, z: number): boolean {
    const tile = Tile.tiles[this.getTile(x, y, z)];
    if (tile == null) return false;
    return tile.isSolidRender();
  }

  extinguishFire(x: number, y: number, z: number, face: number): void {
    switch (face) {
      case Facing.DOWN: y--; break;
      case Facing.UP: y++; break;
      case Facing.NORTH: z--; break;
      case Facing.SOUTH: z++; break;
      case Facing.WEST: x--; break;
      case Facing.EAST: x++; break;
    }
    if (this.getTile(x, y, z) === Tile.fire.id) {
      this.setTile(x, y, z, 0);
    }
  }

  gatherStats(): string {
    return 'All: ' + this.entities.length;
  }

  gatherChunkSourceStats(): string {
    return this._chunkSource.gatherStats();
  }

  getTileEntity(x: number, y: number, z: number): TileEntity | null {
    const lc = this.getChunk(x >> 4, z >> 4);
    if (!lc) return null;
    const tileEntity = lc.getTileEntity(x & 15, y, z & 15);
    if (tileEntity) return tileEntity;
    for (let i = 0; i < this.pendingTileEntities.length; ++i) {
      const e = this.pendingTileEntities[i]!;
      if (!e.isRemoved() && e.x === x && e.y === y && e.z === z) return e;
    }
    return null;
  }

  setTileEntity(x: number, y: number, z: number, tileEntity: TileEntity | null): void {
    if (!tileEntity || tileEntity.isRemoved()) return;
    if (this.updatingTileEntities) {
      tileEntity.x = x;
      tileEntity.y = y;
      tileEntity.z = z;
      this.pendingTileEntities.push(tileEntity);
    } else {
      this.tileEntities.push(tileEntity);
      const lc = this.getChunk(x >> 4, z >> 4);
      if (lc !== null) lc.setTileEntity(x & 15, y, z & 15, tileEntity);
    }
  }

  removeTileEntity(x: number, y: number, z: number): void {
    const te = this.getTileEntity(x, y, z);
    if (te && this.updatingTileEntities) {
      te.setRemoved();
      Util.remove(this.pendingTileEntities, te);
    } else {
      const lc = this.getChunk(x >> 4, z >> 4);
      if (lc) lc.removeTileEntity(x & 15, y, z & 15);
      if (te) {
        Util.remove(this.pendingTileEntities, te);
        Util.remove(this.tileEntities, te);
        // delete te;（交给垃圾回收）
      }
    }
  }

  getLightsToUpdate(): number {
    return this._lightUpdates.length;
  }

  updateLights(): boolean {
    if (this._maxRecurse >= 50) {
      return false;
    }
    this._maxRecurse++;
    let max = 500;
    while (this._lightUpdates.length > 0) {
      if (--max <= 0) {
        this._maxRecurse--;
        return true;
      }
      const l = this._lightUpdates.pop()!; // LightUpdate l = _lightUpdates.back(); _lightUpdates.pop_back();
      l.update(this);
    }
    this._maxRecurse--;
    return false;
  }

  setUpdateLights(doUpdate: boolean): void {
    this._updateLights = doUpdate;
  }

  updateLight(layer: LightLayer, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, join = true): void {
    if ((this.dimension.hasCeiling && layer === LightLayer.Sky) || !this._updateLights) return;
    maxLoop++;
    if (maxLoop === 50) {
      maxLoop--;
      return;
    }
    const xm = ((x1 + x0) / 2) | 0;
    const zm = ((z1 + z0) / 2) | 0;
    if (!this.hasChunkAt(xm, (Level.DEPTH / 2) | 0, zm)) {
      maxLoop--;
      return;
    }
    if (this.getChunkAt(xm, zm).isEmpty()) {
      maxLoop--;
      return;
    }
    const count = this._lightUpdates.length;
    if (join) {
      let toCheck = 5;
      if (toCheck > count) toCheck = count;
      for (let i = 0; i < toCheck; i++) {
        const last = this._lightUpdates[this._lightUpdates.length - i - 1]!;
        if (last.layer === layer && last.expandToContain(x0, y0, z0, x1, y1, z1)) {
          maxLoop--;
          return;
        }
      }
    }
    this._lightUpdates.push(new LightUpdate(layer, x0, y0, z0, x1, y1, z1));
    const max = 1000000;
    if (this._lightUpdates.length > max) {
      LOGI(`More than ${max} updates, aborting lighting updates`);
      this._lightUpdates.length = 0;
    }
    maxLoop--;
  }

  updateSkyBrightness(): boolean {
    const newDark = this.getSkyDarken(1);
    if (newDark !== this.skyDarken) {
      this.skyDarken = newDark;
      return true;
    }
    return false;
  }

  setSpawnSettings(_spawnEnemies: boolean, _spawnFriendlies: boolean): void {
    // C++ 里函数体的两句被注释掉了
  }

  animateTick(xt: number, yt: number, zt: number): void {
    const r = 16;
    const animateRandom = new Random(); // 每次调用新建，按时间播种
    for (let i = 0; i < 100; i++) {
      const x = xt + this.random.nextInt(r) - this.random.nextInt(r);
      const y = yt + this.random.nextInt(r) - this.random.nextInt(r);
      const z = zt + this.random.nextInt(r) - this.random.nextInt(r);
      const t = this.getTile(x, y, z);
      if (t > 0) {
        Tile.tiles[t]!.animateTick(this, x, y, z, animateRandom);
      }
    }
  }

  // OMIT(Entity): getEntities(except, bb)  Level.cpp:1929
  // OMIT(Entity): getAllEntities()  Level.cpp:1959

  prepare(): void {
    while (this._chunkSource.tick());
  }

  isNew(): boolean {
    return this._isNew;
  }

  mayPlace(tileId: number, x: number, y: number, z: number, ignoreEntities: boolean, face: number): boolean {
    const targetType = this.getTile(x, y, z);
    let targetTile = Tile.tiles[targetType] ?? null;
    const tile = Tile.tiles[tileId]!;
    let aabb = tile.getAABB(this, x, y, z);
    if (ignoreEntities) aabb = null;
    void aabb; // 只被下面 DEFERRED 的一句使用
    // DEFERRED(Entity): if (aabb != NULL && !isUnobstructed(*aabb)) return false;
    if (targetTile === Tile.water || targetTile === Tile.calmWater || targetTile === Tile.lava || targetTile === Tile.calmLava || targetTile === Tile.fire || targetTile === Tile.topSnow) targetTile = null;
    if (tileId > 0 && targetTile === null) {
      if (tile.mayPlace(this, x, y, z, face)) {
        return true;
      }
    }
    return false;
  }

  getSeaLevel(): number {
    return Level.SEA_LEVEL;
  }

  getDirectSignal(x: number, y: number, z: number, dir: number): boolean {
    const t = this.getTile(x, y, z);
    if (t === 0) return false;
    return Tile.tiles[t]!.getDirectSignal(this, x, y, z, dir);
  }

  hasDirectSignal(x: number, y: number, z: number): boolean {
    if (this.getDirectSignal(x, y - 1, z, 0)) return true;
    if (this.getDirectSignal(x, y + 1, z, 1)) return true;
    if (this.getDirectSignal(x, y, z - 1, 2)) return true;
    if (this.getDirectSignal(x, y, z + 1, 3)) return true;
    if (this.getDirectSignal(x - 1, y, z, 4)) return true;
    if (this.getDirectSignal(x + 1, y, z, 5)) return true;
    return false;
  }

  getSignal(x: number, y: number, z: number, dir: number): boolean {
    if (this.isSolidBlockingTile(x, y, z)) {
      return this.hasDirectSignal(x, y, z);
    }
    const t = this.getTile(x, y, z);
    if (t === 0) return false;
    return Tile.tiles[t]!.getSignal(this, x, y, z, dir);
  }

  hasNeighborSignal(x: number, y: number, z: number): boolean {
    if (this.getSignal(x, y - 1, z, 0)) return true;
    if (this.getSignal(x, y + 1, z, 1)) return true;
    if (this.getSignal(x, y, z - 1, 2)) return true;
    if (this.getSignal(x, y, z + 1, 3)) return true;
    if (this.getSignal(x - 1, y, z, 4)) return true;
    if (this.getSignal(x + 1, y, z, 5)) return true;
    return false;
  }

  // OMIT(Entity): getEntitiesOfType(entityType, bb, list)  Level.cpp:2156
  // OMIT(Entity): getEntitiesOfClass(type, bb, list)  Level.cpp:2172
  // OMIT(Entity): countInstanceOfType(typeId)  Level.cpp:2187
  // OMIT(Entity): countInstanceOfBaseType(baseTypeId)  Level.cpp:2195

  updateSleepingPlayerList(): void {}

  getTime(): number {
    return this.levelData.getTime();
  }

  setTime(time: number): void {
    this.levelData.setTime(time);
  }

  getSeed(): number {
    return this.levelData.getSeed();
  }

  getSharedSpawnPos(): Pos {
    return new Pos(this.levelData.getXSpawn(), this.levelData.getYSpawn(), this.levelData.getZSpawn());
  }

  setSpawnPos(spawnPos: Pos): void {
    this.levelData.setSpawn(spawnPos.x, spawnPos.y, spawnPos.z);
  }

  // OMIT(Player): mayInteract(player, xt, yt, zt)  Level.cpp:2088
  // OMIT(Entity): broadcastEntityEvent(e, eventId)  Level.cpp:2092

  getChunkSource(): ChunkSource {
    return this._chunkSource;
  }

  getLevelStorage(): LevelStorage | null {
    return this.levelStorage;
  }

  getLevelData(): LevelData {
    return this.levelData;
  }

  // OMIT(Entity): takePicture(cam, e)  Level.cpp:2150
  // OMIT(Entity): dispatchEntityData(e)  Level.cpp:2208

  saveGame(): void {
    if (this.levelStorage) {
      this.levelStorage.saveGame(this);
      this.saveLevelData();
    }
  }

  loadEntities(): void {
    if (this.levelStorage) this.levelStorage.loadEntities(this, null);
  }

  /*protected*/
  protected updateSkyDarken(): void {
    if (this.updateSkyBrightness())
      for (let i = 0; i < this._listeners.length; i++) {
        this._listeners[i]!.skyColorChanged();
      }
  }

  // OMIT(Player): removePlayer(player)  Level.cpp:2236

  /** C++ 返回 int（0 或 1） */
  isNightMode(): number {
    return this._nightMode ? 1 : 0;
  }

  setNightMode(isNightMode: boolean): void {
    this._nightMode = isNightMode;
  }

  inRange(x: number, y: number, z: number): boolean {
    return x >= 0 && x < LevelConstants.LEVEL_WIDTH && y >= 0 && y < LevelConstants.LEVEL_HEIGHT && z >= 0 && z < LevelConstants.LEVEL_DEPTH;
  }

  /** ADAPTED(Test)：只给测试用，计划刻队列的长度 */
  _pendingTickCountForTest(): number {
    return this._tickNextTickSet.size();
  }
}
