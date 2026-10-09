/**
 * 黄金样本 G16-1（任务单 H2，tools/golden/harness_pathfinder.cpp）：寻路。
 * C++ 在空世界 y = 100 搭场地，这里用平坦世界（地表 63，100 附近全是空气）搭同样的场地，
 * 以鸡为寻路主体，逐个比较 Level.findPath（两个重载）得到的节点序列（第一档：完全相等）。
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Chicken, initTileEntities, type Level, Path, Tile } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../helpers/headlessLevel';

type Case = { name: string; ok: boolean; size: number; nodes: [number, number, number][] };
const G = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/pathfinder.json', import.meta.url), 'utf8'),
) as { floor: number; cases: Case[] };
const F = G.floor;

/** 与 harness 的 Case 表逐项对应 */
const INPUT: Record<
  string,
  {
    s: [number, number, number];
    t: [number, number, number];
    maxDist: number;
    doors: boolean;
    water: boolean;
    toEntity: boolean;
  }
> = {
  open_ground: {
    s: [2.5, F + 1, 2.5],
    t: [7, F + 1, 7],
    maxDist: 16,
    doors: false,
    water: false,
    toEntity: false,
  },
  through_gap: {
    s: [2.5, F + 1, 2.5],
    t: [18, F + 1, 5],
    maxDist: 24,
    doors: false,
    water: false,
    toEntity: false,
  },
  closed_door_blocked: {
    s: [8.5, F + 1, 12.5],
    t: [13, F + 1, 12],
    maxDist: 16,
    doors: false,
    water: false,
    toEntity: false,
  },
  door_can_open: {
    s: [8.5, F + 1, 12.5],
    t: [13, F + 1, 12],
    maxDist: 16,
    doors: true,
    water: false,
    toEntity: false,
  },
  onto_step: {
    s: [12.5, F + 1, 3.5],
    t: [14, F + 2, 3],
    maxDist: 16,
    doors: false,
    water: false,
    toEntity: false,
  },
  around_fence: {
    s: [12.5, F + 1, 11.5],
    t: [16, F + 1, 11],
    maxDist: 16,
    doors: false,
    water: false,
    toEntity: false,
  },
  into_water: {
    s: [2.5, F + 1, 14.5],
    t: [5, F + 1, 17],
    maxDist: 16,
    doors: false,
    water: false,
    toEntity: false,
  },
  avoid_water: {
    s: [2.5, F + 1, 14.5],
    t: [8, F + 1, 20],
    maxDist: 16,
    doors: false,
    water: true,
    toEntity: false,
  },
  into_pit: {
    s: [16.5, F + 1, 18.5],
    t: [18, F - 1, 18],
    maxDist: 16,
    doors: false,
    water: false,
    toEntity: false,
  },
  near_lava: {
    s: [18.5, F + 1, 2.5],
    t: [22, F + 1, 6],
    maxDist: 16,
    doors: false,
    water: false,
    toEntity: false,
  },
  too_far: {
    s: [2.5, F + 1, 2.5],
    t: [22, F + 1, 22],
    maxDist: 8,
    doors: false,
    water: false,
    toEntity: false,
  },
  to_entity: {
    s: [2.5, F + 1, 20.5],
    t: [16, F + 1, 20],
    maxDist: 24,
    doors: false,
    water: false,
    toEntity: true,
  },
};

let level: Level;

function buildArena(L: Level): void {
  for (let x = -2; x < 26; x++)
    for (let z = -2; z < 26; z++) {
      for (let y = F - 3; y < F + 8; y++) L.setTileNoUpdate(x, y, z, 0);
      L.setTileNoUpdate(x, F, z, Tile.rock.id);
      L.setTileNoUpdate(x, F - 1, z, Tile.rock.id);
      L.setTileNoUpdate(x, F - 2, z, Tile.rock.id);
    }
  for (let z = 0; z < 16; z++) {
    if (z === 5 || z === 12) continue;
    L.setTileNoUpdate(10, F + 1, z, Tile.rock.id);
    L.setTileNoUpdate(10, F + 2, z, Tile.rock.id);
  }
  L.setTileAndDataNoUpdate(10, F + 1, 12, Tile.door_wood.id, 0);
  L.setTileAndDataNoUpdate(10, F + 2, 12, Tile.door_wood.id, 8);
  L.setTileNoUpdate(14, F + 1, 3, Tile.rock.id);
  for (let z = 10; z <= 12; z++) L.setTileNoUpdate(14, F + 1, z, Tile.fence.id);
  for (let x = 4; x <= 6; x++)
    for (let z = 16; z <= 18; z++) L.setTileNoUpdate(x, F, z, Tile.calmWater.id);
  for (let x = 18; x <= 19; x++)
    for (let z = 18; z <= 19; z++) {
      L.setTileNoUpdate(x, F, z, 0);
      L.setTileNoUpdate(x, F - 1, z, 0);
    }
  L.setTileNoUpdate(20, F, 4, Tile.lava.id);
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  initTileEntities();
  prepareLevel(level);
  buildArena(level);
});

describe('G16-1 寻路', () => {
  it('夹具里的用例与这里的输入表一一对应', () => {
    expect(G.cases.map((c) => c.name).sort()).toEqual(Object.keys(INPUT).sort());
  });
  for (const c of G.cases) {
    it(c.name, () => {
      const inp = INPUT[c.name]!;
      const mob = new Chicken(level);
      mob.moveTo(inp.s[0], inp.s[1], inp.s[2], 0, 0);
      const path = new Path();
      let ok: boolean;
      if (inp.toEntity) {
        const target = new Chicken(level);
        target.moveTo(inp.t[0] + 0.5, inp.t[1], inp.t[2] + 0.5, 0, 0);
        ok = level.findPathToEntity(path, mob, target, inp.maxDist, inp.doors, inp.water);
      } else {
        ok = level.findPathToTile(
          path,
          mob,
          inp.t[0],
          inp.t[1],
          inp.t[2],
          inp.maxDist,
          inp.doors,
          inp.water,
        );
      }
      const nodes: [number, number, number][] = [];
      for (let i = 0; i < path.getSize(); i++) {
        const n = path.get(i);
        nodes.push([n.x, n.y, n.z]);
      }
      expect(ok).toBe(c.ok);
      expect(path.getSize(), '路径长度').toBe(c.size);
      expect(nodes).toEqual(c.nodes);
    });
  }
});
