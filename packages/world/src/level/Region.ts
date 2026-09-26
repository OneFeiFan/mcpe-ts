import type { LevelSource } from "./LevelSource";
import { Level } from "./Level";
import { Material } from "./material/Material";
import type { LevelChunk } from "./chunk/LevelChunk";
import type { Biome } from "./biome/Biome";
import type { BiomeSource } from "./biome/BiomeSource";
import { Tile } from "./tile/Tile";

export class Region implements LevelSource {
    private xc1: number;
    private zc1: number;
    private chunks: (LevelChunk | null)[][];
    private level: Level;

    private size_x: number;
    private size_z: number;

    constructor(level: Level, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number) {
        this.level = level;

        this.xc1 = x1 >> 4;
        this.zc1 = z1 >> 4;
        const xc2 = x2 >> 4;
        const zc2 = z2 >> 4;

        this.size_x = xc2 - this.xc1 + 1;
        this.size_z = zc2 - this.zc1 + 1;

        this.chunks = new Array<Array<LevelChunk | null>>(this.size_x);
        for (let i = 0; i < this.size_x; ++i) {
            this.chunks[i] = new Array<LevelChunk | null>(this.size_z).fill(null);
        }

        for (let xc = this.xc1; xc <= xc2; xc++) {
            for (let zc = this.zc1; zc <= zc2; zc++) {
                this.chunks[xc - this.xc1]![zc - this.zc1] = level.getChunk(xc, zc);
            }
        }
    }

    // C++ ~Region() 释放 chunks[i] 和 chunks，TS 里 GC 负责，省略。

    getTile(x: number, y: number, z: number): number {
        if (y < 0) return 0;
        if (y >= Level.DEPTH) return 0;

        const xc = (x >> 4) - this.xc1;
        const zc = (z >> 4) - this.zc1;

        if (xc < 0 || xc >= this.size_x || zc < 0 || zc >= this.size_z) {
            return 0;
        }

        const lc = this.chunks[xc]![zc];
        if (lc === null) return 0;

        return lc!.getTile(x & 15, y, z & 15);
    }

    isEmptyTile(x: number, y: number, z: number): boolean {
        // return this.getTile(x, y, z) === 0; //@todo?
        return Tile.tiles[this.getTile(x, y, z)] === null;
    }

    // getTileEntity 原代码被注释，保留注释

    getBrightness(x: number, y: number, z: number): number {
        return this.level.dimension.brightnessRamp[this.getRawBrightness(x, y, z)];
    }

    getRawBrightness(x: number, y: number, z: number): number;
    getRawBrightness(x: number, y: number, z: number, propagate: boolean): number;
    getRawBrightness(x: number, y: number, z: number, propagate?: boolean): number {
        if (propagate === undefined) propagate = true;

        if (x < -Level.MAX_LEVEL_SIZE || z < -Level.MAX_LEVEL_SIZE ||
            x >= Level.MAX_LEVEL_SIZE || z > Level.MAX_LEVEL_SIZE) {
            return Level.MAX_BRIGHTNESS;
        }

        if (propagate) {
            const id = this.getTile(x, y, z);
            if (id === Tile.stoneSlabHalf.id || id === Tile.farmland.id) {
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

        return this.chunks[xc]![zc]!.getRawBrightness(x & 15, y, z & 15, this.level.skyDarken);
    }

    getData(x: number, y: number, z: number): number {
        if (y < 0) return 0;
        if (y >= Level.DEPTH) return 0;
        const xc = (x >> 4) - this.xc1;
        const zc = (z >> 4) - this.zc1;

        return this.chunks[xc]![zc]!.getData(x & 15, y, z & 15);
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