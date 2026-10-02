// 1:1 移植自 src/client/renderer/culling/Culler.h
import type { AABB } from '@mcpe/world';

export abstract class Culler {
  abstract isVisible(bb: AABB): boolean;
  abstract cubeInFrustum(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean;
  abstract cubeFullyInFrustum(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean;
  prepare(_xOff: number, _yOff: number, _zOff: number): void {}
}
