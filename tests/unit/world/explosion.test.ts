import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Explosion, type Level, Tile, TilePos, TilePosSet, initItems } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D3：`Explosion` + `Level.explode`。
//
// ⚠ 这个类**没有黄金样本**（任务单 D 的约定：这批是行为/画面，第三档）。
// 判据是"无头真 Level 单测 + 浏览器场景 + 看截图"。这里用 `createFlatLevel()` 起一个**真 Level**：
// 平台在区块 7–9（方块 x/z 112..159），地表草在 y=63，下面是泥土/石头/基岩。
//
// 【为什么能钉住"逐位可重现"】`Level.random` 是 `new Random(1)`，而且爆炸要用的随机数**全走它**
// （见 Explosion.ts 文件头第 1 条），所以只要先把种子重设一次，整个坑的形状就是确定的。

let level: Level;
const X = 130;
const Z = 130;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  prepareLevel(level);
  initItems();
});

/**
 * ⚠ **每条用例起一个全新的 Level**。爆炸是破坏性的，共用同一个世界的话前一条把地形炸出个坑，
 * 后面那些"前置条件：中心是草"就全假了 —— 第一版就是这么红的（7 条挂掉）。
 * 这跟 fallingtile-wiring 那边"清一下方块就行"不一样，那边不会把地面削掉。
 */
beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  level.random.setSeed(12345);
});

/**
 * 数一块区域里的非空气方块。`r` 是半径，按整数格铺开（不按球形）。
 * `Tile.tiles[]` 是只读表，不在这里动。
 */
function countSolid(cx: number, cy: number, cz: number, r: number): number {
  let n = 0;
  for (let x = cx - r; x <= cx + r; x++)
    for (let y = cy - r; y <= cy + r; y++)
      for (let z = cz - r; z <= cz + r; z++) if (level.getTile(x, y, z) !== 0) n++;
  return n;
}

describe('Explosion（D3）', () => {
  it('炸出一个坑：中心那格被清掉，范围内的方块数明显变少，坑外还留着东西', () => {
    const before = countSolid(X, 63, Z, 4);
    expect(before, '前置条件：爆炸前这一片是有东西的').toBeGreaterThan(100);
    expect(level.getTile(X, 63, Z), '前置条件：中心是草').toBe(Tile.grass.id);

    level.explode(null, X + 0.5, 63.5, Z + 0.5, 3.1);

    const after = countSolid(X, 63, Z, 4);
    expect(level.getTile(X, 63, Z), '正中心那格没了').toBe(0);
    expect(after, `方块数变少（${before} → ${after}）`).toBeLessThan(before);
    expect(after, '不是把整片都抹平').toBeGreaterThan(0);
  });

  it('坑是个球：贴着的正上方那格也空了，而远处 6 格外的还在', () => {
    level.explode(null, X + 0.5, 63.5, Z + 0.5, 3.1);
    expect(level.getTile(X, 62, Z), '中心正下方也炸到了').toBe(0);
    expect(level.getTile(X, 63, Z + 6), '6 格外没波及（半径才 3.1）').toBe(Tile.grass.id);
  });

  it('逐位可重现：同一个种子炸两次，坑一模一样', () => {
    level.random.setSeed(999);
    level.explode(null, X + 0.5, 63.5, Z + 0.5, 4);
    const first: number[] = [];
    for (let x = X - 5; x <= X + 5; x++)
      for (let y = 60; y <= 66; y++)
        for (let z = Z - 5; z <= Z + 5; z++) first.push(level.getTile(x, y, z));

    // 换个新的 Level 重来一遍（旧的那个已经被炸烂了）
    const level2 = createFlatLevel();
    prepareLevel(level2);
    level2.random.setSeed(999);
    level2.explode(null, X + 0.5, 63.5, Z + 0.5, 4);
    const second: number[] = [];
    for (let x = X - 5; x <= X + 5; x++)
      for (let y = 60; y <= 66; y++)
        for (let z = Z - 5; z <= Z + 5; z++) second.push(level2.getTile(x, y, z));

    expect(second).toEqual(first);
    expect(first.some((t) => t === 0), '前置条件：确实炸掉了一些格子').toBe(true);
  });

  it('isClientSide 时整个 explode 直接返回，什么都不动', () => {
    const before = countSolid(X, 63, Z, 4);
    level.isClientSide = true;
    level.explode(null, X + 0.5, 63.5, Z + 0.5, 3.1);
    expect(countSolid(X, 63, Z, 4)).toBe(before);
    expect(level.getTile(X, 63, Z)).toBe(Tile.grass.id);
  });

  it('半径越大坑越大（3.1 vs 1.0）', () => {
    level.explode(null, X + 0.5, 63.5, Z + 0.5, 1);
    const small = countSolid(X, 63, Z, 4);

    const level2 = createFlatLevel();
    prepareLevel(level2);
    level2.random.setSeed(12345);
    level2.explode(null, X + 0.5, 63.5, Z + 0.5, 3.1);
    let big = 0;
    for (let x = X - 4; x <= X + 4; x++)
      for (let y = 59; y <= 67; y++)
        for (let z = Z - 4; z <= Z + 4; z++) if (level2.getTile(x, y, z) !== 0) big++;

    expect(small, '小半径留下的方块更多').toBeGreaterThan(0);
    expect(big).toBeLessThan(small);
  });

  describe('⚠ fire 参数在这一版里没有可见效果（原样行为）', () => {
    /**
     * `explode()` 末尾那段点火是**先**跑，`finalizeExplosion()` 是**后**跑，
     * 而后者会遍历同一个 `toBlow`、对每格重新 `getTile`：
     * 刚点上的火 id > 0，于是**被它自己当成要清的方块清掉了** —— 连 `spawnResources` 都跑了。
     * 所以 `fire = true` 之后世界里一格火都不会剩下。
     * 这是原版就有的顺序，不是移植错；照抄并钉住。
     */
    it('fire=true 点上的火会被 finalizeExplosion 自己清掉，一格都不剩', () => {
      level.explode(null, X + 0.5, 63.5, Z + 0.5, 3.1, true);
      expect(countFire(X, 63, Z, 6), '爆炸范围内没有火').toBe(0);
    });

    it('对照：fire=true 与 fire=false 炸出来的坑完全一样', () => {
      level.explode(null, X + 0.5, 63.5, Z + 0.5, 3.1, false);
      const noFire: number[] = [];
      for (let x = X - 4; x <= X + 4; x++)
        for (let y = 60; y <= 64; y++)
          for (let z = Z - 4; z <= Z + 4; z++) noFire.push(level.getTile(x, y, z));

      const level2 = createFlatLevel();
      prepareLevel(level2);
      level2.random.setSeed(12345);
      level2.explode(null, X + 0.5, 63.5, Z + 0.5, 3.1, true);
      const withFire: number[] = [];
      for (let x = X - 4; x <= X + 4; x++)
        for (let y = 60; y <= 64; y++)
          for (let z = Z - 4; z <= Z + 4; z++) withFire.push(level2.getTile(x, y, z));

      expect(withFire).toEqual(noFire);
    });
  });

  describe('Explosion 类本身', () => {
    it('构造：字段照 C++ 初始化列表，fire 默认 false，toBlow 是空的', () => {
      const e = new Explosion(level, null, 1, 2, 3, 4);
      expect([e.x, e.y, e.z, e.r]).toEqual([1, 2, 3, 4]);
      expect(e.source).toBeNull();
      expect(e.fire).toBe(false);
      expect(e.toBlow.size()).toBe(0);
    });

    it('explode() 之后 toBlow 里有东西，而且 r 被还原回原值（不是翻倍那个）', () => {
      // ⚠ 这里传的是 `f(3.1)`（= C++ 的 `3.1f`），不是裸的 `3.1`。
      //   还原回来的是**传进去的那个值**，所以传 double 的话断言就会差半个 ULP ——
      //   第一版就是这么红的（`expected 3.1 to be 3.0999999046325684`），是**断言错了不是实现错**。
      const org = Math.fround(3.1);
      const e = new Explosion(level, null, X + 0.5, 63.5, Z + 0.5, org);
      e.explode();
      expect(e.toBlow.size()).toBeGreaterThan(0);
      expect(e.r, 'r += r 之后又 r = org 还原了').toBe(org);
    });

    it('只 explode() 不动方块 —— 真正清方块的是 finalizeExplosion()', () => {
      const e = new Explosion(level, null, X + 0.5, 63.5, Z + 0.5, 3.1);
      e.explode();
      expect(level.getTile(X, 63, Z), 'explode() 只算 toBlow，不碰世界').toBe(Tile.grass.id);
    });
  });

  describe('TilePosSet（std::set<TilePos> 的替身）', () => {
    it('按 hashCode 升序遍历 —— 这是 std::set 的顺序，j & 7 的粒子节奏建立在它上面', () => {
      const s = new TilePosSet();
      // 故意乱序插入
      const positions = [new TilePos(5, 6, 7), new TilePos(-1, 2, 3), new TilePos(100, 0, 0)];
      for (const p of positions) s.insert(p);
      const got = s.entries().map((p) => p.hashCode());
      const want = positions.map((p) => p.hashCode()).sort((a, b) => a - b);
      expect(got).toEqual(want);
    });

    it('不同的坐标各占一个位置（没有 hashCode 碰撞时不去重）', () => {
      const s = new TilePosSet();
      s.insert(new TilePos(5, 6, 7));
      s.insert(new TilePos(5, 6, 8));
      s.insert(new TilePos(6, 6, 7));
      expect(s.size()).toBe(3);
    });

    it('⚠ hashCode 相同的不同坐标会被当成同一个元素丢掉（std::set 按 operator< 判等价）', () => {
      // TilePos.hashCode = x*8976890 + y*981131 + z，按 int32 回绕。
      // 构造一对撞上的：(1,0,-8976890) 的 hashCode 正好抵消掉 1*8976890，和 (0,0,0) 相等。
      // （先试过"在一小片坐标里搜一对"，搜不出来 —— 这两个乘数太大，小坐标根本撞不上。）
      const a = new TilePos(0, 0, 0);
      const b = new TilePos(1, 0, -8976890);
      expect(a.equals(b), '前置条件：它们确实是两个不同的坐标').toBe(false);
      expect(a.hashCode(), '前置条件：hashCode 真的撞上了').toBe(b.hashCode());

      const s = new TilePosSet();
      s.insert(a);
      s.insert(b);
      expect(s.size(), 'hashCode 撞上 → std::set 认为已存在，只留先插的那个').toBe(1);
      expect(s.entries()[0]!.equals(a)).toBe(true);
    });
  });
});


function countFire(cx: number, cy: number, cz: number, r: number): number {
  let n = 0;
  for (let x = cx - r; x <= cx + r; x++)
    for (let y = cy - r; y <= cy + r; y++)
      for (let z = cz - r; z <= cz + r; z++)
        if (level.getTile(x, y, z) === Tile.fire.id) n++;
  return n;
}
