/**
 * 全量审核 W70–W76：packages/world/src/level 的 7 个小文件。
 *
 * 这组文件没有随机数、容器或整数除法；测试锁定的是：
 *  - LevelSettings 的 GameType 数值与 4 个静态方法；
 *  - LevelListener 的默认空实现、tileBrightnessChanged 的动态派发、
 *    addParticle 的 string / ParticleType.Id / 联合签名三种调用；
 *  - LevelSource 的 9 个纯虚方法名（类型级穷举）；
 *  - LevelConstants 的 8 个常量逐位值；
 *  - LightLayer 的 Sky/Block 身份与 surrounding；
 *  - FoliageColor / GrassColor 的颜色常量、useTint 开关与像素索引公式。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FoliageColor,
  GameType,
  GrassColor,
  LevelConstants,
  LevelListener,
  LevelSettings,
  LightLayer,
  ParticleType,
  type LevelSource,
} from '@mcpe/world';

describe('W70 LevelSettings', () => {
  it('GameType 与 C++ 命名空间的 4 个常量逐值一致', () => {
    expect(GameType.Undefined).toBe(-1);
    expect(GameType.Survival).toBe(0);
    expect(GameType.Creative).toBe(1);
    expect(GameType.Default).toBe(GameType.Creative);
  });

  it('构造函数与 3 个 getter；allowCheats 默认 false', () => {
    const s = new LevelSettings(123456789, GameType.Survival, true);
    expect(s.getSeed()).toBe(123456789);
    expect(s.getGameType()).toBe(GameType.Survival);
    expect(s.getAllowCheats()).toBe(true);

    const d = new LevelSettings(1, GameType.Creative);
    expect(d.getSeed()).toBe(1);
    expect(d.getGameType()).toBe(GameType.Creative);
    expect(d.getAllowCheats()).toBe(false);
  });

  it('None() 是 (-1, -1, false)', () => {
    const none = LevelSettings.None();
    expect(none.getSeed()).toBe(-1);
    expect(none.getGameType()).toBe(-1);
    expect(none.getAllowCheats()).toBe(false);
  });

  it('validateGameType 只放行 0/1，其余返回 Default(1)', () => {
    expect(LevelSettings.validateGameType(GameType.Survival)).toBe(GameType.Survival);
    expect(LevelSettings.validateGameType(GameType.Creative)).toBe(GameType.Creative);
    for (const v of [-1, 2, 99, -100]) {
      expect(LevelSettings.validateGameType(v)).toBe(GameType.Default);
    }
  });

  it('gameTypeToString 只认得 Survival/Creative', () => {
    expect(LevelSettings.gameTypeToString(GameType.Survival)).toBe('Survival');
    expect(LevelSettings.gameTypeToString(GameType.Creative)).toBe('Creative');
    expect(LevelSettings.gameTypeToString(GameType.Undefined)).toBe('Undefined');
    expect(LevelSettings.gameTypeToString(2)).toBe('Undefined');
  });
});

class RecordingLevelListener extends LevelListener {
  readonly changes: Array<[number, number, number]> = [];

  override tileChanged(x: number, y: number, z: number): void {
    this.changes.push([x, y, z]);
  }
}

describe('W71 LevelListener', () => {
  it('所有默认实现都是空操作', () => {
    const l = new LevelListener();
    expect(l.setTilesDirty(0, 0, 0, 1, 1, 1)).toBeUndefined();
    expect(l.tileChanged(0, 0, 0)).toBeUndefined();
    expect(l.tileBrightnessChanged(0, 0, 0)).toBeUndefined();
    expect(l.skyColorChanged()).toBeUndefined();
    expect(l.allChanged()).toBeUndefined();
    expect(l.playSound('a', 0, 0, 0, 1, 1)).toBeUndefined();
    expect(l.playMusic('a', 0, 0, 0, 0)).toBeUndefined();
    expect(l.playStreamingMusic('a', 0, 0, 0)).toBeUndefined();
    expect(l.tileEvent(0, 0, 0, 0, 0)).toBeUndefined();
  });

  it('tileBrightnessChanged 动态派发到子类的 tileChanged', () => {
    const l = new RecordingLevelListener();
    l.tileBrightnessChanged(1, 2, 3);
    expect(l.changes).toEqual([[1, 2, 3]]);
  });

  it('addParticle 接受 string、ParticleType.Id 以及二者的联合', () => {
    const l = new LevelListener();
    expect(l.addParticle('smoke', 0, 0, 0, 0, 0, 0, 0)).toBeUndefined();
    expect(l.addParticle(ParticleType.smoke, 0, 0, 0, 0, 0, 0, 0)).toBeUndefined();
    const id: string | ParticleType.Id = 'smoke';
    expect(l.addParticle(id, 0, 0, 0, 0, 0, 0, 0)).toBeUndefined();
  });

  it('levelEvent 的 source 允许 null（C++ Player*）', () => {
    const l = new LevelListener();
    expect(l.levelEvent(null, 0, 0, 0, 0, 0)).toBeUndefined();
  });
});

describe('W72 LevelSource', () => {
  it('9 个纯虚方法名与 C++ 头文件一一对应（类型级穷举）', () => {
    const expected: Array<keyof LevelSource> = [
      'getTile',
      'isEmptyTile',
      'getBrightness',
      'getData',
      'getMaterial',
      'isSolidRenderTile',
      'isSolidBlockingTile',
      'getBiomeSource',
      'getBiome',
    ];
    const exhaustive: Record<keyof LevelSource, true> = {
      getTile: true,
      isEmptyTile: true,
      getBrightness: true,
      getData: true,
      getMaterial: true,
      isSolidRenderTile: true,
      isSolidBlockingTile: true,
      getBiomeSource: true,
      getBiome: true,
    };
    expect(Object.keys(exhaustive).sort()).toEqual([...expected].sort());
  });
});

describe('W73 LevelConstants', () => {
  it('8 个静态常量与 LevelConstants.cpp 逐值一致', () => {
    expect(LevelConstants.CHUNK_CACHE_WIDTH).toBe(16);
    expect(LevelConstants.CHUNK_WIDTH).toBe(16);
    expect(LevelConstants.CHUNK_DEPTH).toBe(16);
    expect(LevelConstants.LEVEL_WIDTH).toBe(256);
    expect(LevelConstants.LEVEL_DEPTH).toBe(256);
    expect(LevelConstants.LEVEL_HEIGHT).toBe(128);
    expect(LevelConstants.CHUNK_COLUMNS).toBe(256);
    expect(LevelConstants.CHUNK_BLOCK_COUNT).toBe(32768);
  });

  it('派生常量与 C++ 的乘法关系一致', () => {
    expect(LevelConstants.LEVEL_WIDTH).toBe(
      LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_WIDTH,
    );
    expect(LevelConstants.LEVEL_DEPTH).toBe(
      LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_DEPTH,
    );
    expect(LevelConstants.CHUNK_COLUMNS).toBe(
      LevelConstants.CHUNK_WIDTH * LevelConstants.CHUNK_DEPTH,
    );
    expect(LevelConstants.CHUNK_BLOCK_COUNT).toBe(
      LevelConstants.CHUNK_COLUMNS * LevelConstants.LEVEL_HEIGHT,
    );
  });
});

describe('W74 LightLayer', () => {
  it('Sky/Block 的 surrounding 与身份', () => {
    expect(LightLayer.Sky.surrounding).toBe(15);
    expect(LightLayer.Block.surrounding).toBe(0);
    expect(LightLayer.Sky).not.toBe(LightLayer.Block);
    expect(LightLayer.Sky).toBe(LightLayer.Sky);
  });
});

/** 256×256 的 ARGB 像素表；值等于下标，便于反查 get() 选中的格子 */
function makePixels(): Int32Array {
  const pixels = new Int32Array(256 * 256);
  for (let i = 0; i < pixels.length; i++) pixels[i] = i;
  return pixels;
}

/** C++ `pixels[y << 8 | x]` 的下标，y = (int)((1 - rain * temp) * 255) */
function colorIndex(temp: number, rain: number): number {
  const mixed = rain * temp;
  const x = ((1 - temp) * 255) | 0;
  const y = ((1 - mixed) * 255) | 0;
  return (y << 8) | x;
}

describe('W75 FoliageColor', () => {
  beforeEach(() => {
    FoliageColor.init(makePixels());
    FoliageColor.setUseTint(true);
  });

  it('三个颜色常量逐位一致', () => {
    expect(FoliageColor.getEvergreenColor()).toBe(0x619961);
    expect(FoliageColor.getBirchColor()).toBe(0x80a755);
    expect(FoliageColor.getDefaultColor()).toBe(0x48b518);
  });

  it('useTint 默认 true，setUseTint 可改回', () => {
    expect(FoliageColor.useTint).toBe(true);
    FoliageColor.setUseTint(false);
    expect(FoliageColor.useTint).toBe(false);
    FoliageColor.setUseTint(true);
    expect(FoliageColor.useTint).toBe(true);
  });

  it('get 按 (y<<8|x) 取像素，保留 int 的符号', () => {
    expect(FoliageColor.get(1, 1)).toBe(0);
    expect(FoliageColor.get(0, 0)).toBe(65535);
    expect(FoliageColor.get(0.5, 0.5)).toBe(colorIndex(0.5, 0.5));

    const pixels = makePixels();
    pixels[colorIndex(1, 1)] = -1;
    FoliageColor.init(pixels);
    expect(FoliageColor.get(1, 1)).toBe(-1);
  });
});

describe('W76 GrassColor', () => {
  beforeEach(() => {
    GrassColor.init(makePixels());
    GrassColor.setUseTint(true);
  });

  it('useTint 默认 true，setUseTint 可改回', () => {
    expect(GrassColor.useTint).toBe(true);
    GrassColor.setUseTint(false);
    expect(GrassColor.useTint).toBe(false);
    GrassColor.setUseTint(true);
    expect(GrassColor.useTint).toBe(true);
  });

  it('get 按 (y<<8|x) 取像素，保留 int 的符号', () => {
    expect(GrassColor.get(1, 1)).toBe(0);
    expect(GrassColor.get(0, 0)).toBe(65535);
    expect(GrassColor.get(0.5, 0.5)).toBe(colorIndex(0.5, 0.5));

    const pixels = makePixels();
    pixels[colorIndex(1, 1)] = -1;
    GrassColor.init(pixels);
    expect(GrassColor.get(1, 1)).toBe(-1);
  });
});
