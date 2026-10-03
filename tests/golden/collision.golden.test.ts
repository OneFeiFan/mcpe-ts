import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ItemEntity, ItemInstance, type Level, Tile } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../helpers/headlessLevel';

/**
 * 黄金样本 G12-2（tools/golden/harness_collision.cpp）：碰撞与运动轨迹。C++ 在空世界 y = 115 处搭场地，
 * 这里用平坦世界（地面在 63，y = 115 以上全是空气）摆同样的方块，局部几何相同。
 * 掉落物实体逐 tick 运动，比较位置、速度（容差 1e-4，第二档）与 onGround、horizontalCollision（完全相同）。
 */
type Case = { name: string; start: number[]; ticks: number[][] };
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/collision.json', import.meta.url), 'utf8')) as { floor: number; cases: Case[] };
const F = G.floor;
let level: Level;

function buildArena(level: Level): void {
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) {
      for (let y = F; y < F + 12; y++) level.setTileNoUpdate(x, y, z, 0);
      level.setTileNoUpdate(x, F, z, Tile.rock.id);
    }
  for (let x = 0; x < 4; x++) for (let z = 8; z < 12; z++) level.setTileNoUpdate(x, F, z, Tile.ice.id);
  for (let z = 0; z < 16; z++) {
    level.setTileNoUpdate(10, F + 1, z, Tile.rock.id);
    level.setTileNoUpdate(10, F + 2, z, Tile.rock.id);
  }
  level.setTileAndDataNoUpdate(4, F + 1, 4, Tile.stoneSlabHalf.id, 0);
  level.setTileAndDataNoUpdate(7, F + 1, 3, Tile.stairs_wood.id, 0);
  level.setTileNoUpdate(12, F + 1, 12, Tile.fence.id);
  for (let x = 2; x < 4; x++) for (let z = 2; z < 4; z++) level.setTileNoUpdate(x, F + 1, z, Tile.calmWater.id);
  level.setTileNoUpdate(6, F + 1, 12, Tile.web.id);
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  prepareLevel(level);
  buildArena(level);
});

describe('G12-2 碰撞与运动轨迹', () => {
  for (const c of G.cases) {
    it(c.name, () => {
      const [x, y, z, xd, yd, zd] = c.start as [number, number, number, number, number, number];
      const e = new ItemEntity(level, x, y, z, new ItemInstance(Tile.rock.id, 1, 0));
      e.xd = xd;
      e.yd = yd;
      e.zd = zd;
      c.ticks.forEach((want, t) => {
        e.tick();
        const got = [e.x, e.y, e.z, e.xd, e.yd, e.zd];
        got.forEach((v, i) => expect(Math.abs(v - want[i]!), `${c.name} 第 ${t} tick 的第 ${i} 个量（${v} 对 ${want[i]}）`).toBeLessThan(1e-4));
        expect([e.onGround ? 1 : 0, e.horizontalCollision ? 1 : 0], `${c.name} 第 ${t} tick 的标志`).toEqual([want[6], want[7]]);
      });
    });
  }
});
