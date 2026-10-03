// dev 页共用：照 NinecraftApp::init 与 Minecraft::prepareLevel 的世界部分，在浏览器里建好 demo 的平坦世界。
// 与 tests/helpers/headlessLevel.ts 对应；S9 的 Minecraft 移植完成后，这里改为直接调用 Minecraft。
import { TextureData, TileRenderer } from '@mcpe/client';
import { SharedConstants } from '@mcpe/core';
import { Mth } from '@mcpe/util';
import {
  FlatDimension,
  FoliageColor,
  GameType,
  GrassColor,
  initBiomes,
  initMaterials,
  initTiles,
  Level,
  LevelChunk,
  LevelConstants,
  LevelSettings,
  MemoryLevelStorage,
  MobCategory,
} from '@mcpe/world';

export function createDemoLevel(): Level {
  Mth.initMth();
  initMaterials();
  MobCategory.initMobCategories();
  initTiles();
  initBiomes();
  LevelChunk.ChunkBlockCount = LevelConstants.CHUNK_BLOCK_COUNT;
  // Minecraft::init 按选项改写（foliagetint、tintedSide 默认 false）
  FoliageColor.setUseTint(false);
  GrassColor.setUseTint(false);
  TileRenderer.setUseTint(false);
  const level = new Level(
    new MemoryLevelStorage(),
    'demo',
    new LevelSettings(0, GameType.Creative),
    SharedConstants.GeneratorVersion,
    new FlatDimension(),
  );
  prepareLevel(level);
  return level;
}

function prepareLevel(level: Level): void {
  if (!level.isNew()) level.setUpdateLights(false);
  const W = LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_WIDTH;
  for (let x = 8; x < W; x += LevelConstants.CHUNK_WIDTH)
    for (let z = 8; z < W; z += LevelConstants.CHUNK_WIDTH) {
      level.getTile(x, 64, z);
      if (level.isNew()) while (level.updateLights());
    }
  level.setUpdateLights(true);
  for (let x = 0; x < LevelConstants.CHUNK_CACHE_WIDTH; x++)
    for (let z = 0; z < LevelConstants.CHUNK_CACHE_WIDTH; z++) {
      const chunk = level.getChunk(x, z);
      if (chunk && !chunk.createdFromSave) {
        chunk.unsaved = false;
        chunk.clearUpdateMap();
      }
    }
  if (level.isNew()) {
    level.setInitialSpawn();
    level.saveLevelData();
    level.getChunkSource().saveAll(false);
    level.saveGame();
  } else {
    level.saveLevelData();
    level.loadEntities();
  }
  level.prepare();
}

/** 预加载一张图片，转成 TextureData（RGBA 字节，决策 D9 的同步语义） */
export async function loadImage(url: string): Promise<TextureData> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const t = new TextureData();
  t.w = img.width;
  t.h = img.height;
  t.data = new Uint8Array(g.getImageData(0, 0, img.width, img.height).data.buffer);
  return t;
}
