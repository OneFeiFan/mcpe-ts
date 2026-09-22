import type { Vec3 } from '@mcpe/math';

export interface CameraState {
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
}

export interface MeshData {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

export interface RenderWorldSnapshot {
  readonly tick: number;
}

export interface Renderer {
  render(snapshot: RenderWorldSnapshot, camera: CameraState): void;
}
