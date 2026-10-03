/**
 * 1:1 移植自 src/world/level/storage/LevelData.h 与 LevelData.cpp（S4 起，B4b 补齐 NBT 部分）：
 * 世界的元数据（种子、出生点、时间、游戏模式）。
 *
 * 【B4b 补齐】原先 OMIT(NBT) 的 10 个函数已按 C++ 移植：LevelData(CompoundTag*)、createTag×2、
 *   setTagData、getTagData、setPlayerTag、getLoadedPlayerTag、setLoadedPlayerTag、
 *   v1_write/v1_read（TS 名 v1Write/v1Read，与方法命名惯例一致）。
 *   仍 OMIT 的只剩 setLoadedPlayerTo(Player)，它依赖 PlayerData::loadPlayer，后者本身是 OMIT(Player)。
 *
 * 【ADAPTED(Cpp)】C++ 的拷贝构造写成构造函数的一个重载 new LevelData(rhs)，operator= 写成 assign(rhs)。
 *   重载的 createTag(const std::vector<Player*>&) 按 R10 命名成 createTagForPlayers。
 *
 * 【C++ 的未初始化字段】带 LevelSettings 的构造函数没有初始化 storageVersion，所有构造函数都没有初始化
 *   sizeOnDisk；这里取 0。拷贝构造与 operator= 都不复制 sizeOnDisk，照原样保留。
 *
 * 【原样保留的两处 (int) 强转】getTagData 里 `sizeOnDisk = (int)tag->getLong(...)` 和
 *   `lastPlayed = (int)tag->getLong(...)` —— 都是从 64 位截断到 32 位。前者的目标字段本身是 long，
 *   所以截断后再符号扩展回 64 位，是原版的怪癖；值小的时候看不出来，但别"顺手修好"。
 *
 * 【三档规则】种子属于"种子 → 世界"的链，照原值保存；其余字段本来就是整数。
 */
import { SharedConstants } from '@mcpe/core';
import { CompoundTag, TAG_Compound } from '@mcpe/nbt';
import { getEpochTimeS } from '@mcpe/platform';
import { BitStream } from '@mcpe/util';
import { Dimension } from '../dimension/Dimension';
import { GameType, type LevelSettings } from '../LevelSettings';
import type { Player } from '../../entity/player/Player';
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
  private loadedPlayerTag: CompoundTag | null = null;
  private dimension = Dimension.NORMAL;
  private gameType: number = GameType.Default;
  private storageVersion = 0;
  private spawnMobs = false;
  private allowCheats = false;
  private generatorVersion: number = SharedConstants.GeneratorVersion;

  constructor();
  constructor(settings: LevelSettings, levelName: string, generatorVersion?: number);
  constructor(rhs: LevelData);
  constructor(tag: CompoundTag);
  constructor(
    a?: LevelSettings | LevelData | CompoundTag,
    levelName?: string,
    generatorVersion = -1,
  ) {
    if (a === undefined) {
      // LevelData()：字段初值即 C++ 初始化列表
      this.spawnMobs = this.gameType === GameType.Survival;
    } else if (a instanceof LevelData) {
      // LevelData(const LevelData& rhs)
      this.copyFields(a);
      this.setPlayerTag(a.loadedPlayerTag);
    } else if (a instanceof CompoundTag) {
      // LevelData(CompoundTag* tag)
      this.getTagData(a);
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

  /** ADAPTED(Cpp)：LevelData& operator=(const LevelData& rhs) */
  assign(rhs: LevelData): this {
    if (this !== rhs) {
      this.copyFields(rhs);
      this.setPlayerTag(rhs.loadedPlayerTag);
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

  // ---- 字节流（v1 存档格式）----

  /**
   * 对应 `void v1_write(RakNet::BitStream&)`。注意 `getEpochTimeS()` 在 C++ 里返回 **int**，
   * 所以最后那项是 4 字节，与 v1_read 读进 lastPlayed(int) 对称。
   */
  v1Write(bitStream: BitStream): void {
    bitStream.writeLong(this.seed);
    bitStream.writeInt(this.xSpawn);
    bitStream.writeInt(this.ySpawn);
    bitStream.writeInt(this.zSpawn);
    bitStream.writeLong(this.time);
    bitStream.writeLong(this.sizeOnDisk);
    bitStream.writeInt(getEpochTimeS());
    bitStream.writeString(this.levelName);
  }

  /** 对应 `void v1_read(RakNet::BitStream&, int storageVersion)` */
  v1Read(bitStream: BitStream, storageVersion: number): void {
    this.storageVersion = storageVersion;
    this.seed = bitStream.readLong();
    this.xSpawn = bitStream.readInt();
    this.ySpawn = bitStream.readInt();
    this.zSpawn = bitStream.readInt();
    this.time = bitStream.readLong();
    this.sizeOnDisk = bitStream.readLong();
    this.lastPlayed = bitStream.readInt();
    this.levelName = bitStream.readString();
  }

  // ---- NBT ----

  /** 对应 `CompoundTag* createTag()` */
  createTag(): CompoundTag {
    const tag = new CompoundTag();
    const player =
      this.loadedPlayerTag !== null ? (this.loadedPlayerTag.copy() as CompoundTag) : null;
    this.setTagData(tag, player);
    return tag;
  }

  /** 对应重载 `CompoundTag* createTag(const std::vector<Player*>&)`（R10：改名以免和上面撞名） */
  createTagForPlayers(players: Player[]): CompoundTag {
    const tag = new CompoundTag();
    let playerTag: CompoundTag | null = null;
    const player = players.length > 0 ? players[0]! : null;
    if (player !== null) {
      playerTag = new CompoundTag();
      // DEFERRED(Player): player->saveWithoutId(playerTag);  LevelData.cpp:126
      //   Player 的存档序列化还没移植；这一步没做，写出来的 Player 标签是空的。
    }
    this.setTagData(tag, playerTag);
    return tag;
  }

  /** 对应 `void setTagData(CompoundTag* tag, CompoundTag* playerTag)` */
  setTagData(tag: CompoundTag | null, playerTag: CompoundTag | null): void {
    if (!tag) return;
    tag.putLong('RandomSeed', BigInt(this.seed));
    tag.putInt('GameType', this.gameType);
    tag.putBoolean('AllowCommands', this.allowCheats);
    tag.putInt('SpawnX', this.xSpawn);
    tag.putInt('SpawnY', this.ySpawn);
    tag.putInt('SpawnZ', this.zSpawn);
    tag.putLong('Time', BigInt(this.time));
    tag.putLong('SizeOnDisk', BigInt(this.sizeOnDisk));
    tag.putLong('LastPlayed', BigInt(getEpochTimeS()));
    tag.putString('LevelName', this.levelName);
    tag.putInt('StorageVersion', this.storageVersion);
    tag.putInt('Platform', 2);
    if (playerTag !== null) {
      tag.putCompound('Player', playerTag);
    }
  }

  /** 对应 `void getTagData(const CompoundTag* tag)` */
  getTagData(tag: CompoundTag | null): void {
    if (!tag) return;
    this.seed = Number(tag.getLong('RandomSeed'));
    this.gameType = tag.getInt('GameType');
    this.allowCheats = tag.getBoolean('AllowCommands');
    this.xSpawn = tag.getInt('SpawnX');
    this.ySpawn = tag.getInt('SpawnY');
    this.zSpawn = tag.getInt('SpawnZ');
    this.time = Number(tag.getLong('Time'));
    // 【原样保留】(int) 强转：从 64 位截到 32 位
    this.lastPlayed = Number(BigInt.asIntN(32, tag.getLong('LastPlayed')));
    this.sizeOnDisk = Number(BigInt.asIntN(32, tag.getLong('SizeOnDisk')));
    this.levelName = tag.getString('LevelName');
    this.storageVersion = tag.getInt('StorageVersion');
    this.spawnMobs = this.gameType === GameType.Survival;
    if (tag.contains('Player', TAG_Compound)) {
      this.setPlayerTag(tag.getCompound('Player'));
    }
  }

  /** 对应 `void setPlayerTag(CompoundTag* tag)`：**拷贝一份**存下来 */
  setPlayerTag(tag: CompoundTag | null): void {
    // C++ 在这里 delete 掉旧的 loadedPlayerTag 再置 NULL；TS 交给 GC
    this.loadedPlayerTag = null;
    if (tag) this.loadedPlayerTag = tag.copy() as CompoundTag;
  }

  /** 对应 `CompoundTag* getLoadedPlayerTag()`。返回内部对象本身（C++ 也返回裸指针） */
  getLoadedPlayerTag(): CompoundTag | null {
    return this.loadedPlayerTag;
  }

  /** 对应 `void setLoadedPlayerTag(CompoundTag* playerTag)`：**接管**传入对象，不拷贝 */
  setLoadedPlayerTag(playerTag: CompoundTag | null): void {
    this.loadedPlayerTag = playerTag;
  }

  // OMIT(Player): setLoadedPlayerTo(p)  LevelData.cpp:257 —— 依赖 PlayerData::loadPlayer，后者是 OMIT(Player)

  // ---- 取值 ----

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
