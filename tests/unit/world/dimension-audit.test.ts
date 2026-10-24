import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Mth } from '@mcpe/util';
import {
  Dimension,
  FlatChunkSource,
  FlatDimension,
  Level,
  NormalDayCycleDimension,
} from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';
import { initTestTiles } from '../../helpers/initTestTiles';

// 全量审核 W77–W79（packages/world/src/level/dimension）：
//   W77 Dimension：getSunriseColor / getFogColor 的 float 形参入口与每一步 float 运算；
//   W78 FlatDimension：NEW，无 C++ 对应，只重写 createRandomLevelSource；
//   W79 NormalDayCycleDimension：getTimeOfDay / getFogColor 的 float 逐步舍入
//       （C 库 ::cos(double)，不是查表 Mth.cos；s4 黄金样本逐位验证）。

const f = Math.fround;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  Mth.initMth(); // getSunriseColor / getFogColor 用查表的 Mth.cos / Mth.sin
  initTestTiles();
});

describe('Dimension 审核（W77–W79）', () => {
  it('W77-1：getSunriseColor 的 float 形参入口与每一步运算都舍入', () => {
    const d = new Dimension();
    // 这组输入能让“逐步 float”和“整段 double 再舍入”得到不同的 float（已用穷举脚本找到）
    const td = 0.2511422720537921;
    expect(f(td)).not.toBe(td); // 入口舍入确实被触发

    const col = d.getSunriseColor(td, 0);
    expect(col).not.toBeNull();

    const span = f(0.4);
    const tt = f(Mth.cos(f(f(f(td) * Mth.PI) * 2)) - 0.0);
    const mid = -0.0;
    const aa = f(f(f(f(tt - mid) / span) * f(0.5)) + f(0.5));
    let mix = f(1 - f(f(1 - Mth.sin(f(aa * Mth.PI))) * f(0.99)));
    mix = f(mix * mix);

    expect(Array.from(col!)).toEqual([
      f(f(aa * f(0.3)) + f(0.7)),
      f(f(f(aa * aa) * f(0.7)) + f(0.2)),
      f(f(f(aa * aa) * 0.0) + f(0.2)),
      mix,
    ]);

    // 旧写法（整段 double，只在写进 Float32Array 时舍入一次）在这组输入上结果不同
    const ttOld = Mth.cos(td * Mth.PI * 2) - 0.0;
    const aaOld = ((ttOld - mid) / 0.4) * 0.5 + 0.5;
    let mixOld = 1 - (1 - Mth.sin(aaOld * Mth.PI)) * 0.99;
    mixOld = mixOld * mixOld;
    expect(f(aaOld * aaOld * 0.7 + 0.2)).not.toBe(col![1]);
    expect(f(mixOld)).not.toBe(col![3]);
  });

  it('W77-2：getFogColor 的亮度与雾色按 float 逐步舍入', () => {
    const d = new Dimension();
    const td = 0.77185139786042;
    expect(f(td)).not.toBe(td);

    const v = d.getFogColor(td, 0);
    const br = f(f(Mth.cos(f(f(f(td) * Mth.PI) * 2)) * 2) + f(0.5));
    const rf = f(f(br * f(0.94)) + f(0.06));
    const gf = rf;
    const bf = f(f(br * f(0.91)) + f(0.09));
    const r0 = f(((0x80daff >> 16) & 0xff) / 255.0);
    const g0 = f(((0x80daff >> 8) & 0xff) / 255.0);
    const b0 = f((0x80daff & 0xff) / 255.0);
    expect([v.x, v.y, v.z]).toEqual([f(r0 * rf), f(g0 * gf), f(b0 * bf)]);

    // 旧写法（double）在这组输入下 y、z 两个分量都不同
    const brOld = Mth.cos(td * Mth.PI * 2) * 2 + 0.5;
    const gOld = (((0x80daff >> 8) & 0xff) / 255.0) * (brOld * 0.94 + 0.06);
    expect(f(gOld)).not.toBe(v.y);
  });

  it('W78：FlatDimension 只重写 createRandomLevelSource（NEW，无 C++ 对应）', () => {
    const lv = new FakeLevel();
    const d = new FlatDimension();
    d.init(lv);
    expect(d.createRandomLevelSource()).toBeInstanceOf(FlatChunkSource);
    // 其余行为沿用 Dimension
    expect(d.getTimeOfDay(0, 0)).toBe(1);
    expect(d.isNaturalDimension()).toBe(false);
  });

  it('W79-1：NormalDayCycleDimension.getFogColor 用 C 库 ::cos(double)，结果赋回 float', () => {
    const d = new NormalDayCycleDimension();
    const td = 0.20995034;
    expect(f(td)).not.toBe(td);

    const v = d.getFogColor(td, 0);
    const br = f(Math.cos(f(f(f(td) * Mth.PI) * 2)) * 2 + f(0.5));
    const rf = f(f(br * f(0.94)) + f(0.06));
    const r0 = f(((0x80daff >> 16) & 0xff) / 255.0);
    expect(v.x).toBe(f(r0 * rf));

    // 上一版误按 cosf（每一步都收口成 float）；这组输入下 x 分量与它不同
    const brCosf = f(f(f(Math.cos(f(f(f(td) * Mth.PI) * 2))) * 2) + f(0.5));
    const rfCosf = f(f(brCosf * f(0.94)) + f(0.06));
    expect(f(r0 * rfCosf)).not.toBe(v.x);
  });

  it('W79-2：NormalDayCycleDimension.getTimeOfDay 的 float 形参入口与逐步舍入', () => {
    const d = new NormalDayCycleDimension();
    const time = 0;
    const a = 0.46;
    expect(f(a)).not.toBe(a);

    const af = f(a);
    const dayStep = (time % Level.TICKS_PER_DAY) | 0;
    let td = f(f(f(dayStep + af) / Level.TICKS_PER_DAY) - f(0.25));
    if (td < 0) td = f(td + 1);
    if (td > 1) td = f(td - 1);
    const tdo = td;
    // ::cos(double)：实参先算成 float，cos 与乘加在 double 里，最后赋回 float
    td = f(1 - (Math.cos(f(td * Mth.PI)) + 1) * f(0.5));
    const expected = f(tdo + f(f(td - tdo) / 3));

    expect(d.getTimeOfDay(time, a)).toBe(expected);

    // 上一版误按 cosf 逐步舍入；这组输入下结果不同
    const dayStepOld = (time % Level.TICKS_PER_DAY) | 0;
    let tdOld = f(f(f(dayStepOld + a) / Level.TICKS_PER_DAY) - f(0.25));
    if (tdOld < 0) tdOld = f(tdOld + 1);
    if (tdOld > 1) tdOld = f(tdOld - 1);
    const tdoOld = tdOld;
    tdOld = f(1 - f(f(f(Math.cos(f(tdOld * Mth.PI))) + 1) * f(0.5)));
    expect(f(tdoOld + f(f(tdOld - tdoOld) / 3))).not.toBe(expected);
  });
});
