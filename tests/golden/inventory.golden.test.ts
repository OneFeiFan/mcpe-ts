import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CompoundTag, ListTag, NbtIo } from '@mcpe/nbt';
import { MemoryDataOutput } from '@mcpe/util';
import {
  ContainerType, FillingContainer, initItems, initMaterials, initTiles, Inventory, Item, ItemInstance, type Player, Tile,
} from '@mcpe/world';

/**
 * 黄金样本 G12-3（tools/golden/harness_inventory.cpp）：创造模式的默认物品栏（Inventory::setupDefault）、
 * 生存模式下 add 的合并与链接槽，以及 FillingContainer::save 写出的 NBT 字节。
 */
type Dump = { size: number; slots: ([number, number, number] | null)[]; linked: number[]; save: string };
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/inventory.json', import.meta.url), 'utf8')) as { creative: Dump; survival: Dump };
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function dump(inv: FillingContainer): Dump {
  const slots: Dump['slots'] = [];
  for (let i = 0; i < inv.getContainerSize(); i++) {
    const it = inv.getItem(i);
    slots.push(it ? [it.id, it.count, it.getAuxValue()] : null);
  }
  const linked = inv.linkedSlots.slice(0, inv.getNumLinkedSlots()).map((l) => l.inventorySlot);
  const root = new CompoundTag();
  root.put('Inventory', inv.saveItems(new ListTag()));
  const out = new MemoryDataOutput();
  NbtIo.write(root, out);
  return { size: inv.getContainerSize(), slots, linked, save: hex(out.toUint8Array()) };
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initMaterials();
  initTiles();
  initItems();
});

describe('G12-3 物品栏', () => {
  it('创造模式的默认物品栏：113 格的内容与顺序、9 个链接槽、存档字节与 C++ 相同', () => {
    const inv = new Inventory(null as unknown as Player, true); // C++ 的 harness 也传 NULL：构造与 setupDefault 不用 player
    expect(dump(inv)).toEqual(G.creative);
  });

  it('生存模式：两次 40 个石头合并成 64 + 16，煤、羊毛各占一格，链接槽依次指向它们；存档字节相同', () => {
    const inv = new FillingContainer(36 + Inventory.MAX_SELECTION_SIZE, Inventory.MAX_SELECTION_SIZE, ContainerType.INVENTORY, false);
    inv.add(new ItemInstance(Tile.rock, 40, 0));
    inv.add(new ItemInstance(Tile.rock, 40, 0));
    inv.add(new ItemInstance(Item.coal, 3, 0));
    inv.add(new ItemInstance(Tile.cloth, 5, 14));
    expect(dump(inv)).toEqual(G.survival);
  });
});
