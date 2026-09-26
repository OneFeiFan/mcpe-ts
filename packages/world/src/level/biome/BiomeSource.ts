import { Random } from "@mcpe/util";
import { PerlinNoise } from "../levelgen/synth/PerlinNoise";
import { Biome } from "./Biome";
import type { Level } from "../Level";
import type { ChunkPos } from "../ChunkPos";

export class BiomeSource {
    static readonly zoom = 2 * 1;
    static readonly tempScale = BiomeSource.zoom / 80.0;
    static readonly downfallScale = BiomeSource.zoom / 40.0;
    static readonly noiseScale = 1 / 4.0;

    temperatures: Float32Array;
    downfalls: Float32Array;
    noises: Float32Array;

    lenTemperatures: number;
    lenDownfalls: number;
    lenNoises: number;
    lenBiomes: number;

    private biomes: (Biome | null)[];
    private temperatureMap: PerlinNoise | null;
    private downfallMap: PerlinNoise | null;
    private noiseMap: PerlinNoise | null;

    private rndTemperature: Random;
    private rndDownfall: Random;
    private rndNoise: Random;

    /**
     * 对应 C++ 的两个构造函数。
     * 注意：C++ 里 `BiomeSource()` 是 protected，`BiomeSource(Level*)` 是 public。
     * TS 不允许重载签名有不同可见性，此处统一为 public；无参版本仅供子类使用，
     * 外部代码请勿直接调用。
     */
    constructor();
    constructor(level: Level);
    constructor(level?: Level) {
        if (level === undefined) {
            this.temperatureMap = null;
            this.downfallMap = null;
            this.noiseMap = null;
            this.lenTemperatures = 0;
            this.lenDownfalls = 0;
            this.lenNoises = 0;
            this.lenBiomes = 0;
            this.temperatures = new Float32Array(0);
            this.downfalls = new Float32Array(0);
            this.noises = new Float32Array(0);
            this.biomes = new Array<Biome | null>(16 * 16).fill(null);
            // C++ 里 rnd* 是默认构造，TS 里给占位值
            this.rndTemperature = new Random(0);
            this.rndDownfall = new Random(0);
            this.rndNoise = new Random(0);
        } else {
            // C++: level->getSeed() * 9871 —— long 运算，可能溢出，此处按 BigInt 处理
            this.rndTemperature = new Random(level.getSeed() * 9871);
            this.rndDownfall = new Random(level.getSeed() * 39811);
            this.rndNoise = new Random(level.getSeed() * 543321);

            this.lenTemperatures = 0;
            this.lenDownfalls = 0;
            this.lenNoises = 0;
            this.lenBiomes = 0;
            this.downfalls = new Float32Array(0);
            this.noises = new Float32Array(0);
            this.biomes = new Array<Biome | null>(16 * 16).fill(null);
            this.temperatures = new Float32Array(16 * 16);

            this.temperatureMap = new PerlinNoise(this.rndTemperature, 4);
            this.downfallMap = new PerlinNoise(this.rndDownfall, 4);
            this.noiseMap = new PerlinNoise(this.rndNoise, 2);
        }
    }

    // C++ ~BiomeSource() 释放三个 map 和四个数组 —— GC 负责，省略

    getBiomeChunk(chunk: ChunkPos): Biome | null {
        return this.getBiome(chunk.x << 4, chunk.z << 4);
    }

    /** 对应 C++ 的 `getBiome(const ChunkPos&)`；重命名以避免与下面同名 overload 冲突 */
    getBiome(x: number, z: number): Biome | null;
    getBiome(chunk: ChunkPos): Biome | null;
    getBiome(a: number | ChunkPos, b?: number): Biome | null {
        if (typeof a !== "number") {
            return this.getBiome(a.x << 4, a.z << 4);
        }
        return this.getBiomeBlock(a, b!, 1, 1)[0] ?? null;
    }

    getTemperature(x: number, z: number): number {
        this.temperatures = this.temperatureMap!.getRegion(
            this.temperatures, x, z, 1, 1,
            BiomeSource.tempScale, BiomeSource.tempScale, 0.5
        );
        return this.temperatures[0]!;
    }

    /** public：从内部缓冲区返回 */
    getBiomeBlock(x: number, z: number, w: number, h: number): (Biome | null)[] {
        return this.getBiomeBlockImpl(this.biomes, x, z, w, h);
    }

    /**
     * C++ 里是 private 的 getBiomeBlock(Biome**, ...) 重载。
     * 注意参数 biomes__ 在原代码里完全未被使用（内部写的是成员 biomes）。
     */
    private getBiomeBlockImpl(
        _biomes: (Biome | null)[],
        x: number, z: number, w: number, h: number
    ): (Biome | null)[] {
        this.temperatures = this.temperatureMap!.getRegion(
            this.temperatures, x, z, w, w,
            BiomeSource.tempScale, BiomeSource.tempScale, 0.25
        );
        this.downfalls = this.downfallMap!.getRegion(
            this.downfalls, x, z, w, w,
            BiomeSource.downfallScale, BiomeSource.downfallScale, 0.3333
        );
        this.noises = this.noiseMap!.getRegion(
            this.noises, x, z, w, w,
            BiomeSource.noiseScale, BiomeSource.noiseScale, 0.588
        );

        const temperatures = this.temperatures;
        const downfalls = this.downfalls;
        const noises = this.noises;
        const biomes = this.biomes;

        let pp = 0;
        for (let yy = 0; yy < w; yy++) {
            for (let xx = 0; xx < h; xx++) {
                const noise = noises[pp]! * 1.1 + 0.5;

                let split2 = 0.01;
                let split1 = 1 - split2;
                let temperature = (temperatures[pp]! * 0.15 + 0.7) * split1 + noise * split2;
                split2 = 0.002;
                split1 = 1 - split2;
                let downfall = (downfalls[pp]! * 0.15 + 0.5) * split1 + noise * split2;
                temperature = 1 - ((1 - temperature) * (1 - temperature));
                if (temperature < 0) temperature = 0;
                if (downfall < 0) downfall = 0;
                if (temperature > 1) temperature = 1;
                if (downfall > 1) downfall = 1;

                temperatures[pp] = temperature;
                downfalls[pp] = downfall;
                biomes[pp++] = Biome.getBiome(temperature, downfall);
            }
        }

        return biomes;
    }

    getTemperatureBlock(_temperatures: Float32Array | null, x: number, z: number, w: number, h: number): Float32Array {
        const ot = this.temperatures;
        this.temperatures = this.temperatureMap!.getRegion(
            this.temperatures, x, z, w, h,
            BiomeSource.tempScale, BiomeSource.tempScale, 0.25
        );
        this.noises = this.noiseMap!.getRegion(
            this.noises, x, z, w, h,
            BiomeSource.noiseScale, BiomeSource.noiseScale, 0.588
        );

        if (ot !== this.temperatures) {
            // LOGI("tmp ptr changed\n");
        }

        const temperatures = this.temperatures;
        const noises = this.noises;

        let pp = 0;
        for (let yy = 0; yy < w; yy++) {
            for (let xx = 0; xx < h; xx++) {
                const noise = noises[pp]! * 1.1 + 0.5;

                let split2 = 0.01;
                let split1 = 1 - split2;
                let temperature = (temperatures[pp]! * 0.15 + 0.7) * split1 + noise * split2;
                temperature = 1 - ((1 - temperature) * (1 - temperature));

                if (temperature < 0) temperature = 0;
                if (temperature > 1) temperature = 1;

                temperatures[pp] = temperature;
                pp++;
            }
        }

        return this.temperatures;
    }

    getDownfallBlock(_downfalls: Float32Array | null, x: number, z: number, w: number, h: number): Float32Array {
        this.downfalls = this.downfallMap!.getRegion(
            this.downfalls, x, z, w, w,
            BiomeSource.downfallScale, BiomeSource.downfallScale, 0.5
        );
        return this.downfalls;
    }
}