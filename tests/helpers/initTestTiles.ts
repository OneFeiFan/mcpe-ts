import { initMaterials, initTiles } from '@mcpe/world';

/**
 * 测试用的方块注册：S3 的 16 个方块类已经全部移植，直接用 TileInclude 的 initTiles()（与 NinecraftApp::init 相同）。
 * 只验证注册机制、不依赖真实子类的测试（tile-registry-mechanism、tiles-batch）仍然用各自的替身。
 */
let done = false;
export function initTestTiles(): void {
  if (done) return;
  done = true;
  initMaterials();
  initTiles();
}
