/**
 * 1:1 移植自 src/world/level/storage/ExternalFileLevelStorage.cpp/.h。
 *
 * 【进度】B4 做了三个静态函数：readLevelData / writeLevelData（level.dat）与 readPlayerData（player.dat）。
 * B5a 补上构造、析构、prepareLevel、saveLevelData、savePlayer/loadPlayer；
 * B5b 补上区块的 save/load、tick、savePendingUnsavedChunks、saveAll；
 * B5c 补上 saveEntities / loadEntities（实体文件）—— 至此 C++ 那个类的成员函数全部到位。
 * （`loadEntities` 依赖的 `EntityFactory::loadEntity` 同批移植，见 entity/EntityFactory.ts。）
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
import { CompoundTag, ListTag, NbtIo, TAG_Compound, TAG_List } from '@mcpe/nbt';
import { LOGE, LOGI, SEEK_END, SEEK_SET, getTimeMs, getTimeS, getVfs } from '@mcpe/platform';
import { BitStream, RakDataInput, RakDataOutput } from '@mcpe/util';
import { EntityFactory } from '../../entity/EntityFactory';
import type { Player } from '../../entity/player/Player';
import { LevelChunk } from '../chunk/LevelChunk';
import type { ChunkStorage } from '../chunk/storage/ChunkStorage';
import type { Dimension } from '../dimension/Dimension';
import type { Level } from '../Level';
import { Tile } from '../tile/Tile';
import { TileEntity } from '../tile/entity/TileEntity';
import { LevelConstants } from '../LevelConstants';
import { createFolderIfNotExists, getRemainingFileSize } from './FolderMethods';
import { LevelData } from './LevelData';
import { LevelStorage } from './LevelStorage';
import type { PlayerData } from './PlayerData';
import { RegionFile } from './RegionFile';

/**
 * C++ 里这是文件内的 `static const int ChunkVersion_Light = 1;`。
 * 它跟 level.dat 的 storageVersion 是**两个不同的东西**，但 load 里拿后者当版本号用了 —— 照抄。
 * （ChunkVersion_Entity = 2 见下面那条注释 —— 它其实是死的。）
 */
const ChunkVersion_Light = 1;

// C++ 里 ChunkVersion_Entity = 2 也在这里声明（`.cpp:22`），但**从头到尾只出现在一行被注释掉的
// 代码里**（`.cpp:469` 的 `//if (loadedStorageVersion >= ChunkVersion_Entity) {`）。
// 照原样不建这个常量，只留这条注释 —— 任务单原文说它"到 B5c 才用到"，那是错的。

/**
 * C++ 的 `fwrite("ENT\0", 1, 4, fp)`。
 *
 * 【字面量是 5 字节，只写 4 个】C 的 `"ENT\0"` 在内存里是 `E N T \0 \0`（末尾还有一个编译器
 * 补的结束符），fwrite 的第三个参数把写入截到 4 字节，所以文件里就是 `45 4E 54 00`。
 *
 * TS 没有"字符串即字节数组"这回事，只能显式写出这 4 个字节。
 */
const ENT_FILE_MAGIC = new Uint8Array([0x45, 0x4e, 0x54, 0x00]);

/**
 * 把一段字节按 C 的 `%s` 读法变成字符串：一直读到第一个 0，或者读完整段。
 *
 * `loadEntities` 里那个 `char header[5]` 只填了 4 个字节，第 5 个从没写过 —— C++ 拿它喂 `%s`
 * 是在读越界内存，只是恰好被 magic 自带的那个 '\0'（第 4 个字节）截住，所以打印出来是 "ENT"。
 * 这里按"读到 NUL 为止"还原那个恰好。
 */
function decodeCString(bytes: Uint8Array): string {
  let end = 0;
  while (end < bytes.length && bytes[end] !== 0) end++;
  let s = '';
  for (let i = 0; i < end; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

/**
 * C++ 的 `UnsavedLevelChunk`（ExternalFileLevelStorage.h 里那个 struct）：
 * 一个"等着被存下去"的区块。`pos` 是它在区块缓存里的扁平下标。
 */
interface UnsavedLevelChunk {
  pos: number;
  /** 进列表的时间（`RakNet::TimeMS` → `getTimeMs()`）；挑"最老的"就是按它比 */
  addedToList: number;
  chunk: LevelChunk;
}

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

export class ExternalFileLevelStorage extends LevelStorage implements ChunkStorage {
  private levelId: string;
  private levelPath: string;
  /** C++ 是 LevelData* 且可能为 NULL（两个文件都读不出来时就 delete 掉了），所以这里要能是 null */
  private loadedLevelData: LevelData | null;
  // regionFile 只有区块读写会用到，这里按 C++ 的初始化列表演成 null
  private regionFile: RegionFile | null = null;
  /**
   * C++ 头文件里有这个字段（`RegionFile* entitiesFile;`），构造函数也把它初始化成 NULL ——
   * 但**它从没被任何一个函数用过**：实体文件走的是裸 `fopen`，不是 RegionFile。
   * 留着是为了跟 C++ 的字段表一致，也免得以后有人以为漏了。真要用它反而是错的。
   */
  private entitiesFile: RegionFile | null = null;
  private level: Level | null = null;
  private tickCount = 0;
  private loadedStorageVersion: number;
  /**
   * C++ 的 `std::list<UnsavedLevelChunk> unsavedChunkList`：等着一批批存下去的区块。
   * 用数组代替 —— 这里只需要"追加""按下标删""从头扫"，list 的迭代器稳定性用不上。
   */
  private unsavedChunkList: UnsavedLevelChunk[] = [];
  /**
   * C++ 的 `lastSavedEntitiesTick(-999999)`。**只有 saveEntities 会写它**（开头那句
   * `lastSavedEntitiesTick = tickCount;`）—— 也就是说 tick 里那个"每 60 秒存一次实体"的
   * 判断，节拍是由"上一次真的存了"来重置的，不是由判断本身。
   */
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
   * （C++ 的析构里没有 entitiesFile —— 它从没被 new 过，理由见上面那个字段的注释。）
   */

  prepareLevel(_level: Level): LevelData | null {
    this.level = _level;
    return this.loadedLevelData;
  }

  /**
   * C++ 的 `ChunkStorage* createChunkStorage(Dimension*) { return this; }` —— 返回自己。
   *
   * C++ 里这个类同时继承 LevelStorage 和 ChunkStorage；TS 只能单继承，ChunkStorage 那一半用 implements 表达（审核 S5）。ChunkStorage 那一半共六个方法：load / save / tick /
   * flush（B5b-1、B5b-2）、saveAll（B5b-2，见那里的注释）、saveEntities（B5c-1），**现在齐了**。
   * 这个类要到 B7 才接进 Minecraft，在那之前没人会调它。
   */
  createChunkStorage(_dimension: Dimension): ChunkStorage {
    return this;
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
   * 于是下次调用会**再试一遍**。全类只有 save / load 两处这么做 —— 剩下的读写都各开各的文件
   * （saveEntities/loadEntities 直接 fopen entities.dat，不走 regionFile）。
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
   * 把 level 里的实体与方块实体全存进 entities.dat。
   *
   * 【这不是 RegionFile，是平文件】任务单原文写的"RegionFile 的第二个实例"是错的 ——
   * `entitiesFile` 这个 `RegionFile*` 字段在 C++ 里**声明了却从没被用过**（全文件只有
   * `ExternalFileLevelStorage.h:90` 的声明与 `.cpp:86` 的 `entitiesFile(NULL)`），
   * 这个函数走的是裸 `fopen`。文件布局：
   *
   *     "ENT\0"    4 字节（C 的字面量其实是 5 字节，"ENT\0" 后面那个隐含的 '\0' 会被丢掉）
   *     int32      version  ← 写死 1；读的时候只拿去打日志，从没参与判断
   *     int32      numBytes ← 后面 NBT 的字节数
   *     byte[]     NbtIo::write 的产物
   *
   * 【两个 int 是小端】它们走的是 `fwrite(&version, sizeof(int), 1, fp)` —— 直接倒内存，
   * 不经过 BitStream 那套端序交换。VFS 的 CFile.write 正好也是原样落字节，所以喂 Int32Array 就对。
   *
   * 【实体与方块实体各自成一张表】`Entities` 与 `TileEntities` 是两个平级的 ListTag，
   * 不嵌套、不分组。`count` 是两者**加起来**的条数（只影响日志）。
   *
   * 【两个数组的过滤条件不一样】实体是"`save` 返回 false 就丢掉"，方块实体在 save 之前
   * **多一道 `shouldSave()`**（false 直接 continue，连标签都不建）。
   *
   * 【玩家永远不会进这个文件】`Entity::save` 开头是 `if (removed || id == 0) return false;`，
   * 而 `Player::getEntityTypeId()` 返回的就是 **0** —— 所以 level->entities 里的玩家每次都被
   * 这一条挡掉。这不是漏了：玩家有单独的一条路（`players/<名字>.dat`，走 savePlayer）。
   *
   * 【`levelChunk` 参数从来没被读过】C++ 的签名里有它（为了跟 `save` 对齐、满足 ChunkStorage 的接口），
   * 函数体里一次都没用到 —— 传进来的总是 NULL。照抄。
   */
  saveEntities(level: Level, _levelChunk: LevelChunk | null): void {
    this.lastSavedEntitiesTick = this.tickCount;
    let count = 0;
    const st = getTimeS();

    const entities = level.entities;
    const entityTags = new ListTag();
    for (let i = 0; i < entities.length; ++i) {
      const e = entities[i]!;
      const tag = new CompoundTag();
      if (e.save(tag)) {
        count++;
        entityTags.add(tag);
      }
      // C++ 这里是 `else delete tag;`（save 失败就把标签删掉，不进列表）—— TS 交给 GC
    }

    const tileEntities = level.tileEntities;
    const tileEntityTags = new ListTag();
    for (let i = 0; i < tileEntities.length; ++i) {
      const e = tileEntities[i]!;
      if (!e.shouldSave()) continue;
      const tag = new CompoundTag();
      if (e.save(tag)) {
        count++;
        tileEntityTags.add(tag);
      }
    }

    const base = new CompoundTag();
    base.put('Entities', entityTags);
    base.put('TileEntities', tileEntityTags);
    const stream = new BitStream();
    const dos = new RakDataOutput(stream);
    NbtIo.write(base, dos);
    const numBytes = stream.getNumberOfBytesUsed();

    // C++ 把 "entities.dat" 直接写在字符串里，没有独立常量（对应 fnLevelDat 那些）
    const fp = getVfs().open(this.levelPath + '/entities.dat', 'wb');
    if (fp) {
      const version = 1;
      fp.write(ENT_FILE_MAGIC, 1, 4);
      fp.write(new Int32Array([version]), 4, 1);
      fp.write(new Int32Array([numBytes]), 4, 1);
      fp.write(stream.getData(), 1, numBytes);
      fp.close();
    }
    // C++ 在这里 `base.deleteChildren();`（标签树的对象归 NbtIo::write 用完后由谁删，C++ 得手动来）
    // —— TS 交给 GC。写文件那一段用的是已经序列化好的 stream，与这棵树再无关系。

    const tt = getTimeS() - st;
    // C++ 是 %d / %f / %d。%f 按仓库既有约定用 toFixed(6)（见 platform/src/time.ts）
    LOGI(`Time to save ${count} entities: ${tt.toFixed(6)} s. Size: ${numBytes} bytes\n`);
  }

  /**
   * 从 entities.dat 读回实体与方块实体。文件格式见 saveEntities。
   *
   * 【哪些情况什么都不读】整段读取被 `if (numBytes <= left && numBytes > 0)` 包着：
   * 文件只有头（left == 0）、或者头里写的长度比实际剩下的还多（被截断），都直接跳过载荷。
   * 头本身读失败时**完全不看返回值**（见下面那条注释）。
   *
   * 【两条路回填的方式不一样】
   *   - 实体：造出来 → `level.addEntity(e)`，交给 Level 的常规入列逻辑。
   *   - 方块实体：造出来 → 找到它坐标所在的区块 → 那个位置**还没有**方块实体才 `chunk.addTileEntity(e)`，
   *     否则直接丢掉（并且分两种日志：区块找不到 / 位置被占）。
   *
   * 【原样保留：这里不检查 NbtIo::read 的返回值】同一个文件里的 readLevelData 和 loadPlayer
   * **都**写了 `if (tag)`，偏偏 loadEntities 没写 —— 参考源码自己的不一致。留着照抄：
   * 标签读不出来时 C++ 会段错误，TS 会抛 TypeError，都是崩。这里写成 `tag!` 就是那个"不检查"。
   */
  override loadEntities(level: Level, _chunk: LevelChunk | null): void {
    this.lastSavedEntitiesTick = this.tickCount;
    const fp = getVfs().open(this.levelPath + '/entities.dat', 'rb');
    if (fp) {
      // C++ 是 `char header[5]`，只读 4 个字节，第 5 个从没写过 —— 所以它**不是**以 NUL 结尾的，
      // 最后那句 LOGI("%s") 其实在读越界内存。实际能读到的就是 "ENT"，因为第 4 个字节
      // （magic 里那个 '\0'）正好把它截住。这里按"读到第一个 0 为止"还原那 4 个字节。
      const headerBytes = new Uint8Array(4);
      const versionBuf = new Int32Array(1);
      const numBytesBuf = new Int32Array(1);

      // 【三个 fread 的返回值全被忽略】文件短于 12 字节时 C++ 的 version/numBytes 是**未初始化的
      // 栈内存**（UB），TS 复刻不了，只能先用 0 —— 好在下面那道 `numBytes > 0` 会兜住，
      // 表现是"什么都不读"，也就是 C++ 在多数情况下碰巧的表现。
      fp.read(headerBytes, 1, 4);
      fp.read(versionBuf, 4, 1);
      fp.read(numBytesBuf, 4, 1);

      const version = versionBuf[0]!;
      const numBytes = numBytesBuf[0]!;
      const left = getRemainingFileSize(fp);

      if (numBytes <= left && numBytes > 0) {
        const buf = new Uint8Array(numBytes);
        fp.read(buf, 1, numBytes);
        const stream = new BitStream(buf, numBytes, false);
        const tag = NbtIo.read(new RakDataInput(stream))!; // 见函数头：不检查 null，照抄

        if (tag.contains('Entities', TAG_List)) {
          const entityTags = tag.getList('Entities');
          for (let i = 0; i < entityTags.size(); ++i) {
            const _et = entityTags.get(i);
            if (!_et || _et.getId() !== TAG_Compound) {
              // C++ 是 `LOGE(..., _et, _et?_et->getId() : -1)` —— 第一个参数是 %p 指针，
              // JS 没有指针，只保留后一半（元素类型或 -1）
              LOGE(`Entity tag is either NULL or not a compoundTag: ${_et ? _et.getId() : -1}!\n`);
              continue;
            }
            const e = EntityFactory.loadEntity(_et as CompoundTag, level);
            if (e) level.addEntity(e);
          }
        }

        if (tag.contains('TileEntities', TAG_List)) {
          const tileEntityTags = tag.getList('TileEntities');
          for (let i = 0; i < tileEntityTags.size(); ++i) {
            const _et = tileEntityTags.get(i);
            if (!_et || _et.getId() !== TAG_Compound) {
              LOGE(
                `TileEntity tag is either NULL or not a compoundTag: ${_et ? _et.getId() : -1}!\n`,
              );
              continue;
            }
            const e = TileEntity.loadStatic(_et as CompoundTag);
            if (e) {
              // 【这个判断永远为真】C++ 的 getChunkAt 走 ChunkCache::getChunk，区块不在就当场生成
              // 一个出来，所以它不会返回 NULL —— "Couldn't find chunk" 那条是死代码。照抄。
              // TS 的返回类型不带 null，这里显式放宽只是为了让下面两个分支都写得出来。
              const chunk: LevelChunk | null = level.getChunkAt(e.x, e.z);
              if (chunk && !chunk.hasTileEntityAt(e)) {
                LOGI(`Adding TileEntity ${e.type} to ${e.x}, ${e.y}, ${e.z}\n`);
                chunk.addTileEntity(e);
              } else {
                // C++ 这里是 `delete e;` —— 这个方块实体没人要，TS 交给 GC
                if (!chunk) LOGE(`Couldn't find chunk at ${e.x}, ${e.z} to add ${e.type}\n`);
                else LOGE(`Already have TileEntity at ${e.x}, ${e.z} to add ${e.type}\n`);
              }
            }
          }
        }
        // C++ 之后是 `tag->deleteChildren(); delete tag; delete[] buf;` —— 内存归属，TS 交给 GC
      }

      const header = decodeCString(headerBytes);
      LOGI(`header: ${header}, version: ${version}, bytes: ${numBytes} (remaining: ${left})\n`);
      fp.close();
    }
  }

  /**
   * 每 tick 调一次，做两件节奏不同的事：
   *   1. **每 1000 tick**（且已经 prepareLevel 过）：把区块缓存 16×16 扫一遍，凡是标了
   *      `unsaved` 的收进"待保存列表"并把标记清掉；然后挑最老的存两个。
   *   2. **距上次存实体超过 60 秒**（`60 * TicksPerSecond` = 1200 tick）：存实体。
   *
   * 【`savePendingUnsavedChunks(2)` 在 if 里面】只有每 1000 tick 那一拍会顺带存两个区块，
   * 平时一个都不存。照抄。
   *
   * 【已经在列表里的会"重新排队"】扫到同一个 pos 时是**更新时间戳**而不是再 push 一条，
   * 所以一个区块在列表里最多出现一次。
   */
  tick(): void {
    this.tickCount++;
    if (this.tickCount % 1000 === 0 && this.level) {
      LOGI('Saving level...\n');
      for (let z = 0; z < LevelConstants.CHUNK_CACHE_WIDTH; z++) {
        for (let x = 0; x < LevelConstants.CHUNK_CACHE_WIDTH; x++) {
          const chunk = this.level.getChunk(x, z);
          if (chunk && chunk.unsaved) {
            const pos = x + z * LevelConstants.CHUNK_CACHE_WIDTH;
            let found = false;
            for (const prev of this.unsavedChunkList) {
              if (prev.pos === pos) {
                prev.addedToList = getTimeMs();
                found = true;
                break;
              }
            }
            if (!found) {
              this.unsavedChunkList.push({ pos, addedToList: getTimeMs(), chunk });
            }
            chunk.unsaved = false;
          }
        }
      }
      this.savePendingUnsavedChunks(2);
    }
    // 【在 if (… && level) 外面】C++ 这一句不在上面那个"每 1000 tick"的块里，也没做空判断 ——
    // level 为 NULL 时它会直接解引用。实际路径上 tick 只在 prepareLevel 之后调用，所以从没炸过。
    // 照抄：`this.level!` 就是那个不检查的写法。
    if (this.tickCount - this.lastSavedEntitiesTick > 60 * SharedConstants.TicksPerSecond) {
      this.saveEntities(this.level!, null);
    }
  }

  /**
   * 从"待保存列表"里挑最老的几个存下去。**返回的是"存的个数 + 1"**。
   *
   * 【返回值多一个，原样保留】原文是 `while (++count <= maxCount && !list.empty())` ——
   * 先自增再判断，所以存满 maxCount 个之后 count 要到 maxCount + 1 才退出；列表提前空掉时
   * 也是"存的个数 + 1"。`saveAll` 拿它打日志，于是那句 "Saving %d additional chunks."
   * 报的数字总是比实际多一个。照抄，别"修好"。
   *
   * 【maxCount < 0 表示不限】saveAll 就是传 -1。
   */
  savePendingUnsavedChunks(maxCount: number): number {
    if (maxCount < 0) maxCount = this.unsavedChunkList.length;
    let count = 0;
    while (++count <= maxCount && this.unsavedChunkList.length > 0) {
      let removeIdx = 0;
      let oldest = this.unsavedChunkList[0]!;
      for (let i = 0; i < this.unsavedChunkList.length; i++) {
        const e = this.unsavedChunkList[i]!;
        // 严格小于：时间戳一样时保持先碰到的那个，与 C++ 的 `<` 一致
        if (e.addedToList < oldest.addedToList) {
          oldest = e;
          removeIdx = i;
        }
      }
      const chunk = oldest.chunk;
      this.unsavedChunkList.splice(removeIdx, 1);
      // save 根本不用 level 这个参数（C++ 那边传的也是成员 level，函数体里没读过它）
      this.save(this.level!, chunk);
    }
    return count;
  }

  /**
   * C++ 的 `ChunkStorage::saveAll` 那一半，加一句"再清空待保存列表"。
   *
   * 【为什么把基类那两行抄过来】C++ 里这个类同时继承 LevelStorage 与 ChunkStorage，
   * `ChunkStorage::saveAll(level, levelChunks)` 是显式限定调用的。TS 只能单继承
   * （这里继承的是 LevelStorage），所以照抄基类那两行 —— 它本来就是个两行的循环。
   * 也正因为 saveAll 在 TS 的 LevelStorage 上并不存在，这里不能写 `override`。
   */
  saveAll(level: Level, levelChunks: LevelChunk[]): void {
    for (let i = 0; i < levelChunks.length; ++i) this.save(level, levelChunks[i]!);
    const numChunks = this.savePendingUnsavedChunks(-1);
    LOGI(`Saving ${numChunks} additional chunks.\n`);
  }

  /** C++ 的 `saveGame` 只有一句：`saveEntities(level, NULL);` */
  override saveGame(level: Level): void {
    this.saveEntities(level, null);
  }

  /** C++ 的空实现：`virtual void flush() {}` */
  flush(): void {}

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
   * PlayerData.h 的 clampXZ/clampY/clampRot 属于 PlayerData.loadPlayer（2026-10-07 已移植），
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
   * `players` 非空时调 createTagForPlayers，里面用 `player->saveWithoutId(tag)` 写出完整的 Player 标签
   * （读回见 Level.loadPlayer，tests/unit/world/player-restore.test.ts）。黄金样本 G14-2 传 null 走 createTag()，那是当时的做法，保留。
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
