/**
 * 黄金样本 G16-2（任务单 H3，tools/golden/harness_mobai.cpp）：旧 AI（PathfinderMob.updateAi）的行为轨迹。
 * 三只鸡在围起来的场地里各自 tick 400 次，逐刻比较位置（第二档：1e-4）、yRot（1e-3 度，见下）与 onGround、isPathFinding（第一档）。
 * yRot 的容差：位置在 C++ 与 TS 之间只差 ~2e-6（第二档以内），但寻路转向用 atan2(目标 − 当前位置)，离路径点很近时
 *   角度对位置差非常敏感，实测最大偏差 1.1e-4 度；所以角度用 1e-3 度。标志（着地、是否在寻路）1200 条记录逐条完全一致。
 * 随机数与 harness 对齐：Mth 的 _mthRand.setSeed(mthSeed)、每只鸡 random.setSeed(seed)，
 * 构造时用随机数初始化的字段（ambientSoundTime、eggTime、rotA、timeOffs）构造后改成与 harness 相同的固定值。
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { _mthRand } from '@mcpe/util';
import { Chicken, initTileEntities, type Level, Tile } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../helpers/headlessLevel';

type MobRec = { start: number[]; seed: number; ticks: number[][] };
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/mobai.json', import.meta.url), 'utf8')) as { floor: number; mobs: MobRec[]; mthSeed: number };
const F = G.floor;
let level: Level;

function buildArena(L: Level): void {
  for (let x = -2; x < 26; x++)
    for (let z = -2; z < 26; z++) {
      for (let y = F - 3; y < F + 8; y++) L.setTileNoUpdate(x, y, z, 0);
      L.setTileNoUpdate(x, F, z, Tile.grass.id);
      L.setTileNoUpdate(x, F - 1, z, Tile.dirt.id);
      L.setTileNoUpdate(x, F - 2, z, Tile.rock.id);
    }
  for (let i = -2; i < 26; i++) {
    L.setTileNoUpdate(i, F + 1, -2, Tile.fence.id);
    L.setTileNoUpdate(i, F + 1, 25, Tile.fence.id);
    L.setTileNoUpdate(-2, F + 1, i, Tile.fence.id);
    L.setTileNoUpdate(25, F + 1, i, Tile.fence.id);
  }
  for (let z = 4; z < 18; z++) L.setTileNoUpdate(12, F + 1, z, Tile.rock.id);
  L.setTileNoUpdate(6, F + 1, 6, Tile.rock.id);
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  initTileEntities();
  prepareLevel(level);
  buildArena(level);
});

describe('G16-2 旧 AI 的行为轨迹', () => {
  it('三只鸡 400 刻：位置、朝向、着地、是否在寻路与 C++ 一致', () => {
    const mobs = G.mobs.map((m, i) => {
      const c = new Chicken(level);
      c.moveTo(m.start[0]!, m.start[1]!, m.start[2]!, m.start[3]!, 0);
      const ci = c as unknown as { random: { setSeed(s: number): void }; ambientSoundTime: number; eggTime: number; rotA: number; timeOffs: number };
      ci.random.setSeed(m.seed);
      ci.ambientSoundTime = -40;
      ci.eggTime = 6000;
      ci.rotA = Math.fround(0.015);
      ci.timeOffs = Math.fround(100.0 * i);
      return c;
    });
    _mthRand.setSeed(G.mthSeed);
    const T = G.mobs[0]!.ticks.length;
    const maxErr = [0, 0, 0, 0];
    for (let t = 0; t < T; t++) {
      for (let i = 0; i < mobs.length; i++) {
        const c = mobs[i]!;
        c.tick();
        const want = G.mobs[i]!.ticks[t]!;
        const got = [c.x, c.y, c.z, c.yRot];
        got.forEach((v, k) => {
          const e = Math.abs(v - want[k]!);
          if (e > maxErr[k]!) maxErr[k] = e;
          const tol = k === 3 ? 1e-3 : 1e-4;
          if (e >= tol) throw new Error(`第 ${i} 只鸡第 ${t} 刻的第 ${k} 个量：TS ${v}，C++ ${want[k]}`);
        });
        expect([c.onGround ? 1 : 0, c.isPathFinding() ? 1 : 0], `第 ${i} 只鸡第 ${t} 刻的标志`).toEqual([want[4], want[5]]);
      }
    }
    expect(maxErr[1], 'y 完全一致').toBe(0);
  });
});
