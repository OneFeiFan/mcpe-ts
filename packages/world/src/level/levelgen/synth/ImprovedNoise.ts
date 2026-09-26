/**
 * 1:1 移植自 src/world/level/levelgen/synth/ImprovedNoise.h 与 ImprovedNoise.cpp（Ken Perlin 的改进噪声）。
 *
 * 【三档规则】世界生成的地形、群系温度都由它算出，属于“种子 → 世界”的链，逐位与 C++ 一致（已用黄金样本核对）：
 *  - 每一步 float 运算都 fround。先算 double 再舍入到 float 与直接做 float 运算结果相同（double 的精度足够，不会产生二次舍入误差），
 *    所以逐步 fround 就是 C++ 的结果。
 *  - (int) 强转用 f2i（x86 语义）；int 与 float 比较、相减时，int 先转成 float（f(xf)），与 C++ 的隐式转换一致。
 *  - 0 乘负数得 -0 等符号细节，JS 与 C++ 同为 IEEE 754，照写即可一致。
 *  - 参数在入口处先转成 float：C++ 的形参是 float，调用方传入的 double 会在这里被舍入。
 */
import { f2i, Random } from '@mcpe/util';
import { Synth } from './Synth';

const f = Math.fround;

// 热点路径用模块级函数（V8 能直接内联），类上的同名方法转调它们，保持 C++ 的公开接口

function lerpF(t: number, a: number, b: number): number {
  return f(a + f(t * f(b - a)));
}

function gradF(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15; // CONVERT LO 4 BITS OF HASH CODE
  const u = h < 8 ? x : y, // INTO 12 GRADIENT DIRECTIONS.
    v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return f(((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v));
}

function grad2F(hash: number, x: number, z: number): number {
  const h = hash & 15; // CONVERT LO 4 BITS OF HASH CODE
  const u = f((1 - ((h & 8) >> 3)) * x), // INTO 12 GRADIENT DIRECTIONS.
    v = h < 4 ? 0 : h === 12 || h === 14 ? x : z;
  return f(((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v));
}

/** x * x * x * (x * (x * 6 - 15) + 10)，按 C++ 的求值顺序逐步舍入 */
function fade(t: number): number {
  return f(f(f(t * t) * t) * f(f(t * f(f(t * 6) - 15)) + 10));
}

export class ImprovedNoise extends Synth {
  /** C++ 里声明了但从未初始化、也从未使用 */
  scale = 0;
  xo = 0;
  yo = 0;
  zo = 0;
  private readonly p = new Int32Array(512);

  constructor();
  constructor(random: Random);
  constructor(random?: Random) {
    super();
    if (random === undefined) {
      const r = new Random(1);
      this.init(r);
    } else {
      this.init(random);
    }
  }

  init(random: Random): void {
    this.xo = f(random.nextFloat() * 256);
    this.yo = f(random.nextFloat() * 256);
    this.zo = f(random.nextFloat() * 256);
    const p = this.p;
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    for (let i = 0; i < 256; i++) {
      const j = random.nextInt(256 - i) + i;
      const tmp = p[i]!;
      p[i] = p[j]!;
      p[j] = tmp;
      p[i + 256] = p[i]!;
    }
  }

  noise(_x: number, _y: number, _z: number): number {
    let x = f(f(_x) + this.xo);
    let y = f(f(_y) + this.yo);
    let z = f(f(_z) + this.zo);
    let xf = f2i(x);
    let yf = f2i(y);
    let zf = f2i(z);
    if (x < f(xf)) xf--;
    if (y < f(yf)) yf--;
    if (z < f(zf)) zf--;
    const X = xf & 255, // FIND UNIT CUBE THAT
      Y = yf & 255, // CONTAINS POINT.
      Z = zf & 255;
    x = f(x - f(xf)); // FIND RELATIVE X,Y,Z
    y = f(y - f(yf)); // OF POINT IN CUBE.
    z = f(z - f(zf));
    const u = fade(x), // COMPUTE FADE CURVES
      v = fade(y), // FOR EACH OF X,Y,Z.
      w = fade(z);
    const p = this.p;
    const A = p[X]! + Y, AA = p[A]! + Z, AB = p[A + 1]! + Z, // HASH COORDINATES OF
      B = p[X + 1]! + Y, BA = p[B]! + Z, BB = p[B + 1]! + Z; // THE 8 CUBE CORNERS,
    const x1 = f(x - 1), y1 = f(y - 1), z1 = f(z - 1);
    return lerpF(w,
      lerpF(v,
        lerpF(u, gradF(p[AA]!, x, y, z), gradF(p[BA]!, x1, y, z)),
        lerpF(u, gradF(p[AB]!, x, y1, z), gradF(p[BB]!, x1, y1, z))),
      lerpF(v,
        lerpF(u, gradF(p[AA + 1]!, x, y, z1), gradF(p[BA + 1]!, x1, y, z1)),
        lerpF(u, gradF(p[AB + 1]!, x, y1, z1), gradF(p[BB + 1]!, x1, y1, z1))));
  }

  lerp(t: number, a: number, b: number): number {
    return lerpF(t, a, b);
  }

  grad2(hash: number, x: number, z: number): number {
    return grad2F(hash, x, z);
  }

  grad(hash: number, x: number, y: number, z: number): number {
    return gradF(hash, x, y, z);
  }

  /** C++ 的两个重载 getValue(x, y) 与 getValue(x, y, z)：二维时 z 取 0 */
  override getValue(x: number, y: number): number;
  getValue(x: number, y: number, z: number): number;
  getValue(x: number, y: number, z?: number): number {
    return this.noise(x, y, z === undefined ? 0 : z);
  }

  add(buffer: Float32Array, _x: number, _y: number, _z: number, xSize: number, ySize: number, zSize: number, xs: number, ys: number, zs: number, pow: number): void {
    _x = f(_x); _y = f(_y); _z = f(_z); xs = f(xs); ys = f(ys); zs = f(zs); pow = f(pow);
    const p = this.p;
    const { xo, yo, zo } = this;
    if (ySize === 1) {
      let A = 0, AA = 0, B = 0, BA = 0;
      let vv0 = 0, vv2 = 0;
      let pp = 0;
      const scale = f(1.0 / pow);
      for (let xx = 0; xx < xSize; xx++) {
        let x = f(f(f(_x + xx) * xs) + xo);
        let xf = f2i(x);
        if (x < f(xf)) xf--;
        const X = xf & 255;
        x = f(x - f(xf));
        const u = fade(x);
        const x1 = f(x - 1);
        for (let zz = 0; zz < zSize; zz++) {
          let z = f(f(f(_z + zz) * zs) + zo);
          let zf = f2i(z);
          if (z < f(zf)) zf--;
          const Z = zf & 255;
          z = f(z - f(zf));
          const w = fade(z);
          const z1 = f(z - 1);
          A = p[X]! + 0;
          AA = p[A]! + Z;
          B = p[X + 1]! + 0;
          BA = p[B]! + Z;
          vv0 = lerpF(u, grad2F(p[AA]!, x, z), gradF(p[BA]!, x1, 0, z));
          vv2 = lerpF(u, gradF(p[AA + 1]!, x, 0, z1), gradF(p[BA + 1]!, x1, 0, z1));
          const val = lerpF(w, vv0, vv2);
          buffer[pp] = f(buffer[pp]! + f(val * scale));
          pp++;
        }
      }
      return;
    }
    let pp = 0;
    const scale = f(1 / pow);
    let yOld = -1;
    let A = 0, AA = 0, AB = 0, B = 0, BA = 0, BB = 0;
    let vv0 = 0, vv1 = 0, vv2 = 0, vv3 = 0;
    for (let xx = 0; xx < xSize; xx++) {
      let x = f(f(f(_x + xx) * xs) + xo);
      let xf = f2i(x);
      if (x < f(xf)) xf--;
      const X = xf & 255;
      x = f(x - f(xf));
      const u = fade(x);
      const x1 = f(x - 1);
      for (let zz = 0; zz < zSize; zz++) {
        let z = f(f(f(_z + zz) * zs) + zo);
        let zf = f2i(z);
        if (z < f(zf)) zf--;
        const Z = zf & 255;
        z = f(z - f(zf));
        const w = fade(z);
        const z1 = f(z - 1);
        for (let yy = 0; yy < ySize; yy++) {
          let y = f(f(f(_y + yy) * ys) + yo);
          let yf = f2i(y);
          if (y < f(yf)) yf--;
          const Y = yf & 255;
          y = f(y - f(yf));
          const v = fade(y);
          if (yy === 0 || Y !== yOld) {
            yOld = Y;
            A = p[X]! + Y;
            AA = p[A]! + Z;
            AB = p[A + 1]! + Z;
            B = p[X + 1]! + Y;
            BA = p[B]! + Z;
            BB = p[B + 1]! + Z;
            const y1 = f(y - 1);
            vv0 = lerpF(u, gradF(p[AA]!, x, y, z), gradF(p[BA]!, x1, y, z));
            vv1 = lerpF(u, gradF(p[AB]!, x, y1, z), gradF(p[BB]!, x1, y1, z));
            vv2 = lerpF(u, gradF(p[AA + 1]!, x, y, z1), gradF(p[BA + 1]!, x1, y, z1));
            vv3 = lerpF(u, gradF(p[AB + 1]!, x, y1, z1), gradF(p[BB + 1]!, x1, y1, z1));
          }
          const v0 = lerpF(v, vv0, vv1);
          const v1 = lerpF(v, vv2, vv3);
          const val = lerpF(w, v0, v1);
          buffer[pp] = f(buffer[pp]! + f(val * scale));
          pp++;
        }
      }
    }
  }

  hashCode(): number {
    let x = 4711;
    for (let i = 0; i < 512; ++i) x = (Math.imul(x, 37) + this.p[i]!) | 0;
    return x;
  }
}
