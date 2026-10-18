// 1:1 移植自 src/world/phys/AABB.h
import { formatG as fmt } from '@mcpe/util';
import { Vec3 } from './Vec3';
import { HitResult } from './HitResult';

/**
 * 2026-10 全量审核后改为与 C++ 逐位一致：六个边界是 float，形参是 float 的先转 float，每一步运算 f()；
 * clip 按 C++ 的写法用 Vec3.clipX / clipY / clipZ 求六个交点，再按到起点的距离取最近的一个（以前是内联的 double 版本）。
 */
const f = Math.fround;

export class AABB {
  public x0: number;
  public y0: number;
  public z0: number;
  public x1: number;
  public y1: number;
  public z1: number;

  /** C++ `AABB()`（0,0,0 到 1,1,1）与 `AABB(float x0, …, float z1)` */
  public constructor(
    x0: number = 0,
    y0: number = 0,
    z0: number = 0,
    x1: number = 1,
    y1: number = 1,
    z1: number = 1,
  ) {
    this.x0 = f(x0);
    this.y0 = f(y0);
    this.z0 = f(z0);
    this.x1 = f(x1);
    this.y1 = f(y1);
    this.z1 = f(z1);
  }

  public set(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): AABB {
    this.x0 = f(x0);
    this.y0 = f(y0);
    this.z0 = f(z0);
    this.x1 = f(x1);
    this.y1 = f(y1);
    this.z1 = f(z1);
    return this;
  }

  /** C++ `void set(const AABB& b)` */
  public setFrom(b: AABB): void {
    this.x0 = b.x0;
    this.y0 = b.y0;
    this.z0 = b.z0;
    this.x1 = b.x1;
    this.y1 = b.y1;
    this.z1 = b.z1;
  }

  public expand(xa: number, ya: number, za: number): AABB {
    xa = f(xa);
    ya = f(ya);
    za = f(za);
    let _x0 = this.x0;
    let _y0 = this.y0;
    let _z0 = this.z0;
    let _x1 = this.x1;
    let _y1 = this.y1;
    let _z1 = this.z1;
    if (xa < 0) _x0 = f(_x0 + xa);
    if (xa > 0) _x1 = f(_x1 + xa);
    if (ya < 0) _y0 = f(_y0 + ya);
    if (ya > 0) _y1 = f(_y1 + ya);
    if (za < 0) _z0 = f(_z0 + za);
    if (za > 0) _z1 = f(_z1 + za);
    return new AABB(_x0, _y0, _z0, _x1, _y1, _z1);
  }

  public grow(xa: number, ya: number, za: number): AABB {
    xa = f(xa);
    ya = f(ya);
    za = f(za);
    return new AABB(
      this.x0 - xa,
      this.y0 - ya,
      this.z0 - za,
      this.x1 + xa,
      this.y1 + ya,
      this.z1 + za,
    );
  }

  public cloneMove(xa: number, ya: number, za: number): AABB {
    xa = f(xa);
    ya = f(ya);
    za = f(za);
    return new AABB(
      this.x0 + xa,
      this.y0 + ya,
      this.z0 + za,
      this.x1 + xa,
      this.y1 + ya,
      this.z1 + za,
    );
  }

  public clipXCollide(c: AABB, xa: number): number {
    xa = f(xa);
    if (c.y1 <= this.y0 || c.y0 >= this.y1) return xa;
    if (c.z1 <= this.z0 || c.z0 >= this.z1) return xa;
    if (xa > 0 && c.x1 <= this.x0) {
      const max = f(this.x0 - c.x1);
      if (max < xa) xa = max;
    }
    if (xa < 0 && c.x0 >= this.x1) {
      const max = f(this.x1 - c.x0);
      if (max > xa) xa = max;
    }
    return xa;
  }

  public clipYCollide(c: AABB, ya: number): number {
    ya = f(ya);
    if (c.x1 <= this.x0 || c.x0 >= this.x1) return ya;
    if (c.z1 <= this.z0 || c.z0 >= this.z1) return ya;
    if (ya > 0 && c.y1 <= this.y0) {
      const max = f(this.y0 - c.y1);
      if (max < ya) ya = max;
    }
    if (ya < 0 && c.y0 >= this.y1) {
      const max = f(this.y1 - c.y0);
      if (max > ya) ya = max;
    }
    return ya;
  }

  public clipZCollide(c: AABB, za: number): number {
    za = f(za);
    if (c.x1 <= this.x0 || c.x0 >= this.x1) return za;
    if (c.y1 <= this.y0 || c.y0 >= this.y1) return za;
    if (za > 0 && c.z1 <= this.z0) {
      const max = f(this.z0 - c.z1);
      if (max < za) za = max;
    }
    if (za < 0 && c.z0 >= this.z1) {
      const max = f(this.z1 - c.z0);
      if (max > za) za = max;
    }
    return za;
  }

  public intersects(c: AABB): boolean {
    if (c.x1 <= this.x0 || c.x0 >= this.x1) return false;
    if (c.y1 <= this.y0 || c.y0 >= this.y1) return false;
    if (c.z1 <= this.z0 || c.z0 >= this.z1) return false;
    return true;
  }

  /** C++ `intersects(float x02, …, float z12)`（R10：参数个数不同的重载改名） */
  public intersectsXYZ(
    x02: number,
    y02: number,
    z02: number,
    x12: number,
    y12: number,
    z12: number,
  ): boolean {
    if (f(x12) <= this.x0 || f(x02) >= this.x1) return false;
    if (f(y12) <= this.y0 || f(y02) >= this.y1) return false;
    if (f(z12) <= this.z0 || f(z02) >= this.z1) return false;
    return true;
  }

  public intersectsInner(c: AABB): boolean {
    if (c.x1 < this.x0 || c.x0 > this.x1) return false;
    if (c.y1 < this.y0 || c.y0 > this.y1) return false;
    if (c.z1 < this.z0 || c.z0 > this.z1) return false;
    return true;
  }

  public move(xa: number, ya: number, za: number): AABB {
    xa = f(xa);
    ya = f(ya);
    za = f(za);
    this.x0 = f(this.x0 + xa);
    this.y0 = f(this.y0 + ya);
    this.z0 = f(this.z0 + za);
    this.x1 = f(this.x1 + xa);
    this.y1 = f(this.y1 + ya);
    this.z1 = f(this.z1 + za);
    return this;
  }

  /** C++ `contains(const Vec3& p)`（R10：取三个分量；Vec3 的分量是 float） */
  public contains(x: number, y: number, z: number): boolean {
    x = f(x);
    y = f(y);
    z = f(z);
    if (x <= this.x0 || x >= this.x1) return false;
    if (y <= this.y0 || y >= this.y1) return false;
    if (z <= this.z0 || z >= this.z1) return false;
    return true;
  }

  public getSize(): number {
    const xs = f(this.x1 - this.x0);
    const ys = f(this.y1 - this.y0);
    const zs = f(this.z1 - this.z0);
    return f(f(f(xs + ys) + zs) / 3.0);
  }

  public shrink(xa: number, ya: number, za: number): AABB {
    xa = f(xa);
    ya = f(ya);
    za = f(za);
    return new AABB(
      this.x0 + xa,
      this.y0 + ya,
      this.z0 + za,
      this.x1 - xa,
      this.y1 - ya,
      this.z1 - za,
    );
  }

  public copy(): AABB {
    return new AABB(this.x0, this.y0, this.z0, this.x1, this.y1, this.z1);
  }

  public toString(): string {
    return `AABB(${fmt(this.x0)},${fmt(this.y0)},${fmt(this.z0)} to ${fmt(this.x1)},${fmt(this.y1)},${fmt(this.z1)})`;
  }

  public clip(a: Vec3, b: Vec3): HitResult {
    const xh0 = new Vec3();
    const xh1 = new Vec3();
    const yh0 = new Vec3();
    const yh1 = new Vec3();
    const zh0 = new Vec3();
    const zh1 = new Vec3();
    let bxh0 = a.clipX(b, this.x0, xh0);
    let bxh1 = a.clipX(b, this.x1, xh1);
    let byh0 = a.clipY(b, this.y0, yh0);
    let byh1 = a.clipY(b, this.y1, yh1);
    let bzh0 = a.clipZ(b, this.z0, zh0);
    let bzh1 = a.clipZ(b, this.z1, zh1);
    if (!bxh0 || !this.containsX(xh0)) bxh0 = false;
    if (!bxh1 || !this.containsX(xh1)) bxh1 = false;
    if (!byh0 || !this.containsY(yh0)) byh0 = false;
    if (!byh1 || !this.containsY(yh1)) byh1 = false;
    if (!bzh0 || !this.containsZ(zh0)) bzh0 = false;
    if (!bzh1 || !this.containsZ(zh1)) bzh1 = false;
    let closest: Vec3 | null = null;
    const d = (v: Vec3): number => a.distanceToSqr(v.x, v.y, v.z);
    if (bxh0 && (closest === null || d(xh0) < d(closest))) closest = xh0;
    if (bxh1 && (closest === null || d(xh1) < d(closest))) closest = xh1;
    if (byh0 && (closest === null || d(yh0) < d(closest))) closest = yh0;
    if (byh1 && (closest === null || d(yh1) < d(closest))) closest = yh1;
    if (bzh0 && (closest === null || d(zh0) < d(closest))) closest = zh0;
    if (bzh1 && (closest === null || d(zh1) < d(closest))) closest = zh1;
    if (closest === null) return new HitResult();
    let face = -1;
    if (closest === xh0) face = 4;
    if (closest === xh1) face = 5;
    if (closest === yh0) face = 0;
    if (closest === yh1) face = 1;
    if (closest === zh0) face = 2;
    if (closest === zh1) face = 3;
    // HitResult 按值保存 *closest（拷贝，不经过把 -0 变成 +0 的构造函数）
    return new HitResult(0, 0, 0, face, new Vec3().set(closest.x, closest.y, closest.z));
  }

  private containsX(v: Vec3): boolean {
    return v.y >= this.y0 && v.y <= this.y1 && v.z >= this.z0 && v.z <= this.z1;
  }

  private containsY(v: Vec3): boolean {
    return v.x >= this.x0 && v.x <= this.x1 && v.z >= this.z0 && v.z <= this.z1;
  }

  private containsZ(v: Vec3): boolean {
    return v.x >= this.x0 && v.x <= this.x1 && v.y >= this.y0 && v.y <= this.y1;
  }
}
