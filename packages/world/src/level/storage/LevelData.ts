/**
 * 1:1 移植自 src/world/level/storage/LevelData.h 与 LevelData.cpp（S4）：世界的元数据（种子、出生点、时间、游戏模式）。
 *
 * 【OMIT】NBT 读写（从 CompoundTag 构造、createTag×2、getTagData、setTagData、setPlayerTag、getLoadedPlayerTag、
 *   setLoadedPlayerTag）、网络读写（v1_write、v1_read）、setLoadedPlayerTo(Player)，共 11 个。
 *   loadedPlayerTag 字段只被这些函数使用，一并 OMIT；拷贝与析构里对它的处理 DEFERRED(NBT)。
 * 【ADAPTED(Cpp)】C++ 的拷贝构造写成构造函数的一个重载 new LevelData(rhs)，operator= 写成 assign(rhs)。
 * 【C++ 的未初始化字段】带 LevelSettings 的构造函数没有初始化 storageVersion，所有构造函数都没有初始化 sizeOnDisk；这里取 0。
 *   拷贝构造与 operator= 都不复制 sizeOnDisk，照原样保留。
 * 【三档规则】种子属于“种子 → 世界”的链，照原值保存；其余字段本来就是整数。
 */
import { SharedConstants } from '@mcpe/core';
import { Dimension } from '../dimension/Dimension';
import { GameType, type LevelSettings } from '../LevelSettings';
import { PlayerData } from './PlayerData';

export class LevelData {
  playerData = new PlayerData();
  playerDataVersion = -1;
  levelName = '';

  private seed = 0; // long
  private xSpawn = 128;
  private ySpawn = 64;
  private zSpawn = 128;
  private time = 0; // long
  private lastPlayed = 0;
  private sizeOnDisk = 0; // long
  // OMIT(NBT): CompoundTag* loadedPlayerTag;  LevelData.h:90
  private dimension = Dimension.NORMAL;
  private gameType: number = GameType.Default;
  private storageVersion = 0;
  private spawnMobs = false;
  private allowCheats = false;
  private generatorVersion: number = SharedConstants.GeneratorVersion;

  constructor();
  constructor(settings: LevelSettings, levelName: string, generatorVersion?: number);
  constructor(rhs: LevelData);
  constructor(a?: LevelSettings | LevelData, levelName?: string, generatorVersion = -1) {
    if (a === undefined) {
      // LevelData()：字段初值即 C++ 初始化列表
      this.spawnMobs = this.gameType === GameType.Survival;
    } else if (a instanceof LevelData) {
      // LevelData(const LevelData& rhs)
      this.copyFields(a);
      // DEFERRED(NBT): setPlayerTag(rhs.loadedPlayerTag);
    } else {
      // LevelData(const LevelSettings& settings, const std::string& levelName, int generatorVersion = -1)
      this.seed = a.getSeed();
      this.gameType = a.getGameType();
      this.allowCheats = a.getAllowCheats();
      this.levelName = levelName!;
      if (generatorVersion < 0) generatorVersion = SharedConstants.GeneratorVersion;
      this.generatorVersion = generatorVersion;
      this.spawnMobs = this.gameType === GameType.Survival;
    }
  }

  // OMIT(NBT): LevelData(CompoundTag* tag)  LevelData.cpp:34

  /** ADAPTED(Cpp)：LevelData& operator=(const LevelData& rhs) */
  assign(rhs: LevelData): this {
    if (this !== rhs) {
      this.copyFields(rhs);
      // DEFERRED(NBT): setPlayerTag(rhs.loadedPlayerTag);
    }
    return this;
  }

  private copyFields(rhs: LevelData): void {
    this.seed = rhs.seed;
    this.gameType = rhs.gameType;
    this.levelName = rhs.levelName;
    this.xSpawn = rhs.xSpawn;
    this.ySpawn = rhs.ySpawn;
    this.zSpawn = rhs.zSpawn;
    this.lastPlayed = rhs.lastPlayed;
    this.time = rhs.time;
    this.dimension = rhs.dimension;
    this.spawnMobs = rhs.spawnMobs;
    this.allowCheats = rhs.allowCheats;
    this.playerData.assign(rhs.playerData);
    this.playerDataVersion = rhs.playerDataVersion;
    this.generatorVersion = rhs.generatorVersion;
    this.storageVersion = rhs.storageVersion;
  }

  // OMIT(Network): v1_write(bitStream)  LevelData.cpp:85
  // OMIT(Network): v1_read(bitStream, storageVersion)  LevelData.cpp:97
  // OMIT(NBT): createTag()  LevelData.cpp:111
  // OMIT(NBT): createTag(players)  LevelData.cpp:118
  // OMIT(NBT): setTagData(tag, playerTag)  LevelData.cpp:131
  // OMIT(NBT): getTagData(tag)  LevelData.cpp:150
  // OMIT(NBT): setPlayerTag(tag)  LevelData.cpp:169

  getSeed(): number {
    return this.seed;
  }

  getXSpawn(): number {
    return this.xSpawn;
  }

  getYSpawn(): number {
    return this.ySpawn;
  }

  getZSpawn(): number {
    return this.zSpawn;
  }

  getTime(): number {
    return this.time;
  }

  getSizeOnDisk(): number {
    return this.sizeOnDisk;
  }

  // OMIT(NBT): getLoadedPlayerTag()  LevelData.cpp:203
  // OMIT(Player): setLoadedPlayerTo(p)  LevelData.cpp:207

  getDimension(): number {
    return this.dimension;
  }

  setSeed(seed: number): void {
    this.seed = seed;
  }

  setXSpawn(xSpawn: number): void {
    this.xSpawn = xSpawn;
  }

  setYSpawn(ySpawn: number): void {
    this.ySpawn = ySpawn;
  }

  setZSpawn(zSpawn: number): void {
    this.zSpawn = zSpawn;
  }

  setTime(time: number): void {
    this.time = time;
  }

  setSizeOnDisk(sizeOnDisk: number): void {
    this.sizeOnDisk = sizeOnDisk;
  }

  // OMIT(NBT): setLoadedPlayerTag(playerTag)  LevelData.cpp:240

  setDimension(dimension: number): void {
    this.dimension = dimension;
  }

  setSpawn(xSpawn: number, ySpawn: number, zSpawn: number): void {
    this.xSpawn = xSpawn;
    this.ySpawn = ySpawn;
    this.zSpawn = zSpawn;
  }

  getLevelName(): string {
    return this.levelName;
  }

  setLevelName(levelName: string): void {
    this.levelName = levelName;
  }

  getGeneratorVersion(): number {
    return this.generatorVersion;
  }

  setGeneratorVersion(version: number): void {
    this.generatorVersion = version;
  }

  getLastPlayed(): number {
    return this.lastPlayed;
  }

  getStorageVersion(): number {
    return this.storageVersion;
  }

  setStorageVersion(version: number): void {
    this.storageVersion = version;
  }

  getGameType(): number {
    return this.gameType;
  }

  setGameType(type: number): void {
    this.gameType = type;
  }

  getSpawnMobs(): boolean {
    return this.spawnMobs;
  }

  setSpawnMobs(doSpawn: boolean): void {
    this.spawnMobs = doSpawn;
  }

  getAllowCheats(): boolean {
    return this.allowCheats;
  }

  setAllowCheats(allow: boolean): void {
    this.allowCheats = allow;
  }
}
