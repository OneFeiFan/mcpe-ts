import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';

const f = Math.fround;
import { FallingTile, initItems, type Level, Tile } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D1：FallingTile（落沙）。**这个类没有黄金样本** —— 落沙是行为不是数值，
// 属 golden-sample 技能里的第三档。判据就是这个文件：起一个**真 Level**
// （headlessLevel 的 createFlatLevel，不是替身），真的 addEntity + tickEntities。
//
// ⚠ 平坦世界**只在区块 7–9 那块 3×3 平台上有地形**（FlatChunkSource.ts:16-46），
// 区块 x/z 112..159；其余区块全是空气。所以测试点必须落在那块平台上 ——
// 一开始我写在 (40,40)，那儿本来就是空的，落沙会一直掉到出界。
// 平台的地层是固定的：y0 基岩、y1..59 石头、y60..62 泥土、y63 草 ——
// 所以地表顶上第一格空位是 **y=64**，下面所有断言都建立在这个已知高度上。

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

/** 把某处清空，免得跨用例互相影响 */
const clearColumn = (): void => {
  for (let y = 64; y <= 100; y++) level.setTile(X, y, Z, 0);
};

describe('FallingTile（落沙）', () => {
  it('第一刻就把原位置的方块清掉，然后一路往下落，落地时把方块放回地面并自己消失', () => {
    clearColumn();
    // 要落的那个方块：放在 y=70，实体站在它上面
    level.setTile(X, 70, Z, Tile.sand.id);
    const e = new FallingTile(level, X + 0.5, 70.5, Z + 0.5, Tile.sand.id, 0);
    expect(level.addEntity(e)).toBe(true);
    expect(Tile.tiles[level.getTile(X, 70, Z)]!.id).toBe(Tile.sand.id);

    // 第一刻：time 从 0 变 1，走到 `if (time == 1)` 那支 —— 原位置的方块与 tile 相同，清掉
    level.tickEntities();
    expect(e.time).toBe(1);
    expect(level.getTile(X, 70, Z)).toBe(0);

    // 往下落：每一刻 y 都在减（重力 0.04，逐次 ×0.98）
    const yAfterFirst = e.y;
    level.tickEntities();
    expect(e.y).toBeLessThan(yAfterFirst);

    // 一直 tick 到它落地
    let ticks = 2;
    while (!e.removed && ticks < 200) {
      level.tickEntities();
      ticks++;
    }

    expect(e.removed).toBe(true);
    // 落地的判断是 onGround —— 实体脚底贴在被 move() 挡住的方块顶上，
    // y = 地表顶(64) + heightOffset(0.98/2)，floor 之后正好是 64
    expect(Mth.floor(e.y)).toBe(64);
    expect(level.getTile(X, 64, Z)).toBe(Tile.sand.id);
    // 落点下面那格还是草，没被穿过去
    expect(level.getTile(X, 63, Z)).toBe(Tile.grass.id);
  });

  it('每一刻的速度逐位确定（钉住运算顺序与结果侧的收口）', () => {
    clearColumn();
    level.setTile(X, 70, Z, Tile.sand.id);
    const e = new FallingTile(level, X + 0.5, 70.5, Z + 0.5, Tile.sand.id, 0);
    level.addEntity(e);

    // C++ 那三句是：`yd -= 0.04f;` → `move(...)` → `xd *= 0.98f; yd *= 0.98f; zd *= 0.98f;`
    // 这里把每一步都按 C++ 的字面量类型写出来，钉住**运算顺序与结果侧的收口**。
    //
    // ⚠ 有一条要说清楚，别把它当成"钉住了 `0.04f` 这个字面量"：
    //   把 `f(this.yd - f(0.04))` 改成 `f(this.yd - 0.04)`（漏包字面量），**这个类上观测不出差别**。
    //   实测：`0.04` 与 `f(0.04)` 差 8.94e-10，而 `yd` 收敛在 -1.96 附近、那儿的 float 间距是 1.19e-7 ——
    //   差一个 ULP 的约 1/130，永远翻不过去；起始值 0 那次更彻底，`0 - x` 是精确的，两次舍入结果相同。
    //   所以包 `f()` 是**忠实的照抄**，但**没法用断言证明**。真拿它做扰动，会得到一个假绿。
    level.tickEntities();
    expect(e.yd).toBe(f(f(0 - f(0.04)) * f(0.98)));
    // （这里不断言 e.y —— 它是 move() 里 `bb.y0 + heightOffset - ySlideOffset` 反算回来的，
    //   精确路径是 Entity.move 的事，不归这个类管；钉 yd 就够表达"字面量是 float"。）

    level.tickEntities();
    expect(e.yd).toBe(f(f(f(f(0 - f(0.04)) * f(0.98)) - f(0.04)) * f(0.98)));
  });

  it('原位置的方块和 tile 对不上时，第一刻就自己消失（不掉下去）', () => {
    clearColumn();
    // 故意不在那个位置放方块 —— getTile 会是空气，与 tile 不等
    const e = new FallingTile(level, X + 0.5, 70.5, Z + 0.5, Tile.sand.id, 0);
    level.addEntity(e);
    level.tickEntities();
    expect(e.removed).toBe(true);
    expect(level.getTile(X, 64, Z)).toBe(0); // 什么都没放下来
  });

  it('tile 为 0 时第一刻就消失（tick 开头那条 `if (tile == 0)`）', () => {
    clearColumn();
    const e = new FallingTile(level, X + 0.5, 70.5, Z + 0.5, 0, 0);
    level.addEntity(e);
    level.tickEntities();
    expect(e.removed).toBe(true);
  });

  it('isPickable 跟着 removed 走', () => {
    clearColumn();
    const e = new FallingTile(level, X + 0.5, 70.5, Z + 0.5, Tile.sand.id, 0);
    expect(e.isPickable()).toBe(true);
    e.remove();
    expect(e.isPickable()).toBe(false);
  });

  it('临时实体：两个构造的字段与碰撞盒', () => {
    clearColumn();
    // 六参构造：设了位置，并把 xo/xOld 一起对齐（不然第一帧会从原点插值过来）
    const a = new FallingTile(level, 1.5, 71.5, 2.5, Tile.sand.id, 3);
    expect([a.tile, a.data, a.time]).toEqual([Tile.sand.id, 3, 0]);
    expect([a.x, a.y, a.z]).toEqual([1.5, 71.5, 2.5]);
    expect([a.xo, a.xOld, a.yo, a.yOld, a.zo, a.zOld]).toEqual([1.5, 1.5, 71.5, 71.5, 2.5, 2.5]);
    // ⚠ 0.98f 是十进制字面量，得写成 f(0.98) —— 直接写 0.98 是 double，差半个 ULP
    expect([a.bbWidth, a.bbHeight]).toEqual([Math.fround(0.98), Math.fround(0.98)]);
    expect(a.heightOffset).toBeCloseTo(0.49);
    expect([a.xd, a.yd, a.zd]).toEqual([0, 0, 0]);

    // 单参构造：tile/data 归零，不调 setPos（停在原点）
    const b = new FallingTile(level);
    expect([b.tile, b.data, b.time]).toEqual([0, 0, 0]);
    expect([b.x, b.y, b.z]).toEqual([0, 0, 0]);
  });

  it('存档往返：Tile/Data/Time 三个字节；⚠ tile > 127 读回来是负数（原样行为，不是笔误）', () => {
    clearColumn();
    const e = new FallingTile(level, X + 0.5, 70.5, Z + 0.5, Tile.sand.id, 7);
    e.time = 9;
    const tag = new CompoundTag();
    e.save(tag);

    const back = new FallingTile(level);
    back.load(tag);
    expect([back.tile, back.data, back.time]).toEqual([Tile.sand.id, 7, 9]);

    // C++ 的 readAdditionalSaveData 是 `tile = tag->getByte("Tile")` —— **没有 `& 0xff`**。
    // getByte 给的是有符号 char，所以 200 读回来是 200-256 = -56。
    // 同批的 Arrow / Throwable 都带 `& 0xff`，只有这里不带 —— 不一致是原样，钉住它。
    const hi = new FallingTile(level);
    const hiTag = new CompoundTag();
    hi.tile = 200;
    hi.save(hiTag);
    const hiBack = new FallingTile(level);
    hiBack.load(hiTag);
    expect(hiBack.tile).toBe(200 - 256);
  });
});
