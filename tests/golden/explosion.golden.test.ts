import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Explosion, type Level, Tile } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../helpers/headlessLevel';

/**
 * 黄金样本 G-D3（tools/golden/harness_explosion.cpp）：爆炸。
 *
 * 这个样本是**补出来的**。D3 先只写了单测，断言是"炸出一个坑、方块数变少" ——
 * 然后拿 6 处扰动去试，**5 处照样绿**（改步长、改能量系数、去掉"只走立方体表面"、
 * toBlow 不判 remainingPower、改能量衰减）。爆炸是纯数值计算，本来就该按第一档钉死。
 *
 * 【场地怎么对齐】C++ 那边是空世界（EmptyDimension）在 y=103..115 搭一块 16×16×13 的分层场地；
 * 这里用平坦世界（地面在 63，y≥64 全是空气）在同样的高度摆同样的方块 —— 局部几何完全相同。
 * 这正是 tests/golden/collision.golden.test.ts 的做法。
 *
 * 【档位】坐标全是整数、方块 id 也是整数，所以是**第一档：逐位相等**，不留容差。
 */
type Case = {
  name: string;
  at: number[];
  r: number;
  seed: number;
  fire: number;
  toBlow: number[][];
  toBlowSize: number;
  after: number[];
};
const G = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/explosion.json', import.meta.url), 'utf8'),
) as { floor: number; arena: number[]; cases: Case[] };
const F = G.floor;
let level: Level;

/** 与 harness_explosion.cpp 的 buildArena 逐行对应（分层场地 + 黑曜石块） */
function buildArena(lv: Level): void {
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) {
      for (let y = F - 12; y <= F - 10; y++) lv.setTileNoUpdate(x, y, z, Tile.rock.id);
      for (let y = F - 9; y <= F - 2; y++) lv.setTileNoUpdate(x, y, z, Tile.dirt.id);
      for (let y = F - 1; y <= F; y++) lv.setTileNoUpdate(x, y, z, Tile.sand.id);
    }
  for (let z = 0; z < 16; z++) lv.setTileNoUpdate(0, F, z, Tile.gravel.id);
  for (let x = 6; x < 10; x++)
    for (let y = F - 6; y <= F - 4; y++)
      for (let z = 6; z < 10; z++) lv.setTileNoUpdate(x, y, z, Tile.obsidian.id);
}

/** 与 harness_explosion.cpp 的 dumpRegion 同序：x 外层、y 中层、z 内层 */
function dumpRegion(lv: Level): number[] {
  const out: number[] = [];
  for (let x = 0; x <= 15; x++)
    for (let y = F - 12; y <= F; y++) for (let z = 0; z <= 15; z++) out.push(lv.getTile(x, y, z));
  return out;
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('G-D3 爆炸', () => {
  for (const c of G.cases) {
    it(c.name, () => {
      // ⚠ 每个 case 都要一块**全新**的场地：爆炸是破坏性的，C++ 那边也是每个 case new 一个 Level
      level = createFlatLevel();
      prepareLevel(level);
      buildArena(level);
      level.random.setSeed(c.seed);

      const [x, y, z] = c.at as [number, number, number];
      const e = new Explosion(level, null, x, y, z, c.r);
      e.fire = c.fire !== 0;
      e.explode();

      // toBlow 的**内容与顺序**：std::set 按 TilePos::operator<（= hashCode）升序
      const gotToBlow = e.toBlow.entries().map((p) => [p.x, p.y, p.z]);
      expect(gotToBlow.length, `${c.name}: toBlow 格数`).toBe(c.toBlowSize);
      expect(gotToBlow, `${c.name}: toBlow 的内容与遍历顺序`).toEqual(c.toBlow);

      e.finalizeExplosion();
      expect(dumpRegion(level), `${c.name}: 炸完之后整片场地的方块`).toEqual(c.after);
    });
  }

  it('前置条件：夹具本身是有内容的（不是全 0 空跑）', () => {
    const sizes = G.cases.map((c) => c.toBlowSize);
    expect(
      sizes.some((n) => n > 50),
      `有几个 case 真的炸出了坑（${sizes.join('/')}）`,
    ).toBe(true);
    // 黑曜石那个 case 是反例：抗性 1200，一步就停，toBlow 是空的
    const obsidian = G.cases.find((c) => c.name.includes('obsidian'));
    expect(obsidian?.toBlowSize, '黑曜石挡得住').toBe(0);
  });
});
