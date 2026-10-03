// 1:1 移植自 src/client/renderer/culling/Frustum.h 与 Frustum.cpp：用 glGetFloatv 读投影与模型视图矩阵，算出 6 个平面。
// 平面归一化用 Mth.invSqrt（Quake 的快速平方根倒数），与 C++ 相同。
import { Mth } from '@mcpe/util';
import { GL_MODELVIEW_MATRIX, GL_PROJECTION_MATRIX, glGetFloatv } from '../gles';
import { FrustumData } from './FrustumData';

const { RIGHT, LEFT, BOTTOM, TOP, BACK, FRONT, A, B, C, D } = FrustumData;

export class Frustum extends FrustumData {
  private static readonly frustum = new Frustum(); // Frustum Frustum::frustum;

  static getFrustum(): FrustumData {
    Frustum.frustum.calculateFrustum();
    return Frustum.frustum;
  }

  private normalizePlane(frustum: Float32Array[], side: number): void {
    const f = frustum[side]!;
    const invMagnitude = Mth.invSqrt(f[A]! * f[A]! + f[B]! * f[B]! + f[C]! * f[C]!);
    f[A]! *= invMagnitude;
    f[B]! *= invMagnitude;
    f[C]! *= invMagnitude;
    f[D]! *= invMagnitude;
  }

  private calculateFrustum(): void {
    const proj = this.proj,
      modl = this.modl,
      clip = this.clip,
      F = this.m_Frustum;
    glGetFloatv(GL_PROJECTION_MATRIX, proj);
    glGetFloatv(GL_MODELVIEW_MATRIX, modl);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        clip[r * 4 + c] =
          modl[r * 4]! * proj[c]! +
          modl[r * 4 + 1]! * proj[4 + c]! +
          modl[r * 4 + 2]! * proj[8 + c]! +
          modl[r * 4 + 3]! * proj[12 + c]!;
    const plane = (side: number, sign: number, k: number) => {
      F[side]![A] = clip[3]! + sign * clip[k]!;
      F[side]![B] = clip[7]! + sign * clip[4 + k]!;
      F[side]![C] = clip[11]! + sign * clip[8 + k]!;
      F[side]![D] = clip[15]! + sign * clip[12 + k]!;
      this.normalizePlane(F, side);
    };
    plane(RIGHT, -1, 0);
    plane(LEFT, 1, 0);
    plane(BOTTOM, 1, 1);
    plane(TOP, -1, 1);
    plane(BACK, -1, 2);
    plane(FRONT, 1, 2);
  }
}
