// 1:1 移植自 src/world/level/LevelSource.h（S2 前置）：纯虚接口
import type { Biome } from './biome/Biome';
import type { BiomeSource } from './biome/BiomeSource';
import type { Material } from './material/Material';

export interface LevelSource {
  getTile(x: number, y: number, z: number): number;
  isEmptyTile(x: number, y: number, z: number): boolean;
  getBrightness(x: number, y: number, z: number): number;
  getData(x: number, y: number, z: number): number;
  getMaterial(x: number, y: number, z: number): Material;
  isSolidRenderTile(x: number, y: number, z: number): boolean;
  isSolidBlockingTile(x: number, y: number, z: number): boolean;
  getBiomeSource(): BiomeSource;
  getBiome(x: number, z: number): Biome;
}
