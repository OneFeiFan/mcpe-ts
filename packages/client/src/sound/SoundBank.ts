/**
 * 音源包：把 `apps/web/public/sounds/` 下那对产物的字节变成一张
 * "文件名 → SoundDesc"的表。
 *
 * 【它对应 C++ 的什么】C++ 里 `Sound.cpp` 那 101 个 `SA_*` 全局变量
 * （`SoundDesc SA_bow((char*)PCM_bow);`）—— 数据是**编译进二进制、进程启动就在内存里**的。
 * TS 没有这一步，数据要在运行时从 `sounds.bin` 取。这个类就是那批全局变量在 TS 里的替身。
 *
 * 【为什么每段都是 subarray 而不是拷贝】`SoundDesc.frames` 要和 C++ 的裸指针语义一致
 * （见 `SoundDesc.ts` 的头注释），而且 103 段加起来是 6 MB —— 切片一次就多 6 MB。
 * 整包只在内存里存一份，每段只是一个视图。
 */
import { SoundDesc } from './SoundDesc';

/** `sounds.json` 里的一条 */
export type SoundPackEntry = {
  name: string;
  offset: number;
  size: number;
  channels: number;
  byteWidth: number;
  frameRate: number;
  numFrames: number;
};

export class SoundBank {
  private readonly bin: Uint8Array;
  private readonly byName = new Map<string, SoundDesc>();
  /** 文件名 → 在包里的位置（用来做 subarray） */
  private readonly spans = new Map<string, [number, number]>();

  constructor(bin: Uint8Array, index: readonly SoundPackEntry[]) {
    this.bin = bin;
    for (const e of index) {
      this.spans.set(e.name, [e.offset, e.offset + e.size]);
    }
  }

  /** 包里有几个音频 */
  get size(): number {
    return this.spans.size;
  }

  /**
   * 按**文件名**（`.pcm` 去掉后缀，例如 `"stone1"`）取一段。
   * 第一次取的时候才建 `SoundDesc`（顺带解析那 16 字节头），之后走缓存。
   *
   * ⚠ 传的是文件名而不是游戏内名字：`step.stone` 挂的是 4 个**不同文件**
   * （`stone1`…`stone4`），拿游戏名当键会让 4 个变体共用一段数据。
   */
  desc(fileName: string): SoundDesc | null {
    const cached = this.byName.get(fileName);
    if (cached !== undefined) return cached;

    const span = this.spans.get(fileName);
    if (span === undefined) return null;

    // ⚠ subarray（共享内存的视图），不是 slice
    const bytes = this.bin.subarray(span[0], span[1]);
    const desc = new SoundDesc(bytes);
    this.byName.set(fileName, desc);
    return desc;
  }

  /** 包里有没有这个文件名 */
  has(fileName: string): boolean {
    return this.spans.has(fileName);
  }

  /** 全部文件名（排序后的，给测试和调试用） */
  names(): string[] {
    return [...this.spans.keys()].sort();
  }
}
