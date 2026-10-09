/**
 * 1:1 移植自 src/world/level/Level.h 与 Level.cpp（S5）。替换原来的 FORWARD-DECL(Level)。
 *
 * 【PORT-CUT】
 *  - _init：new PathFinder()（任务单 H2 起恢复）
 *  - tick：MobSpawner（任务单 H9 起恢复）；三处 SetTimePacket 发送与实体数据同步循环 → DEFERRED(Network)
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
import { Difficulty } from '../Difficulty';
import { MobSpawnerData } from './biome/Biome';
import type { MobCategory } from '../entity/MobCategory';
import { PathFinder } from './pathfinder/PathFinder';
import type { Mob } from '../entity/Mob';
import { Region } from './Region';
import type { Path } from './pathfinder/Path';
import { SharedConstants } from '@mcpe/core';
import { getTimeS, LOGE, LOGI } from '@mcpe/platform';
import { Mth, Random, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH, Util, WeighedRandom } from '@mcpe/util';
import type { Entity } from '../entity/Entity';
import { MobTypes, type ParticleType } from '../entity/EntityTypes';
import type { Player } from '../entity/player/Player';
import type { TripodCamera } from '../entity/item/TripodCamera';
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
import { Explosion } from './Explosion';
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
import { LiquidTile } from './tile/LiquidTile';
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

/** C++ 的 struct PRInfo（待移除的玩家） */
interface PRInfo {
  e: Entity;
  ticks: number;
}

/** Level::tickTiles 里的 static const int pollChunkOffsets[] */
const pollChunkOffsets: readonly number[] = [
  -1, -4, 0, -4, 1, -4, -2, -3, -1, -3, 0, -3, 1, -3, 2, -3, -3, -2, -2, -2, -1, -2, 0, -2, 1, -2,
  2, -2, 3, -2, -4, -1, -3, -1, -2, -1, -1, -1, 0, -1, 1, -1, 2, -1, 3, -1, 4, -1, -4, 0, -3, 0, -2,
  0, -1, 0, 0, 0, 1, 0, 2, 0, 3, 0, 4, 0, -4, 1, -3, 1, -2, 1, -1, 1, 0, 1, 1, 1, 2, 1, 3, 1, 4, 1,
  -3, 2, -2, 2, -1, 2, 0, 2, 1, 2, 2, 2, 3, 2, -2, 3, -1, 3, 0, 3, 1, 3, 2, 3, -1, 4, 0, 4, 1, 4,
];

/** Level.cpp 的文件内静态变量 static int maxLoop（所有 Level 共用） */
let maxLoop = 0;

/** Level.cpp 函数内的 static 局部变量 */
const levelStatics = { mobSpawnTick: 0 };

export class Level implements LevelSource {
  /** ADAPTED(ESM)：MobSpawner.tick 由 MobSpawner 模块加载时注入（Level 不能值导入 MobSpawner：它经 MobFactory 引入各种生物类，会形成加载循环） */
  static mobSpawnerTick: ((level: Level, spawnEnemies: boolean, spawnFriendlies: boolean) => number) | null = null;

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
  private _es: Entity[] = [];
  private _tickNextTickSet = new TickDataSet();
  private _chunksToPoll = new Map<number, ChunkPos>(); // std::set<ChunkPos>，键是 hashCode
  private _lightUpdates: LightUpdate[] = [];
  private _pendingEntityData = new Map<number, Entity>();
  private _updateLights = true;
  private _maxRecurse = 0;
  private _isNew = false;
  private _nightMode = false;
  private _pathFinder: PathFinder | null = null;
  private _lastSavedPlayerTime = 0; // @attn: @time: clock starts on 0 now, change if not
  private _pendingPlayerRemovals: PRInfo[] = [];

  constructor(
    levelStorage: LevelStorage | null,
    levelName: string,
    settings: LevelSettings,
    generatorVersion: number,
    fixedDimension: Dimension | null = null,
  ) {
    this.levelStorage = levelStorage;
    this._init(levelName, settings, generatorVersion, fixedDimension);
  }

  // 析构函数 ~Level 不移植（R3）

  _init(
    levelName: string,
    settings: LevelSettings,
    generatorVersion: number,
    fixedDimension: Dimension | null,
  ): void {
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
    this._pathFinder = new PathFinder();
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

  checkAndHandleWater(box: AABB, material: Material, e: Entity): boolean {
    const x0 = Mth.floor(box.x0);
    const x1 = Mth.floor(box.x1 + 1);
    const y0 = Mth.floor(box.y0);
    const y1 = Mth.floor(box.y1 + 1);
    const z0 = Mth.floor(box.z0);
    const z1 = Mth.floor(box.z1 + 1);
    if (!this.hasChunksAt(x0, y0, z0, x1, y1, z1)) {
      return false;
    }
    let ok = false;
    const current = new Vec3(0, 0, 0);
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        for (let z = z0; z < z1; z++) {
          const tile = Tile.tiles[this.getTile(x, y, z)];
          if (tile != null && tile.material === material) {
            const yt0 = y + 1 - LiquidTile.getHeight(this.getData(x, y, z));
            if (y1 >= yt0) {
              ok = true;
              tile.handleEntityInside(this, x, y, z, e, current);
            }
          }
        }
    const len = current.length();
    if (len > 0) {
      const pow = 0.004 / len;
      e.xd += current.x * pow;
      e.yd += current.y * pow;
      e.zd += current.z * pow;
    }
    return ok;
  }

  /** C++ 的两个重载：getNearestPlayer(source, maxDist) 与 getNearestPlayer(x, y, z, maxDist) */
  getNearestPlayer(source: Entity, maxDist: number): Player | null;
  getNearestPlayer(x: number, y: number, z: number, maxDist: number): Player | null;
  getNearestPlayer(a: Entity | number, b: number, c?: number, d?: number): Player | null {
    if (typeof a !== 'number') return this.getNearestPlayer(a.x, a.y, a.z, b);
    const x = a,
      y = b,
      z = c!,
      maxDist = d!;
    const maxDistSqr = maxDist * maxDist;
    let best = -1;
    let result: Player | null = null;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!;
      if (p.removed) continue;
      const dist = p.distanceToSqr(x, y, z);
      if ((maxDist < 0 || dist < maxDistSqr) && (best === -1 || dist < best)) {
        best = dist;
        result = p;
      }
    }
    return result;
  }

  tick(): void {
    if (!this.isClientSide && this.levelData.getSpawnMobs()) {
      const MobSpawnInterval = 2;
      if (++levelStatics.mobSpawnTick >= MobSpawnInterval) { // C++ 的 static int _mobSpawnTick（函数内静态，所有 Level 共用）
        levelStatics.mobSpawnTick = 0;
        TIMER_PUSH('mobSpawner');
        Level.mobSpawnerTick!(this, this._spawnEnemies && this.difficulty > Difficulty.PEACEFUL, this._spawnFriendlies && this.levelData.getTime() % 400 < MobSpawnInterval);
        TIMER_POP();
      }
    }
    TIMER_PUSH('chunkSource');
    this._chunkSource.tick();

    this.updateSkyDarken();
    if (this._nightMode) {
      let curTime = this.levelData.getTime();
      if (curTime % Level.TICKS_PER_DAY !== Level.MIDDLE_OF_NIGHT_TIME) {
        if (
          curTime % Level.TICKS_PER_DAY < Level.MIDDLE_OF_NIGHT_TIME &&
          (curTime + 20) % Level.TICKS_PER_DAY > Level.MIDDLE_OF_NIGHT_TIME
        ) {
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
        if (
          xp >= 0 &&
          xp < LevelConstants.CHUNK_CACHE_WIDTH &&
          zp >= 0 &&
          zp < LevelConstants.CHUNK_CACHE_WIDTH
        ) {
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
      for (let i = 0; i < 20; i++) {
        //@todo: CHUNK_TILE_TICK_COUNT
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

  loadPlayer(player: Player | null, doAddPlayer = true): void {
    if (player) {
      const loadedPlayerTag = this.levelData.getLoadedPlayerTag();
      if (loadedPlayerTag !== null) {
        player.load(loadedPlayerTag);
        this.levelData.setLoadedPlayerTag(null);
      } else {
        this.levelData.setLoadedPlayerTo(player);
      }
      if (doAddPlayer) this.addEntity(player);
    }
  }
  /** C++ findPath(Path*, Entity* from, Entity* to, float maxDist, bool canOpenDoors, bool avoidWater)（Level.cpp:381；R10 情形 B） */
  findPathToEntity(path: Path, from: Entity, to: Entity, maxDist: number, canOpenDoors: boolean, avoidWater: boolean): boolean {
    TIMER_PUSH('pathfind');
    const x = Mth.floor(from.x);
    const y = Mth.floor(from.y);
    const z = Mth.floor(from.z);
    const r = Math.trunc(maxDist + 16);
    const region = new Region(this, x - r, y - r, z - r, x + r, y + r, z + r);
    this._pathFinder!.setLevelSource(region);
    this._pathFinder!.canOpenDoors = canOpenDoors;
    this._pathFinder!.avoidWater = avoidWater;
    this._pathFinder!.findPathToEntity(path, from, to, maxDist);
    TIMER_POP();
    return true;
  }

  /** C++ findPath(Path*, Entity* from, int xBest, int yBest, int zBest, float maxDist, bool canOpenDoors, bool avoidWater)（Level.cpp:404） */
  findPathToTile(path: Path, from: Entity, xBest: number, yBest: number, zBest: number, maxDist: number, canOpenDoors: boolean, avoidWater: boolean): boolean {
    TIMER_PUSH('pathfind');
    const x = Mth.floor(from.x);
    const y = Mth.floor(from.y);
    const z = Mth.floor(from.z);
    const r = Math.trunc(maxDist + 8);
    const region = new Region(this, x - r, y - r, z - r, x + r, y + r, z + r);
    this._pathFinder!.setLevelSource(region);
    this._pathFinder!.canOpenDoors = canOpenDoors;
    this._pathFinder!.avoidWater = avoidWater;
    this._pathFinder!.findPathToTile(path, from, xBest, yBest, zBest, maxDist);
    TIMER_POP();
    return true;
  }

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
    while (
      this.getTopTile(xSpawn, zSpawn) === 0 ||
      this.getTopTile(xSpawn, zSpawn) === Tile.invisible_bedrock.id
    ) {
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
    let x0 = a,
      z0 = c,
      x1 = d,
      z1 = g!;
    const y0 = b,
      y1 = e;
    if (y1 < 0 || y0 >= Level.DEPTH) return false;
    x0 >>= 4;
    z0 >>= 4;
    x1 >>= 4;
    z1 >>= 4;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) if (!this.hasChunk(x, z)) return false;
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

  updateLightIfOtherThan(
    layer: LightLayer,
    x: number,
    y: number,
    z: number,
    expected: number,
  ): void {
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
    const layer = a,
      x = b,
      y = c,
      z = d!;
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
        if (
          xTile0 >= 0 &&
          zTile0 >= 0 &&
          xTile0 < LevelConstants.LEVEL_WIDTH &&
          zTile0 < LevelConstants.LEVEL_WIDTH
        ) {
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
  playSound(
    a: Entity | number,
    b: string | number,
    c: number,
    d: number | string,
    e?: number,
    g?: number,
  ): void {
    if (typeof a !== 'number') {
      const entity = a,
        name = b as string,
        volume = c,
        pitch = d as number;
      for (let i = 0; i < this._listeners.length; i++) {
        this._listeners[i]!.playSound(
          name,
          entity.x,
          entity.y - entity.heightOffset,
          entity.z,
          volume,
          pitch,
        );
      }
      return;
    }
    const x = a,
      y = b as number,
      z = c,
      name = d as string,
      volume = e!,
      pitch = g!;
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.playSound(name, x, y, z, volume, pitch);
    }
  }

  levelEvent(
    source: Player | null,
    type: number,
    x: number,
    y: number,
    z: number,
    data: number,
  ): void {
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
  addParticle(
    id: string | ParticleType.Id,
    x: number,
    y: number,
    z: number,
    xd: number,
    yd: number,
    zd: number,
    data = 0,
  ): void {
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.addParticle(id, x, y, z, xd, yd, zd, data);
    }
  }

  addEntity(e: Entity): boolean {
    const prev = this.getEntity(e.entityId);
    if (prev) this.removeEntity(prev);
    const xc = Mth.floor(e.x / 16);
    const zc = Mth.floor(e.z / 16);
    const forced = true;
    if (forced /* || hasChunk(xc, zc)*/) {
      if (e.isPlayer() && !this.players.includes(e as Player)) {
        this.players.push(e as Player);
      }
      this.getChunk(xc, zc).addEntity(e);
      this.entities.push(e);
      this.entityIdLookup.set(e.entityId, e);
      this.entityAdded(e);
      return true;
    }
    return false;
  }

  getEntity(entityId: number): Entity | null {
    return this.entityIdLookup.get(entityId) ?? null;
  }

  entityAdded(e: Entity): void {
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.entityAdded(e);
    }
  }

  entityRemoved(e: Entity): void {
    for (let j = 0; j < this._listeners.length; j++) {
      this._listeners[j]!.entityRemoved(e);
    }
  }

  /** C++ `Mob* Level::getMob(int entityId)`（任务单 H4） */
  getMob(entityId: number): Mob | null {
    const entity = this.getEntity(entityId);
    return entity && entity.isMob() ? (entity as Mob) : null;
  }

  removeEntity(e: Entity): void {
    e.remove();
    if (e.isPlayer() && e.reallyRemoveIfPlayer) {
      Util.remove(this.players, e as Player);
    }
  }
  tileEntityChanged(x: number, y: number, z: number, te: TileEntity): void {
    if (this.hasChunkAt(x, y, z)) {
      this.getChunkAt(x, z).markUnsaved();
    }
    for (let i = 0; i < this._listeners.length; i++) {
      this._listeners[i]!.tileEntityChanged(x, y, z, te);
    }
  }
  /** C++ `Biome::MobSpawnerData Level::getRandomMobSpawnAt(const MobCategory&, int, int, int)`（按值返回，这里返回副本） */
  getRandomMobSpawnAt(mobCategory: MobCategory, x: number, y: number, z: number): MobSpawnerData {
    const mobList = this._chunkSource.getMobsAt(mobCategory, x, y, z);
    if (mobList.length === 0) return new MobSpawnerData();
    const data = WeighedRandom.getRandomItem(this.random, mobList);
    if (!data) return new MobSpawnerData();
    return new MobSpawnerData(data.mobClassId, data.randomWeight, data.minCount, data.maxCount);
  }

  addListener(listener: LevelListener): void {
    this._listeners.push(listener);
  }

  removeListener(listener: LevelListener): void {
    const it = this._listeners.indexOf(listener);
    // C++ 在找不到时对 end() 调用 erase，是未定义行为；这里找不到就什么都不做
    if (it >= 0) this._listeners.splice(it, 1);
  }

  /** 返回共享的 boxes（C++ 返回 std::vector<AABB>&）；实体之间的碰撞盒那段在 C++ 里被注释掉了 */
  getCubes(_source: Entity | null, box: AABB): AABB[] {
    this.boxes.length = 0;
    const x0 = Mth.floor(box.x0);
    const x1 = Mth.floor(box.x1 + 1);
    const y0 = Mth.floor(box.y0);
    const y1 = Mth.floor(box.y1 + 1);
    const z0 = Mth.floor(box.z0);
    const z1 = Mth.floor(box.z1 + 1);
    for (let x = x0; x < x1; x++)
      for (let z = z0; z < z1; z++) {
        if (this.hasChunkAt(x, (Level.DEPTH / 2) | 0, z)) {
          for (let y = y0 - 1; y < y1; y++) {
            const tile = Tile.tiles[this.getTile(x, y, z)];
            if (tile != null) {
              tile.addAABBs(this, x, y, z, box, this.boxes);
            }
          }
        }
      }
    return this.boxes;
  }

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
    if (this.dimension.FogType === 1) {
      // 1 is java styled fog which should use temperatures!
      skyColor = this.getBiomeSource().getBiome(xx, zz)!.getSkyColor(temp);
    } else {
      // otherwise default to the normal pocket edition skycolor
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
      if (
        t === 0 ||
        !Tile.tiles[t]!.material.blocksMotion() ||
        Tile.tiles[t]!.material === Material.leaves
      ) {
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
      if (!this._tickNextTickSet.has(td)) {
        // _tickNextTickSet.find(td) == end()：永远成立，见 TickNextTickData.ts
        this._tickNextTickSet.insert(td);
      }
    }
  }

  tickEntities(): void {
    TIMER_PUSH('entities');
    TIMER_PUSH('remove');
    const pendingRemovedEntities: Entity[] = [];
    const zombies: { setUseNewAi(use: boolean): void }[] = []; // std::vector<Zombie*> zombies（只交给被注释掉的 setZombieAi）
    TIMER_POP_PUSH('regular');
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i]!;
      if (!e.removed) {
        this.tickEntity(e);
        if (e.getEntityTypeId() === MobTypes.Zombie) {
          const zombie = e as unknown as { setUseNewAi(use: boolean): void };
          zombies.push(zombie);
          zombie.setUseNewAi(false);
        }
      }
      TIMER_PUSH('remove');
      if (e.removed && (!e.isPlayer() || e.reallyRemoveIfPlayer)) {
        const xc = e.xChunk;
        const zc = e.zChunk;
        if (e.inChunk && this.hasChunk(xc, zc)) {
          this.getChunk(xc, zc).removeEntity(e);
        }
        this.entityIdLookup.delete(e.entityId);
        this.entities.splice(i--, 1);
        this.entityRemoved(e);
        pendingRemovedEntities.push(e);
      }
      TIMER_POP();
    }
    TIMER_POP_PUSH('remove');
    for (let i = 0; i < pendingRemovedEntities.length; ++i) {
      const e = pendingRemovedEntities[i]!;
      if (e.isPlayer()) this._pendingPlayerRemovals.push({ e, ticks: 16 });
      // else delete e;（交给垃圾回收）
    }
    pendingRemovedEntities.length = 0;
    for (let i = this._pendingPlayerRemovals.length - 1; i >= 0; --i) {
      const pr = this._pendingPlayerRemovals[i]!;
      if (--pr.ticks <= 0) {
        LOGI('deleting: player');
        this._pendingPlayerRemovals.splice(i, 1);
      }
    }
    TIMER_POP_PUSH('tileEntities');
    this.updatingTileEntities = true;
    for (let i = 0; i < this.tileEntities.length; ++i) {
      const te = this.tileEntities[i]!;
      if (!te.isRemoved() && te.level !== null) {
        if (this.hasChunkAt(te.x, te.y, te.z)) {
          te.tick();
        }
      }
      if (te.isRemoved()) {
        for (let j = 0; j < 10; ++j) LOGI(`REmoved tile-entity @ ${te.x}, ${te.y}, ${te.z}`);
        this.tileEntities.splice(i--, 1);
        if (this.hasChunk(te.x >> 4, te.z >> 4)) {
          const lc = this.getChunk(te.x >> 4, te.z >> 4);
          if (lc !== null) {
            lc.removeTileEntity(te.x & 15, te.y, te.z & 15);
          }
        }
      }
    }
    this.updatingTileEntities = false;
    TIMER_POP_PUSH('pendingTileEntities');
    if (this.pendingTileEntities.length > 0) {
      for (let i = 0; i < this.pendingTileEntities.length; ++i) {
        let e: TileEntity | null = this.pendingTileEntities[i]!;
        if (!e.isRemoved()) {
          let found = false;
          for (let j = 0; j < this.tileEntities.length; ++j) {
            if (this.tileEntities[j] === e) {
              found = true;
              break;
            }
          }
          const xx = e.x,
            yy = e.y,
            zz = e.z;
          const lc = this.getChunk(xx >> 4, zz >> 4);
          const has = lc && lc.hasTileEntityAt(e);
          if (!found) {
            if (!has) this.tileEntities.push(e);
            else e = null;
          }
          if (e && lc) lc.setTileEntity(xx & 15, yy, zz & 15, e);
          this.sendTileUpdated(xx, yy, zz);
        }
      }
      this.pendingTileEntities.length = 0;
    }
    TIMER_POP();
    TIMER_POP();
  }

  /**
   * C++ `void Level::setZombieAi(std::vector<Zombie*>& zombies)`（Level.cpp:1507，任务单 H11）。
   * 原样保留：唯一的调用点（tickEntities 里的 `//setZombieAi(zombies);`，Level.cpp:1429）被注释掉了；
   *   NumSmartZombiesPerPlayer 是 0——即便被调用，也只有“没有僵尸”时进入第一个分支，第二段循环一次都不执行。
   *   std::nth_element + DistanceEntitySorter（按到玩家的距离）在这里用一次排序代替：j < 0 的循环不读结果，等价。
   */
  setZombieAi(zombies: { setUseNewAi(use: boolean): void; distanceToSqr(e: Entity): number; x: number; y: number; z: number }[]): void {
    const size = zombies.length;
    const NumSmartZombiesPerPlayer = 0;
    if (size <= NumSmartZombiesPerPlayer) {
      for (let i = 0; i < size; ++i) zombies[i]!.setUseNewAi(true);
      return;
    }
    for (let i = 0; i < this.players.length; ++i) {
      const p = this.players[i]!;
      const d2 = (z: { x: number; y: number; z: number }): number => (z.x - p.x) * (z.x - p.x) + (z.y - p.y) * (z.y - p.y) + (z.z - p.z) * (z.z - p.z);
      zombies.sort((a, b) => d2(a) - d2(b));
      for (let j = 0; j < NumSmartZombiesPerPlayer; ++j)
        if (zombies[j]!.distanceToSqr(p) < 32 * 32) zombies[j]!.setUseNewAi(true);
    }
  }

  /**
   * C++ 的 tick(Entity*) 与 tick(Entity*, bool actual)（前者以 actual = true 转调后者）。它们和无参的 Level::tick()（世界的 tick）同名，
   * 按 R10 情形 B 命名为 tickEntity，并按情形 A 合并成一个默认参数。
   */
  tickEntity(e: Entity, actual = true): void {
    const xc = Mth.floor(e.x);
    const zc = Mth.floor(e.z);
    const r = 32;
    if (actual && !this.hasChunksAt(xc - r, 0, zc - r, xc + r, 128, zc + r)) {
      return;
    }
    e.xOld = e.x;
    e.yOld = e.y;
    e.zOld = e.z;
    e.yRotO = e.yRot;
    e.xRotO = e.xRot;
    if (actual && e.inChunk) {
      e.tick();
    }
    TIMER_PUSH('chunkCheck');
    if (e.x !== e.x) e.x = e.xOld; // @note: checking for NaN, not sure about Infinite
    if (e.y !== e.y) e.y = e.yOld;
    if (e.z !== e.z) e.z = e.zOld;
    if (e.xRot !== e.xRot) e.xRot = e.xRotO;
    if (e.yRot !== e.yRot) e.yRot = e.yRotO;
    const xcn = Mth.floor(e.x / 16.0);
    const ycn = Mth.floor(e.y / 16.0);
    const zcn = Mth.floor(e.z / 16.0);
    if (!e.inChunk || e.xChunk !== xcn || e.yChunk !== ycn || e.zChunk !== zcn) {
      if (e.inChunk && this.hasChunk(e.xChunk, e.zChunk)) {
        this.getChunk(e.xChunk, e.zChunk).removeEntity(e, e.yChunk);
      }
      if (this.hasChunk(xcn, zcn)) {
        e.inChunk = true;
        this.getChunk(xcn, zcn).addEntity(e);
      } else {
        e.inChunk = false;
      }
    }
    TIMER_POP();
    const now = getTimeS();
    if (now - this._lastSavedPlayerTime >= 30) {
      this.saveLevelData();
      this._lastSavedPlayerTime = now;
    }
  }

  isUnobstructed(aabb: AABB): boolean {
    const entities = this.getEntities(null, aabb);
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if (!e.removed && e.blocksBuilding) return false;
    }
    return true;
  }
  // （setZombieAi 见上方；这里原是同一条 OMIT 记录的重复）

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

  /**
   * C++ 的两个重载（R10 情形 A：短版本只是以 `fire = false` 转调长版本）：
   *   explode(source, x, y, z, r)       Level.cpp:1684
   *   explode(source, x, y, z, r, fire) Level.cpp:1689
   *
   * `if (!isClientSide)` 是原句；`ExplodePacket` 那句照旧 DEFERRED(Network)。
   */
  explode(
    source: Entity | null,
    x: number,
    y: number,
    z: number,
    r: number,
    fire = false,
  ): void {
    if (!this.isClientSide) {
      const explosion = new Explosion(this, source, x, y, z, r);
      explosion.fire = fire;
      explosion.explode();
      explosion.finalizeExplosion();
      // DEFERRED(Network): ExplodePacket packet(x, y, z, r, explosion.toBlow); raknetInstance->send(packet);
    }
  }

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
      case Facing.DOWN:
        y--;
        break;
      case Facing.UP:
        y++;
        break;
      case Facing.NORTH:
        z--;
        break;
      case Facing.SOUTH:
        z++;
        break;
      case Facing.WEST:
        x--;
        break;
      case Facing.EAST:
        x++;
        break;
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

  updateLight(
    layer: LightLayer,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    join = true,
  ): void {
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

  /** 返回共享的 _es（C++ 返回 EntityList&） */
  getEntities(except: Entity | null, bb: AABB): Entity[] {
    this._es.length = 0;
    const xc0 = Mth.floor((bb.x0 - 2) / 16);
    const xc1 = Mth.floor((bb.x1 + 2) / 16);
    const zc0 = Mth.floor((bb.z0 - 2) / 16);
    const zc1 = Mth.floor((bb.z1 + 2) / 16);
    for (let xc = xc0; xc <= xc1; xc++)
      for (let zc = zc0; zc <= zc1; zc++) {
        if (this.hasChunk(xc, zc)) {
          this.getChunk(xc, zc).getEntities(except, bb, this._es);
        }
      }
    return this._es;
  }

  getAllEntities(): readonly Entity[] {
    return this.entities;
  }

  prepare(): void {
    while (this._chunkSource.tick());
  }

  isNew(): boolean {
    return this._isNew;
  }

  mayPlace(
    tileId: number,
    x: number,
    y: number,
    z: number,
    ignoreEntities: boolean,
    face: number,
  ): boolean {
    const targetType = this.getTile(x, y, z);
    let targetTile = Tile.tiles[targetType] ?? null;
    const tile = Tile.tiles[tileId]!;
    let aabb = tile.getAABB(this, x, y, z);
    if (ignoreEntities) aabb = null;
    if (aabb != null && !this.isUnobstructed(aabb)) return false;
    if (
      targetTile === Tile.water ||
      targetTile === Tile.calmWater ||
      targetTile === Tile.lava ||
      targetTile === Tile.calmLava ||
      targetTile === Tile.fire ||
      targetTile === Tile.topSnow
    )
      targetTile = null;
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

  /** C++ 的返回值 list.size() - (-初始大小)，即“加上”初始大小（原样保留这个缺陷） */
  getEntitiesOfType(entityType: number, bb: AABB, list: Entity[]): number {
    const xc0 = Mth.floor((bb.x0 - 2) / 16);
    const xc1 = Mth.floor((bb.x1 + 2) / 16);
    const zc0 = Mth.floor((bb.z0 - 2) / 16);
    const zc1 = Mth.floor((bb.z1 + 2) / 16);
    const count = -list.length;
    for (let xc = xc0; xc <= xc1; xc++)
      for (let zc = zc0; zc <= zc1; zc++) {
        if (this.hasChunk(xc, zc)) {
          this.getChunk(xc, zc).getEntitiesOfType(entityType, bb, list);
        }
      }
    return list.length - count;
  }

  getEntitiesOfClass(type: number, bb: AABB, list: Entity[]): number {
    const xc0 = Mth.floor((bb.x0 - 2) / 16);
    const xc1 = Mth.floor((bb.x1 + 2) / 16);
    const zc0 = Mth.floor((bb.z0 - 2) / 16);
    const zc1 = Mth.floor((bb.z1 + 2) / 16);
    const count = -list.length;
    for (let xc = xc0; xc <= xc1; xc++)
      for (let zc = zc0; zc <= zc1; zc++) {
        if (this.hasChunk(xc, zc)) {
          this.getChunk(xc, zc).getEntitiesOfClass(type, bb, list);
        }
      }
    return list.length - count;
  }

  countInstanceOfType(typeId: number): number {
    let n = 0;
    for (let i = 0; i < this.entities.length; ++i)
      if (typeId === this.entities[i]!.getEntityTypeId()) ++n;
    return n;
  }

  countInstanceOfBaseType(baseTypeId: number): number {
    if (baseTypeId < MobTypes.BaseEnemy || baseTypeId > MobTypes.BaseWaterCreature) {
      LOGE(
        'Bad typeId sent to Level::countInstanceOf. Note that only Base types (MobTypes::Base*) are supported for now.',
      );
      return -1;
    }
    let n = 0;
    for (let i = 0; i < this.entities.length; ++i)
      if (baseTypeId === this.entities[i]!.getCreatureBaseType()) ++n;
    return n;
  }

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
    return new Pos(
      this.levelData.getXSpawn(),
      this.levelData.getYSpawn(),
      this.levelData.getZSpawn(),
    );
  }

  setSpawnPos(spawnPos: Pos): void {
    this.levelData.setSpawn(spawnPos.x, spawnPos.y, spawnPos.z);
  }

  mayInteract(_player: Player, _xt: number, _yt: number, _zt: number): boolean {
    return true;
  }

  broadcastEntityEvent(_e: Entity, _eventId: number): void {
    if (this.isClientSide) return;
    // DEFERRED(Network): EntityEventPacket packet(e->entityId, eventId); raknetInstance->send(packet);
  }

  getChunkSource(): ChunkSource {
    return this._chunkSource;
  }

  getLevelStorage(): LevelStorage | null {
    return this.levelStorage;
  }

  getLevelData(): LevelData {
    return this.levelData;
  }

  /** C++ `void Level::takePicture(TripodCamera* cam, Entity* e)` —— 转发给所有 listener */
  takePicture(cam: TripodCamera, e: Entity): void {
    for (let i = 0; i < this._listeners.length; i++) this._listeners[i]!.takePicture(cam, e);
  }
  dispatchEntityData(e: Entity): void {
    if (this.isClientSide) return;
    if (!this._pendingEntityData.has(e.entityId)) this._pendingEntityData.set(e.entityId, e); // std::map::insert 不覆盖
  }

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

  removePlayer(player: Player): void {
    for (let i = 0; i < this.players.length; ++i)
      if (this.players[i] === player) {
        this.players.splice(i, 1);
      }
  }

  /** C++ 返回 int（0 或 1） */
  isNightMode(): number {
    return this._nightMode ? 1 : 0;
  }

  setNightMode(isNightMode: boolean): void {
    this._nightMode = isNightMode;
  }

  inRange(x: number, y: number, z: number): boolean {
    return (
      x >= 0 &&
      x < LevelConstants.LEVEL_WIDTH &&
      y >= 0 &&
      y < LevelConstants.LEVEL_HEIGHT &&
      z >= 0 &&
      z < LevelConstants.LEVEL_DEPTH
    );
  }

  /** ADAPTED(Test)：只给测试用，计划刻队列的长度 */
  _pendingTickCountForTest(): number {
    return this._tickNextTickSet.size();
  }
}
