import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Path, PathFinder, Tile } from '@mcpe/world';
import type { Entity, LevelSource } from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';
import { initTestTiles } from '../../helpers/initTestTiles';

// 全量审核 W94（packages/world/src/level/pathfinder/PathFinder.ts）。
// W94-1 修复了 findPathToPoint 的 float 形参入口舍入（xt/yt/zt/maxDist）；
// 其余是行为锁定：isFree 的 walkable 怪癖、门/水/栅栏分支顺序、哈希节点表。

const f = Math.fround;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  initTestTiles(); // isFree 要读 Tile.stone.material
});

/** 一整层石头地面（y=0），上方全是空气 */
function makeLevel(): LevelSource {
  const level = new FakeLevel();
  for (let x = -2; x <= 5; x++) {
    for (let z = -2; z <= 5; z++) level.put(x, 0, z, Tile.rock.id);
  }
  return level as unknown as LevelSource;
}

/** PathFinder 只读这几个成员：坐标、包围盒、isInWater、level（门判断用） */
function makeEntity(x: number, y: number, z: number, inWater = false): Entity {
  return {
    x: x + 0.5,
    z: z + 0.5,
    bb: { x0: x, y0: y, z0: z },
    bbWidth: 1,
    bbHeight: 1,
    isInWater: () => inWater,
    level: null,
  } as unknown as Entity;
}

describe('PathFinder 审核（W94）', () => {
  it('W94-1：maxDist 在 float 形参入口先舍入，边界上的邻居不再算可达', () => {
    const pf = new PathFinder(makeLevel());
    // 起点 (0,1,0)，目标 (2,1,1)：东邻 (1,1,0) 到目标的距离正好是 float(sqrt(2))
    const from = makeEntity(0, 1, 0);
    const to = makeEntity(2, 1, 1);
    expect(f(Math.SQRT2)).not.toBe(Math.SQRT2);

    // 不舍入时 1.414213538 < 1.414213562 成立，东邻被当成可达，能找到路；
    // 舍入后两者相等，严格小于不成立，起点没有任何邻居 → 失败。
    expect(pf.findPathToEntity(new Path(), from, to, Math.SQRT2)).toBe(false);

    // 同一场景把 maxDist 放大就能找到路，证明失败不是场景本身走不通
    expect(pf.findPathToEntity(new Path(), from, to, 1.5)).toBe(true);
  });

  it('W94：起点在水里时跳过水柱、临时关掉 avoidWater，且不恢复（原版怪癖）', () => {
    const level = new FakeLevel();
    for (let x = -1; x <= 3; x++) {
      for (let z = -1; z <= 3; z++) level.put(x, 0, z, Tile.rock.id);
    }
    // (0,1,0) 与 (0,2,0) 是水，实体从 y=1 的水里出发
    level.put(0, 1, 0, Tile.water.id);
    level.put(0, 2, 0, Tile.water.id);
    const pf = new PathFinder(level as unknown as LevelSource);
    pf.avoidWater = true;

    const path = new Path();
    expect(pf.findPathToEntity(path, makeEntity(0, 1, 0, true), makeEntity(2, 1, 0), 10)).toBe(
      true,
    );
    // C++ 里 resetAvoidWater 记了旧值却从不恢复
    expect(pf.avoidWater).toBe(false);
  });

  it('W94：isFree 的 walkable 只算不返回，水/门/栅栏的分支顺序与 C++ 相同', () => {
    const level = new FakeLevel();
    for (let x = -1; x <= 3; x++) {
      for (let z = -1; z <= 3; z++) level.put(x, 0, z, Tile.rock.id);
    }
    const pf = new PathFinder(level as unknown as LevelSource);
    const e = makeEntity(0, 1, 0);
    const size = { x: 1, y: 1, z: 1 } as never; // 只读 x/y/z
    const isFree = (
      pf as unknown as {
        isFree(e: Entity, x: number, y: number, z: number, size: never): number;
      }
    ).isFree.bind(pf);

    expect(isFree(e, 0, 1, 0, size)).toBe(PathFinder.TYPE_OPEN);

    level.put(0, 1, 0, Tile.water.id);
    expect(isFree(e, 0, 1, 0, size)).toBe(PathFinder.TYPE_OPEN); // avoidWater=false：水算可走
    pf.avoidWater = true;
    expect(isFree(e, 0, 1, 0, size)).toBe(PathFinder.TYPE_WATER);
    pf.avoidWater = false;

    level.put(0, 1, 0, Tile.fence.id);
    expect(isFree(e, 0, 1, 0, size)).toBe(PathFinder.TYPE_FENCE);

    level.put(0, 1, 0, Tile.rock.id);
    expect(isFree(e, 0, 1, 0, size)).toBe(PathFinder.TYPE_BLOCKED);
  });

  it('W94：节点表按 createHash 查，哈希相同的坐标共用同一个节点（原版怪癖）', () => {
    const pf = new PathFinder(makeLevel());
    const getNode = (
      pf as unknown as {
        getNode(x: number, y: number, z: number): { x: number; y: number; z: number };
      }
    ).getNode.bind(pf);

    const a = getNode(1, 2, 3);
    const b = getNode(1, 2, 3);
    expect(b).toBe(a);

    // createHash 只保留 y 的低 8 位：y=2 与 y=258 哈希相同，查表会命中同一个节点
    const c = getNode(1, 258, 3);
    expect(c).toBe(a);
    expect(c.y).toBe(2); // 返回的是先前那个节点（short 截断后的 y）
  });
});
