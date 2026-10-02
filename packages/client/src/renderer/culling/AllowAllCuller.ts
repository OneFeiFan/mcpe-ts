// 1:1 移植自 src/client/renderer/culling/AllowAllCuller.h
import type { AABB } from '@mcpe/world';
import { Culler } from './Culler';

export class AllowAllCuller extends Culler {
  isVisible(_bb: AABB): boolean {
    return true;
  }
  cubeFullyInFrustum(_x1: number, _y1: number, _z1: number, _x2: number, _y2: number, _z2: number): boolean {
    return true;
  }
  cubeInFrustum(_x1: number, _y1: number, _z1: number, _x2: number, _y2: number, _z2: number): boolean {
    return true;
  }
  override prepare(_xOff: number, _yOff: number, _zOff: number): void {}
}
