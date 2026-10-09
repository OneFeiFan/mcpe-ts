/**
 * 世界生成与区块重建的耗时基线（审核报告第五节）。默认不跑；手动：BENCH=1 npx vitest run tests/bench
 * 种子 123 的真实世界：生成 7×7 个区块（地形 + 洞穴峡谷 + 地物），再把中间 5×5×8 个 16³ 渲染区块重建三轮（平滑光照开）取平均。
 * （用 tsx 直接跑会撞上与 vitest 不同的模块求值顺序，所以写成 vitest 文件。）
 */
import { describe, it, vi } from 'vitest';
import { SharedConstants } from '@mcpe/core';
import { Chunk, GLES1, glSetContext, Minecraft, Tesselator } from '@mcpe/client';
import { GameType, initItems, initTileEntities, Level, LevelSettings, MemoryLevelStorage } from '@mcpe/world';
import { createFlatLevel } from '../helpers/headlessLevel';

describe('性能基线', () => {
  it('生成 + 重建', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    createFlatLevel();
    initItems();
    initTileEntities();
    const level = new Level(new MemoryLevelStorage(), 'perf', new LevelSettings(123, GameType.Survival), SharedConstants.GeneratorVersion);
    let t0 = performance.now();
    for (let cz = 2; cz <= 8; cz++) for (let cx = 2; cx <= 8; cx++) level.getChunk(cx, cz);
    const gen = performance.now() - t0;
    glSetContext(new GLES1(null));
    Tesselator.instance.init();
    Minecraft.useAmbientOcclusion = true;
    let id = 1;
    const chunks: Chunk[] = [];
    for (let cz = 3; cz <= 7; cz++)
      for (let cx = 3; cx <= 7; cx++)
        for (let cy = 0; cy < 8; cy++) chunks.push(new Chunk(level, cx * 16, cy * 16, cz * 16, 16, 0, [id++, id++, id++]));
    t0 = performance.now();
    for (let round = 0; round < 3; round++)
      for (const c of chunks) {
        c.setDirty();
        c.rebuild();
      }
    const reb = (performance.now() - t0) / 3;
    console.info(`[perf] 生成+地物 49 区块: ${gen.toFixed(0)} ms（${(gen / 49).toFixed(1)} ms/区块）`);
    console.info(`[perf] 重建 ${chunks.length} 个渲染区块（AO 开，三轮平均）: ${reb.toFixed(0)} ms（${(reb / chunks.length).toFixed(2)} ms/个）`);
  }, 300000);
});
