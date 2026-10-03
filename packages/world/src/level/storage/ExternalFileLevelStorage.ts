/**
 * 1:1 移植自 src/world/level/storage/ExternalFileLevelStorage.cpp/.h。
 *
 * 【B4c 只做了两个静态函数】readLevelData / writeLevelData —— level.dat 的读写。
 * 其余部分（构造、prepareLevel、saveLevelData、区块的 save/load、实体读写）在 B5 分三步做。
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
import { LevelData } from './LevelData';

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
