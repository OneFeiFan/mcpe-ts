import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import { LightLayer, LightUpdate, TickDataSet, TickNextTickData, Tile } from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';
import { initTestTiles } from '../../helpers/initTestTiles';

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles();
});

describe('TickNextTickData / TickDataSet（std::set）', () => {
  it('begin() 取出的顺序与按 operator< 排序完全相同：先 delay，同一时刻按创建先后', () => {
    const r = new Random(7);
    const set = new TickDataSet();
    const all: TickNextTickData[] = [];
    for (let i = 0; i < 500; i++) {
      const td = new TickNextTickData(i, 64, 0, 8).setDelay(r.nextInt(20)); // 大量相同的 delay
      all.push(td);
      set.insert(td);
    }
    const sorted = [...all].sort((a, b) => (a.lessThan(b) ? -1 : b.lessThan(a) ? 1 : 0));
    const popped: TickNextTickData[] = [];
    while (set.size() > 0) {
      const td = set.begin()!;
      set.erase(td);
      popped.push(td);
    }
    expect(popped).toEqual(sorted);
    expect(popped.filter((t) => t.delay === 3).map((t) => t.x)).toEqual(
      all.filter((t) => t.delay === 3).map((t) => t.x),
    );
  });

  it('照 C++ 原样：同一位置、同一方块重复计划不会被去重（find 永远找不到新对象）', () => {
    const set = new TickDataSet();
    for (let i = 0; i < 3; i++) {
      const td = new TickNextTickData(1, 2, 3, 8).setDelay(100); // Level::addToTickNextTick 的写法
      if (!set.has(td)) set.insert(td);
    }
    expect(set.size()).toBe(3);
    const same = set.begin()!;
    set.insert(same); // 同一个对象：std::set 里已有等价元素，insert 不做事
    expect(set.size()).toBe(3);
  });

  it('erase 也能删除非堆顶的元素；equals 只比较坐标与方块；hashCode 按 int 回绕', () => {
    const set = new TickDataSet();
    const a = new TickNextTickData(0, 0, 0, 1).setDelay(1),
      b = new TickNextTickData(0, 0, 0, 1).setDelay(2),
      c = new TickNextTickData(0, 0, 0, 1).setDelay(3);
    [c, a, b].forEach((t) => set.insert(t));
    set.erase(b);
    expect([set.size(), set.begin()]).toEqual([2, a]);
    expect(a.equals(b)).toBe(true);
    const t = new TickNextTickData(3000, 64, -2000, 8);
    const want = Number(
      BigInt.asIntN(32, (3000n * 128n * 1024n + -2000n * 128n + 64n) * 256n + 8n),
    );
    expect(t.hashCode()).toBe(want);
  });
});

/** 照 Level.cpp 的 updateLight（1856 行）、updateLights（1816 行）、updateLightIfOtherThan（797 行）驱动 LightUpdate，省略区块检查 */
class LitLevel extends FakeLevel {
  readonly queue: LightUpdate[] = []; // Level 的 _lightUpdates（FakeLevel 已有同名的记录字段，这里换个名字）
  private maxLoop = 0;
  private maxRecurse = 0;

  override updateLight(
    layer: LightLayer,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    join = true,
  ): void {
    this.maxLoop++;
    if (this.maxLoop === 50) {
      this.maxLoop--;
      return;
    }
    const count = this.queue.length;
    if (join) {
      let toCheck = 5;
      if (toCheck > count) toCheck = count;
      for (let i = 0; i < toCheck; i++) {
        const last = this.queue[this.queue.length - i - 1]!;
        if (last.layer === layer && last.expandToContain(x0, y0, z0, x1, y1, z1)) {
          this.maxLoop--;
          return;
        }
      }
    }
    this.queue.push(new LightUpdate(layer, x0, y0, z0, x1, y1, z1));
    this.maxLoop--;
  }

  override updateLights(): boolean {
    if (this.maxRecurse >= 50) return false;
    this.maxRecurse++;
    let max = 500;
    while (this.queue.length > 0) {
      if (--max <= 0) {
        this.maxRecurse--;
        return true;
      }
      this.queue.pop()!.update(this);
    }
    this.maxRecurse--;
    return false;
  }

  override updateLightIfOtherThan(
    layer: LightLayer,
    x: number,
    y: number,
    z: number,
    expected: number,
  ): void {
    if (layer === LightLayer.Sky) {
      if (this.isSkyLit(x, y, z)) expected = 15;
    } else if (layer === LightLayer.Block) {
      const t = this.getTile(x, y, z);
      if (Tile.lightEmission[t]! > expected) expected = Tile.lightEmission[t]!;
    }
    if (this.getBrightness(layer, x, y, z) !== expected) this.updateLight(layer, x, y, z, x, y, z);
  }
}

describe('LightUpdate', () => {
  it('一次 update：光源得到 15，并对 6 个邻居发出“期望 14”的检查', () => {
    const lv = new FakeLevel().put(0, 64, 0, 10); // 熔岩：lightEmission 15
    new LightUpdate(LightLayer.Block, 0, 64, 0, 0, 64, 0).update(lv);
    expect(lv.getBrightness(LightLayer.Block, 0, 64, 0)).toBe(15);
    expect(lv.otherThanCalls.map(([, x, y, z, e]) => [x, y, z, e])).toEqual([
      [-1, 64, 0, 14],
      [0, 63, 0, 14],
      [0, 64, -1, 14],
      [1, 64, 0, 14],
      [0, 65, 0, 14],
      [0, 64, 1, 14],
    ]);
  });

  it('照 Level 的驱动方式传播：空气里每走一格减 1，实心方块挡光、光会绕过去', () => {
    const lv = new LitLevel().put(0, 64, 0, 10).put(1, 64, 0, 1); // 光源右边一块石头
    lv.updateLight(LightLayer.Block, 0, 64, 0, 0, 64, 0);
    while (lv.updateLights()) {
      /* 每次最多处理 500 个，直到清空 */
    }
    const L = (x: number, y: number, z: number) => lv.getBrightness(LightLayer.Block, x, y, z);
    expect([L(0, 64, 0), L(-1, 64, 0), L(-5, 64, 0), L(0, 67, 0), L(-2, 65, 1)]).toEqual([
      15, 14, 10, 12, 11,
    ]);
    expect(L(1, 64, 0)).toBe(0); // 石头本身
    expect(L(2, 64, 0)).toBe(11); // 被石头挡住，要绕上去再下来：4 步
    expect([L(-14, 64, 0), L(-15, 64, 0), L(-16, 64, 0)]).toEqual([1, 0, 0]);
  });

  it('expandToContain：已包含返回 true；只差一圈且体积增量不超过 2 时扩大；否则 false', () => {
    const u = new LightUpdate(LightLayer.Sky, 0, 0, 0, 4, 4, 4);
    expect(u.expandToContain(1, 1, 1, 2, 2, 2)).toBe(true);
    expect([u.x0, u.x1]).toEqual([0, 4]);
    expect(u.expandToContain(0, 0, 0, 5, 4, 4)).toBe(false); // 增量 16 > 2
    const p = new LightUpdate(LightLayer.Sky, 0, 0, 0, 0, 0, 0);
    expect(p.expandToContain(1, 0, 0, 1, 0, 0)).toBe(true); // 0 体积 → 0 体积
    expect([p.x0, p.x1]).toEqual([0, 1]);
    const copy = new LightUpdate(p);
    expect([copy.layer, copy.x1]).toEqual([LightLayer.Sky, 1]);
    const q = new LightUpdate(LightLayer.Block, 9, 9, 9, 9, 9, 9);
    q.assign(p);
    expect([q.layer, q.x0, q.x1]).toEqual([LightLayer.Sky, 0, 1]);
  });
});
