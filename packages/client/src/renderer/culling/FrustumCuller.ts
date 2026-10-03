// 1:1 移植自 src/client/renderer/culling/FrustumCuller.h。构造时把当前视锥按值复制一份（C++：frustum = Frustum::getFrustum();）。
import type { AABB } from '@mcpe/world';
import { Culler } from './Culler';
import { Frustum } from './Frustum';
import { FrustumData } from './FrustumData';

export class FrustumCuller extends Culler {
  private frustum = new FrustumData();
  private xOff = 0; // C++ 未初始化，prepare 之前不该使用
  private yOff = 0;
  private zOff = 0;

  constructor() {
    super();
    this.frustum.assign(Frustum.getFrustum());
  }

  override prepare(xOff: number, yOff: number, zOff: number): void {
    this.xOff = xOff;
    this.yOff = yOff;
    this.zOff = zOff;
  }

  cubeFullyInFrustum(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ): boolean {
    return this.frustum.cubeFullyInFrustum(
      x0 - this.xOff,
      y0 - this.yOff,
      z0 - this.zOff,
      x1 - this.xOff,
      y1 - this.yOff,
      z1 - this.zOff,
    );
  }

  cubeInFrustum(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    return this.frustum.cubeInFrustum(
      x0 - this.xOff,
      y0 - this.yOff,
      z0 - this.zOff,
      x1 - this.xOff,
      y1 - this.yOff,
      z1 - this.zOff,
    );
  }

  isVisible(bb: AABB): boolean {
    return this.cubeInFrustum(bb.x0, bb.y0, bb.z0, bb.x1, bb.y1, bb.z1);
  }
}
