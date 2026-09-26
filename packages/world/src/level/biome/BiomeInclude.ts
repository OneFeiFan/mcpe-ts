/**
 * ADAPTED（ES 模块）：对应 src/world/level/biome/BiomeInclude.h。
 * C++ 的 Biome.cpp include 全部子类后在 initBiomes() 里 new；ES 模块里基类 import 子类会触发 TDZ，
 * 所以由这里集中 import 子类再注入（与 TileInclude、MaterialInclude 同一模式）。
 * 调用方一律用这里导出的 initBiomes()，顺序照 NinecraftApp::init：initTiles 之后。
 */
import { Biome } from './Biome';
import { FlatBiome } from './FlatBiome';
import { ForestBiome } from './ForestBiome';
import { RainforestBiome } from './RainforestBiome';
import { SwampBiome } from './SwampBiome';
import { TaigaBiome } from './TaigaBiome';

export function initBiomes(): void {
  Biome.initBiomes({ RainforestBiome, SwampBiome, ForestBiome, FlatBiome, TaigaBiome });
}
