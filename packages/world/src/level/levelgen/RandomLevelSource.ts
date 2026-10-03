/**
 * 1:1 移植自 src/world/level/levelgen/RandomLevelSource.h 与 .cpp。
 * **C-2：只到类骨架 + 构造函数 + `getHeights`。**`prepareHeights` / `buildSurfaces`（C-3）、
 * 洞穴峡谷（C-4/C-5）、`getChunk`（C-5）、`postProcess`（C-7）都还是 DEFERRED。
 *
 * 【它继承 ChunkSource，不是 LevelSource】这点容易搞错 —— `RandomLevelSource.h:32` 写的是
 * `class RandomLevelSource: public ChunkSource`。`LevelSource` 是另一个接口，只有 `Level` 和 `Region` 实现。
 *
 * 【三档规则】这一整条是"种子 → 世界"的链，属**第一档：逐位与 C++ 一致**（黄金样本 G15-1 比的是
 * float 的位模式）。所以每一步浮点运算都过 `Math.fround`，写法照 `synth/PerlinNoise.ts` 的先例。
 *
 * 【两个必须原样保留的怪癖】
 *   - `static const int CHUNK_WIDTH = 4;`（.h:39）是**死的** —— `.cpp` 里用的全是
 *     `LevelConstants::CHUNK_WIDTH`（16）。别"顺手"改成 16，也别改成 4 去用它。
 *   - `getHeights` 开头的 `float s = 1 * 684.412f;` 那个 `1 *` 是原来就有的，照抄。
 *   - 构造函数的 `version` 参数**从头到尾没被用过**（既不存也不读），签名照保留。
 *
 * 【构造函数里那句 printf】C++ 有
 *     `Random randomCopy = random; printf("random.get : %d\n", randomCopy.nextInt());`
 * 打印的是**副本**的随机数，不影响 `this->random` 的状态，所以对生成结果零影响。
 * 移植它需要给 Random 加一套"复制状态"的机制，只为了重现一行调试输出 —— 按 R3 记成 OMIT(Debug)。
 */
import { LOGI } from '@mcpe/platform';
import { Random } from '@mcpe/util';
import type { MobCategory } from '../../entity/MobCategory';
import type { Biome } from '../biome/Biome';
import { ChunkSource } from '../chunk/ChunkSource';
import type { LevelChunk } from '../chunk/LevelChunk';
import { LevelConstants } from '../LevelConstants';
import type { Level } from '../Level';
import { PerlinNoise } from './synth/PerlinNoise';

const f = Math.fround;

/** RandomLevelSource.cpp 的文件内 `static const int MAX_BUFFER_SIZE = 1024;` */
const MAX_BUFFER_SIZE = 1024;

export class RandomLevelSource extends ChunkSource {
  // 两个都是 C++ 的 `static const float`，所以要过 fround 变成 32 位真值 ——
  // 直接写 0.5 / 0.3 是 double，0.3 那个尤其不能偷懒（C-7 的 postProcess 会拿它做浮点乘）。
  static readonly SNOW_CUTOFF = f(0.5);
  static readonly SNOW_SCALE = f(0.3);
  static readonly CHUNK_HEIGHT = 8;
  /** ⚠ 死常量：`.cpp` 用的是 `LevelConstants::CHUNK_WIDTH`（16），不是这个。原样保留。 */
  static readonly CHUNK_WIDTH = 4;

  // DEFERRED(Levelgen): LargeCaveFeature caveFeature;  RandomLevelSource.h:63（C-4 移植该类时补上）
  // DEFERRED(Levelgen): CanyonFeature canyonFeature;  RandomLevelSource.h:64（C-5 移植该类时补上）

  // OMIT(Levelgen): int waterDepths[16+16][16+16];  RandomLevelSource.h:68
  //   只在构造函数里被清零（.cpp:36-38），此后再没被读过。
  // OMIT(Levelgen): float* fi; float* fis;  RandomLevelSource.h:74
  //   只在构造函数的初始化列表里置 NULL（.cpp:32）、在析构里 delete（.cpp:61-62），从没被用过。

  // ------------------------------------------------------------------ private（按 .h 的声明顺序）
  private readonly chunkMap = new Map<number, LevelChunk>(); // C++: std::map<int, LevelChunk*>，C-5 的 getChunk 用
  private readonly random: Random;
  private readonly lperlinNoise1: PerlinNoise;
  private readonly lperlinNoise2: PerlinNoise;
  private readonly perlinNoise1: PerlinNoise;
  private readonly perlinNoise2: PerlinNoise;
  private readonly perlinNoise3: PerlinNoise;
  private readonly scaleNoise: PerlinNoise;
  private readonly depthNoise: PerlinNoise;
  private readonly forestNoise: PerlinNoise;

  private readonly level: Level;
  /** 构造函数存下来，但本文件里从没读过（只有 postProcess 会看，而那是 C-7）。原样保留。 */
  private readonly spawnMobs: boolean;

  private buffer: Float32Array;
  /** C++ 是 `float sandBuffer[16 * 16]` 这样的定长数组，C-3 的 buildSurfaces 用 */
  private readonly sandBuffer = new Float32Array(16 * 16);
  private readonly gravelBuffer = new Float32Array(16 * 16);
  private readonly depthBuffer = new Float32Array(16 * 16);
  private pnr: Float32Array | null = null;
  private ar: Float32Array | null = null;
  private br: Float32Array | null = null;
  private sr: Float32Array | null = null;
  private dr: Float32Array | null = null;
  /** C++ 里注释写着 "normally unused like above, but restored this maybe might come handy"。确实没用过。 */
  private temperatures: Float32Array | null = null;

  /**
   * C++ `RandomLevelSource(Level* level, long seed, int version, bool spawnMobs)`。
   * **`version` 是没用的参数**（见文件头），保留是为了签名对得上。
   *
   * 【顺序有讲究】C++ 的初始化列表是 `random(seed)` 在最前，后面 8 个 PerlinNoise 全都吃 `&random`，
   * 所以这里也必须先建 `random` 再建噪声 —— 不能写成字段初始化器（那会先于构造函数体求值）。
   */
  constructor(level: Level, seed: number, _version: number, spawnMobs: boolean) {
    super();
    this.random = new Random(seed);
    this.level = level;
    this.lperlinNoise1 = new PerlinNoise(this.random, 16);
    this.lperlinNoise2 = new PerlinNoise(this.random, 16);
    this.perlinNoise1 = new PerlinNoise(this.random, 8);
    this.perlinNoise2 = new PerlinNoise(this.random, 4);
    this.perlinNoise3 = new PerlinNoise(this.random, 4);
    this.scaleNoise = new PerlinNoise(this.random, 10);
    this.depthNoise = new PerlinNoise(this.random, 16);
    this.forestNoise = new PerlinNoise(this.random, 8);
    this.spawnMobs = spawnMobs;
    this.buffer = new Float32Array(MAX_BUFFER_SIZE);
    // OMIT(Debug): Random randomCopy = random; printf("random.get : %d\n", randomCopy.nextInt());  RandomLevelSource.cpp:39-40
    //   （打的是副本，不影响随机流；理由见文件头）
  }

  // 析构函数不移植（R3）：C++ 的 ~RandomLevelSource 只是 delete[] 那几个 buffer，TS 交给 GC。

  hasChunk(_x: number, _y: number): boolean {
    return true;
  }

  getChunk(_x: number, _z: number): LevelChunk {
    // DEFERRED(Levelgen): 整段 getChunk（.cpp:540-567）—— C-5 里连同 prepareHeights/buildSurfaces/洞穴峡谷一起做
    throw new Error('RandomLevelSource.getChunk 尚未移植（C-5）');
  }

  create(_x: number, _z: number): LevelChunk {
    // DEFERRED(Levelgen): return getChunk(x, z);  RandomLevelSource.cpp:536-538
    throw new Error('RandomLevelSource.create 尚未移植（C-5）');
  }

  prepareHeights(
    _xOffs: number,
    _zOffs: number,
    _blocks: Uint8Array,
    _biomes: null,
    _temperatures: Float32Array,
  ): void {
    // DEFERRED(Levelgen): 整段 prepareHeights（.cpp:66-137）—— C-3
    throw new Error('RandomLevelSource.prepareHeights 尚未移植（C-3）');
  }

  buildSurfaces(_xOffs: number, _zOffs: number, _blocks: Uint8Array, _biomes: Biome[]): void {
    // DEFERRED(Levelgen): 整段 buildSurfaces（.cpp:139-218）—— C-3
    throw new Error('RandomLevelSource.buildSurfaces 尚未移植（C-3）');
  }

  postProcess(_parent: ChunkSource, _xt: number, _zt: number): void {
    // DEFERRED(LevelgenFeature): 整段 postProcess（.cpp:220-534，315 行：湖/矿/树/花草/泉）—— C-7
    throw new Error('RandomLevelSource.postProcess 尚未移植（C-7，本轮不做地物）');
  }

  tick(): boolean {
    return false;
  }

  shouldSave(): boolean {
    return true;
  }

  getMobsAt(mobCategory: MobCategory, x: number, _y: number, z: number): Biome.MobList {
    const biomeSource = this.level.getBiomeSource();
    if (biomeSource === null) {
      return [];
    }
    const biome = biomeSource.getBiome(x, z);
    if (biome === null) {
      return [];
    }
    return biome.getMobs(mobCategory);
  }

  gatherStats(): string {
    return 'RandomLevelSource';
  }

  // OMIT(Levelgen): void RandomLevelSource::calcWaterDepths(ChunkSource* parent, int xt, int zt);  RandomLevelSource.cpp:659
  //   全库只有声明和定义、没有任何调用点（自己 grep 核过）—— 死代码，按 TASK-C 的清单不移植。

  /**
   * `RandomLevelSource::getHeights`（.cpp:565-703）。
   *
   * C++ 里这个是 `private`，TS 也保持 private（黄金样本测试用一次类型断言取它，见测试文件）。
   *
   * 【逐句对齐】每一步浮点都过 `Math.fround`（第一档）。几处容易写错的：
   *   - `16 / xSize`、`wScale / 2` 是 **int / int**，要 `Math.trunc`；
   *   - `depth * ySize / 16` 里 `ySize` 是 int，但 `depth` 是 float，整体是浮点除法，不是整数除法；
   *   - `ySize / 2.0f` 同理是浮点；
   *   - `(yy - (ySize - 4)) / (4 - 1.0f)` 的分母是 `3.0f`，分子是整数相减（精确），整体浮点。
   */
  private getHeights(
    buffer: Float32Array,
    x: number,
    y: number,
    z: number,
    xSize: number,
    ySize: number,
    zSize: number,
  ): Float32Array {
    const size = xSize * ySize * zSize;
    if (size > MAX_BUFFER_SIZE) {
      LOGI(
        `RandomLevelSource::getHeights: TOO LARGE BUFFER REQUESTED: ${size} (max ${MAX_BUFFER_SIZE})`,
      );
    }

    const s = f(1 * 684.412);
    const hs = f(1 * 684.412);
    const biomeSource = this.level.getBiomeSource();
    const temperatures = biomeSource.temperatures!;
    const downfalls = biomeSource.downfalls!;

    this.sr = this.scaleNoise.getRegion(this.sr, x, z, xSize, zSize, 1.121, 1.121, 0.5);
    this.dr = this.depthNoise.getRegion(this.dr, x, z, xSize, zSize, 200.0, 200.0, 0.5);
    this.pnr = this.perlinNoise1.getRegion(
      this.pnr,
      x,
      y,
      z,
      xSize,
      ySize,
      zSize,
      f(s / 80.0),
      f(hs / 160.0),
      f(s / 80.0),
    );
    this.ar = this.lperlinNoise1.getRegion(this.ar, x, y, z, xSize, ySize, zSize, s, hs, s);
    this.br = this.lperlinNoise2.getRegion(this.br, x, y, z, xSize, ySize, zSize, s, hs, s);

    let p = 0;
    let pp = 0;

    const wScale = Math.trunc(16 / xSize);
    for (let xx = 0; xx < xSize; xx++) {
      const xp = xx * wScale + Math.trunc(wScale / 2);

      for (let zz = 0; zz < zSize; zz++) {
        const zp = zz * wScale + Math.trunc(wScale / 2);
        const temperature = temperatures[xp * 16 + zp]!;
        const downfall = f(downfalls[xp * 16 + zp]! * temperature);
        let dd = f(1 - downfall);
        dd = f(dd * dd);
        dd = f(dd * dd);
        dd = f(1 - dd);
        let scale = f((this.sr![pp]! + 256.0) / 512);
        scale = f(scale * dd);
        if (scale > 1) scale = 1;
        let depth = f(this.dr![pp]! / 8000.0);
        if (depth < 0) depth = f(-depth * 0.3);
        depth = f(f(depth * 3.0) - 2.0);
        if (depth < 0) {
          depth = f(depth / 2);
          if (depth < -1) depth = -1;
          depth = f(depth / 1.4);
          depth = f(depth / 2);
          scale = 0;
        } else {
          if (depth > 1) depth = 1;
          depth = f(depth / 8);
        }
        if (scale < 0) scale = 0;
        scale = f(scale + 0.5);
        depth = f(f(depth * ySize) / 16);
        const yCenter = f(f(ySize / 2.0) + f(depth * 4));
        pp++;

        for (let yy = 0; yy < ySize; yy++) {
          let val = 0;
          let yOffs = f(f((yy - yCenter) * 12) / scale);
          if (yOffs < 0) yOffs = f(yOffs * 4);
          const bb = f(this.ar![p]! / 512);
          const cc = f(this.br![p]! / 512);
          const v = f(f(f(this.pnr![p]! / 10) + 1) / 2);
          if (v < 0) val = bb;
          else if (v > 1) val = cc;
          else val = f(bb + f(f(cc - bb) * v));
          val = f(val - yOffs);
          if (yy > ySize - 4) {
            const slide = f((yy - (ySize - 4)) / 3.0);
            val = f(f(val * f(1 - slide)) + f(-10 * slide));
          }
          buffer[p] = val;
          p++;
        }
      }
    }
    return buffer;
  }
}

// OMIT(Levelgen): class PerformanceTestChunkSource : public ChunkSource  RandomLevelSource.h:100（.cpp:741 起）
//   和 RandomLevelSource 挤在同一个头文件里的第二个类，7 个成员函数。
//   它没有实现 getMobsAt，所以一直是个抽象类、从没被实例化过 ——
//   `.cpp` 里唯一那处 `return new PerformanceTestChunkSource(level);` 是被注释掉的。
//   （`FlatChunkSource::create` 的注释里提到过它：那个 create 的写法就是照抄它。）
//   按 TASK-C 的清单不移植。
