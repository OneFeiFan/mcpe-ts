// 1:1 移植自 src/world/phys/Vec3.h
export class Vec3 {
  public x: number = 0;
  public y: number = 0;
  public z: number = 0;

  public constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  public set(x: number, y: number, z: number): Vec3 {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  public add(x: number, y: number, z: number): Vec3 {
    return new Vec3(this.x + x, this.y + y, this.z + z);
  }

  public addSelf(x: number, y: number, z: number): Vec3 {
    this.x += x;
    this.y += y;
    this.z += z;
    return this;
  }

  public sub(x: number, y: number, z: number): Vec3 {
    return new Vec3(this.x - x, this.y - y, this.z - z);
  }

  public subSelf(x: number, y: number, z: number): Vec3 {
    this.x -= x;
    this.y -= y;
    this.z -= z;
    return this;
  }

  public multiply(k: number): Vec3 {
    return new Vec3(this.x * k, this.y * k, this.z * k);
  }

  public multiplySelf(k: number): Vec3 {
    this.x *= k;
    this.y *= k;
    this.z *= k;
    return this;
  }

  public divide(k: number): Vec3 {
    return new Vec3(this.x / k, this.y / k, this.z / k);
  }

  public divideSelf(k: number): Vec3 {
    this.x /= k;
    this.y /= k;
    this.z /= k;
    return this;
  }

  // 返回一个新的 Vec3 实例，该实例是当前向量的归一化版本。如果当前向量的长度接近零，则返回一个零向量。
  public normalized(): Vec3 {
    const lenSq = this.x * this.x + this.y * this.y + this.z * this.z;
    if (lenSq < 1e-8) return new Vec3();
    const dist = Math.sqrt(lenSq);
    return new Vec3(this.x / dist, this.y / dist, this.z / dist);
  }

  // 计算当前向量与另一个向量的点积
  public dot(x: number, y: number, z: number): number {
    return this.x * x + this.y * y + this.z * z;
  }

  // 计算当前向量与另一个向量的叉积，并返回一个新的 Vec3 实例表示结果。
  public cross(x: number, y: number, z: number): Vec3 {
    return new Vec3(this.y * z - this.z * y, this.z * x - this.x * z, this.x * y - this.y * x);
  }

  public negate() {
    this.x = -this.x;
    this.y = -this.y;
    this.z = -this.z;
  }

  public negated(): Vec3 {
    return new Vec3(-this.x, -this.y, -this.z);
  }

  public distanceTo(x: number, y: number, z: number): number {
    const xd = x - this.x;
    const yd = y - this.y;
    const zd = z - this.z;
    return Math.sqrt(xd * xd + yd * yd + zd * zd);
  }

  public distanceToSqr(x: number, y: number, z: number): number {
    const xd = x - this.x;
    const yd = y - this.y;
    const zd = z - this.z;
    return xd * xd + yd * yd + zd * zd;
  }

  public length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  // clipX, clipY, clipZ 方法用于计算当前向量与另一个向量之间的线段在指定平面上的交点，并将结果存储在 result 向量中。如果交点存在且在线段上，则返回 true；否则返回 false。
  public clipX(b: Vec3, xt: number, result: Vec3): boolean {
    const sx = this.x;
    const sy = this.y;
    const sz = this.z;

    const xd = b.x - sx;
    const yd = b.y - sy;
    const zd = b.z - sz;

    if (xd * xd < 1e-7) return false;

    const d = (xt - sx) / xd;
    if (d < 0 || d > 1) return false;

    result.x = sx + xd * d;
    result.y = sy + yd * d;
    result.z = sz + zd * d;
    return true;
  }

  public clipY(b: Vec3, yt: number, result: Vec3): boolean {
    const sx = this.x;
    const sy = this.y;
    const sz = this.z;

    const xd = b.x - sx;
    const yd = b.y - sy;
    const zd = b.z - sz;

    if (yd * yd < 1e-7) return false;

    const d = (yt - sy) / yd;
    if (d < 0 || d > 1) return false;

    result.x = sx + xd * d;
    result.y = sy + yd * d;
    result.z = sz + zd * d;
    return true;
  }

  public clipZ(b: Vec3, zt: number, result: Vec3): boolean {
    const sx = this.x;
    const sy = this.y;
    const sz = this.z;

    const xd = b.x - sx;
    const yd = b.y - sy;
    const zd = b.z - sz;

    if (zd * zd < 1e-7) return false;

    const d = (zt - sz) / zd;
    if (d < 0 || d > 1) return false;

    result.x = sx + xd * d;
    result.y = sy + yd * d;
    result.z = sz + zd * d;
    return true;
  }

  public toString(): string {
    return `Vec3(${this.x},${this.y},${this.z})`;
  }

  // 用于在当前向量和另一个向量之间进行线性插值。参数 v 是目标向量，参数 a 是插值因子，取值范围为 [0, 1]。当 a 为 0 时，返回当前向量；当 a 为 1 时，返回目标向量；当 a 在 0 和 1 之间时，返回两者之间的插值向量。
  public lerp(v: Vec3, a: number): Vec3 {
    return new Vec3(
      this.x + (v.x - this.x) * a,
      this.y + (v.y - this.y) * a,
      this.z + (v.z - this.z) * a,
    );
  }

  // xRot, yRot, zRot 方法用于绕 X、Y、Z 轴旋转当前向量。参数 degs 是旋转角度，单位为弧度。旋转后，当前向量的坐标会被更新为旋转后的新坐标。
  private _lastXAngle = NaN;
  private _lastXcos = 1;
  private _lastXsin = 0;

  private _lastYAngle = NaN;
  private _lastYcos = 1;
  private _lastYsin = 0;

  private _lastZAngle = NaN;
  private _lastZcos = 1;
  private _lastZsin = 0;

  public xRot(degs: number) {
    let cosv: number;
    let sinv: number;
    if (degs === this._lastXAngle) {
      cosv = this._lastXcos;
      sinv = this._lastXsin;
    } else {
      cosv = Math.cos(degs);
      sinv = Math.sin(degs);
      this._lastXAngle = degs;
      this._lastXcos = cosv;
      this._lastXsin = sinv;
    }

    const x = this.x;
    const y = this.y;
    const z = this.z;

    this.x = x;
    this.y = y * cosv + z * sinv;
    this.z = z * cosv - y * sinv;
  }

  public yRot(degs: number) {
    let cosv: number;
    let sinv: number;
    if (degs === this._lastYAngle) {
      cosv = this._lastYcos;
      sinv = this._lastYsin;
    } else {
      cosv = Math.cos(degs);
      sinv = Math.sin(degs);
      this._lastYAngle = degs;
      this._lastYcos = cosv;
      this._lastYsin = sinv;
    }

    const x = this.x;
    const y = this.y;
    const z = this.z;

    this.x = x * cosv + z * sinv;
    this.y = y;
    this.z = z * cosv - x * sinv;
  }

  public zRot(degs: number) {
    let cosv: number;
    let sinv: number;
    if (degs === this._lastZAngle) {
      cosv = this._lastZcos;
      sinv = this._lastZsin;
    } else {
      cosv = Math.cos(degs);
      sinv = Math.sin(degs);
      this._lastZAngle = degs;
      this._lastZcos = cosv;
      this._lastZsin = sinv;
    }

    const x = this.x;
    const y = this.y;
    const z = this.z;

    this.x = x * cosv + y * sinv;
    this.y = y * cosv - x * sinv;
    this.z = z;
  }

  // fromPolarXY 方法用于根据给定的角度和半径创建一个新的 Vec3 实例。参数 angle 是角度，单位为弧度，参数 radius 是半径。该方法返回一个新的 Vec3 实例，其 x 坐标为 radius * cos(angle)，y 坐标为 radius * sin(angle)，z 坐标为 0。
  public static fromPolarXY(angle: number, radius: number): Vec3 {
    return new Vec3(radius * Math.cos(angle), radius * Math.sin(angle), 0);
  }
}
