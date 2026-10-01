import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Mth } from '@mcpe/util';
import {
  BiomeSource, Dimension, DimensionFactory, GameType, isUnregistered, LevelData, LevelSettings, NormalDayCycleDimension,
} from '@mcpe/world';
import { NormalDayCycleDimension as ViaHeaderPath } from '../../../packages/world/src/level/dimension/NormalDayCycleDimension';
import { FakeLevel } from '../../helpers/fakeLevel';
import { initTestTiles } from '../../helpers/initTestTiles';

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Mth.initMth(); // getFogColor、getSunriseColor 用查表的 Mth.cos / Mth.sin；NinecraftApp::init 第一行就是它
  initTestTiles();
});

describe('Dimension', () => {
  it('默认值与 init', () => {
    const d = new Dimension();
    const lv = new FakeLevel();
    d.init(lv);
    expect([d.level, d.foggy, d.ultraWarm, d.hasCeiling, d.id, d.FogType, d.getDimension()]).toEqual([lv, false, false, false, 0, 0, 'Overworld']);
    expect(d.brightnessRamp[15]).toBeCloseTo(0.9);
    expect([d.getTimeOfDay(12345, 0.5), d.mayRespawn(), d.isNaturalDimension()]).toEqual([1, true, false]);
  });

  it('init 创建 BiomeSource（用 level 的种子）；RandomLevelSource 未移植，调用时报出原因', () => {
    const d = new Dimension();
    const lv = new FakeLevel();
    lv.seed = 12345;
    d.init(lv);
    expect(d.biomeSource).toBeInstanceOf(BiomeSource);
    expect(isUnregistered(d.biomeSource)).toBe(false);
    expect(Number.isFinite(d.biomeSource.getTemperature(128, 128))).toBe(true); // Level.getSkyColor 每帧读它
    expect(() => d.createRandomLevelSource()).toThrow(/RandomLevelSource 尚未移植/);
  });

  it('getNew 与 DimensionFactory：创造模式用 Dimension，生存模式用有昼夜的 NormalDayCycleDimension', () => {
    expect(Dimension.getNew(Dimension.NORMAL)).not.toBeInstanceOf(NormalDayCycleDimension);
    expect(Dimension.getNew(Dimension.NORMAL_DAYCYCLE)).toBeInstanceOf(NormalDayCycleDimension);
    expect(Dimension.getNew(5)).toBeNull();
    expect(DimensionFactory.createDefaultDimension(new LevelData(new LevelSettings(1, GameType.Survival), 's'))).toBeInstanceOf(NormalDayCycleDimension);
    expect(DimensionFactory.createDefaultDimension(new LevelData(new LevelSettings(1, GameType.Creative), 'c'))).not.toBeInstanceOf(NormalDayCycleDimension);
    expect(ViaHeaderPath).toBe(NormalDayCycleDimension); // 按 C++ 头文件路径 import 得到的是同一个类
  });

  it('isValidSpawn：顶部是实心方块才行，invisible_bedrock 不行', () => {
    const d = new Dimension();
    const lv = new FakeLevel().put(0, 63, 0, 2).put(1, 63, 1, 95).put(2, 63, 2, 8);
    d.init(lv);
    expect([d.isValidSpawn(0, 0), d.isValidSpawn(1, 1), d.isValidSpawn(2, 2)]).toEqual([true, false, false]); // 水不是实心方块
  });

  it('雾色：FogType 为 0 时是 PE 的 0x80daff；正午最亮，午夜只剩底色', () => {
    const d = new Dimension();
    const noon = d.getFogColor(0, 0); // td = 0：cos(0) = 1 → br = 1
    expect([noon.x, noon.y, noon.z].map((v) => Math.round(v * 255))).toEqual([0x80, 0xda, 0xff]);
    const night = new NormalDayCycleDimension().getFogColor(0.5, 0);
    expect(night.x).toBeCloseTo((0x80 / 255) * 0.06);
    expect(new NormalDayCycleDimension().getSunriseColor(0.25, 0)).not.toBeNull(); // 日出时有颜色
    expect(d.getSunriseColor(0, 0)).toBeNull();
  });
});
