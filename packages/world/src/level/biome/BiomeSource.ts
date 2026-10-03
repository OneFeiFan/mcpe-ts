/**
 * 1:1 移植自 src/world/level/biome/BiomeSource.h 与 BiomeSource.cpp（S4）。替换原来的 FORWARD-DECL(BiomeSource)。
 *
 * 【三档规则】温度、降水决定每一列的群系，属于“种子 → 世界”的链，逐位与 C++ 一致（tools/golden/harness_biomesource.cpp 核对）：
 *  - 每列的温度、降水按 float 逐步计算，常量是 float（1.1f、0.15f、0.7f、0.01f、0.002f …）。
 *  - 三个 Random 的种子是 long 乘法 level->getSeed() * 9871 等；Random 只用低 32 位，所以写成 Math.imul(seed | 0, 9871)。
 *    直接用 JS 乘法在种子较大时会超出 2^53，低位就错了。
 *
 * 【缓冲区】temperatures 在带 Level 的构造函数里分配 16×16；downfalls、noises 一开始是 NULL，第一次调用时由
 *   PerlinNoise.getRegion 按当次大小分配，之后一直复用。照原样保留：所以第一次若是 1×1（GrassTile 着色），
 *   之后再取 16×16 时，C++ 会写越界（未定义行为）。demo 里草地着色关闭，不会走到；世界生成时第一次调用就是 16×16。
 *
 * 【照原样保留的 C++ 行为】getBiomeBlock 取三张噪声图时宽高都传 w（不是 w、h）；getTemperature 返回的是未经变换的原始噪声值。
 *
 * C++ 里 BiomeSource() 是 protected，BiomeSource(Level*) 是 public；TS 的重载不能有不同可见性，这里统一为 public。
 */
import { Random } from '@mcpe/util';
import type { ChunkPos } from '../ChunkPos';
import type { Level } from '../Level';
import { PerlinNoise } from '../levelgen/synth/PerlinNoise';
import { Biome } from './Biome';

const f = Math.fround;

export class BiomeSource {
  static readonly zoom = f(2 * 1);
  static readonly tempScale = f(BiomeSource.zoom / 80.0);
  static readonly downfallScale = f(BiomeSource.zoom / 40.0);
  static readonly noiseScale = f(1 / 4.0);

  temperatures: Float32Array | null = null; // float*，C++ 初值 NULL
  downfalls: Float32Array | null = null;
  noises: Float32Array | null = null;

  lenTemperatures = 0;
  lenDownfalls = 0;
  lenNoises = 0;
  lenBiomes = 0;

  private biomes: (Biome | null)[];
  private temperatureMap: PerlinNoise | null = null;
  private downfallMap: PerlinNoise | null = null;
  private noiseMap: PerlinNoise | null = null;

  /** C++ 的成员对象：无参构造函数里是默认构造（按时间播种），从未使用 */
  private rndTemperature: Random;
  private rndDownfall: Random;
  private rndNoise: Random;

  constructor();
  constructor(level: Level);
  constructor(level?: Level) {
    if (level === undefined) {
      this.rndTemperature = new Random();
      this.rndDownfall = new Random();
      this.rndNoise = new Random();
      this.biomes = new Array<Biome | null>(16 * 16).fill(null);
    } else {
      const seed = level.getSeed() | 0; // long 乘法只有低 32 位进入 Random
      this.rndTemperature = new Random(Math.imul(seed, 9871));
      this.rndDownfall = new Random(Math.imul(seed, 39811));
      this.rndNoise = new Random(Math.imul(seed, 543321));
      this.temperatureMap = new PerlinNoise(this.rndTemperature, 4); // PerlinSimplexNoise 就是 PerlinNoise（typedef）
      this.downfallMap = new PerlinNoise(this.rndDownfall, 4);
      this.noiseMap = new PerlinNoise(this.rndNoise, 2);
      this.biomes = new Array<Biome | null>(16 * 16).fill(null);
      this.temperatures = new Float32Array(16 * 16);
    }
  }

  /** C++ getBiome(const ChunkPos&) 的别名，保留给已有调用方 */
  getBiomeChunk(chunk: ChunkPos): Biome | null {
    return this.getBiome(chunk.x << 4, chunk.z << 4);
  }

  getBiome(x: number, z: number): Biome | null;
  getBiome(chunk: ChunkPos): Biome | null;
  getBiome(a: number | ChunkPos, b?: number): Biome | null {
    if (typeof a !== 'number') {
      return this.getBiome(a.x << 4, a.z << 4);
    }
    return this.getBiomeBlock(a, b!, 1, 1)[0] ?? null;
  }

  getTemperature(x: number, z: number): number {
    this.temperatures = this.temperatureMap!.getRegion(
      this.temperatures,
      x,
      z,
      1,
      1,
      BiomeSource.tempScale,
      BiomeSource.tempScale,
      0.5,
    );
    return this.temperatures[0]!;
  }

  getBiomeBlock(x: number, z: number, w: number, h: number): (Biome | null)[] {
    this.biomes = this.getBiomeBlockImpl(this.biomes, x, z, w, h);
    return this.biomes;
  }

  /** C++ 的 getBiomeBlock(Biome** biomes__, int x, int z, int w, int h)：参数 biomes__ 没有用到，写的是成员 biomes */
  private getBiomeBlockImpl(
    _biomes: (Biome | null)[],
    x: number,
    z: number,
    w: number,
    h: number,
  ): (Biome | null)[] {
    const temperatures = (this.temperatures = this.temperatureMap!.getRegion(
      this.temperatures,
      x,
      z,
      w,
      w,
      BiomeSource.tempScale,
      BiomeSource.tempScale,
      0.25,
    ));
    const downfalls = (this.downfalls = this.downfallMap!.getRegion(
      this.downfalls,
      x,
      z,
      w,
      w,
      BiomeSource.downfallScale,
      BiomeSource.downfallScale,
      0.3333,
    ));
    const noises = (this.noises = this.noiseMap!.getRegion(
      this.noises,
      x,
      z,
      w,
      w,
      BiomeSource.noiseScale,
      BiomeSource.noiseScale,
      0.588,
    ));
    const biomes = this.biomes;
    let pp = 0;
    for (let yy = 0; yy < w; yy++) {
      for (let xx = 0; xx < h; xx++) {
        const noise = f(f(noises[pp]! * f(1.1)) + f(0.5));
        let split2 = f(0.01);
        let split1 = f(1 - split2);
        let temperature = f(
          f(f(f(temperatures[pp]! * f(0.15)) + f(0.7)) * split1) + f(noise * split2),
        );
        split2 = f(0.002);
        split1 = f(1 - split2);
        let downfall = f(f(f(f(downfalls[pp]! * f(0.15)) + f(0.5)) * split1) + f(noise * split2));
        temperature = f(1 - f(f(1 - temperature) * f(1 - temperature)));
        if (temperature < 0) temperature = 0;
        if (downfall < 0) downfall = 0;
        if (temperature > 1) temperature = 1;
        if (downfall > 1) downfall = 1;
        temperatures[pp] = temperature;
        downfalls[pp] = downfall;
        biomes[pp++] = Biome.getBiome(temperature, downfall);
      }
    }
    return biomes;
  }

  getTemperatureBlock(
    _temperatures: Float32Array | null,
    x: number,
    z: number,
    w: number,
    h: number,
  ): Float32Array {
    const ot = this.temperatures;
    const temperatures = (this.temperatures = this.temperatureMap!.getRegion(
      this.temperatures,
      x,
      z,
      w,
      h,
      BiomeSource.tempScale,
      BiomeSource.tempScale,
      0.25,
    ));
    const noises = (this.noises = this.noiseMap!.getRegion(
      this.noises,
      x,
      z,
      w,
      h,
      BiomeSource.noiseScale,
      BiomeSource.noiseScale,
      0.588,
    ));
    if (ot !== temperatures) {
      // LOGI("tmp ptr changed\n");
    }
    let pp = 0;
    for (let yy = 0; yy < w; yy++) {
      for (let xx = 0; xx < h; xx++) {
        const noise = f(f(noises[pp]! * f(1.1)) + f(0.5));
        const split2 = f(0.01);
        const split1 = f(1 - split2);
        let temperature = f(
          f(f(f(temperatures[pp]! * f(0.15)) + f(0.7)) * split1) + f(noise * split2),
        );
        temperature = f(1 - f(f(1 - temperature) * f(1 - temperature)));
        if (temperature < 0) temperature = 0;
        if (temperature > 1) temperature = 1;
        temperatures[pp] = temperature;
        pp++;
      }
    }
    return temperatures;
  }

  getDownfallBlock(
    _downfalls: Float32Array | null,
    x: number,
    z: number,
    w: number,
    _h: number,
  ): Float32Array {
    this.downfalls = this.downfallMap!.getRegion(
      this.downfalls,
      x,
      z,
      w,
      w,
      BiomeSource.downfallScale,
      BiomeSource.downfallScale,
      0.5,
    );
    return this.downfalls;
  }
}
