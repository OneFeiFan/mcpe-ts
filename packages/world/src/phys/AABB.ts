// 1:1 移植自 src/world/phys/AABB.h
import { Vec3 } from './Vec3';
import { HitResult } from './HitResult';

export class AABB {
  public x0: number = 0;
  public y0: number = 0;
  public z0: number = 0;
  public x1: number = 1;
  public y1: number = 1;
  public z1: number = 1;

  public constructor(
    x0: number = 0,
    y0: number = 0,
    z0: number = 0,
    x1: number = 1,
    y1: number = 1,
    z1: number = 1,
  ) {
    this.x0 = x0;
    this.y0 = y0;
    this.z0 = z0;
    this.x1 = x1;
    this.y1 = y1;
    this.z1 = z1;
  }

  public set(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): AABB {
    this.x0 = x0;
    this.y0 = y0;
    this.z0 = z0;
    this.x1 = x1;
    this.y1 = y1;
    this.z1 = z1;
    return this;
  }

  public expand(xa: number, ya: number, za: number): AABB {
    let _x0 = this.x0;
    let _y0 = this.y0;
    let _z0 = this.z0;
    let _x1 = this.x1;
    let _y1 = this.y1;
    let _z1 = this.z1;

    if (xa < 0) _x0 += xa;
    if (xa > 0) _x1 += xa;
    if (ya < 0) _y0 += ya;
    if (ya > 0) _y1 += ya;
    if (za < 0) _z0 += za;
    if (za > 0) _z1 += za;

    return new AABB(_x0, _y0, _z0, _x1, _y1, _z1);
  }

  public grow(xa: number, ya: number, za: number): AABB {
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
    if (c.y1 <= this.y0 || c.y0 >= this.y1) return xa;
    if (c.z1 <= this.z0 || c.z0 >= this.z1) return xa;

    if (xa > 0 && c.x1 <= this.x0) {
      let max = this.x0 - c.x1;
      if (max < xa) xa = max;
    }
    if (xa < 0 && c.x0 >= this.x1) {
      let max = this.x1 - c.x0;
      if (max > xa) xa = max;
    }

    return xa;
  }

  public clipYCollide(c: AABB, ya: number): number {
    if (c.x1 <= this.x0 || c.x0 >= this.x1) return ya;
    if (c.z1 <= this.z0 || c.z0 >= this.z1) return ya;

    if (ya > 0 && c.y1 <= this.y0) {
      let max = this.y0 - c.y1;
      if (max < ya) ya = max;
    }
    if (ya < 0 && c.y0 >= this.y1) {
      let max = this.y1 - c.y0;
      if (max > ya) ya = max;
    }
    return ya;
  }

  public clipZCollide(c: AABB, za: number): number {
    if (c.x1 <= this.x0 || c.x0 >= this.x1) return za;
    if (c.y1 <= this.y0 || c.y0 >= this.y1) return za;
    if (za > 0 && c.z1 <= this.z0) {
      let max = this.z0 - c.z1;
      if (max < za) za = max;
    }
    if (za < 0 && c.z0 >= this.z1) {
      let max = this.z1 - c.z0;
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

  public intersectsInner(c: AABB): boolean {
    if (c.x1 < this.x0 || c.x0 > this.x1) return false;
    if (c.y1 < this.y0 || c.y0 > this.y1) return false;
    if (c.z1 < this.z0 || c.z0 > this.z1) return false;
    return true;
  }

  public move(xa: number, ya: number, za: number): AABB {
    this.x0 += xa;
    this.y0 += ya;
    this.z0 += za;
    this.x1 += xa;
    this.y1 += ya;
    this.z1 += za;
    return this;
  }

  public contains(x: number, y: number, z: number): boolean {
    if (x <= this.x0 || x >= this.x1) return false;
    if (y <= this.y0 || y >= this.y1) return false;
    if (z <= this.z0 || z >= this.z1) return false;
    return true;
  }

  public getSize(): number {
    let xs = this.x1 - this.x0;
    let ys = this.y1 - this.y0;
    let zs = this.z1 - this.z0;
    return (xs + ys + zs) / 3.0;
  }

  public shrink(xa: number, ya: number, za: number): AABB {
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
    return `AABB(${this.x0},${this.y0},${this.z0} to ${this.x1},${this.y1},${this.z1})`;
  }

  public clip(a: Vec3, b: Vec3): HitResult {
    // 缓存端点坐标，避免在六个分支里反复访问对象属性
    const ax = a.x,
      ay = a.y,
      az = a.z;
    const bx = b.x,
      by = b.y,
      bz = b.z;

    // 线段方向向量（a -> b）
    const xd = bx - ax;
    const yd = by - ay;
    const zd = bz - az;

    // 与 Vec3.clipX/Y/Z 内部保持一致的判定阈值
    const EPS = 1e-7;
    const xdSq = xd * xd;
    const ydSq = yd * yd;
    const zdSq = zd * zd;

    // 缓存 AABB 边界
    const x0 = this.x0,
      y0 = this.y0,
      z0 = this.z0;
    const x1 = this.x1,
      y1 = this.y1,
      z1 = this.z1;

    // 最近交点与距离，face = -1 表示尚未命中
    let closestX = 0,
      closestY = 0,
      closestZ = 0;
    let closestDistSqr = Infinity;
    let face = -1;

    // 临时变量（复用以避免在六个分支里重复声明）
    let t = 0,
      hx = 0,
      hy = 0,
      hz = 0;
    let dx = 0,
      dy = 0,
      dz = 0,
      dSqr = 0;

    // -------------------------------------------------------------------
    // 平面 x = x0  （对应原 clipX(b, x0, xh0) + containsX(xh0)）
    // -------------------------------------------------------------------
    if (xdSq >= EPS) {
      t = (x0 - ax) / xd;
      if (t >= 0 && t <= 1) {
        hx = ax + xd * t;
        hy = ay + yd * t;
        hz = az + zd * t;
        // containsX: 交点必须在 y/z 范围内
        if (hy >= y0 && hy <= y1 && hz >= z0 && hz <= z1) {
          dx = hx - ax;
          dy = hy - ay;
          dz = hz - az;
          dSqr = dx * dx + dy * dy + dz * dz;
          if (dSqr < closestDistSqr) {
            closestDistSqr = dSqr;
            closestX = hx;
            closestY = hy;
            closestZ = hz;
            face = 4;
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // 平面 x = x1  （face = 5）
    // -------------------------------------------------------------------
    if (xdSq >= EPS) {
      t = (x1 - ax) / xd;
      if (t >= 0 && t <= 1) {
        hx = ax + xd * t;
        hy = ay + yd * t;
        hz = az + zd * t;
        if (hy >= y0 && hy <= y1 && hz >= z0 && hz <= z1) {
          dx = hx - ax;
          dy = hy - ay;
          dz = hz - az;
          dSqr = dx * dx + dy * dy + dz * dz;
          if (dSqr < closestDistSqr) {
            closestDistSqr = dSqr;
            closestX = hx;
            closestY = hy;
            closestZ = hz;
            face = 5;
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // 平面 y = y0  （face = 0，对应原 clipY + containsY）
    // -------------------------------------------------------------------
    if (ydSq >= EPS) {
      t = (y0 - ay) / yd;
      if (t >= 0 && t <= 1) {
        hx = ax + xd * t;
        hy = ay + yd * t;
        hz = az + zd * t;
        // containsY: 交点必须在 x/z 范围内
        if (hx >= x0 && hx <= x1 && hz >= z0 && hz <= z1) {
          dx = hx - ax;
          dy = hy - ay;
          dz = hz - az;
          dSqr = dx * dx + dy * dy + dz * dz;
          if (dSqr < closestDistSqr) {
            closestDistSqr = dSqr;
            closestX = hx;
            closestY = hy;
            closestZ = hz;
            face = 0;
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // 平面 y = y1  （face = 1）
    // -------------------------------------------------------------------
    if (ydSq >= EPS) {
      t = (y1 - ay) / yd;
      if (t >= 0 && t <= 1) {
        hx = ax + xd * t;
        hy = ay + yd * t;
        hz = az + zd * t;
        if (hx >= x0 && hx <= x1 && hz >= z0 && hz <= z1) {
          dx = hx - ax;
          dy = hy - ay;
          dz = hz - az;
          dSqr = dx * dx + dy * dy + dz * dz;
          if (dSqr < closestDistSqr) {
            closestDistSqr = dSqr;
            closestX = hx;
            closestY = hy;
            closestZ = hz;
            face = 1;
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // 平面 z = z0  （face = 2，对应原 clipZ + containsZ）
    // -------------------------------------------------------------------
    if (zdSq >= EPS) {
      t = (z0 - az) / zd;
      if (t >= 0 && t <= 1) {
        hx = ax + xd * t;
        hy = ay + yd * t;
        hz = az + zd * t;
        // containsZ: 交点必须在 x/y 范围内
        if (hx >= x0 && hx <= x1 && hy >= y0 && hy <= y1) {
          dx = hx - ax;
          dy = hy - ay;
          dz = hz - az;
          dSqr = dx * dx + dy * dy + dz * dz;
          if (dSqr < closestDistSqr) {
            closestDistSqr = dSqr;
            closestX = hx;
            closestY = hy;
            closestZ = hz;
            face = 2;
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // 平面 z = z1  （face = 3）
    // -------------------------------------------------------------------
    if (zdSq >= EPS) {
      t = (z1 - az) / zd;
      if (t >= 0 && t <= 1) {
        hx = ax + xd * t;
        hy = ay + yd * t;
        hz = az + zd * t;
        if (hx >= x0 && hx <= x1 && hy >= y0 && hy <= y1) {
          dx = hx - ax;
          dy = hy - ay;
          dz = hz - az;
          dSqr = dx * dx + dy * dy + dz * dz;
          if (dSqr < closestDistSqr) {
            closestDistSqr = dSqr;
            closestX = hx;
            closestY = hy;
            closestZ = hz;
            face = 3;
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // 未命中任何面 -> NO_HIT
    // -------------------------------------------------------------------
    if (face === -1) return new HitResult();

    return new HitResult(0, 0, 0, face, new Vec3(closestX, closestY, closestZ));
  }
}
