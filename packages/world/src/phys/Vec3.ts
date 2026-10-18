// 1:1 移植自 src/world/phys/Vec3.h
/**
 * Vec3：三个 float 分量（C++ 按值传递的小结构）。
 *
 * 2026-10 全量审核后改为与 C++ 逐位一致（以前是全 double 的改写版）：
 *  - 每个分量都是 float，运算逐步 f()；形参是 float 的先转 float。
 *  - 构造函数把 -0 变成 +0（C++：`if (x == -0.0f) x = 0.0f;`——+0 与 -0 都相等，所以总是写成 +0）；
 *    经由构造函数生成的结果（add、sub、multiply、normalized、cross、negated、lerp、fromPolarXY）都带这一步，set / addSelf 等就地修改的不带。
 *  - 不带 Mth:: 的 sqrt、sin、cos 是 C 库的 double 版本，结果存回 float。
 *  - 以前每个实例还带 9 个缓存三角函数的字段（xRot / yRot / zRot），去掉了：Vec3 是到处新建的小对象，多出的字段只增加内存。
 * R10：C++ 以 Vec3 为参数的 dot / cross / distanceTo / distanceToSqr 在这里取三个分量；运算符 `*`、`*=` 写成 multiply、multiplySelf。
 */
import { formatG as fmt } from '@mcpe/util';

const f = Math.fround;
const CLIP_EPS = f(0.0000001);
const NORM_EPS = f(0.0001);

export class Vec3 {
  public x: number;
  public y: number;
  public z: number;

  /** C++ `Vec3()`（全 0）与 `Vec3(float x, float y, float z)`（-0 → +0） */
  public constructor(x: number = 0, y: number = 0, z: number = 0) {
    x = f(x);
    y = f(y);
    z = f(z);
    this.x = x === 0 ? 0 : x;
    this.y = y === 0 ? 0 : y;
    this.z = z === 0 ? 0 : z;
  }

  public set(x: number, y: number, z: number): Vec3 {
    this.x = f(x);
    this.y = f(y);
    this.z = f(z);
    return this;
  }

  /** C++ `operator+` 的分量形式 */
  public add(x: number, y: number, z: number): Vec3 {
    return new Vec3(f(this.x + f(x)), f(this.y + f(y)), f(this.z + f(z)));
  }

  public addSelf(x: number, y: number, z: number): Vec3 {
    this.x = f(this.x + f(x));
    this.y = f(this.y + f(y));
    this.z = f(this.z + f(z));
    return this;
  }

  public sub(x: number, y: number, z: number): Vec3 {
    return new Vec3(f(this.x - f(x)), f(this.y - f(y)), f(this.z - f(z)));
  }

  public subSelf(x: number, y: number, z: number): Vec3 {
    this.x = f(this.x - f(x));
    this.y = f(this.y - f(y));
    this.z = f(this.z - f(z));
    return this;
  }

  /** C++ `operator*(float k)` */
  public multiply(k: number): Vec3 {
    k = f(k);
    return new Vec3(f(this.x * k), f(this.y * k), f(this.z * k));
  }

  /** C++ `operator*=(float k)` */
  public multiplySelf(k: number): Vec3 {
    k = f(k);
    this.x = f(this.x * k);
    this.y = f(this.y * k);
    this.z = f(this.z * k);
    return this;
  }

  public normalized(): Vec3 {
    const dist = f(Math.sqrt(f(f(f(this.x * this.x) + f(this.y * this.y)) + f(this.z * this.z))));
    if (dist < NORM_EPS) return new Vec3();
    return new Vec3(f(this.x / dist), f(this.y / dist), f(this.z / dist));
  }

  /** C++ `dot(const Vec3& p)`：x * p.x + y * p.y + z * p.z（从左到右，逐步 float） */
  public dot(x: number, y: number, z: number): number {
    return f(f(f(this.x * f(x)) + f(this.y * f(y))) + f(this.z * f(z)));
  }

  public cross(x: number, y: number, z: number): Vec3 {
    x = f(x);
    y = f(y);
    z = f(z);
    return new Vec3(
      f(f(this.y * z) - f(this.z * y)),
      f(f(this.z * x) - f(this.x * z)),
      f(f(this.x * y) - f(this.y * x)),
    );
  }

  public negate(): void {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
  }

  public negated(): Vec3 {
    return new Vec3(-this.x, -this.y, -this.z);
  }

  public distanceTo(x: number, y: number, z: number): number {
    const xd = f(f(x) - this.x);
    const yd = f(f(y) - this.y);
    const zd = f(f(z) - this.z);
    return f(Math.sqrt(f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd))));
  }

  public distanceToSqr(x: number, y: number, z: number): number {
    const xd = f(f(x) - this.x);
    const yd = f(f(y) - this.y);
    const zd = f(f(z) - this.z);
    return f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd));
  }

  public length(): number {
    return f(Math.sqrt(f(f(f(this.x * this.x) + f(this.y * this.y)) + f(this.z * this.z))));
  }

  public clipX(b: Vec3, xt: number, result: Vec3): boolean {
    const xd = f(b.x - this.x);
    const yd = f(b.y - this.y);
    const zd = f(b.z - this.z);
    if (f(xd * xd) < CLIP_EPS) return false;
    const d = f(f(f(xt) - this.x) / xd);
    if (d < 0 || d > 1) return false;
    result.set(f(this.x + f(xd * d)), f(this.y + f(yd * d)), f(this.z + f(zd * d)));
    return true;
  }

  public clipY(b: Vec3, yt: number, result: Vec3): boolean {
    const xd = f(b.x - this.x);
    const yd = f(b.y - this.y);
    const zd = f(b.z - this.z);
    if (f(yd * yd) < CLIP_EPS) return false;
    const d = f(f(f(yt) - this.y) / yd);
    if (d < 0 || d > 1) return false;
    result.set(f(this.x + f(xd * d)), f(this.y + f(yd * d)), f(this.z + f(zd * d)));
    return true;
  }

  public clipZ(b: Vec3, zt: number, result: Vec3): boolean {
    const xd = f(b.x - this.x);
    const yd = f(b.y - this.y);
    const zd = f(b.z - this.z);
    if (f(zd * zd) < CLIP_EPS) return false;
    const d = f(f(f(zt) - this.z) / zd);
    if (d < 0 || d > 1) return false;
    result.set(f(this.x + f(xd * d)), f(this.y + f(yd * d)), f(this.z + f(zd * d)));
    return true;
  }

  /** C++：`ss << "Vec3(" << x << "," << y << "," << z << ")"`（流的默认格式） */
  public toString(): string {
    return `Vec3(${fmt(this.x)},${fmt(this.y)},${fmt(this.z)})`;
  }

  public lerp(v: Vec3, a: number): Vec3 {
    a = f(a);
    return new Vec3(
      f(this.x + f(f(v.x - this.x) * a)),
      f(this.y + f(f(v.y - this.y) * a)),
      f(this.z + f(f(v.z - this.z) * a)),
    );
  }

  public xRot(degs: number): void {
    const cosv = f(Math.cos(f(degs)));
    const sinv = f(Math.sin(f(degs)));
    const xx = this.x;
    const yy = f(f(this.y * cosv) + f(this.z * sinv));
    const zz = f(f(this.z * cosv) - f(this.y * sinv));
    this.x = xx;
    this.y = yy;
    this.z = zz;
  }

  public yRot(degs: number): void {
    const cosv = f(Math.cos(f(degs)));
    const sinv = f(Math.sin(f(degs)));
    const xx = f(f(this.x * cosv) + f(this.z * sinv));
    const yy = this.y;
    const zz = f(f(this.z * cosv) - f(this.x * sinv));
    this.x = xx;
    this.y = yy;
    this.z = zz;
  }

  public zRot(degs: number): void {
    const cosv = f(Math.cos(f(degs)));
    const sinv = f(Math.sin(f(degs)));
    const xx = f(f(this.x * cosv) + f(this.y * sinv));
    const yy = f(f(this.y * cosv) - f(this.x * sinv));
    const zz = this.z;
    this.x = xx;
    this.y = yy;
    this.z = zz;
  }

  public static fromPolarXY(angle: number, radius: number): Vec3 {
    angle = f(angle);
    radius = f(radius);
    return new Vec3(f(radius * f(Math.cos(angle))), f(radius * f(Math.sin(angle))), 0);
  }
}
