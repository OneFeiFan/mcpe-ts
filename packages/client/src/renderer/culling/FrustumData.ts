// 1:1 移植自 src/client/renderer/culling/FrustumData.h：视锥的 6 个平面与判定。
// float m_Frustum[16][16] 只用到前 6 行、每行前 4 个数；按值拷贝（FrustumCuller 构造时复制一份）用 assign。
import type { AABB } from '@mcpe/world';

export class FrustumData {
  static readonly RIGHT = 0; // The RIGHT side of the frustum
  static readonly LEFT = 1; // The LEFT    side of the frustum
  static readonly BOTTOM = 2; // The BOTTOM side of the frustum
  static readonly TOP = 3; // The TOP side of the frustum
  static readonly BACK = 4; // The BACK   side of the frustum
  static readonly FRONT = 5; // The FRONT side of the frustum
  static readonly A = 0; // The X value of the plane's normal
  static readonly B = 1; // The Y value of the plane's normal
  static readonly C = 2; // The Z value of the plane's normal
  static readonly D = 3; // The distance the plane is from the origin

  readonly m_Frustum: Float32Array[] = Array.from({ length: 16 }, () => new Float32Array(16));
  readonly proj = new Float32Array(16);
  readonly modl = new Float32Array(16);
  readonly clip = new Float32Array(16);

  /** C++ 的拷贝赋值 */
  assign(rhs: FrustumData): this {
    for (let i = 0; i < 16; i++) this.m_Frustum[i]!.set(rhs.m_Frustum[i]!);
    this.proj.set(rhs.proj);
    this.modl.set(rhs.modl);
    this.clip.set(rhs.clip);
    return this;
  }

  pointInFrustum(x: number, y: number, z: number): boolean {
    for (let i = 0; i < 6; i++) {
      const f = this.m_Frustum[i]!;
      if (f[0]! * x + f[1]! * y + f[2]! * z + f[3]! <= 0) return false;
    }
    return true;
  }

  sphereInFrustum(x: number, y: number, z: number, radius: number): boolean {
    for (let i = 0; i < 6; i++) {
      const f = this.m_Frustum[i]!;
      if (f[0]! * x + f[1]! * y + f[2]! * z + f[3]! <= -radius) return false;
    }
    return true;
  }

  cubeFullyInFrustum(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
  ): boolean {
    for (let i = 0; i < 6; i++) {
      const f = this.m_Frustum[i]!;
      const p = (x: number, y: number, z: number) => f[0]! * x + f[1]! * y + f[2]! * z + f[3]! > 0;
      if (!p(x1, y1, z1)) return false;
      if (!p(x2, y1, z1)) return false;
      if (!p(x1, y2, z1)) return false;
      if (!p(x2, y2, z1)) return false;
      if (!p(x1, y1, z2)) return false;
      if (!p(x2, y1, z2)) return false;
      if (!p(x1, y2, z2)) return false;
      if (!p(x2, y2, z2)) return false;
    }
    return true;
  }

  cubeInFrustum(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): boolean {
    for (let i = 0; i < 6; i++) {
      const f = this.m_Frustum[i]!;
      const p = (x: number, y: number, z: number) => f[0]! * x + f[1]! * y + f[2]! * z + f[3]! > 0;
      if (p(x1, y1, z1)) continue;
      if (p(x2, y1, z1)) continue;
      if (p(x1, y2, z1)) continue;
      if (p(x2, y2, z1)) continue;
      if (p(x1, y1, z2)) continue;
      if (p(x2, y1, z2)) continue;
      if (p(x1, y2, z2)) continue;
      if (p(x2, y2, z2)) continue;
      return false;
    }
    return true;
  }

  isVisible(aabb: AABB): boolean {
    return this.cubeInFrustum(aabb.x0, aabb.y0, aabb.z0, aabb.x1, aabb.y1, aabb.z1);
  }
}
