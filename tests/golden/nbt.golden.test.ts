import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CompoundTag, DoubleTag, IntTag, ListTag, NbtIo } from '@mcpe/nbt';
import { MemoryDataInput, MemoryDataOutput } from '@mcpe/util';
import { initItems, initMaterials, initTiles, ItemInstance } from '@mcpe/world';

/**
 * 黄金样本 G11-3、G11-4（tools/golden/harness_nbt.cpp）：NBT 字节级往返与 ItemInstance 的存档格式。
 * 结构与 harness 的 build() 一一对应（CompoundTag 按名字排序写出，所以插入顺序无关）。
 */
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/nbt.json', import.meta.url), 'utf8')) as {
  root: string; reread: string; items: { id: number; count: number; aux: number; hex: string; back: [number, number, number] | null }[];
};
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));
function write(tag: CompoundTag): Uint8Array {
  const out = new MemoryDataOutput();
  NbtIo.write(tag, out);
  return out.toUint8Array();
}

function build(): CompoundTag {
  const root = new CompoundTag();
  root.putByte('b_min', -128);
  root.putByte('b_max', 127);
  root.putBoolean('bool', true);
  root.putShort('s_min', -32768);
  root.putShort('s', 12345);
  root.putInt('i_min', -2147483648);
  root.putInt('i', 123456789);
  root.putLong('l', 0x123456789abcdef0n);
  root.putLong('l_neg', -1n);
  root.putFloat('f', 3.14159);
  root.putFloat('f_neg0', -0.0);
  root.putDouble('d_from_float', 1.0 / 3.0); // C++ 的参数是 float
  root.put('d_real', new DoubleTag('d_real', 1.0 / 3.0));
  root.putString('str', 'hello');
  root.putString('empty', '');
  root.putString('utf8', '中文');
  root.putByteArray('bytes', new Uint8Array([1, 2, 3, 250, 0]));
  const ints = new ListTag();
  ints.add(new IntTag('', 1));
  ints.add(new IntTag('', 2));
  ints.add(new IntTag('', 3));
  root.put('ints', ints);
  root.put('empty_list', new ListTag());
  const comps = new ListTag();
  for (let i = 0; i < 2; i++) {
    const c = new CompoundTag();
    c.putString('name', i ? 'b' : 'a');
    c.putShort('n', i);
    comps.add(c);
  }
  root.put('comps', comps);
  const nested = new CompoundTag();
  nested.putInt('x', -5);
  const inner = new CompoundTag();
  inner.putString('deep', 'yes');
  nested.putCompound('inner', inner);
  root.putCompound('nested', nested);
  return root;
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  initMaterials();
  initTiles();
  initItems();
});

describe('G11-3 NBT 字节级往返', () => {
  it('写出的字节与 C++ 完全相同', () => {
    expect(hex(write(build()))).toBe(G.root);
  });
  it('读回 C++ 的字节再写出，与 C++ 的读回再写出相同（ByteArrayTag.load 不设长度，字节数组变空）', () => {
    const back = NbtIo.read(new MemoryDataInput(unhex(G.root)))!;
    expect(hex(write(back))).toBe(G.reread);
  });
});

describe('G11-4 ItemInstance 存档格式', () => {
  it('save 的字节与 fromTag 的结果与 C++ 相同', () => {
    for (const c of G.items) {
      const it = new ItemInstance(c.id, c.count, c.aux);
      const bytes = write(it.save(new CompoundTag()));
      expect(hex(bytes), `(${c.id}, ${c.count}, ${c.aux})`).toBe(c.hex);
      const l = ItemInstance.fromTag(NbtIo.read(new MemoryDataInput(bytes))!);
      expect(l ? [l.id, l.count, l.getAuxValue()] : null, `(${c.id}, ${c.count}, ${c.aux}) 读回`).toEqual(c.back);
    }
  });
});
