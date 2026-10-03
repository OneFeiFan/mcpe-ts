/**
 * 1:1 移植自 src/world/level/storage/ExternalFileLevelStorage.cpp/.h。
 *
 * 【进度】B4 做了三个静态函数：readLevelData / writeLevelData（level.dat）与 readPlayerData（player.dat）。
 * B5a 补上构造、析构、prepareLevel、saveLevelData、savePlayer/loadPlayer。仍是 OMIT 的：
 * 区块的 load/save、saveAll、saveGame、tick（B5b）与 loadEntities/saveEntities（B5c）。
 *
 * level.dat 的文件布局（readLevelData / writeLevelData 两个函数一起看）：
 *     int32 version     ← 存档版本号，同时决定载荷用哪种格式
 *     int32 size        ← 载荷字节数
 *     byte[size] data   ← version==1 走 v1_write 的裸字节，version>=2 走 NBT
 *
 * 【只走 NBT 那条路是有原因的】存档版本常量 `SharedConstants::StorageVersion` 是 3，
 * 而 `writeLevelData` 只在 storageVersion == 1 时才用 v1_write。也就是说 **v1 那条分支在默认
 * 配置下是死代码** —— 但它是 C++ 里真实存在的分支，照原样留着（读的时候 version==1 仍要能读）。
 *
 * 【R10 改名：静态与成员同名】C++ 里 saveLevelData / savePlayer / loadPlayer 各有**一个成员版和
 * 一个静态版**（成员版转调静态版），同名。TS 一个类里不能静态与实例同名，按 R10 情形 B 处理：
 * **成员版保留原名**（它是 LevelStorage 接口的实现，是"分派入口"），静态版按区分参数改名 ——
 * 与手册里 `静态的 Player::animateRespawn(...)` → `animateRespawnFor` 同一做法：
 *     saveLevelData(directory, levelData, players) → saveLevelDataTo
 *     savePlayer(player, worldDir)                 → savePlayerTo
 *     loadPlayer(player, worldDir)                 → loadPlayerFrom
 *
 * 【ADAPTED(Web)：C++ 的 ofstream/ifstream】savePlayer/loadPlayer 用的是 `std::ofstream` /
 * `std::ifstream`，不是 `FILE*` —— B1 造的 CFile 对应的是后者，套不上。这里直接走 VirtualFS：
 *   - ofstream(path, out|binary)：默认**截断**，打不开时 write **静默失败**（不抛、不报错）。
 *     对应 open(path,'wb') 返回 null 时直接跳过写入 —— 效果一样，而且都不会凭空建出文件。
 *   - ifstream：`if (!file.is_open()) return false;` 对应 open 返回 null 就 return false。
 *
 * 【析构】C++ 的 `~ExternalFileLevelStorage` 是 `delete regionFile; delete loadedLevelData;`。
 * TS 没有析构，交给 GC —— 见文件末尾的说明。
 *
 * 【getRemainingFileSize 已经挪回 FolderMethods】B4c 时它临时放在这里（注释写着"B6 时再挪过去"），
 * B5a 顺势把它和 FolderMethods 的其它函数一起归位了。
 */
import { SharedConstants } from '@mcpe/core';
import { CompoundTag, NbtIo } from '@mcpe/nbt';
import { LOGE, LOGI, SEEK_END, SEEK_SET, getVfs } from '@mcpe/platform';
import { BitStream, RakDataInput, RakDataOutput } from '@mcpe/util';
import type { Player } from '../../entity/player/Player';
import { LevelChunk } from '../chunk/LevelChunk';
import type { ChunkStorage } from '../chunk/storage/ChunkStorage';
import type { Dimension } from '../dimension/Dimension';
import type { Level } from '../Level';
import { Tile } from '../tile/Tile';
import { LevelConstants } from '../LevelConstants';
import { createFolderIfNotExists, getRemainingFileSize } from './FolderMethods';
import { LevelData } from './LevelData';
import { LevelStorage } from './LevelStorage';
import type { PlayerData } from './PlayerData';
import { RegionFile } from './RegionFile';

/**
 * C++ 里这是文件内的 `static const int ChunkVersion_Light = 1;`。
 * 它跟 level.dat 的 storageVersion 是**两个不同的东西**，但 load 里拿后者当版本号用了 —— 照抄。
 * （另一个常量 ChunkVersion_Entity = 2 要到 B5c 的 loadEntities 才用到，那时再加。）
 */
const ChunkVersion_Light = 1;

// C++ 里这四个是文件内的 const char* const，有内部链接；导出是因为 B5/B6 也要用同样的文件名
export const fnLevelDatOld = 'level.dat_old';
export const fnLevelDatNew = 'level.dat_new';
export const fnLevelDat = 'level.dat';
export const fnPlayerDat = 'player.dat';

/**
 * C++ 里这个类定义在 ExternalFileLevelStorage.cpp **文件内部**（不在头文件里），只有本文件的 load 用它。
 * 这里对应地放在同一个文件、不导出。
 *
 * 两个函数都是"就地改区块里的方块数组"，返回有没有改过；调用方拿它决定 `unsaved`。
 */
class LevelConverters {
  /** 老存档里羊毛是 101..115 这 15 个独立方块 id，后来合并成"羊毛 + 颜色数据"，这里做那个迁移 */
  static v1_ClothIdToClothData(c: LevelChunk): boolean {
    let changed = false;
    const blocks = c.getBlockData()!;
    const newTile = Tile.cloth.id;
    for (let i = 0; i < 16 * 16 * 128; ++i) {
      const oldTile = blocks[i]!;
      if (oldTile >= 101 && oldTile <= 115) {
        const color = 0xf - (oldTile - 101);
        blocks[i] = newTile;
        c.data.set(i, color);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * 把"注册表里已经不存在"的方块 id 换成 info_updateGame1 / info_updateGame2。
   *
   * 【注意这个函数在 load 里是**无条件执行**的】原文的缩进看着像在 `if (loadedStorageVersion == 1)`
   * 里面，但 C++ 的 if 不带花括号时只管第一条语句 —— 所以它其实每次都跑。见 load 里的注释。
   */
  static ReplaceUnavailableBlocks(c: LevelChunk): boolean {
    let changed = false;
    const blocks = c.getBlockData()!;
    for (let i = 0; i < 16 * 16 * 128; ++i) {
      const oldTile = blocks[i]!;
      const newTile = Tile.transformToValidBlockId(oldTile);
      if (oldTile !== newTile) {
        blocks[i] = newTile;
        changed = true;
      }
    }
    return changed;
  }
}

/**
 * PlayerData 在 player.dat 里的**内存布局**（ADAPTED(Cpp)）。
 *
 * C++ 那边没有什么"布局"可言 —— `readPlayerData` 直接
 *     fread(&dest.playerData, 1, sizeof(dest.playerData), fp)
 * 把结构体的内存镜像整个读进来，偏移由编译器的字段顺序与对齐填充决定。TS 没有这层信息，
 * 只能按固定数字解码，所以这组数字必须**量**出来、不能推算：错一个字节，后面所有字段就全错位，
 * 而错位的结果往往还是个"看着挺像"的浮点数，不会自己暴露出来。
 *
 * 这里的值来自参考编译器（tools/golden/harness_playerdata.cpp 的 layout 段），
 * tests/golden/playerdata.golden.test.ts 会拿夹具里记的实测值逐项核对 —— 布局一变测试就红。
 *
 * 留意 onGround 是 bool（1 字节），后面有 3 字节填充（下一个成员是 int，要 4 字节对齐），
 * 所以 inventorySlots 在 44 而不是 41。
 */
export const PLAYER_DATA_LAYOUT = {
  sizeOf: 80,
  pos: 0, // Vec3，3 个 float
  motion: 12, // Vec3
  xRot: 24, // float
  yRot: 28, // float
  fallDistance: 32, // float
  onFire: 36, // short
  airSupply: 38, // short
  onGround: 40, // bool
  inventorySlots: 44, // int[9]
  maxSelectionSize: 9,
} as const;

/**
 * 把 player.dat 载荷的这 80 字节按上面的布局解到 out 里。
 *
 * 【小端】参考实现跑在 x86-64 上（黄金样本就是这么生成的），float/short/int 都是小端。
 * 这跟 B2 那个 BitStream **不是一回事**：那边是 RakNet 主动做了端序交换，这里是**裸内存**，
 * 原样就是宿主序，不做任何转换。
 */
function decodePlayerData(buf: Uint8Array, out: PlayerData): void {
  const L = PLAYER_DATA_LAYOUT;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  out.pos.x = dv.getFloat32(L.pos, true);
  out.pos.y = dv.getFloat32(L.pos + 4, true);
  out.pos.z = dv.getFloat32(L.pos + 8, true);
  out.motion.x = dv.getFloat32(L.motion, true);
  out.motion.y = dv.getFloat32(L.motion + 4, true);
  out.motion.z = dv.getFloat32(L.motion + 8, true);
  out.xRot = dv.getFloat32(L.xRot, true);
  out.yRot = dv.getFloat32(L.yRot, true);
  out.fallDistance = dv.getFloat32(L.fallDistance, true);
  out.onFire = dv.getInt16(L.onFire, true); // short → 有符号
  out.airSupply = dv.getInt16(L.airSupply, true);
  out.onGround = dv.getUint8(L.onGround) !== 0;
  for (let i = 0; i < L.maxSelectionSize; i++) {
    out.inventorySlots[i] = dv.getInt32(L.inventorySlots + i * 4, true);
  }
}

export class ExternalFileLevelStorage extends LevelStorage {
  private levelId: string;
  private levelPath: string;
  /** C++ 是 LevelData* 且可能为 NULL（两个文件都读不出来时就 delete 掉了），所以这里要能是 null */
  private loadedLevelData: LevelData | null;
  // regionFile / entitiesFile 只有 B5b/B5c 的区块与实体读写会用到，这里先按 C++ 的初始化列表演成 null
  private regionFile: RegionFile | null = null;
  private entitiesFile: RegionFile | null = null;
  private level: Level | null = null;
  private tickCount = 0;
  private loadedStorageVersion: number;
  // C++ 的 lastSavedEntitiesTick(-999999)；unsavedChunkList 是 B5b 的 tick 才用的，本步不声明
  private lastSavedEntitiesTick = -999999;

  /**
   * 建目录、读 level.dat、再读 player.dat。
   *
   * 【原样保留】注意 `readLevelData` **读坏了也返回 true**（见那个函数的注释），所以"文件存在但内容
   * 是坏的"这条路上，`loadedLevelData` 会保留一个全默认值的 LevelData，构造函数照样往下走。
   * 只有"两个文件都打不开"才会把它丢掉、置 null。
   */
  constructor(levelId: string, fullPath: string) {
    super(); // LevelStorage 没有显式构造函数，这里只是满足 TS 对派生类的要求
    this.levelId = levelId;
    this.levelPath = fullPath;
    this.loadedLevelData = null;
    this.loadedStorageVersion = SharedConstants.StorageVersion;

    createFolderIfNotExists(this.levelPath);
    const playerFolder = this.levelPath + '/players';
    createFolderIfNotExists(playerFolder);
    // C++ 在这里还算了 `std::string datFileName = levelPath + "/" + fnLevelDat;`，但**从头到尾没用到**
    // （真正用的是下面的 levelFileName）。原样保留一个没人读的局部变量没有意义，这里略去。
    const levelFileName = this.levelPath + '/' + fnPlayerDat;

    this.loadedLevelData = new LevelData();
    if (ExternalFileLevelStorage.readLevelData(this.levelPath, this.loadedLevelData)) {
      this.loadedStorageVersion = this.loadedLevelData.getStorageVersion();
      ExternalFileLevelStorage.readPlayerData(levelFileName, this.loadedLevelData);
    } else {
      // C++: delete loadedLevelData; loadedLevelData = NULL;
      this.loadedLevelData = null;
    }
  }

  /**
   * C++ 的析构是 `delete regionFile; delete loadedLevelData;`。
   * TS 没有析构函数，这两个对象交给 GC —— 不写等价物是**有意的**，不是什么都没做。
   * （regionFile/entitiesFile 在 B5b/B5c 里才真正被打开。）
   */

  prepareLevel(_level: Level): LevelData | null {
    this.level = _level;
    return this.loadedLevelData;
  }

  /**
   * C++ 的 `ChunkStorage* createChunkStorage(Dimension*) { return this; }` —— 返回自己。
   *
   * 【B5b 之前先挡一下】C++ 里这个类**同时继承 LevelStorage 和 ChunkStorage**，TS 只能单继承，
   * 所以返回 this 时得断言一下：ChunkStorage 那一半（load / save / saveAll / tick / flush）要到
   * B5b 才补齐。也就是说**现在这个对象还不能当 ChunkStorage 用**（去调 load 会 undefined）——
   * B5b 补齐之后这个断言才名副其实。这个类要到 B7 才接进 Minecraft，之前没人会调它。
   */
  createChunkStorage(_dimension: Dimension): ChunkStorage {
    return this as unknown as ChunkStorage;
  }

  /** C++ 的空实现：`void checkSession() {}` */
  checkSession(): void {}

  /** C++ 的空实现：`void closeAll() {}` */
  closeAll(): void {}

  /** C++ 的成员版 `saveLevelData(levelData, players)`：只是转到静态版，用 this.levelPath */
  saveLevelData(levelData: LevelData, players: Player[] | null = null): void {
    ExternalFileLevelStorage.saveLevelDataTo(this.levelPath, levelData, players);
  }

  /**
   * 静态版 `saveLevelData(directory, levelData, players)` —— 真正干活的那个（R10 改名，见文件头）。
   *
   * 整个流程就是"写临时文件 → 挪旧的 → 改名 → 收拾"这一套原子写的套路：
   *   1. 把 levelData 的 storageVersion 强制设成 SharedConstants::StorageVersion（所以存下去永远是当前版本）
   *   2. 写 level.dat_new
   *   3. 删 level.dat_old（无论存不存在）
   *   4. 若 level.dat 存在：改名成 level.dat_old，再删一次 level.dat
   *      —— 注意第 4 步的 `remove(datFile)` 在 rename 成功之后，看着多余（旧名已经没了），
   *         照抄不动
   *   5. 把 level.dat_new 改名成 level.dat，再删一次 level.dat_new（同样多余，照抄）
   * 任一步失败就 LOGE 并**直接返回**（后面一步都不做）。
   *
   * 【路径里有双斜杠】传下去的 directory 末尾带 `/`，而 savePlayer 自己又拼 `/players/`，
   * 于是玩家文件路径是 `levelPath//players//名字.dat`。VirtualFS.normalize 会合并连续的 `/`，
   * 所以能正常工作 —— 这是 C++ 就有的写法，不改。
   */
  static saveLevelDataTo(levelPath: string, levelData: LevelData, players: Player[] | null): void {
    const directory = levelPath + '/';
    const tmpFile = directory + fnLevelDatNew;
    const datFile = directory + fnLevelDat;
    const oldFile = directory + fnLevelDatOld;

    levelData.setStorageVersion(SharedConstants.StorageVersion);

    if (!ExternalFileLevelStorage.writeLevelData(tmpFile, levelData, players)) return;

    const vfs = getVfs();
    vfs.remove(oldFile); // C++ 的 remove() 不管文件在不在都不报错

    if (vfs.exists(datFile)) {
      if (!vfs.rename(datFile, oldFile)) {
        LOGE("Error@saveLevelData: Couldn't move savefile to level.dat_old\n");
        return;
      }
      vfs.remove(datFile);
    }
    if (!vfs.rename(tmpFile, datFile)) {
      LOGE("Error@saveLevelData: Couldn't move new file to level.dat\n");
      return;
    }
    vfs.remove(tmpFile);

    if (!players || players.length === 0) return;
    for (const player of players) {
      if (player !== null) {
        ExternalFileLevelStorage.savePlayerTo(player, directory);
      }
    }
  }

  /** C++ 的成员版 `savePlayer(Player&)`：转到静态版，用 this.levelPath */
  savePlayer(player: Player): void {
    ExternalFileLevelStorage.savePlayerTo(player, this.levelPath);
  }

  /** C++ 的成员版 `loadPlayer(Player&)`：转到静态版，用 this.levelPath */
  loadPlayer(player: Player): boolean {
    return ExternalFileLevelStorage.loadPlayerFrom(player, this.levelPath);
  }

  /**
   * 静态版 `savePlayer(player, worldDir)`：把玩家的 NBT 写进 `players/<名字>.dat`。
   *
   * 注意这个路径**不是** player.dat（那是 readPlayerData 读的遗留格式），两者不是一回事。
   * C++ 用 `std::ofstream`，见文件头的 ADAPTED(Web) 说明。
   */
  static savePlayerTo(player: Player, worldDir: string): void {
    const playerPath = worldDir + '/players/' + player.name + '.dat';
    LOGI(`Saving player ${player.name} to ${playerPath}...\n`);

    const data = new BitStream();
    const buf = new RakDataOutput(data);
    const playerTag = new CompoundTag();
    player.saveWithoutId(playerTag);
    NbtIo.write(playerTag, buf);
    // C++ 之后还 tag->deleteChildren(); delete tag; —— TS 交给 GC

    const file = getVfs().open(playerPath, 'wb');
    // C++ 的 ofstream 打不开时 write 是静默失败的（不抛不报错），这里跳过写入 —— 一样不报错
    if (!file) return;
    file.write(data.getData(), 1, data.getNumberOfBytesUsed());
    file.close();
  }

  /**
   * 静态版 `loadPlayer(player, worldDir)`：读回 `players/<名字>.dat` 并 load 进 player。
   *
   * 【返回值】只有**文件打不开**才 false。文件打得开但 NBT 读不出来（tag 为 null）**照样返回 true**
   * —— 照抄，调用方别拿它判断"玩家数据读到了没有"。
   */
  static loadPlayerFrom(player: Player, worldDir: string): boolean {
    const playerPath = worldDir + '/players/' + player.name + '.dat';
    LOGI(`Loading player ${player.name} from ${playerPath}...\n`);

    const file = getVfs().open(playerPath, 'rb');
    if (!file) return false;

    // C++ 是 `vector<uint8_t> data((istreambuf_iterator...), ...)` 一次读完，再喂给 BitStream
    file.seek(0, SEEK_END);
    const size = file.tell();
    file.seek(0, SEEK_SET);
    const data = new Uint8Array(size);
    file.read(data, 1, size);
    file.close();

    const bitStream = new BitStream(data, data.length, false);
    const stream = new RakDataInput(bitStream);
    const tag = NbtIo.read(stream);
    if (tag) {
      player.load(tag);
      // C++ 之后还 tag->deleteChildren(); delete tag; —— TS 交给 GC
    }
    return true;
  }

  /**
   * 把一个区块写进 chunks.dat。
   *
   * 【regionFile 是懒打开的】第一次用到才 new + open；打不开就把指针清回 null 并直接返回 ——
   * 于是下次调用会**再试一遍**。全类只有 save / load 两处这么做（loadEntities 之类是 B5c）。
   *
   * 区块在文件里的布局就是五个数组首尾相接，**没有长度前缀也没有版本号**：
   *     CHUNK_BLOCK_COUNT    字节  方块 id
   *     CHUNK_BLOCK_COUNT/2  字节  数据层（每方块 4 位）
   *     CHUNK_BLOCK_COUNT/2  字节  天空光
   *     CHUNK_BLOCK_COUNT/2  字节  方块光
   *     CHUNK_COLUMNS        字节  updateMap
   *
   * 【写的时候不看版本】读的时候才按 loadedStorageVersion 决定读不读光照那两段（见 load）。
   * 所以"用旧版本读、再用当前版本写回去"会把光照补上，反过来则会读错位。照抄，不修。
   */
  save(_level: Level, levelChunk: LevelChunk): void {
    if (!this.regionFile) {
      this.regionFile = new RegionFile(this.levelPath);
      if (!this.regionFile.open()) {
        this.regionFile = null;
        return;
      }
    }
    const chunkData = new BitStream();
    chunkData.writeBytes(levelChunk.getBlockData()!, LevelConstants.CHUNK_BLOCK_COUNT);
    chunkData.writeBytes(levelChunk.data.data!, Math.trunc(LevelConstants.CHUNK_BLOCK_COUNT / 2));
    chunkData.writeBytes(
      levelChunk.skyLight.data!,
      Math.trunc(LevelConstants.CHUNK_BLOCK_COUNT / 2),
    );
    chunkData.writeBytes(
      levelChunk.blockLight.data!,
      Math.trunc(LevelConstants.CHUNK_BLOCK_COUNT / 2),
    );
    chunkData.writeBytes(levelChunk.updateMap, LevelConstants.CHUNK_COLUMNS);
    this.regionFile.writeChunk(levelChunk.x, levelChunk.z, chunkData);
  }

  /**
   * 从 chunks.dat 读一个区块出来。读不到（regionFile 打不开、或这个坐标没有区块）返回 null。
   *
   * 【光照那两段按版本读】`loadedStorageVersion >= ChunkVersion_Light(=1)` 才读天空光与方块光
   * —— 老存档里没有这两段，硬读就会把后面的 updateMap 读错位。
   */
  load(level: Level, x: number, z: number): LevelChunk | null {
    if (!this.regionFile) {
      this.regionFile = new RegionFile(this.levelPath);
      if (!this.regionFile.open()) {
        this.regionFile = null;
        return null;
      }
    }
    const chunkData = this.regionFile.readChunk(x, z);
    if (!chunkData) return null;

    chunkData.resetReadPointer();
    const half = Math.trunc(LevelConstants.CHUNK_BLOCK_COUNT / 2);
    const blockIds = chunkData.readBytes(LevelConstants.CHUNK_BLOCK_COUNT);
    const levelChunk = new LevelChunk(level, blockIds, x, z);
    levelChunk.data.data!.set(chunkData.readBytes(half));
    if (this.loadedStorageVersion >= ChunkVersion_Light) {
      levelChunk.skyLight.data!.set(chunkData.readBytes(half));
      levelChunk.blockLight.data!.set(chunkData.readBytes(half));
    }
    levelChunk.updateMap.set(chunkData.readBytes(LevelConstants.CHUNK_COLUMNS));
    // C++ 这里还有 `delete[] chunkData->GetData(); delete chunkData;` —— 那是内存归属
    // （readChunk 把数据的所有权交给调用方），TS 由 GC 负责。

    let changed = false;
    // 【原样保留一个"缺花括号的 if"】C++ 写的是：
    //     if (loadedStorageVersion == 1)
    //       changed |= LevelConverters::v1_ClothIdToClothData(levelChunk);
    //       changed |= LevelConverters::ReplaceUnavailableBlocks(levelChunk);
    // 不带花括号的 if 只管**第一条**语句，所以 ReplaceUnavailableBlocks **每次都跑**，
    // 跟 loadedStorageVersion 无关。缩进骗人，但这是真实行为，照抄别"修好"。
    if (this.loadedStorageVersion === 1) {
      changed = LevelConverters.v1_ClothIdToClothData(levelChunk) || changed;
    }
    changed = LevelConverters.ReplaceUnavailableBlocks(levelChunk) || changed;

    levelChunk.recalcHeightmap();
    levelChunk.unsaved = changed;
    levelChunk.terrainPopulated = true;
    levelChunk.createdFromSave = true;
    return levelChunk;
  }

  /**
   * 先试 level.dat，失败再试 level.dat_old。
   *
   * 【原样保留】C++ 里不管中途是否 break（版本读不出、长度不合法、载荷读不全），
   * 最后都 `return true` —— 只有"两个文件都打不开"才返回 false。这个"读坏了也算成功"的行为照抄，
   * 因为调用方（构造函数）拿它判断要不要把 loadedStorageVersion 设成读到的版本。
   */
  static readLevelData(directory: string, levelData: LevelData): boolean {
    let datFilename = directory + '/' + fnLevelDat;
    let file = getVfs().open(datFilename, 'rb');

    if (!file) {
      datFilename = directory + '/' + fnLevelDatOld;
      file = getVfs().open(datFilename, 'rb');
    }
    if (!file) return false;

    const versionBuf = new Int32Array(1);
    const sizeBuf = new Int32Array(1);
    // C++ 是 do { ... } while (false)，用 break 当 goto 使；TS 里用带标签的块更直白
    read: {
      if (file.read(versionBuf, 4, 1) !== 1) break read;
      if (file.read(sizeBuf, 4, 1) !== 1) break read;

      const version = versionBuf[0]!;
      const size = sizeBuf[0]!;

      const left = getRemainingFileSize(file);
      if (size > left || size <= 0) break read;

      const data = new Uint8Array(size);
      if (file.read(data, 1, size) !== size) break read;

      if (version === 1) {
        levelData.v1Read(new BitStream(data, size, false), version);
      } else if (version >= 2) {
        const bitStream = new BitStream(data, size, false);
        const tag = NbtIo.read(new RakDataInput(bitStream));
        if (tag) {
          // C++ 在这里还有 `tag->deleteChildren(); delete tag;` —— 说明 getTagData 是**拷贝**字段
          // 而不是接管这个标签对象（否则删了就是 use-after-free）。TS 由 GC 负责，不需要这两句。
          levelData.getTagData(tag);
        }
      }
    }

    file.close();
    return true;
  }

  /**
   * 读 player.dat（裸结构体转储）。布局见 PLAYER_DATA_LAYOUT。
   *
   * 【这个格式是遗留的】本版本的 savePlayer 写的是 NBT（players/<名字>.dat），**不写 player.dat**，
   * 所以这里读的是一个只读的旧格式。照原样移植。
   *
   * 【原样保留的怪癖：检查在后，写入在前】C++ 是
   *     if (fread(&dest.playerData, 1, sizeof(dest.playerData), fp) != size) break;
   * —— fread **先**把 sizeof 个字节写进结构体，**再**拿返回值去比 size。所以文件头里的 size
   * 与 sizeof 不一致时，结构体其实**已经被覆盖了**，只是跳过了下面的 clamp 和
   * playerDataVersion 赋值（版本于是停在初值 -1）。这不是"没读到"。
   * 下面的 decodePlayerData 因此必须在比较**之前**，位置换一下就与参考实现不符。
   * G14-3 的 size-mismatch / truncated 两个用例钉的就是这条。
   *
   * 【文件比 sizeof 短时】没读到的尾部按 0 处理。C++ 那边结构体没被写到的部分保持原值，
   * 而唯一的调用点（构造函数）是对着一个刚 new 出来的 LevelData 调的 —— 那些"原值"是
   * **未初始化内存**，本来就没有确定行为，不复刻（PITFALLS 第 20 条）。harness 里也是先
   * 把这个结构体清 0 再调的，两边一致。
   *
   * 【clamp 用的是这一套，不是 PlayerData.h 里的】x/z 夹到 [0.5, LEVEL_?-0.5]，y < 0 时给 64。
   * PlayerData.h 的 clampXZ/clampY/clampRot 属于 loadPlayer（那个仍是 OMIT(Player)），
   * 这个函数一个都没用。
   */
  static readPlayerData(filename: string, dest: LevelData): boolean {
    const fp = getVfs().open(filename, 'rb');
    if (!fp) return false;

    const versionBuf = new Int32Array(1);
    const sizeBuf = new Int32Array(1);
    read: {
      if (fp.read(versionBuf, 4, 1) !== 1) break read;
      if (fp.read(sizeBuf, 4, 1) !== 1) break read;

      const version = versionBuf[0]!;
      const size = sizeBuf[0]!;

      if (version === 1) {
        const buf = new Uint8Array(PLAYER_DATA_LAYOUT.sizeOf);
        const got = fp.read(buf, 1, PLAYER_DATA_LAYOUT.sizeOf);
        // 先解出来再比 —— 对应 C++ 里 fread 先写入、后比较（见函数头注释）
        decodePlayerData(buf, dest.playerData);
        if (got !== size) break read;

        const pos = dest.playerData.pos;
        if (pos.x < 0.5) pos.x = 0.5;
        if (pos.z < 0.5) pos.z = 0.5;
        if (pos.x > LevelConstants.LEVEL_WIDTH - 0.5) pos.x = LevelConstants.LEVEL_WIDTH - 0.5;
        if (pos.z > LevelConstants.LEVEL_DEPTH - 0.5) pos.z = LevelConstants.LEVEL_DEPTH - 0.5;
        if (pos.y < 0) pos.y = 64;
        dest.playerDataVersion = version;
      }
    }

    fp.close();
    return true;
  }

  /**
   * 写 level.dat。`players` 传 null 或空数组时写不带玩家数据的标签。
   *
   * 【注意】`players` 非空时会调 createTagForPlayers，而那里面的 `player->saveWithoutId(tag)`
   * 还没移植（DEFERRED(Player)）—— 也就是说走这条路写出来的 Player 标签是空的，与参考 C++ 不一致。
   * 黄金样本 G14-2 因此传 null 走 createTag()。真要用到玩家存档得等 Player 序列化移植完。
   */
  static writeLevelData(
    datFileName: string,
    levelData: LevelData,
    players: Player[] | null,
  ): boolean {
    const file = getVfs().open(datFileName, 'wb');
    if (!file) return false;

    const data = new BitStream();
    if (levelData.getStorageVersion() === 1) {
      levelData.v1Write(data);
    } else {
      const buf = new RakDataOutput(data);
      const tag =
        players && players.length > 0
          ? levelData.createTagForPlayers(players)
          : levelData.createTag();
      NbtIo.write(tag, buf);
      // C++ 在 write 之后 `tag->deleteChildren(); delete tag;`；TS 交给 GC
    }

    const version = levelData.getStorageVersion();
    const size = data.getNumberOfBytesUsed();
    file.write(new Int32Array([version]), 4, 1);
    file.write(new Int32Array([size]), 4, 1);
    file.write(data.getData(), 1, size);
    file.close();

    return true;
  }
}
