/**
 * 1:1 移植自 src/world/level/levelgen/synth/PerlinNoise.h 与 PerlinNoise.cpp：多个 ImprovedNoise 叠加（倍频）。
 * BiomeSource 的 PerlinSimplexNoise 在分支里就是它（typedef PerlinNoise PerlinSimplexNoise）。
 * 【三档规则】同 ImprovedNoise：属于“种子 → 世界”的链，逐位与 C++ 一致（已用黄金样本核对）。
 * 【C++ 的重载】getValue 的二维 / 三维写成一个方法，getRegion 的两个重载按参数个数加后缀（$10、$8），调用处照 C++ 写 getRegion(...)。
 */
import { Random } from '@mcpe/util';
import { ImprovedNoise } from './ImprovedNoise';
import { Synth } from './Synth';

const f = Math.fround;

export class PerlinNoise extends Synth {
  private noiseLevels: ImprovedNoise[] = [];
  private levels = 0;
  /** C++ 的成员对象：无论用哪个构造函数都会默认构造（按时间播种）；只有 PerlinNoise(levels) 真正用它 */
  private _random = new Random();
  private _rndPtr: Random;

  constructor(levels: number);
  constructor(random: Random, levels: number);
  constructor(a: number | Random, b?: number) {
    super();
    if (typeof a === 'number') {
      this._rndPtr = this._random;
      this.init(a);
    } else {
      this._rndPtr = a;
      this.init(b!);
    }
  }

  private init(levels: number): void {
    this.levels = levels;
    this.noiseLevels = new Array<ImprovedNoise>(levels);
    for (let i = 0; i < levels; i++) {
      this.noiseLevels[i] = new ImprovedNoise(this._rndPtr);
    }
  }

  /** C++ 的两个重载 getValue(x, y) 与 getValue(x, y, z) */
  override getValue(x: number, y: number): number;
  getValue(x: number, y: number, z: number): number;
  getValue(x: number, y: number, z?: number): number {
    x = f(x);
    y = f(y);
    let value = 0;
    let pow = 1;
    if (z === undefined) {
      for (let i = 0; i < this.levels; i++) {
        value = f(value + f(this.noiseLevels[i]!.getValue(f(x * pow), f(y * pow)) / pow));
        pow = f(pow / 2);
      }
    } else {
      z = f(z);
      for (let i = 0; i < this.levels; i++) {
        value = f(value + f(this.noiseLevels[i]!.getValue(f(x * pow), f(y * pow), f(z * pow)) / pow));
        pow = f(pow / 2);
      }
    }
    return value;
  }

  getRegion(buffer: Float32Array | null, x: number, y: number, z: number, xSize: number, ySize: number, zSize: number, xScale: number, yScale: number, zScale: number): Float32Array;
  getRegion(sr: Float32Array | null, x: number, z: number, xSize: number, zSize: number, xScale: number, zScale: number, pow: number): Float32Array;
  getRegion(buf: Float32Array | null, a: number, b: number, c: number, d: number, e: number, g: number, h: number, i?: number, j?: number): Float32Array {
    return j === undefined ? this.getRegion$8(buf, a, b, c, d, e, g, h) : this.getRegion$10(buf, a, b, c, d, e, g, h, i!, j);
  }

  /** C++ getRegion(float* buffer, float x, float y, float z, int xSize, int ySize, int zSize, float xScale, float yScale, float zScale) */
  getRegion$10(buffer: Float32Array | null, x: number, y: number, z: number, xSize: number, ySize: number, zSize: number, xScale: number, yScale: number, zScale: number): Float32Array {
    xScale = f(xScale);
    yScale = f(yScale);
    zScale = f(zScale);
    const size = Math.imul(Math.imul(xSize, ySize), zSize);
    if (buffer === null) {
      buffer = new Float32Array(size);
    }
    for (let i = 0; i < size; i++) buffer[i] = 0;
    let pow = 1;
    for (let i = 0; i < this.levels; i++) {
      this.noiseLevels[i]!.add(buffer, x, y, z, xSize, ySize, zSize, f(xScale * pow), f(yScale * pow), f(zScale * pow), pow);
      pow = f(pow / 2);
    }
    return buffer;
  }

  /** C++ getRegion(float* sr, int x, int z, int xSize, int zSize, float xScale, float zScale, float pow)：pow 没有用到，照原样 */
  getRegion$8(sr: Float32Array | null, x: number, z: number, xSize: number, zSize: number, xScale: number, zScale: number, _pow: number): Float32Array {
    return this.getRegion$10(sr, f(x), 10.0, f(z), xSize, 1, zSize, xScale, 1, zScale);
  }

  hashCode(): number {
    let x = 4711;
    for (let i = 0; i < this.levels; ++i) x = Math.imul(x, this.noiseLevels[i]!.hashCode());
    return x;
  }
}
