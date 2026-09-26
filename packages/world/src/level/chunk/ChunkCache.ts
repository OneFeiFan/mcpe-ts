import { ChunkSource } from "./ChunkSource";
import { ChunkStorage } from "./storage/ChunkStorage";
import { EmptyLevelChunk } from "./EmptyLevelChunk";
import { Level } from "../Level";
import { LevelConstants } from "../LevelConstants";
import { LightLayer } from "../LightLayer";
import type { LevelChunk } from "./LevelChunk";
import type { MobCategory } from "../../entity/MobCategory";
import type { Biome } from "../biome/Biome";

export class ChunkCache extends ChunkSource {
    private static readonly MAX_SAVES = 2;

    xLast: number;
    zLast: number;

    private emptyChunk: LevelChunk;
    private source: ChunkSource | null;
    private storage: ChunkStorage | null;
    private chunks: (LevelChunk | null)[];
    private level: Level;
    private last: LevelChunk | null;

    constructor(level_: Level, storage_: ChunkStorage | null, source_: ChunkSource | null) {
        super();

        this.xLast = -999999999;
        this.zLast = -999999999;
        this.last = null;
        this.level = level_;
        this.storage = storage_;
        this.source = source_;

        this.isChunkCache = true;

        // C++: new EmptyLevelChunk(level_, NULL, 0, 0)
        this.emptyChunk = new EmptyLevelChunk(level_, null, 0, 0);

        const W = LevelConstants.CHUNK_CACHE_WIDTH;
        this.chunks = new Array<LevelChunk | null>(W * W).fill(null);
        // LOGI("Chunks allocated.");
    }

    // C++ ~ChunkCache 会 delete source / emptyChunk / chunks[i]。
    // TS 里 GC 负责回收；如果调用方需要在丢弃前做清理，请显式调用 storage 的关闭方法。

    fits(x: number, z: number): boolean {
        const W = LevelConstants.CHUNK_CACHE_WIDTH;
        return x >= 0 && z >= 0 && x < W && z < W;
    }

    override hasChunk(x: number, z: number): boolean {
        // 固定世界大小下，范围外的区块总是"存在"（emptyChunk）
        if (!this.fits(x, z)) return true;

        if (x === this.xLast && z === this.zLast && this.last !== null) {
            return true;
        }
        const W = LevelConstants.CHUNK_CACHE_WIDTH;
        const xs = x & (W - 1);
        const zs = z & (W - 1);
        const slot = xs + zs * W;
        const c = this.chunks[slot];
        return c !== null && (c === this.emptyChunk || c!.isAt(x, z));
    }

    override create(x: number, z: number): LevelChunk {
        return this.getChunk(x, z);
    }

    override getChunk(x: number, z: number): LevelChunk {
        if (x === this.xLast && z === this.zLast && this.last !== null) {
            return this.last;
        }
        if (!this.fits(x, z)) return this.emptyChunk;

        const W = LevelConstants.CHUNK_CACHE_WIDTH;
        const xs = x & (W - 1);
        const zs = z & (W - 1);
        const slot = xs + zs * W;

        if (!this.hasChunk(x, z)) {
            const oldChunk = this.chunks[slot];
            if (oldChunk !== null) {
                oldChunk!.unload();
                this.save(oldChunk!);
                this.saveEntities(oldChunk!);
            }

            let newChunk = this.load(x, z);
            let updateLights = false;
            if (newChunk === null) {
                if (this.source === null) {
                    newChunk = this.emptyChunk;
                } else {
                    // C++ 里若 source->getChunk 返回 null 会崩溃，这里用 ! 保持相同语义
                    newChunk = this.source.getChunk(x, z)!;
                }
            } else {
                updateLights = true;
            }
            this.chunks[slot] = newChunk;
            newChunk.lightLava();

            if (updateLights) {
                for (let cx = 0; cx < 16; cx++) {
                    for (let cz = 0; cz < 16; cz++) {
                        const height = this.level.getHeightmap(cx + x * 16, cz + z * 16);
                        for (let cy = height; cy >= 0; cy--) {
                            this.level.updateLight(
                                LightLayer.Sky,
                                cx + x * 16, cy, cz + z * 16,
                                cx + x * 16, cy, cz + z * 16
                            );
                            this.level.updateLight(
                                LightLayer.Block,
                                cx + x * 16 - 1, cy, cz + z * 16 - 1,
                                cx + x * 16 + 1, cy, cz + z * 16 + 1
                            );
                        }
                    }
                }
            }

            const loaded = this.chunks[slot];
            if (loaded !== null) {
                loaded.load();
            }

            const c = this.chunks[slot]!;
            if (!c.terrainPopulated
                && this.hasChunk(x + 1, z + 1)
                && this.hasChunk(x, z + 1)
                && this.hasChunk(x + 1, z)) {
                this.postProcess(this, x, z);
            }
            if (this.hasChunk(x - 1, z) && !this.getChunk(x - 1, z).terrainPopulated
                && this.hasChunk(x - 1, z + 1) && this.hasChunk(x, z + 1)
                && this.hasChunk(x - 1, z)) {
                this.postProcess(this, x - 1, z);
            }
            if (this.hasChunk(x, z - 1) && !this.getChunk(x, z - 1).terrainPopulated
                && this.hasChunk(x + 1, z - 1) && this.hasChunk(x, z - 1)
                && this.hasChunk(x + 1, z)) {
                this.postProcess(this, x, z - 1);
            }
            if (this.hasChunk(x - 1, z - 1) && !this.getChunk(x - 1, z - 1).terrainPopulated
                && this.hasChunk(x - 1, z - 1) && this.hasChunk(x, z - 1)
                && this.hasChunk(x - 1, z)) {
                this.postProcess(this, x - 1, z - 1);
            }
        }

        this.xLast = x;
        this.zLast = z;
        this.last = this.chunks[slot]!;

        return this.chunks[slot]!;
    }

    override getMobsAt(mobCategory: MobCategory, x: number, y: number, z: number): Biome.MobList {
        // C++ 直接解引用 source，若为 null 崩溃；保持相同语义
        return this.source!.getMobsAt(mobCategory, x, y, z);
    }

    override postProcess(parent: ChunkSource, x: number, z: number): void {
        if (!this.fits(x, z)) return;
        const chunk = this.getChunk(x, z);
        if (!chunk.terrainPopulated) {
            chunk.terrainPopulated = true;
            if (this.source !== null) {
                this.source.postProcess(parent, x, z);
                chunk.clearUpdateMap();
            }
        }
    }

    // C++ 里 save 被注释掉，保留注释

    override tick(): boolean {
        if (this.storage !== null) this.storage.tick();
        return this.source!.tick();
    }

    override shouldSave(): boolean {
        return true;
    }

    override gatherStats(): string {
        // 原 C++: std::stringstream -> "ChunkCache: " << W*W
        const W = LevelConstants.CHUNK_CACHE_WIDTH;
        return `ChunkCache: ${W * W}`;
    }

    override saveAll(onlyUnsaved: boolean): void {
        if (this.storage !== null) {
            // 注意：C++ 里这里用了局部变量名 chunks，屏蔽了成员 chunks。
            // TS 里改名 chunkList 避免混淆，语义相同。
            const chunkList: LevelChunk[] = [];
            const W = LevelConstants.CHUNK_CACHE_WIDTH;
            for (let z = 0; z < W; ++z) {
                for (let x = 0; x < W; ++x) {
                    const chunk = this.level.getChunk(x, z)!;
                    if (!onlyUnsaved || chunk.shouldSave(false)) {
                        chunkList.push(chunk);
                    }
                }
            }
            this.storage.saveAll(this.level, chunkList);
        }
    }

    private load(x: number, z: number): LevelChunk | null {
        if (this.storage === null) return this.emptyChunk;
        const W = LevelConstants.CHUNK_CACHE_WIDTH;
        if (x < 0 || x >= W || z < 0 || z >= W) {
            return this.emptyChunk;
        }
        const levelChunk = this.storage.load(this.level, x, z);
        if (levelChunk !== null) {
            levelChunk.lastSaveTime = this.level.getTime();
        }
        return levelChunk;
    }

    private saveEntities(levelChunk: LevelChunk): void {
        if (this.storage === null) return;
        this.storage.saveEntities(this.level, levelChunk);
    }

    private save(levelChunk: LevelChunk): void {
        if (this.storage === null) return;
        levelChunk.lastSaveTime = this.level.getTime();
        this.storage.save(this.level, levelChunk);
    }
}