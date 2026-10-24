import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Biome,
  BiomeSource,
  BirchFeature,
  ChunkPos,
  FlatBiome,
  ForestBiome,
  PineFeature,
  RainforestBiome,
  SpruceFeature,
  SwampBiome,
  TaigaBiome,
  TreeFeature,
  initBiomes,
  type Level,
} from '@mcpe/world';
import { Random } from '@mcpe/util';
import { initTestTiles } from '../../helpers/initTestTiles';

// 全量审核 W82–W87（packages/world/src/level/biome）：
//   W82 BiomeSource；W83 FlatBiome；W84 ForestBiome；W85 RainforestBiome；
//   W86 SwampBiome；W87 TaigaBiome。
// 本轮没有运行时修改，测试用于锁定 C++ 的缓冲区怪癖与 getTreeFeature 的随机数消耗顺序。

const f = Math.fround;
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const bits = (x: number): number => {
  f32[0] = x;
  return u32[0]!;
};

/** 记录每次 nextInt 的实参，并按脚本返回；用于锁定 C++ 里“空 if 也消耗随机数”的行为 */
class ScriptedRandom extends Random {
  readonly calls: number[] = [];
  private readonly answers: number[];

  constructor(answers: number[]) {
    super(0);
    this.answers = answers.slice();
  }

  override nextInt(): number;
  override nextInt(n: number): number;
  override nextInt(n?: number): number {
    this.calls.push(n ?? -1);
    return this.answers.shift() ?? 0;
  }
}

const fakeLevel = (seed: number): Level => ({ getSeed: () => seed }) as unknown as Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles(); // Biome 的构造函数要读 Tile.grass、Tile.dirt
  initBiomes();
});

describe('BiomeSource 审核（W82）', () => {
  it('W82：四个静态常量与 C++ 的 float 值逐位相同', () => {
    expect(BiomeSource.zoom).toBe(2);
    expect(bits(BiomeSource.tempScale)).toBe(bits(f(2 / 80)));
    expect(bits(BiomeSource.downfallScale)).toBe(bits(f(2 / 40)));
    expect(bits(BiomeSource.noiseScale)).toBe(bits(f(1 / 4)));
  });

  it('W82：getBiomeChunk 与 getBiome(x<<4, z<<4) 同源，getBiome 取 1×1 区块的第 0 项', () => {
    const bs = new BiomeSource(fakeLevel(12345));
    const a = bs.getBiomeChunk(new ChunkPos(7, -3));
    expect(a).toBeInstanceOf(Biome);
    expect(bs.getBiome(7 << 4, -3 << 4)).toBe(a);
    expect(bs.getBiomeBlock(7 << 4, -3 << 4, 1, 1)[0]).toBe(a);
  });

  it('W82：getTemperatureBlock 忽略传入缓冲区，写回成员数组（C++ 原样）', () => {
    const bs = new BiomeSource(fakeLevel(987));
    const passed = new Float32Array(3);
    const r = bs.getTemperatureBlock(passed, 0, 0, 16, 16);
    expect(r).toBe(bs.temperatures);
    expect(r).not.toBe(passed);
    expect(r.length).toBe(256);
  });

  it('W82：getDownfallBlock 宽高都传 w（忽略 h），与 C++ 相同', () => {
    const bs = new BiomeSource(fakeLevel(987));
    const r = bs.getDownfallBlock(null, 0, 0, 4, 1);
    expect(r).toBe(bs.downfalls);
    expect(r.length).toBe(16); // w × w，而不是 w × h
  });

  it('W82：getBiomeBlock 复用同一个成员数组，缓冲区不随 w 缩小（C++ 只换指针不缩容）', () => {
    const bs = new BiomeSource(fakeLevel(2024));
    const first = bs.getBiomeBlock(0, 0, 4, 4);
    const second = bs.getBiomeBlock(16, 16, 4, 4);
    expect(second).toBe(first);
    expect(bs.temperatures!.length).toBe(256); // 构造时分配 16×16，之后一直复用
    expect(bs.downfalls!.length).toBe(16); // 初值 NULL，首次 getRegion 按当次 4×4 分配
    expect(first.length).toBe(256);
  });
});

describe('子群系审核（W83–W87）', () => {
  it('W84：ForestBiome 1/5 出白桦，只消耗一次 nextInt(5)', () => {
    const rnd = new ScriptedRandom([0]);
    const feat = new ForestBiome().getTreeFeature(rnd);
    expect(feat).toBeInstanceOf(BirchFeature);
    expect(rnd.calls).toEqual([5]);
  });

  it('W84：ForestBiome 其余情况仍取一次 nextInt(3)（空分支），再返回橡树', () => {
    for (const answer of [0, 1, 2]) {
      const rnd = new ScriptedRandom([1, answer]);
      const feat = new ForestBiome().getTreeFeature(rnd);
      expect(feat!.constructor).toBe(TreeFeature);
      expect(rnd.calls).toEqual([5, 3]); // nextInt(3) 的返回值不影响结果，但必须消耗
    }
  });

  it('W85：RainforestBiome 固定返回橡树，但每次都先消耗一次 nextInt(3)', () => {
    for (const answer of [0, 1, 2]) {
      const rnd = new ScriptedRandom([answer]);
      const feat = new RainforestBiome().getTreeFeature(rnd);
      expect(feat!.constructor).toBe(TreeFeature);
      expect(rnd.calls).toEqual([3]);
    }
  });

  it('W87：TaigaBiome 1/3 松树，否则云杉', () => {
    const r0 = new ScriptedRandom([0]);
    expect(new TaigaBiome().getTreeFeature(r0)).toBeInstanceOf(PineFeature);
    expect(r0.calls).toEqual([3]);

    const r1 = new ScriptedRandom([1]);
    expect(new TaigaBiome().getTreeFeature(r1)).toBeInstanceOf(SpruceFeature);
    expect(r1.calls).toEqual([3]);
  });

  it('W83/W86：FlatBiome、SwampBiome 是空类，没有重写任何方法', () => {
    expect(Object.getOwnPropertyNames(FlatBiome.prototype)).toEqual(['constructor']);
    expect(Object.getOwnPropertyNames(SwampBiome.prototype)).toEqual(['constructor']);
    expect(FlatBiome.prototype.getTreeFeature).toBe(Biome.prototype.getTreeFeature);
    expect(SwampBiome.prototype.getTreeFeature).toBe(Biome.prototype.getTreeFeature);

    // 基类 getTreeFeature 先消耗一次 nextInt(10)（空分支），再返回橡树
    const rnd = new ScriptedRandom([0]);
    const feat = new FlatBiome().getTreeFeature(rnd);
    expect(feat!.constructor).toBe(TreeFeature);
    expect(rnd.calls).toEqual([10]);
  });
});
