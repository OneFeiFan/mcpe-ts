// 1:1 移植自 src/util/Random.h；部分语句暂缓或省略，见文件内的 DEFERRED / OMIT 标记
import { getTimeMs } from '@mcpe/platform';

const f = Math.fround;
const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER_MASK = 0x80000000;
const LOWER_MASK = 0x7fffffff;
const MAG01 = new Uint32Array([0, MATRIX_A]);
const TWO_32_INV = 1.0 / 4294967296.0;

export interface RRDiff1 {
  x: number;
}
export interface RRDiff2 {
  x: number;
  y: number;
}
export interface RRDiff3 {
  x: number;
  y: number;
  z: number;
}
export type RRDiffOut = RRDiff1 | RRDiff2 | RRDiff3;

export class Random {
  private mt: Uint32Array;
  private mti: number;
  private _seed: number;
  private haveNextNextGaussian: boolean;
  private nextNextGaussian: number;

  /** C++ 的隐式拷贝构造（`Random randomCopy = random;`）：复制全部状态，之后两者互不影响 */
  copy(): Random {
    const r = new Random(0);
    r.mt.set(this.mt);
    r.mti = this.mti;
    r._seed = this._seed;
    r.haveNextNextGaussian = this.haveNextNextGaussian;
    r.nextNextGaussian = this.nextNextGaussian;
    return r;
  }

  constructor(seed?: number) {
    this.mt = new Uint32Array(N);
    this.mti = N + 1;
    this._seed = 0;
    this.haveNextNextGaussian = false;
    this.nextNextGaussian = 0;
    this.setSeed(seed === undefined ? getTimeMs() : seed);
  }

  setSeed(seed: number): this {
    this._seed = seed;
    this.haveNextNextGaussian = false;
    this.nextNextGaussian = 0;

    const mt = this.mt;
    mt[0] = seed >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1]!;
      mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0;
    }
    this.mti = N;
    return this;
  }

  getSeed(): number {
    return this._seed;
  }

  // 审核补登记：MT19937 原始代码里的其余辅助函数，游戏代码不调用（init_genrand 的逻辑已写在 setSeed 里）
  // OMIT(Util): void init_genrand(unsigned long s)  Random.h
  // OMIT(Util): void init_by_array(unsigned long init_key[], int key_length)  Random.h
  // OMIT(Util): long genrand_int31(void)  Random.h
  // OMIT(Util): double genrand_real1(void)  Random.h
  // OMIT(Util): double genrand_real3(void)  Random.h
  // OMIT(Util): double genrand_res53(void)  Random.h

  genrand_int32(): number {
    const mt = this.mt;
    let mti = this.mti;
    let y: number;

    if (mti >= N) {
      let kk = 0;
      const end1 = N - M;
      for (; kk < end1; kk++) {
        y = (mt[kk]! & UPPER_MASK) | (mt[kk + 1]! & LOWER_MASK);
        mt[kk] = (mt[kk + M]! ^ (y >>> 1) ^ MAG01[y & 1]!) >>> 0;
      }
      for (; kk < N - 1; kk++) {
        y = (mt[kk]! & UPPER_MASK) | (mt[kk + 1]! & LOWER_MASK);
        mt[kk] = (mt[kk + (M - N)]! ^ (y >>> 1) ^ MAG01[y & 1]!) >>> 0;
      }
      y = (mt[N - 1]! & UPPER_MASK) | (mt[0]! & LOWER_MASK);
      mt[N - 1] = (mt[M - 1]! ^ (y >>> 1) ^ MAG01[y & 1]!) >>> 0;
      mti = 0;
    }

    y = mt[mti++]!;
    this.mti = mti;

    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;

    return y >>> 0;
  }

  nextBoolean(): boolean {
    // 与原 C++ 一致，注意原代码掩码是 0x8000000（1<<27），不是 0x80000000
    return (this.genrand_int32() & 0x8000000) !== 0;
  }

  nextFloat(): number {
    // C++: (float)genrand_real2()
    return f(this.genrand_int32() * TWO_32_INV);
  }

  nextDouble(): number {
    // C++: genrand_real2()
    return this.genrand_int32() * TWO_32_INV;
  }

  nextInt(): number;
  nextInt(n: number): number;
  nextInt(n?: number): number {
    const v = this.genrand_int32();
    return n === undefined ? v >>> 1 : v % n;
  }

  nextLong(): number;
  nextLong(n: number): number;
  nextLong(n?: number): number {
    const v = this.genrand_int32();
    return n === undefined ? v >>> 1 : v % n;
  }

  nextGaussian(): number {
    // C++ 里 v1、v2、s、multiplier 都是 float，std::log / std::sqrt 走 float 重载：每一步都要 Math.fround
    if (this.haveNextNextGaussian) {
      this.haveNextNextGaussian = false;
      return this.nextNextGaussian;
    }
    const f = Math.fround;
    let v1: number, v2: number, s: number;
    do {
      v1 = f(f(2 * this.nextFloat()) - 1); // between -1.0 and 1.0
      v2 = f(f(2 * this.nextFloat()) - 1); // between -1.0 and 1.0
      s = f(f(v1 * v1) + f(v2 * v2));
    } while (s >= 1 || s === 0);
    const multiplier = f(Math.sqrt(f(f(-2 * f(Math.log(s))) / s)));
    this.nextNextGaussian = f(v2 * multiplier);
    this.haveNextNextGaussian = true;
    return f(v1 * multiplier);
  }

  /**
   * 用法：
   *   const o: RRDiff3 = { x: 0, y: 0, z: 0 };
   *   rand.rrDiff(o);   // o 被就地更新
   *
   *   const o2: RRDiff1 = { x: 0 };
   *   rand.rrDiff(o2);
   */
  rrDiff(out: RRDiff3): void;
  rrDiff(out: RRDiff2): void;
  rrDiff(out: RRDiff1): void;
  rrDiff(out: RRDiffOut): void {
    const u = this.genrand_int32();

    if ((out as RRDiff3).z !== undefined) {
      const o = out as RRDiff3;
      o.x = ((u & 0x1f) - ((u >>> 5) & 0x1f)) / 32;
      o.y = (((u >>> 10) & 0x1f) - ((u >>> 15) & 0x1f)) / 32;
      o.z = (((u >>> 20) & 0x1f) - ((u >>> 25) & 0x1f)) / 32;
    } else if ((out as RRDiff2).y !== undefined) {
      const o = out as RRDiff2;
      o.x = ((u & 0xff) - ((u >>> 8) & 0xff)) / 256;
      o.y = (((u >>> 16) & 0xff) - ((u >>> 24) & 0xff)) / 256;
    } else {
      const o = out as RRDiff1;
      o.x = ((u & 0xffff) - ((u >>> 16) & 0xffff)) / 65536;
    }
  }
}
