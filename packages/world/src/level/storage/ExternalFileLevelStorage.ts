/**
 * 1:1 移植自 src/world/level/storage/ExternalFileLevelStorage.cpp/.h。
 *
 * 【B4 做了三个静态函数】readLevelData / writeLevelData（level.dat）与 readPlayerData（player.dat）。
 * 其余部分（构造、prepareLevel、saveLevelData、区块的 save/load、实体读写、savePlayer）在 B5 分三步做。
 * 所以这里先建出这个类，B5 再往同一个类里加成员。
 *
 * level.dat 的文件布局（两个函数一起看）：
 *     int32 version     ← 存档版本号，同时决定载荷用哪种格式
 *     int32 size        ← 载荷字节数
 *     byte[size] data   ← version==1 走 v1_write 的裸字节，version>=2 走 NBT
 *
 * 【只走 NBT 那条路是有原因的】存档版本常量 `SharedConstants::StorageVersion` 是 3，
 * 而 `writeLevelData` 只在 storageVersion == 1 时才用 v1_write。也就是说 **v1 那条分支在默认
 * 配置下是死代码** —— 但它是 C++ 里真实存在的分支，照原样留着（读的时候 version==1 仍要能读）。
 *
 * 【getRemainingFileSize 暂时放在这里】它在 C++ 里属于 FolderMethods.cpp（B6 移植）。
 * 为了不把 B6 拖到这一步前面，先作为模块内私有函数放在这里，B6 时再挪过去。
 */
import { SEEK_END, SEEK_SET, getVfs, type CFile } from '@mcpe/platform';
import { NbtIo } from '@mcpe/nbt';
import { BitStream, RakDataInput, RakDataOutput } from '@mcpe/util';
import type { Player } from '../../entity/player/Player';
import { LevelConstants } from '../LevelConstants';
import { LevelData } from './LevelData';
import type { PlayerData } from './PlayerData';

// C++ 里这四个是文件内的 const char* const，有内部链接；导出是因为 B5/B6 也要用同样的文件名
export const fnLevelDatOld = 'level.dat_old';
export const fnLevelDatNew = 'level.dat_new';
export const fnLevelDat = 'level.dat';
export const fnPlayerDat = 'player.dat';

/**
 * 对应 FolderMethods.cpp 的 `int getRemainingFileSize(FILE* fp)`：
 * 从当前位置到文件末尾还有多少字节，且**不改动当前位置**。
 * C++ 用的是 ftell → seek(END) → ftell → seek 回去（SEEK_SET，不是 SEEK_CUR）。
 */
function getRemainingFileSize(fp: CFile | null): number {
  if (!fp) return 0;
  const current = fp.tell();
  fp.seek(0, SEEK_END);
  const end = fp.tell();
  fp.seek(current, SEEK_SET);
  return end - current;
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

export class ExternalFileLevelStorage {
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
