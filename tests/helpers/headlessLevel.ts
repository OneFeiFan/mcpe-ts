import { SharedConstants } from '@mcpe/core';
import { Mth } from '@mcpe/util';
import {
  FlatDimension, GameType, initBiomes, Level, LevelChunk, LevelConstants, LevelSettings, MemoryLevelStorage, MobCategory,
} from '@mcpe/world';
import { initTestTiles } from './initTestTiles';

/**
 * 无头启动（手册 S5 的“无头启动顺序”）：照 NinecraftApp::init 的初始化顺序，再照 Minecraft::prepareLevel 的世界部分准备世界。
 * 以后 client 包里的 Minecraft.prepareLevel 移植完，这里的 prepareLevel 应与它逐行对应。
 */
let initialized = false;
export function initHeadless(): void {
  if (initialized) return;
  initialized = true;
  Mth.initMth();
  initTestTiles(); // initMaterials → initTiles
  MobCategory.initMobCategories();
  initBiomes();
  LevelChunk.ChunkBlockCount = LevelConstants.CHUNK_BLOCK_COUNT; // 32768，C++ 的静态初值是 0
}

export function createFlatLevel(): Level {
  initHeadless();
  return new Level(new MemoryLevelStorage(), 'demo', new LevelSettings(0, GameType.Creative), SharedConstants.GeneratorVersion, new FlatDimension());
}

/** Minecraft::prepareLevel 的世界部分（去掉进度条与计时） */
export function prepareLevel(level: Level): void {
  if (!level.isNew()) level.setUpdateLights(false);
  const W = LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_WIDTH;
  for (let x = 8; x < W; x += LevelConstants.CHUNK_WIDTH) {
    for (let z = 8; z < W; z += LevelConstants.CHUNK_WIDTH) {
      level.getTile(x, 64, z);
      if (level.isNew()) while (level.updateLights());
    }
  }
  level.setUpdateLights(true);
  for (let x = 0; x < LevelConstants.CHUNK_CACHE_WIDTH; x++) {
    for (let z = 0; z < LevelConstants.CHUNK_CACHE_WIDTH; z++) {
      const chunk = level.getChunk(x, z);
      if (chunk && !chunk.createdFromSave) {
        chunk.unsaved = false;
        chunk.clearUpdateMap();
      }
    }
  }
  if (level.isNew()) {
    level.setInitialSpawn(); // @note: should obviously be called from Level itself
    level.saveLevelData();
    level.getChunkSource().saveAll(false);
    level.saveGame();
  } else {
    level.saveLevelData();
    level.loadEntities();
  }
  level.prepare();
}
