// 1:1 移植自 src/world/level/Region.h 与 Region.cpp
import type { LevelSource } from './LevelSource';
import { Level } from './Level';
import { Material } from './material/Material';
import type { LevelChunk } from './chunk/LevelChunk';
import type { Biome } from './biome/Biome';
import type { BiomeSource } from './biome/BiomeSource';
import { Tile } from './tile/Tile';

export class Region implements LevelSource {
  private xc1: number;
  private zc1: number;
  private chunks: (LevelChunk | null)[];
  // ADAPTED(Cpp)（性能任务 P3）：C++ 在 getRawBrightness 里每次读 Tile::stoneSlabHalf->id /
  // Tile::farmland->id，这里构造时缓存——Region 都在 initTiles 之后才创建，id 不会变。
  private slabId: number;
  private farmlandId: number;
  private level: Level;

  private size_x: number;
  private size_z: number;

  constructor(
    level: Level,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
  ) {
    this.level = level;

    this.xc1 = x1 >> 4;
    this.zc1 = z1 >> 4;
    const xc2 = x2 >> 4;
    const zc2 = z2 >> 4;

    this.size_x = xc2 - this.xc1 + 1;
    this.size_z = zc2 - this.zc1 + 1;

    // ADAPTED(Cpp)（性能任务 P3）：C++ 的 LevelChunk*** chunks（二维）在这里压成一维数组，
    // 下标 xc * size_z + zc；取值热路径少一层间接。
    this.chunks = new Array<LevelChunk | null>(this.size_x * this.size_z).fill(null);
    for (let xc = this.xc1; xc <= xc2; xc++) {
      for (let zc = this.zc1; zc <= zc2; zc++) {
        this.chunks[(xc - this.xc1) * this.size_z + (zc - this.zc1)] = level.getChunk(xc, zc);
      }
    }
    this.slabId = Tile.stoneSlabHalf.id;
    this.farmlandId = Tile.farmland.id;
  }

  // OMIT(Cpp): ~Region()  Region.cpp:29 —— C++ 释放 chunks[i] 与 chunks，TS 由 GC 接管（R3）。

  getTile(x: number, y: number, z: number): number {
    if (y < 0) return 0;
    if (y >= Level.DEPTH) return 0;

    const xc = (x >> 4) - this.xc1;
    const zc = (z >> 4) - this.zc1;

    if (xc < 0 || xc >= this.size_x || zc < 0 || zc >= this.size_z) {
      return 0;
    }

    const lc = this.chunks[xc * this.size_z + zc]!;
    if (lc === null) return 0;

    return lc!.getTile(x & 15, y, z & 15);
  }

  isEmptyTile(x: number, y: number, z: number): boolean {
    return Tile.tiles[this.getTile(x, y, z)] === null;
  }

  // C++ Region.cpp:58-63 的 getTileEntity 整段被注释，未复制。

  getBrightness(x: number, y: number, z: number): number {
    return this.level.dimension.brightnessRamp[this.getRawBrightness(x, y, z)]!;
  }

  getRawBrightness(x: number, y: number, z: number): number;
  getRawBrightness(x: number, y: number, z: number, propagate: boolean): number;
  getRawBrightness(x: number, y: number, z: number, propagate?: boolean): number {
    if (propagate === undefined) propagate = true;

    // 怪癖保留：C++ 这里 x 用 >=、z 用 >（不对称），照抄。
    if (
      x < -Level.MAX_LEVEL_SIZE ||
      z < -Level.MAX_LEVEL_SIZE ||
      x >= Level.MAX_LEVEL_SIZE ||
      z > Level.MAX_LEVEL_SIZE
    ) {
      return Level.MAX_BRIGHTNESS;
    }

    if (propagate) {
      const id = this.getTile(x, y, z);
      if (id === this.slabId || id === this.farmlandId) {
        let br = this.getRawBrightness(x, y + 1, z, false);
        const br1 = this.getRawBrightness(x + 1, y, z, false);
        const br2 = this.getRawBrightness(x - 1, y, z, false);
        const br3 = this.getRawBrightness(x, y, z + 1, false);
        const br4 = this.getRawBrightness(x, y, z - 1, false);
        if (br1 > br) br = br1;
        if (br2 > br) br = br2;
        if (br3 > br) br = br3;
        if (br4 > br) br = br4;
        return br;
      }
    }

    if (y < 0) return 0;
    if (y >= Level.DEPTH) {
      let br = Level.MAX_BRIGHTNESS - this.level.skyDarken;
      if (br < 0) br = 0;
      return br;
    }

    const xc = (x >> 4) - this.xc1;
    const zc = (z >> 4) - this.zc1;

    return this.chunks[xc * this.size_z + zc]!.getRawBrightness(
      x & 15,
      y,
      z & 15,
      this.level.skyDarken,
    );
  }

  getData(x: number, y: number, z: number): number {
    if (y < 0) return 0;
    if (y >= Level.DEPTH) return 0;
    const xc = (x >> 4) - this.xc1;
    const zc = (z >> 4) - this.zc1;

    return this.chunks[xc * this.size_z + zc]!.getData(x & 15, y, z & 15);
  }

  getMaterial(x: number, y: number, z: number): Material {
    const t = this.getTile(x, y, z);
    if (t === 0) return Material.air;
    return Tile.tiles[t]!.material;
  }

  isSolidBlockingTile(x: number, y: number, z: number): boolean {
    const tile = Tile.tiles[this.getTile(x, y, z)];
    if (tile === null || tile === undefined) return false;
    return tile.material!.isSolidBlocking() && tile.isCubeShaped();
  }

  isSolidRenderTile(x: number, y: number, z: number): boolean {
    const tile = Tile.tiles[this.getTile(x, y, z)];
    if (tile === null || tile === undefined) return false;
    return tile.isSolidRender();
  }

  getBiome(x: number, z: number): Biome {
    return this.level.getBiome(x, z);
  }

  getBiomeSource(): BiomeSource {
    return this.level.getBiomeSource();
  }
}
