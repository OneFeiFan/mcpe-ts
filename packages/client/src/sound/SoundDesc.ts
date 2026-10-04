/**
 * 1:1 移植自 src/client/sound/Sound.h（`class SoundDesc`，约 40 行，整个内联在头文件里）。
 *
 * 一段**已经在内存里的**音频：16 字节小端头 + PCM16 数据。它自己不解码、不播放，
 * 只是"数据 + 描述"的容器 —— 真正的播放是平台层 `SoundSystem::playAt` 的事。
 *
 * 【照抄的四处】
 *   1. **两个构造函数语义完全不同**：
 *      - `SoundDesc(data, size, channels, width, rate)` —— 数据**不带头**，`frames` 和 `buffer` 是同一处；
 *      - `SoundDesc(data)` —— 数据**带头**，前 16 字节是小端 int32 × 4
 *        （channels / byteWidth / frameRate / numFrames），`frames = buffer + 16`。
 *      ⚠ 两个都要保留，因为 `SoundEngine::init` 用的是前者（数据编译进二进制、头要手动给），
 *        而 `.pcm` 文件里存的是后者那种带头格式。
 *   2. `numFrames = size / (channels * byteWidth)` 是 **C++ 整数除法** —— TS 里必须 `Math.trunc`，
 *      写成 `/` 会得到小数，`length()` 和切帧全错。
 *   3. `isValid()` 只看 `buffer != 0`：**默认构造出来的 desc 是"无效"的**，
 *      而且 C++ 里其余字段（`frames` / `size` / …）是**未初始化内存**。
 *      TS 只能给 0 / 空数组 —— 这是语言差异，不是"顺手初始化"，写明在注释里。
 *   4. `destroy()` 是 `const` 方法却改 `buffer`（`mutable char* buffer`）。
 *      TS 没有 const 方法，写成一个普通方法即可。
 *
 * 【`char*` → `Uint8Array`】C++ 里 `buffer` / `frames` 都是裸指针，可以直接做指针运算
 * （`frames = buffer + 16`）。TS 里用 `Uint8Array`，`+16` 就是 `subarray(16)`。
 * ⚠ `subarray` 是**共享底层内存的视图**，不是拷贝 —— 和指针语义一致，别写成 `slice`。
 */
const f = Math.fround;

/** 默认构造时 `frames` 的占位（C++ 里是未初始化指针，谁都读不到它） */
const EMPTY_FRAMES = new Uint8Array(0);

export class SoundDesc {
  /** C++ `char* frames;` —— **带头**那版是 `buffer + 16`，不带头那版就是 `buffer` 本身 */
  frames: Uint8Array;
  /** C++ `int size;` —— 帧数据的字节数（不含 16 字节头） */
  size: number;
  /** C++ `int channels;` */
  channels: number;
  /** C++ `int byteWidth;`（构造函数形参叫 `width`） */
  byteWidth: number;
  /** C++ `int frameRate;` */
  frameRate: number;
  /** C++ `int numFrames;` */
  numFrames: number;
  /** C++ `std::string name;` —— 由 `SoundRepository::add` 回写 */
  name: string;

  /** C++ `mutable char* buffer;`（private）—— `isValid()` 判的就是它 */
  private buffer: Uint8Array | null;

  /** C++ `SoundDesc() : buffer(0) {}` */
  constructor();
  /** C++ `SoundDesc(char* data, int size, int channels, int width, int rate)` —— 数据**不带**头 */
  constructor(data: Uint8Array, size: number, channels: number, width: number, rate: number);
  /** C++ `SoundDesc(char* data)` —— 数据**带** 16 字节头 */
  constructor(data: Uint8Array);
  constructor(data?: Uint8Array, size?: number, channels?: number, width?: number, rate?: number) {
    if (data === undefined) {
      // C++ 只把 buffer 置 0，其余全是未初始化内存。TS 给 0 / 空数组。
      this.buffer = null;
      this.frames = EMPTY_FRAMES;
      this.size = 0;
      this.channels = 0;
      this.byteWidth = 0;
      this.frameRate = 0;
      this.numFrames = 0;
      this.name = '';
      return;
    }

    this.buffer = data;
    this.name = '';

    if (size !== undefined) {
      // 五参数版：数据不带 16 字节头
      this.frames = data; // C++ `frames(data)`
      this.size = size;
      this.channels = channels!;
      this.byteWidth = width!;
      this.frameRate = rate!;
      // ⚠ 整数除法（C++ int / int）
      this.numFrames = Math.trunc(size / (this.channels * this.byteWidth));
      return;
    }

    // 单参数版：前 16 字节是小端 int32 × 4
    // ⚠ 用 byteOffset 而不是从 0 开始 —— 打包文件里每个 desc 都是 subarray 视图
    const head = new DataView(data.buffer, data.byteOffset, Math.min(16, data.byteLength));
    this.channels = head.getInt32(0, true);
    this.byteWidth = head.getInt32(4, true);
    this.frameRate = head.getInt32(8, true);
    this.numFrames = head.getInt32(12, true);
    this.size = this.channels * this.byteWidth * this.numFrames;
    this.frames = data.subarray(16); // C++ `frames = buffer + 16`
  }

  /** C++ `bool isValid() const { return buffer != 0; }` */
  isValid(): boolean {
    return this.buffer !== null;
  }

  /** C++ `float length() const { return ((float)numFrames) / frameRate; }` */
  length(): number {
    return f(f(this.numFrames) / this.frameRate);
  }

  /** C++ `void destroy() const` —— `delete buffer; buffer = 0;`（TS 里就是放开引用，交给 GC） */
  destroy(): void {
    if (this.isValid()) {
      // C++ 这里是 `delete buffer`（其实该写 delete[]，原样保留这个怪癖）。
      // TS 没有手动释放，把引用置空即可；`frames` 还指着那块内存（C++ 里是悬垂指针）。
      this.buffer = null;
    }
  }

  /** 只给测试和调试看：C++ 里 `buffer` 是 private */
  _bufferForTest(): Uint8Array | null {
    return this.buffer;
  }
}
