import { describe, expect, it } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import { ChunkPos, Entity, TilePos, TickDataSet, TickNextTickData } from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';

const f = Math.fround;

/** distanceToSqr 只读 Entity 的 x/z；Entity 是抽象类，这里造一个最小的具体实体。 */
class ProbeEntity extends Entity {
  override getEntityTypeId(): number {
    return 0;
  }

  protected override readAdditionalSaveData(_tag: CompoundTag): void {}

  protected override addAdditonalSaveData(_tag: CompoundTag): void {}
}

function probe(x: number, z: number): Entity {
  const e = new ProbeEntity(new FakeLevel());
  e.x = f(x);
  e.z = f(z);
  return e;
}

describe('ChunkPos 审核（W67）', () => {
  it('W67 distanceToSqr 按 C++ 的 float 逐步舍入', () => {
    const cases: [number, number, number, number, number][] = [
      [0, 0, 0.1, 0.2, 123.25],
      [10, -5, 123.456, -78.9, 2031.77783203125],
      [-300, 200, 1 / 3, Math.PI, 33237576],
      [1000, -2000, 1e-3, -2.5e-2, 1279742464],
    ];
    for (const [x, z, ex, ez, want] of cases) {
      expect(new ChunkPos(x, z).distanceToSqr(probe(ex, ez))).toBe(want);
    }
  });

  it('hashCode 与 C++ 的位模式一致（含负数），equals / lessThan 按原语义', () => {
    expect(ChunkPos.hashCode(0, 0)).toBe(0);
    expect(ChunkPos.hashCode(-1, 0)).toBe(-65536);
    expect(ChunkPos.hashCode(0, -1)).toBe(65535);
    expect(ChunkPos.hashCode(-1, -1)).toBe(-1);
    expect(ChunkPos.hashCode(32767, 32767)).toBe(2147450879);
    expect(ChunkPos.hashCode(-32768, -32768)).toBe(-2147450880);
    expect(new ChunkPos(123, -456).hashCode()).toBe(8126008);

    const a = new ChunkPos(1, 2);
    const b = new ChunkPos(1, 2);
    const c = new ChunkPos(-1, 0);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
    expect(c.lessThan(a)).toBe(true);
    expect(a.lessThan(c)).toBe(false);
  });

  it('构造参数按 C++ int 截断，默认构造为 0', () => {
    const p = new ChunkPos(1.9, -1.9);
    expect([p.x, p.z]).toEqual([1, -1]);
    expect(new ChunkPos()).toEqual(new ChunkPos(0, 0));
  });
});

describe('TilePos 审核（W68）', () => {
  it('hashCode 按 C++ int 回绕', () => {
    expect(new TilePos(5, 6, 7).hashCode()).toBe(50771243);
    expect(new TilePos(100, 0, 0).hashCode()).toBe(897689000);
    expect(new TilePos(1, 0, -8976890).hashCode()).toBe(0);
    expect(new TilePos(123456789, -987654321, 555).hashCode()).toBe(1198220690);
  });

  it('拷贝构造 / clone / assign / equals / lessThan 与原语义一致', () => {
    const a = new TilePos(1, 2, 3);
    const b = new TilePos(a);
    expect(b).not.toBe(a);
    expect(b.equals(a)).toBe(true);
    const c = a.clone();
    expect(c).not.toBe(a);
    expect(c.equals(a)).toBe(true);
    const d = new TilePos(0, 0, 0);
    expect(d.assign(a)).toBe(d);
    expect(d.equals(a)).toBe(true);
    expect(a.lessThan(new TilePos(1, 2, 4))).toBe(true);
    expect(new TilePos(1, 2, 4).lessThan(a)).toBe(false);
  });

  it('operator< 只比 hashCode：哈希碰撞的两个坐标互不小于（原版怪癖）', () => {
    const p = new TilePos(1, 0, -8976890);
    const q = new TilePos(0, 0, 0);
    expect(p.hashCode()).toBe(q.hashCode());
    expect(p.equals(q)).toBe(false);
    expect(p.lessThan(q)).toBe(false);
    expect(q.lessThan(p)).toBe(false);
  });
});

describe('TickNextTickData 审核（W69）', () => {
  it('hashCode 按 C++ int 回绕', () => {
    const t = new TickNextTickData(3000, 64, -2000, 8);
    const want = Number(
      BigInt.asIntN(32, (3000n * 128n * 1024n + -2000n * 128n + 64n) * 256n + 8n),
    );
    expect(t.hashCode()).toBe(1813528584);
    expect(t.hashCode()).toBe(want);
  });

  it('operator< 先 delay 后创建序号 c；setDelay 返回自身', () => {
    const a = new TickNextTickData(1, 2, 3, 8);
    const b = new TickNextTickData(1, 2, 3, 8);
    expect(a.setDelay(5)).toBe(a);
    b.setDelay(5);
    expect(a.lessThan(b)).toBe(true);
    expect(b.lessThan(a)).toBe(false);
    b.setDelay(4);
    expect(b.lessThan(a)).toBe(true);
    expect(a.lessThan(a)).toBe(false);
  });

  it('equals 只比较坐标与 tileId（与 delay / c 无关）', () => {
    const a = new TickNextTickData(1, 2, 3, 8).setDelay(1);
    const b = new TickNextTickData(1, 2, 3, 8).setDelay(2);
    const c = new TickNextTickData(1, 2, 3, 9).setDelay(1);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('TickDataSet：begin 取最小、同一对象重复 insert 不做事、同坐标新对象按原版重复插入', () => {
    const set = new TickDataSet();
    const a = new TickNextTickData(0, 0, 0, 1).setDelay(2);
    const b = new TickNextTickData(0, 0, 0, 1).setDelay(1);
    const c = new TickNextTickData(0, 0, 0, 1).setDelay(1);
    set.insert(a);
    set.insert(b);
    set.insert(c);
    expect(set.size()).toBe(3);
    expect(set.begin()).toBe(b);
    expect(set.has(b)).toBe(true);
    expect(set.has(new TickNextTickData(0, 0, 0, 1).setDelay(1))).toBe(false);

    set.insert(b);
    expect(set.size()).toBe(3);

    set.erase(b);
    expect(set.size()).toBe(2);
    expect(set.begin()).toBe(c);
    set.erase(a);
    expect(set.size()).toBe(1);
    expect(set.begin()).toBe(c);

    set.clear();
    expect(set.size()).toBe(0);
    expect(set.begin()).toBe(null);
  });
});
