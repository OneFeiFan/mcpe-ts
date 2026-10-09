/**
 * 1:1 移植自 src/world/level/levelgen/RandomLevelSource.h 与 .cpp。
 * **C-5 起地形全部就位**：构造函数 + `getHeights` + `prepareHeights` + `buildSurfaces` +
 * 洞穴峡谷（走 `caveFeature`/`canyonFeature`）+ `getChunk`/`create`。
 * **只差 `postProcess`**（整段地物：湖/矿/树/花草/泉/雪，315 行）—— 现在是空实现，C-7 结账。
 *
 * 【⚠ 浮点字面量必须过 `f`】这是本文件里最容易写错、而且**测不出来**的一类：
 * C++ 的 `0.2f` 是 float，TS 直接写 `0.2` 是 double —— 两者差约**半个 float ULP**，
 * 所以 `f(r * 0.2)` 与 C++ 的 `r * 0.2f` 在约两成输入上差 1 位。正确写法是 `f(r * f(0.2))`。
 * 注意区分：**两个已经是 float 的值**之间的 +−×÷，在 double 里算完再 fround，
 * 与 C++ 的单步 float 运算是逐位相同的（double 的 53 位够用，二次舍入无害）；
 * 出问题的只有十进制字面量本身。本文件里需要包的就这几处：`0.2`（buildSurfaces 两处）、
 * `0.3`、`1.4`（getHeights 两处）、`0.15`、`109.0134`、`684.412` —— 其余（0.25、1.121、2 的幂等）
 * 要么二进制精确、要么已经被 `getRegion` 内部 fround 掉了。
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
 * 2026-10-09 审核：为了让日志与原版逐行一致，给 Random 加了 copy()（C++ 的隐式拷贝构造），这行输出照原样打出来。
 */
import { LOGI } from '@mcpe/platform';
import { Random } from '@mcpe/util';
import type { MobCategory } from '../../entity/MobCategory';
import type { Biome } from '../biome/Biome';
import { ChunkSource } from '../chunk/ChunkSource';
import { ChunkPos } from '../ChunkPos';
import { LevelChunk } from '../chunk/LevelChunk';
import { LevelConstants } from '../LevelConstants';
import type { Level } from '../Level';
import { Tile } from '../tile/Tile';
import { CanyonFeature } from './CanyonFeature';
import { LargeCaveFeature } from './LargeCaveFeature';
import { TallGrass } from '../tile/TallGrass';
import { Material } from '../material/Material';
import { Biome as BiomeClass } from '../biome/Biome';
import { LakeFeature } from './feature/LakeFeature';
import { ClayFeature } from './feature/ClayFeature';
import { OreFeature } from './feature/OreFeature';
import { FlowerFeature } from './feature/FlowerFeature';
import { TallgrassFeature } from './feature/TallgrassFeature';
import { ReedsFeature } from './feature/ReedsFeature';
import { CactusFeature } from './feature/CactusFeature';
import { SpringFeature } from './feature/SpringFeature';
import { MobSpawnerHooks } from '../MobSpawnerHooks';
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

  /**
   * C++ 里这个成员声明在 `private:` 段**之前**，所以它比 `random`/`chunkMap` 先构造。
   * 这边顺序无所谓（它不依赖别的成员），但用字段初始化器正好也是先于构造函数体。
   */
  readonly caveFeature = new LargeCaveFeature();
  /** 与 `caveFeature` 同理，声明在 `private:` 段之前 */
  readonly canyonFeature = new CanyonFeature();

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
    // C++：Random randomCopy = random; printf("random.get : %d\n", randomCopy.nextInt());（打的是副本，不影响随机流）
    LOGI(`random.get : ${this.random.copy().nextInt()}\n`);
  }

  // 析构函数不移植（R3）：C++ 的 ~RandomLevelSource 只是 delete[] 那几个 buffer，TS 交给 GC。

  hasChunk(_x: number, _y: number): boolean {
    return true;
  }

  /**
   * `RandomLevelSource::getChunk`（.cpp:540-567）—— 把一个区块从零生成出来，五步串起来：
   * 高度场 → 插值成方块 → 铺表层 → 挖洞穴 → 挖峡谷。结果按坐标缓存进 `chunkMap`。
   *
   * 【顺序不能动】`setSeed` 必须在最前（`buildSurfaces` 与洞穴/峡谷都吃这条随机流）；
   * `getBiomeBlock` 必须排在读 `temperatures` 之前。
   * 黄金样本 G15-1 的五段快照就是照着这个方法拆的。
   */
  getChunk(xOffs: number, zOffs: number): LevelChunk {
    const hashedPos = ChunkPos.hashCode(xOffs, zOffs);

    const cached = this.chunkMap.get(hashedPos);
    if (cached !== undefined) return cached;

    this.random.setSeed(xOffs * 341872712 + zOffs * 132899541);

    const blocks = new Uint8Array(LevelChunk.ChunkBlockCount);
    const levelChunk = new LevelChunk(this.level, blocks, xOffs, zOffs);
    this.chunkMap.set(hashedPos, levelChunk);

    const biomeSource = this.level.getBiomeSource();
    const biomes = biomeSource.getBiomeBlock(xOffs * 16, zOffs * 16, 16, 16);
    const temperatures = biomeSource.temperatures!;
    this.prepareHeights(xOffs, zOffs, blocks, null, temperatures);
    this.buildSurfaces(xOffs, zOffs, blocks, biomes);

    // Carve caves into the chunk
    this.caveFeature.apply(this, this.level, xOffs, zOffs, blocks, LevelChunk.ChunkBlockCount);
    this.canyonFeature.apply(this, this.level, xOffs, zOffs, blocks, LevelChunk.ChunkBlockCount);
    levelChunk.recalcHeightmap();

    return levelChunk;
  }

  create(x: number, z: number): LevelChunk {
    return this.getChunk(x, z);
  }

  /**
   * `RandomLevelSource::prepareHeights`（.cpp:66-137）：把高度场三线性插值成方块，
   * 水下填水/冰、地上填石头。
   *
   * 【逐句对齐的两处】`xc/zc` 只到 `xChunks`（= 1），所以外层看着只有一趟、实际是靠 xc/zc 的
   * `<< 11` / `<< 7` 错开来铺满整个区块，别"顺手"改成 16 重循环。
   * `s0..s3` 在 y 循环末尾累加、`_s0/_s1` 在 x 循环末尾累加 —— 累加位置写错整片地形就斜了。
   *
   * `biomes` 参数在 C++ 里就没用过（getChunk 传的是 0），照原样收下不用。
   */
  prepareHeights(
    xOffs: number,
    zOffs: number,
    blocks: Uint8Array,
    _biomes: null,
    temperatures: Float32Array,
  ): void {
    const xChunks = Math.trunc(16 / LevelConstants.CHUNK_WIDTH);
    // C++ 的 `Level::DEPTH - 64`；Level.DEPTH 就是 LevelConstants.LEVEL_HEIGHT（128）
    const waterHeight = LevelConstants.LEVEL_HEIGHT - 64;

    const xSize = xChunks + 1;
    const ySize = Math.trunc(128 / RandomLevelSource.CHUNK_HEIGHT) + 1;
    const zSize = xChunks + 1;
    this.buffer = this.getHeights(
      this.buffer,
      xOffs * xChunks,
      0,
      zOffs * xChunks,
      xSize,
      ySize,
      zSize,
    );

    for (let xc = 0; xc < xChunks; xc++) {
      for (let zc = 0; zc < xChunks; zc++) {
        for (let yc = 0; yc < Math.trunc(128 / RandomLevelSource.CHUNK_HEIGHT); yc++) {
          const yStep = f(1 / RandomLevelSource.CHUNK_HEIGHT);
          const buf = this.buffer;
          let s0 = buf[((xc + 0) * zSize + (zc + 0)) * ySize + (yc + 0)]!;
          let s1 = buf[((xc + 0) * zSize + (zc + 1)) * ySize + (yc + 0)]!;
          let s2 = buf[((xc + 1) * zSize + (zc + 0)) * ySize + (yc + 0)]!;
          let s3 = buf[((xc + 1) * zSize + (zc + 1)) * ySize + (yc + 0)]!;

          let s0a = f((buf[((xc + 0) * zSize + (zc + 0)) * ySize + (yc + 1)]! - s0) * yStep);
          let s1a = f((buf[((xc + 0) * zSize + (zc + 1)) * ySize + (yc + 1)]! - s1) * yStep);
          let s2a = f((buf[((xc + 1) * zSize + (zc + 0)) * ySize + (yc + 1)]! - s2) * yStep);
          let s3a = f((buf[((xc + 1) * zSize + (zc + 1)) * ySize + (yc + 1)]! - s3) * yStep);

          for (let y = 0; y < RandomLevelSource.CHUNK_HEIGHT; y++) {
            const xStep = f(1 / LevelConstants.CHUNK_WIDTH);

            let _s0 = s0;
            let _s1 = s1;
            let _s0a = f((s2 - s0) * xStep);
            let _s1a = f((s3 - s1) * xStep);

            for (let x = 0; x < LevelConstants.CHUNK_WIDTH; x++) {
              let offs =
                ((x + xc * LevelConstants.CHUNK_WIDTH) << 11) |
                ((0 + zc * LevelConstants.CHUNK_WIDTH) << 7) |
                (yc * RandomLevelSource.CHUNK_HEIGHT + y);
              const step = 1 << 7;
              const zStep = f(1 / LevelConstants.CHUNK_WIDTH);

              let val = _s0;
              let vala = f((_s1 - _s0) * zStep);
              for (let z = 0; z < LevelConstants.CHUNK_WIDTH; z++) {
                const temp =
                  temperatures[
                    (xc * LevelConstants.CHUNK_WIDTH + x) * 16 +
                      (zc * LevelConstants.CHUNK_WIDTH + z)
                  ]!;
                let tileId = 0;
                if (yc * RandomLevelSource.CHUNK_HEIGHT + y < waterHeight) {
                  if (
                    temp < RandomLevelSource.SNOW_CUTOFF &&
                    yc * RandomLevelSource.CHUNK_HEIGHT + y >= waterHeight - 1
                  ) {
                    tileId = Tile.ice.id;
                  } else {
                    tileId = Tile.calmWater.id;
                  }
                }
                if (val > 0) {
                  tileId = Tile.rock.id;
                } else {
                  // C++ 这里是空 else，照原样留着
                }

                blocks[offs] = tileId & 0xff;
                offs += step;
                val = f(val + vala);
              }
              _s0 = f(_s0 + _s0a);
              _s1 = f(_s1 + _s1a);
            }
            s0 = f(s0 + s0a);
            s1 = f(s1 + s1a);
            s2 = f(s2 + s2a);
            s3 = f(s3 + s3a);
          }
        }
      }
    }
  }

  /**
   * `RandomLevelSource::buildSurfaces`（.cpp:139-218）：在石头顶上铺草/沙/沙岩/砾石，
   * 水面补冰，最底下 `random.nextInt(5)` 层做基岩。
   *
   * 【这一步大量消耗 random，而且调用点藏在循环里】`if (y <= 0 + random.nextInt(5))` 在
   * **每一层 y 都会调一次**（每列 128 次、每区块 32768 次），`sand`/`gravel`/`runDepth` 各一次。
   * 顺序或次数差一点，后面 C-4/C-5 的洞穴随机流就全错位。
   *
   * 【`temp` 是写死的 1】C++ 那句 `float temp = 1; // @todo: read temp from BiomeSource` ——
   * 原作者自己留的 TODO，照原样，别去读真实的温度。
   */
  buildSurfaces(xOffs: number, zOffs: number, blocks: Uint8Array, biomes: (Biome | null)[]): void {
    const waterHeight = LevelConstants.LEVEL_HEIGHT - 64;
    const s = f(1 / 32.0);
    this.perlinNoise2.getRegion(this.sandBuffer, xOffs * 16, zOffs * 16, 0, 16, 16, 1, s, s, 1);
    this.perlinNoise2.getRegion(
      this.gravelBuffer,
      xOffs * 16,
      f(109.0134),
      zOffs * 16,
      16,
      1,
      16,
      s,
      1,
      s,
    );
    this.perlinNoise3.getRegion(
      this.depthBuffer,
      xOffs * 16,
      zOffs * 16,
      0,
      16,
      16,
      1,
      f(s * 2),
      f(s * 2),
      f(s * 2),
    );

    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const temp = 1; // @todo: read temp from BiomeSource
        const b = biomes[x + z * 16]!;
        const sand = f(this.sandBuffer[x + z * 16]! + f(this.random.nextFloat() * f(0.2))) > 0;
        const gravel = f(this.gravelBuffer[x + z * 16]! + f(this.random.nextFloat() * f(0.2))) > 3;
        let runDepth = Math.trunc(
          f(f(f(this.depthBuffer[x + z * 16]! / 3) + 3) + f(this.random.nextFloat() * 0.25)),
        );
        let run = -1;
        let top = b.topMaterial;
        let material = b.material;
        for (let y = 127; y >= 0; y--) {
          const offs = (z * 16 + x) * 128 + y;
          if (y <= 0 + this.random.nextInt(5)) {
            blocks[offs] = ((Tile.unbreakable.id << 24) >> 24) & 0xff;
          } else {
            const old = blocks[offs]!;
            if (old === 0) {
              run = -1;
            } else if (old === Tile.rock.id) {
              if (run === -1) {
                if (runDepth <= 0) {
                  top = 0;
                  material = (Tile.rock.id << 24) >> 24;
                } else if (y >= waterHeight - 4 && y <= waterHeight + 1) {
                  top = b.topMaterial;
                  material = b.material;
                  if (gravel) {
                    top = 0;
                    material = (Tile.gravel.id << 24) >> 24;
                  }
                  if (sand) {
                    top = (Tile.sand.id << 24) >> 24;
                    material = (Tile.sand.id << 24) >> 24;
                  }
                }
                if (y < waterHeight && top === 0) {
                  if (temp < f(0.15)) top = (Tile.ice.id << 24) >> 24;
                  else top = (Tile.calmWater.id << 24) >> 24;
                }
                run = runDepth;
                if (y >= waterHeight - 1) blocks[offs] = top & 0xff;
                else blocks[offs] = material & 0xff;
              } else if (run > 0) {
                run--;
                blocks[offs] = material & 0xff;
                if (run === 0 && material === (Tile.sand.id << 24) >> 24) {
                  run = this.random.nextInt(4);
                  material = (Tile.sandStone.id << 24) >> 24;
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * C-6b：整段地物生成这一轮不做，所以**这里什么都不干**。
   *
   * 【但它必须是个空实现，不能抛 —— 这是 C-6b 浏览器实测撞出来的】
   * 它不在什么边缘路径上：`ChunkCache.getChunk` 每凑齐 2×2 个区块就调一次
   * （`ChunkCache.ts:145` 起那四段判断），也就是**每个区块都会走到**。
   * 这里原来写的是 `throw`，于是"从菜单进世界"整条路走不通 ——
   * 而且它在 `Dimension.createRandomLevelSource` 那条 throw 后面才轮到，
   * 之前一直没被走到，是因为前一句先炸了。
   *
   * （地物生成已移植——下面是当时空实现阶段的记录，留作历史：存档里那批老区块确实没有地物，需要删掉重建。）
   * 【空实现的后果已写进 task_plan】`ChunkCache.postProcess` 会先把
   * `chunk.terrainPopulated = true` 再调这里 —— 那是 C++ 自己的顺序，不能为了这个去改。
   * 所以这一轮生成的世界**带着"地物已生成"的标记存下去，实际上一棵草都没有**；
   * 以后补地物时这些老区块不会追溯补上，得删掉重新生成。
   */
  postProcess(_parent: ChunkSource, xt: number, zt: number): void {
    const level = this.level;
    level.isGeneratingTerrain = true;
    heavyTileClass().instaFall = true;
    const xo = xt * 16;
    const zo = zt * 16;
    const biome = level.getBiomeSource()!.getBiome(xo + 16, zo + 16)!;
    const random = this.random;
    random.setSeed(level.getSeed());
    // int 运算：`nextInt() / 2 * 2 + 1` 是整数除法（截断），乘积按 int 溢出（-fwrapv），`^ getSeed()` 后 setSeed 只用低 32 位
    const xScale = (Math.trunc(random.nextInt() / 2) * 2 + 1) | 0;
    const zScale = (Math.trunc(random.nextInt() / 2) * 2 + 1) | 0;
    random.setSeed(((Math.imul(xt, xScale) + Math.imul(zt, zScale)) | 0) ^ level.getSeed());
    if (random.nextInt(4) === 0) {
      const x = xo + random.nextInt(16) + 8;
      const y = random.nextInt(128);
      const z = zo + random.nextInt(16) + 8;
      new LakeFeature(Tile.calmWater.id).place(level, random, x, y, z);
    }
    if (random.nextInt(8) === 0) {
      const x = xo + random.nextInt(16) + 8;
      const y = random.nextInt(random.nextInt(120) + 8);
      const z = zo + random.nextInt(16) + 8;
      if (y < 64 || random.nextInt(10) === 0) {
        new LakeFeature(Tile.calmLava.id).place(level, random, x, y, z);
      }
    }
    // C++ 这里有 static float totalTime 与 getTimeS() 计时（只用于统计），省略
    for (let i = 0; i < 10; i++) {
      const x = xo + random.nextInt(16);
      const y = random.nextInt(128);
      const z = zo + random.nextInt(16);
      new ClayFeature(32).place(level, random, x, y, z);
    }
    const ores: [number, number, number, (r: typeof random) => number][] = [
      [20, Tile.dirt.id, 32, (r) => r.nextInt(128)],
      [10, Tile.gravel.id, 32, (r) => r.nextInt(128)],
      [16, Tile.coalOre.id, 14, (r) => r.nextInt(128)],
      [14, Tile.ironOre.id, 10, (r) => r.nextInt(64)],
      [2, Tile.goldOre.id, 9, (r) => r.nextInt(32)],
      [6, Tile.redStoneOre.id, 8, (r) => r.nextInt(16)],
      [3, Tile.emeraldOre.id, 6, (r) => r.nextInt(16)],
      [1, Tile.lapisOre.id, 6, (r) => r.nextInt(16) + r.nextInt(16)],
    ];
    for (const [times, tile, count, yOf] of ores) {
      for (let i = 0; i < times; i++) {
        const x = xo + random.nextInt(16);
        const y = yOf(random); // C++ 的 x、y、z 按书写顺序依次取随机数
        const z = zo + random.nextInt(16);
        new OreFeature(tile, count).place(level, random, x, y, z);
      }
    }
    const ss = f(0.5);
    const oFor = Math.trunc(
      f(
        f(
          f(f(this.forestNoise.getValue(f(xo * ss), f(zo * ss))) / 8) +
            f(random.nextFloat() * 4) +
            4,
        ) / 3,
      ),
    );
    let forests = 0;
    if (random.nextInt(10) === 0) forests += 1;
    if (biome === BiomeClass.forest) forests += oFor + 2;
    if (biome === BiomeClass.rainForest) forests += oFor + 2;
    if (biome === BiomeClass.seasonalForest) forests += oFor + 1;
    if (biome === BiomeClass.taiga) {
      forests += oFor + 1;
    }
    if (biome === BiomeClass.desert) forests -= 20;
    if (biome === BiomeClass.tundra) forests -= 20;
    if (biome === BiomeClass.plains) forests -= 20;
    for (let i = 0; i < forests; i++) {
      const x = xo + random.nextInt(16) + 8;
      const z = zo + random.nextInt(16) + 8;
      const y = level.getHeightmap(x, z);
      const tree = biome.getTreeFeature(random);
      if (tree) {
        tree.init(1, 1, 1);
        tree.place(level, random, x, y, z);
      }
    }
    for (let i = 0; i < 2; i++) {
      const x = xo + random.nextInt(16) + 8;
      const y = random.nextInt(128);
      const z = zo + random.nextInt(16) + 8;
      new FlowerFeature(Tile.flower.id).place(level, random, x, y, z);
    }
    if (random.nextInt(2) === 0) {
      const x = xo + random.nextInt(16) + 8;
      const y = random.nextInt(128);
      const z = zo + random.nextInt(16) + 8;
      new FlowerFeature(Tile.rose.id).place(level, random, x, y, z);
    }
    if (random.nextInt(4) === 0) {
      const x = xo + random.nextInt(16) + 8;
      const y = random.nextInt(128);
      const z = zo + random.nextInt(16) + 8;
      new FlowerFeature(Tile.mushroom1.id).place(level, random, x, y, z);
    }
    if (random.nextInt(8) === 0) {
      const x = xo + random.nextInt(16) + 8;
      const y = random.nextInt(128);
      const z = zo + random.nextInt(16) + 8;
      new FlowerFeature(Tile.mushroom2.id).place(level, random, x, y, z);
    }
    let grassCount = 0;
    if (biome === BiomeClass.forest) {
      grassCount = 2;
    } else if (biome === BiomeClass.rainForest) {
      grassCount = 10;
    } else if (biome === BiomeClass.seasonalForest) {
      grassCount = 2;
    } else if (biome === BiomeClass.taiga) {
      grassCount = 1;
    } else if (biome === BiomeClass.plains) {
      grassCount = 10;
    }
    for (let i = 0; i < grassCount; i++) {
      let grassMetadata = TallGrass.TALL_GRASS;
      if (biome === BiomeClass.rainForest && random.nextInt(3) !== 0) {
        grassMetadata = TallGrass.FERN;
      }
      const x = xo + random.nextInt(16) + 8;
      const z = zo + random.nextInt(16) + 8;
      const y = level.getHeightmap(x, z);
      new TallgrassFeature(Tile.tallgrass.id, grassMetadata).place(level, random, x, y, z);
    }
    for (let i = 0; i < 10; i++) {
      const x = xo + random.nextInt(16) + 8;
      const y = random.nextInt(128);
      const z = zo + random.nextInt(16) + 8;
      new ReedsFeature().place(level, random, x, y, z);
    }
    let cacti = 0;
    if (biome === BiomeClass.desert) cacti += 5;
    for (let i = 0; i < cacti; i++) {
      const x = xo + random.nextInt(16) + 8;
      const y = random.nextInt(128);
      const z = zo + random.nextInt(16) + 8;
      new CactusFeature().place(level, random, x, y, z);
    }
    for (let i = 0; i < 50; i++) {
      const x = xo + random.nextInt(16) + 8;
      const y = random.nextInt(random.nextInt(120) + 8);
      const z = zo + random.nextInt(16) + 8;
      new SpringFeature(Tile.water.id).place(level, random, x, y, z);
    }
    for (let i = 0; i < 20; i++) {
      const x = xo + random.nextInt(16) + 8;
      const y = random.nextInt(random.nextInt(random.nextInt(112) + 8) + 8);
      const z = zo + random.nextInt(16) + 8;
      new SpringFeature(Tile.lava.id).place(level, random, x, y, z);
    }
    if (this.spawnMobs && !level.isClientSide)
      (
        MobSpawnerHooks.postProcessSpawnMobs as unknown as (
          l: Level,
          b: Biome,
          xo: number,
          zo: number,
          w: number,
          h: number,
          r: Random,
        ) => void
      )(level, biome, xo + 8, zo + 8, 16, 16, random); // 由 MobSpawner 注入（ADAPTED(ESM)）;
    const temperatures = level.getBiomeSource()!.getTemperatureBlock(null, xo + 8, zo + 8, 16, 16);
    for (let x = xo + 8; x < xo + 8 + 16; x++)
      for (let z = zo + 8; z < zo + 8 + 16; z++) {
        const xp = x - (xo + 8);
        const zp = z - (zo + 8);
        const y = level.getTopSolidBlock(x, z);
        const temp = f(
          temperatures[xp * 16 + zp]! - f(f(f(y - 64) / f(64.0)) * RandomLevelSource.SNOW_SCALE),
        );
        if (temp < RandomLevelSource.SNOW_CUTOFF) {
          if (
            y > 0 &&
            y < 128 &&
            level.isEmptyTile(x, y, z) &&
            level.getMaterial(x, y - 1, z).blocksMotion()
          ) {
            if (level.getMaterial(x, y - 1, z) !== Material.ice)
              level.setTile(x, y, z, Tile.topSnow.id);
          }
        }
      }
    heavyTileClass().instaFall = false;
    level.isGeneratingTerrain = false;
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
        if (depth < 0) depth = f(-depth * f(0.3));
        depth = f(f(depth * 3.0) - 2.0);
        if (depth < 0) {
          depth = f(depth / 2);
          if (depth < -1) depth = -1;
          depth = f(depth / f(1.4));
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

/**
 * HeavyTile::instaFall（静态）。不能值导入 HeavyTile：HeavyTile → FallingTile extends Entity，而 RandomLevelSource 正处在
 * Entity 的加载链里（Entity → … → Level → Dimension → RandomLevelSource），会得到“Class extends value undefined”。
 * Tile.sand 就是 HeavyTile 的实例（Tile.cpp:173），经它的构造函数读写同一个静态字段（ADAPTED(ESM)）。
 */
function heavyTileClass(): { instaFall: boolean } {
  return Tile.sand.constructor as unknown as { instaFall: boolean };
}
