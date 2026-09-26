import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Random } from '@mcpe/util';
import { ImprovedNoise, PerlinNoise } from '@mcpe/world';

// 真值来自 tools/golden/harness_synth.cpp（参考源码 levelgen/synth 的 ImprovedNoise.cpp、PerlinNoise.cpp、Synth.cpp，x86-64 上生成）
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/synth.json', import.meta.url), 'utf8'));
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const bits = (x: number): number => { f32[0] = x; return u32[0]!; };
const fl = (b: number): number => { u32[0] = b; return f32[0]!; };
const allBits = (a: Float32Array): number[] => Array.from(a, bits);

describe('ImprovedNoise 与 C++ 逐位一致（种子链）', () => {
  const n = new ImprovedNoise(new Random(12345));
  it('偏移、置换表 hashCode', () => {
    expect([n.xo, n.yo, n.zo].map(bits)).toEqual(G.improvedOffsets);
    expect(n.hashCode()).toBe(G.improvedHash);
  });
  it('noise：300 个随机点 + 53 个边界点（整数、-0、跨整数、超出 int 范围）', () => {
    const bad = (G.noise as [number, number, number, number][]).find(([x, y, z, r]) => bits(n.noise(fl(x), fl(y), fl(z))) !== r);
    expect(bad).toBeUndefined();
  });
  it('二维 getValue', () => {
    const bad = (G.noise2d as [number, number, number][]).find(([x, y, r]) => bits(n.getValue(fl(x), fl(y))) !== r);
    expect(bad).toBeUndefined();
  });
  it('默认构造（内部用 Random(1)）', () => {
    const d = new ImprovedNoise();
    expect([d.xo, d.yo, d.zo, d.noise(1.5, -2.25, 3.125)].map(bits)).toEqual(G.improvedDefault);
    expect(d.hashCode()).toBe(G.improvedDefaultHash);
  });
});

describe('PerlinNoise 与 C++ 逐位一致（种子链）', () => {
  it('4 层：二维、三维取值与 hashCode', () => {
    const pn = new PerlinNoise(new Random(42), 4);
    expect((G.perlin2d as [number, number, number][]).find(([x, y, r]) => bits(pn.getValue(fl(x), fl(y))) !== r)).toBeUndefined();
    expect((G.perlin3d as [number, number, number, number][]).find(([x, y, z, r]) => bits(pn.getValue(fl(x), fl(y), fl(z))) !== r)).toBeUndefined();
    expect(pn.hashCode()).toBe(G.perlinHash);
  });
  it('16 层三维 getRegion（RandomLevelSource 主噪声的参数，各 425 个值）', () => {
    const pn = new PerlinNoise(new Random(9001), 16);
    expect(allBits(pn.getRegion(null, 16, 0, -32, 5, 17, 5, 684.412, 684.412, 684.412))).toEqual(G.region3dA);
    const s = Math.fround(684.412);
    expect(allBits(pn.getRegion(null, -48, 0, 80, 5, 17, 5, Math.fround(s / 80), Math.fround(s / 160), Math.fround(s / 80)))).toEqual(G.region3dB);
  });
  it('8 层二维 getRegion 重载（ySize 为 1 的分支，用到 grad2）', () => {
    const pn = new PerlinNoise(new Random(4), 8);
    expect(allBits(pn.getRegion(null, 128, -64, 16, 16, 0.025, 0.025, 0.25))).toEqual(G.region2dA);
    expect(allBits(pn.getRegion(null, -7, 3, 5, 5, 1.121, 1.121, 0.5))).toEqual(G.region2dB);
  });
  it('Synth.create 与 getDataSize', () => {
    const pn = new PerlinNoise(new Random(5), 2);
    const res = new Float32Array(12);
    pn.create(4, 3, res);
    expect(allBits(res)).toEqual(G.synthCreate);
    expect(pn.getDataSize(4, 3)).toBe(G.dataSize);
  });
});
