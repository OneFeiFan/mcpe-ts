import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Mth, Random } from '@mcpe/util';
import { EntityEvent, initItems, type Level, Sheep, Tile } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 全量审核 W31（packages/world/src/entity/animal/Sheep.ts）。
//
// 剪毛 / 染色 / 掉落的整体行为已由 mobs.test.ts（任务单 H6）覆盖，这里只钉审核关心的点：
//   1. W31 修复：getHeadEatPositionScale / getHeadEatAngleScale 的 float 形参 a 在入口舍入
//      （C++ 在调用边界把实参截成 float；渲染侧传来的 partial tick 是任意 double）；
//   2. getSheepColor 的阈值结构（<5 / <10 / <15 / <18）与 nextInt(500) 的短路兜底；
//   3. NumColors 怪癖值 24（sizeof(COLOR) / sizeof(Sheep*)，64 位构建，不是颜色数 16）。

const f = Math.fround;
const X = 130;
const Y = 64;
const Z = 130;

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createFlatLevel();
  initItems();
  Mth.initMth(); // getHeadEatAngleScale 走 Mth.sin 查表
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  for (let x = X - 4; x <= X + 4; x++)
    for (let z = Z - 4; z <= Z + 4; z++) {
      level.setTileNoUpdate(x, Y - 1, z, Tile.grass.id);
      for (let y = Y; y <= Y + 8; y++) level.setTileNoUpdate(x, y, z, 0);
    }
});

/** Mob::aiStep 会先跑 updateAi()（吃草判定要抽随机数）；这里只测吃动画刻的递减，把它关掉。 */
class AuditSheep extends Sheep {
  protected override updateAi(): void {}
}

function makeAuditSheep(): AuditSheep {
  const s = new AuditSheep(level);
  s.setPos(X + 0.5, Y, Z + 0.5);
  level.addEntity(s);
  return s;
}

/** handleEntityEvent(EAT_GRASS) 把 eatAnimationTick 置 40，再跑 40-e 次 aiStep 递减到 e。 */
function sheepWithEatTick(e: number): AuditSheep {
  const s = makeAuditSheep();
  s.handleEntityEvent(EntityEvent.EAT_GRASS);
  for (let i = 0; i < 40 - e; i++) s.aiStep();
  return s;
}

describe('Sheep 审核（W31）', () => {
  it('W31：getHeadEatPositionScale 的 float 形参 a 在入口先舍入', () => {
    // eatAnimationTick = 2 走 ((float)2 - a) / 4.f 分支。a 比 f(a) 大 3.7e-9，
    // 让「入口舍入（C++ 语义）」与「直接用 double（修复前）」得到不同的 float：
    //   f(f(2 - f(a)) / 4) = 0.42500001192092896；修复前 f(f(2 - a) / 4) = 0.42499998211860657。
    const s = sheepWithEatTick(2);
    expect(s.getHeadEatPositionScale(0.30000001564621925)).toBe(0.42500001192092896);
  });

  it('W31：getHeadEatAngleScale 的 float 形参 a 在入口先舍入', () => {
    // eatAnimationTick = 12 走公式分支：scale = ((float)8 - a) / 32.f。a 差半个 float ULP
    // 会让 Mth.sin 查表下标差 1：入口舍入（C++ 语义）= 0.7720704674720764；修复前
    // = 0.7720545530319214。
    const s = sheepWithEatTick(12);
    expect(s.getHeadEatAngleScale(0.20000195875763893)).toBe(0.7720704674720764);
  });

  it('位置缩放的平顶分支：eatAnimationTick ∈ [4, 36] 时恒为 1', () => {
    const s = sheepWithEatTick(20);
    expect(s.getHeadEatPositionScale(f(0.5))).toBe(1);
  });

  it('getSheepColor：阈值 <5/<10/<15/<18 → 15/7/8/12；≥18 再抽 nextInt(500)', () => {
    // DyePowderItem：BLACK=0、GRAY=8、SILVER=7、BROWN=3、PINK=9 → 15 - x = 15/7/8/12/6。
    const random = new Random(0);
    const nextInt = vi.spyOn(random, 'nextInt');
    nextInt.mockReturnValueOnce(4);
    expect(Sheep.getSheepColor(random)).toBe(15);
    nextInt.mockReturnValueOnce(9);
    expect(Sheep.getSheepColor(random)).toBe(7);
    nextInt.mockReturnValueOnce(14);
    expect(Sheep.getSheepColor(random)).toBe(8);
    nextInt.mockReturnValueOnce(17);
    expect(Sheep.getSheepColor(random)).toBe(12);
    // nextInt(100) ≥ 18 才抽 nextInt(500)：==0 掉粉色，否则白色
    nextInt.mockReturnValueOnce(18).mockReturnValueOnce(0);
    expect(Sheep.getSheepColor(random)).toBe(6);
    nextInt.mockReturnValueOnce(99).mockReturnValueOnce(1);
    expect(Sheep.getSheepColor(random)).toBe(0);
    // 短路：<18 的路径不再抽 nextInt(500)
    nextInt.mockReturnValueOnce(0);
    Sheep.getSheepColor(random);
    expect(nextInt).toHaveBeenLastCalledWith(100);
  });

  it('NumColors 怪癖：sizeof(COLOR)/sizeof(Sheep*) = 192/8 = 24，颜色表本身 16 行', () => {
    expect(Sheep.NumColors).toBe(24);
    expect(Sheep.COLOR.length).toBe(16);
    expect(Array.from(Sheep.COLOR[1]!)).toEqual([f(0.95), f(0.7), f(0.2)]);
  });
});
