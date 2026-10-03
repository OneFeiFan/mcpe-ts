/**
 * 1:1 移植自 src/world/level/storage/RegionFile.h 与 RegionFile.cpp。
 *
 * 这是区块存档文件 chunks.dat 的读写：文件按 4096 字节一个「扇区」切分，头 4096 字节是
 * 32×32 个区块的索引（每项 4 字节：高 24 位是起始扇区号，低 8 位是占用的扇区数），
 * 之后每个区块占据若干连续扇区，区块数据前面 4 字节是长度。
 *
 * 三处替换：
 *  - `FILE*` → `CFile`（B1），文件系统实例从模块级注入点 `getVfs()` 取（对应 C++ 的全局 fopen）
 *  - `RakNet::BitStream` → `@mcpe/util` 的 `BitStream`（B2）
 *  - `int* offsets` / `int* emptyChunk` → `Int32Array`。**不要用普通数组**，
 *    因为 CFile.read/write 收的是 ArrayBufferView，Int32Array 能零拷贝地直接传进去。
 *
 * 【TS 没有析构函数】C++ 的 `~RegionFile` 会调 `close()`（它在 C++ 里是 private）。
 * 这里把 `close()` 公开出来，调用方在丢掉 RegionFile 之前要自己调一次。
 *
 * 【原样保留的怪癖，不要"顺手修好"】下面每处都单独标了注释：
 *  1. `sectorFree` 在 open() 里**不清空**（C++ 也没清），重复 open 会留下旧条目
 *  2. readChunk 里 `if (length <= 0) { }` 是**空块**，显然漏了 return，length 为负时会往下走
 *  3. `sectorsNeeded = size / SECTOR_BYTES + 1` 是整数除法，size 恰为 4096 倍数时多占一个扇区
 *  4. 上限判断写的是 `> 256`，但索引里只存 8 位（最大 255）
 *  5. write() 只写 size+data，**不补齐到扇区边界**，扇区尾部留着上一个区块的残留字节
 */
import { CFile, LOGW, LOGE, SEEK_END, SEEK_SET, getVfs } from '@mcpe/platform';
import { BitStream } from '@mcpe/util';

const SECTOR_BYTES = 4096;
const SECTOR_INTS = SECTOR_BYTES / 4;
const SECTOR_COLS = 32;
const REGION_DAT_NAME = 'chunks.dat';

/** 对应 C++ 文件内的 static void logAssert(int actual, int expected)：不一致只打日志，不中止 */
function logAssert(actual: number, expected: number): void {
  if (actual !== expected) {
    LOGE(`ERROR: I/O operation failed (${actual} vs ${expected})`);
  }
}

export class RegionFile {
  private file: CFile | null = null;
  private filename: string;
  private offsets: Int32Array;
  private emptyChunk: Int32Array;
  /** 对应 `std::map<int,bool> sectorFree`。只用到 find / 下标读写，从不遍历，所以不需要排序语义 */
  private sectorFree: Map<number, boolean> = new Map();

  constructor(basePath: string) {
    this.filename = basePath + '/' + REGION_DAT_NAME;
    // C++ 的 `new int[SECTOR_INTS]`：构造时不保证是 0，但 open() 会 memset；这里给 0 更安全
    this.offsets = new Int32Array(SECTOR_INTS);
    this.emptyChunk = new Int32Array(SECTOR_INTS); // C++ 构造函数里 memset 成全 0
  }

  /**
   * 对应 `~RegionFile()`。C++ 里由析构函数调 close()，TS 没有析构，调用方自己调。
   * 不调也不会崩（就是文件句柄一直开着），但会拖着内存不放。
   */
  close(): void {
    if (this.file) {
      this.file.close();
      this.file = null;
    }
  }

  open(): boolean {
    this.close();
    this.offsets.fill(0); // 对应 memset(offsets, 0, SECTOR_INTS * sizeof(int))
    // 【原样保留】C++ 不在这里清 sectorFree，重复调用 open() 会留下上一次的条目
    this.file = getVfs().open(this.filename, 'r+b');
    if (this.file) {
      logAssert(this.file.read(this.offsets, 4, SECTOR_INTS), SECTOR_INTS);
      this.sectorFree.set(0, false);
      for (let sector = 0; sector < SECTOR_INTS; sector++) {
        const offset = this.offsets[sector]!;
        if (offset) {
          const base = offset >> 8;
          const count = offset & 0xff;
          for (let i = 0; i < count; i++) {
            this.sectorFree.set(base + i, false);
          }
        }
      }
    } else {
      this.file = getVfs().open(this.filename, 'w+b');
      if (!this.file) {
        LOGE(`Failed to create chunk file ${this.filename}`);
        return false;
      }
      logAssert(this.file.write(this.offsets, 4, SECTOR_INTS), SECTOR_INTS);
      this.sectorFree.set(0, false);
    }
    return this.file !== null;
  }

  /**
   * 对应 `bool readChunk(int x, int z, RakNet::BitStream** destChunkData)`。
   * C++ 用出参 + 返回 bool；这里改成返回 BitStream | null（false → null），
   * 是项目里处理 C++ 出参的惯用做法（见 I18n.get 的重载）。
   */
  readChunk(x: number, z: number): BitStream | null {
    const offset = this.offsets[x + z * SECTOR_COLS]!;
    if (offset === 0) {
      return null;
    }
    const file = this.file!;
    const sectorNum = offset >> 8;
    file.seek(sectorNum * SECTOR_BYTES, SEEK_SET);
    // C++ 是 `int length = 0; fread(&length, sizeof(int), 1, file);`，
    // 即读进一个 int 的地址 —— 这里用一个单元素 Int32Array 拿这块地址
    const lengthBuf = new Int32Array(1);
    file.read(lengthBuf, 4, 1);
    let length = lengthBuf[0]!;
    // C++ 这里有一句 `assert(length < ((offset & 0xff) * SECTOR_BYTES));`。
    // 它只在没有 NDEBUG 的构建里生效，生效时是**直接 abort 进程**。浏览器里不该因为一个
    // 损坏的存档整个崩掉，所以这里保留成检查 + 警告，不中止。
    if (!(length < (offset & 0xff) * SECTOR_BYTES)) {
      LOGW(
        `RegionFile::readChunk 长度越界：length=${length}, 扇区容量=${(offset & 0xff) * SECTOR_BYTES}`,
      );
    }
    length -= 4; // sizeof(int)

    // 【原样保留】C++ 原文就是 `if (length <= 0) { }` —— 一个空块，显然漏了 return。
    // length <= 0 时会继续往下走、拿这个长度去分配。TS 这边行为自然对应：
    // length < 0 时 `new Uint8Array(负数)` 抛 RangeError（C++ 的 new[] 也抛 bad_alloc），
    // length == 0 时得到空数组。这条走向不要改，改了就和原版对损坏存档的反应不一致。
    const data = new Uint8Array(length);
    logAssert(file.read(data, 1, length), length);
    return new BitStream(data, length, false);
  }

  /**
   * 对应 `bool writeChunk(int x, int z, RakNet::BitStream& chunkData)`。
   * 区块大小不变且已经有扇区时原地覆写；否则重新找一段连续空闲扇区，必要时把文件加长。
   */
  writeChunk(x: number, z: number, chunkData: BitStream): boolean {
    const size = chunkData.getNumberOfBytesUsed() + 4; // sizeof(int)
    const idx = x + z * SECTOR_COLS;
    const offset = this.offsets[idx]!;
    const sectorNum = offset >> 8;
    const sectorCount = offset & 0xff;
    // 【整数除法】C++ 的 `size / SECTOR_BYTES` 对正数是截断除法。
    // 注意后面 +1：size 恰好是 4096 的倍数时会多占一个扇区（原版就这样，别改成向上取整）
    const sectorsNeeded = Math.trunc(size / SECTOR_BYTES) + 1;
    // 【原样保留】判断写的是 > 256，但索引里 count 只占 8 位（最大 255）。照抄
    if (sectorsNeeded > 256) {
      LOGE('ERROR: Chunk is too big to be saved to file');
      return false;
    }
    if (sectorNum !== 0 && sectorCount === sectorsNeeded) {
      this.write(sectorNum, chunkData);
    } else {
      // 把原来占的扇区标回空闲
      for (let i = 0; i < sectorCount; i++) {
        this.sectorFree.set(sectorNum + i, true);
      }
      let slot = 0;
      let runLength = 0;
      let extendFile = false;
      // 找一段长度 >= sectorsNeeded 的连续空闲扇区；走到 map 里没有的槽位说明到了文件末尾之外
      while (runLength < sectorsNeeded) {
        if (!this.sectorFree.has(slot + runLength)) {
          extendFile = true;
          break;
        }
        if (this.sectorFree.get(slot + runLength) === true) {
          runLength++;
        } else {
          slot = slot + runLength + 1;
          runLength = 0;
        }
      }
      if (extendFile) {
        const file = this.file!;
        file.seek(0, SEEK_END);
        for (let i = 0; i < sectorsNeeded - runLength; i++) {
          file.write(this.emptyChunk, 4, SECTOR_INTS);
          this.sectorFree.set(slot + i, true);
        }
      }
      this.offsets[idx] = (slot << 8) | sectorsNeeded;
      for (let i = 0; i < sectorsNeeded; i++) {
        this.sectorFree.set(slot + i, false);
      }
      this.write(slot, chunkData);
      // 把索引项写回文件头
      const file = this.file!;
      file.seek(idx * 4, SEEK_SET);
      // `&offsets[idx]` 的等价值：这块 Int32Array 里第 idx 项的字节视图，零拷贝
      file.write(new Uint8Array(this.offsets.buffer, idx * 4, 4), 4, 1);
    }
    return true;
  }

  /** 对应私有的 `bool write(int sector, RakNet::BitStream& chunkData)` */
  private write(sector: number, chunkData: BitStream): boolean {
    const file = this.file!;
    file.seek(sector * SECTOR_BYTES, SEEK_SET);
    const size = chunkData.getNumberOfBytesUsed() + 4;
    // 【原样保留】这里只写 size + data，**不把扇区剩余部分补齐**，
    // 所以扇区尾部留着上一个区块的残留字节。黄金样本是逐字节比对，依赖这个行为。
    logAssert(file.write(new Int32Array([size]), 4, 1), 1);
    logAssert(
      file.write(chunkData.getData(), 1, chunkData.getNumberOfBytesUsed()),
      chunkData.getNumberOfBytesUsed(),
    );
    return true;
  }
}
