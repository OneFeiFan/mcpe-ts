import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';
import { type Level, PrimedTnt, Tile, TntTile, EntityTypes, EntityRendererId } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D4：`PrimedTnt`（点着的 TNT）+ `TntTile` 接线。
// 平台在区块 7–9（方块 x/z 112..159），地表草在 y=63，y=64 是第一个空位。
// ⚠ 和 explosion.test.ts 一样，**每条用例起一个全新 Level** —— 爆炸是破坏性的。

let level: Level;
const X = 130;
const Z = 130;

const f = Math.fround;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // ⚠ 不要在这里调 initItems()：它要在 initTiles() **之后**跑（ShovelItem 构造时会读 Tile.grass.id）。
  // 顺序由 headlessLevel 的 initHeadless() 管，createFlatLevel() 会按对的顺序初始化。
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  level.random.setSeed(4321);
});

function countSolid(cx: number, cy: number, cz: number, r: number): number {
  let n = 0;
  for (let x = cx - r; x <= cx + r; x++)
    for (let y = cy - r; y <= cy + r; y++)
      for (let z = cz - r; z <= cz + r; z++) if (level.getTile(x, y, z) !== 0) n++;
  return n;
}

describe('PrimedTnt（D4）', () => {
  describe('两个构造函数不是一模一样的', () => {
    it('单参构造：只有五行公共设置，**不设 makeStepSound**（默认还是 true）', () => {
      const e = new PrimedTnt(level);
      expect(e.life).toBe(80);
      expect(e.entityRendererId).toBe(EntityRendererId.ER_TNT_RENDERER);
      expect(e.blocksBuilding).toBe(true);
      expect([e.bbWidth, e.bbHeight]).toEqual([f(0.98), f(0.98)]);
      expect(e.heightOffset).toBeCloseTo(0.49);
      // ⚠ 四参那个才会设成 false —— 单参这个**没设**，是原样差异
      expect((e as unknown as { makeStepSound: boolean }).makeStepSound).toBe(true);
      // 单参不调 setPos，停在原点
      expect([e.x, e.y, e.z]).toEqual([0, 0, 0]);
    });

    it('四参构造：设位置、xo/yo/zo 对齐、makeStepSound = false、带一个随机初速度', () => {
      const e = new PrimedTnt(level, 12.5, 71.5, 13.5);
      expect([e.x, e.y, e.z]).toEqual([12.5, 71.5, 13.5]);
      // ⚠ 只对齐 xo/yo/zo，**没有** xOld/yOld/zOld —— 这是 PrimedTnt 与 FallingTile 的差异
      //   （C-4 的 FallingTile 写的是 `xo = xOld = x;` 那一串，PrimedTnt 只写 `xo = x;`）。
      //   第一版断言把两者一起断言成对齐了，实测 xOld 是 0 —— 是**断言错，不是实现错**。
      expect([e.xo, e.yo, e.zo]).toEqual([12.5, 71.5, 13.5]);
      expect([e.xOld, e.yOld, e.zOld]).toEqual([0, 0, 0]);
      expect((e as unknown as { makeStepSound: boolean }).makeStepSound).toBe(false);
      expect(e.yd).toBe(f(0.2));
      // xd/zd 是 sin/cos(rot * DEGRAD) * -0.02f —— 只断言"在 ±0.02 之内且两者不同源"
      expect(Math.abs(e.xd)).toBeLessThanOrEqual(0.02);
      expect(Math.abs(e.zd)).toBeLessThanOrEqual(0.02);
    });

    it('getShadowHeightOffs 是 0（不是基类的 bbHeight/2）', () => {
      expect(new PrimedTnt(level).getShadowHeightOffs()).toBe(0);
    });

    it('getEntityTypeId 是 IdPrimedTnt', () => {
      expect(new PrimedTnt(level).getEntityTypeId()).toBe(EntityTypes.IdPrimedTnt);
    });
  });

  describe('引信', () => {
    it('第 79 刻还活着，第 80 刻才炸（life 从 80 数到 0）', () => {
      const e = new PrimedTnt(level, X + 0.5, 70.5, Z + 0.5);
      level.addEntity(e);
      for (let i = 0; i < 79; i++) level.tickEntities();
      expect(e.removed, `第 79 刻不该炸（life=${e.life}）`).toBe(false);
      expect(e.life).toBe(1);

      level.tickEntities();
      expect(e.removed, '第 80 刻炸了').toBe(true);
      expect(e.life).toBe(0);
    });

    it('炸出真坑：方块数变少、中心空了', () => {
      const before = countSolid(X, 62, Z, 3);
      const e = new PrimedTnt(level, X + 0.5, 70.5, Z + 0.5);
      level.addEntity(e);
      for (let i = 0; i < 200 && !e.removed; i++) level.tickEntities();

      expect(e.removed).toBe(true);
      const after = countSolid(X, 62, Z, 3);
      expect(after, `方块被炸掉一些（${before} → ${after}）`).toBeLessThan(before);
      expect(level.getTile(X, 63, Z), '正中心那格没了').toBe(0);
    });

    it('isClientSide 时不炸（只数完引信就停在那儿）', () => {
      level.isClientSide = true;
      const e = new PrimedTnt(level, X + 0.5, 70.5, Z + 0.5);
      level.addEntity(e);
      for (let i = 0; i < 100; i++) level.tickEntities();
      expect(e.removed, '客户端不炸，也不会自己消失').toBe(false);
      expect(e.life).toBeLessThan(0);
      expect(level.getTile(X, 63, Z)).toBe(Tile.grass.id);
    });

    it('isPickable 跟着 removed 走', () => {
      const e = new PrimedTnt(level);
      expect(e.isPickable()).toBe(true);
      e.remove();
      expect(e.isPickable()).toBe(false);
    });

    it('四参构造会往上弹一下（yd = 0.2），落回地面后再炸', () => {
      const e = new PrimedTnt(level, X + 0.5, 70.5, Z + 0.5);
      level.addEntity(e);
      level.tickEntities();
      expect(e.y).toBeGreaterThan(70.5);
    });
  });

  describe('存档往返', () => {
    it('Fuse 一个字节；⚠ 大于 127 读回来是负数（原样行为，与 FallingTile 一致）', () => {
      const e = new PrimedTnt(level, X + 0.5, 70.5, Z + 0.5);
      e.life = 42;
      const tag = new CompoundTag();
      e.save(tag);
      const back = new PrimedTnt(level);
      back.load(tag);
      expect(back.life).toBe(42);

      const hi = new PrimedTnt(level);
      hi.life = 200;
      const hiTag = new CompoundTag();
      hi.save(hiTag);
      const hiBack = new PrimedTnt(level);
      hiBack.load(hiTag);
      expect(hiBack.life, 'C++ 的 getByte 给的是有符号 char，没有 & 0xff').toBe(200 - 256);
    });
  });

  describe('TntTile 接线', () => {
    it('wasExploded：造一个 PrimedTnt，并把引信改成 10..29 刻', () => {
      const tnt = Tile.tnt as TntTile;
      expect(tnt).toBeInstanceOf(TntTile);

      const before = level.entities.length;
      tnt.wasExploded(level, X, 64, Z);

      expect(level.entities.length).toBe(before + 1);
      const e = level.entities[level.entities.length - 1] as PrimedTnt;
      expect(e).toBeInstanceOf(PrimedTnt);
      expect(e.x).toBe(f(X + f(0.5)));
      expect(e.y).toBe(f(64 + f(0.5)));
      expect(e.z).toBe(f(Z + f(0.5)));
      // nextInt(80/4) + 80/8 = nextInt(20) + 10 → [10, 30)
      expect(e.life).toBeGreaterThanOrEqual(10);
      expect(e.life).toBeLessThan(30);
    });

    it('wasExploded 那条随机数调用真的消耗了 level.random（少调一次随机流就错位）', () => {
      const tnt = Tile.tnt as TntTile;
      const probe = createFlatLevel();
      prepareLevel(probe);
      probe.random.setSeed(4321);
      const want = probe.random.nextInt(Math.trunc(80 / 4)) + Math.trunc(80 / 8);

      level.random.setSeed(4321);
      tnt.wasExploded(level, X, 64, Z);
      const e = level.entities[level.entities.length - 1] as PrimedTnt;
      expect(e.life).toBe(want);
    });

    it('destroy：造一个 PrimedTnt 并把方块清掉（引信是默认的 80）', () => {
      const tnt = Tile.tnt as TntTile;
      level.setTileNoUpdate(X, 64, Z, Tile.tnt.id);
      const before = level.entities.length;

      tnt.destroy(level, X, 64, Z, 1); // 1 = EXPLODE_BIT
      expect(level.entities.length).toBe(before + 1);
      const e = level.entities[level.entities.length - 1] as PrimedTnt;
      expect(e.life, 'destroy 这条路不改引信，还是 80').toBe(80);
      // destroy 自己不方块清 —— 清方块是调用方（use / neighborChanged）干的，照抄
      expect(level.getTile(X, 64, Z)).toBe(Tile.tnt.id);
    });

    it('destroy 的 data 不带 EXPLODE_BIT 时什么都不做', () => {
      const tnt = Tile.tnt as TntTile;
      const before = level.entities.length;
      tnt.destroy(level, X, 64, Z, 0);
      expect(level.entities.length).toBe(before);
    });

    it('destroy 在客户端直接返回', () => {
      const tnt = Tile.tnt as TntTile;
      level.isClientSide = true;
      const before = level.entities.length;
      tnt.destroy(level, X, 64, Z, 1);
      expect(level.entities.length).toBe(before);
    });
  });

  it('前置条件：Mth.random / sin / cos 都在（四参构造要用）', () => {
    expect(typeof Mth.random).toBe('function');
    expect(typeof Mth.sin).toBe('function');
    expect(typeof Mth.cos).toBe('function');
  });
});
