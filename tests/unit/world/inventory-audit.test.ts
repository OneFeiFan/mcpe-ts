/**
 * 全量审核 Inventory（W19）：三处只在调用点才暴露的移植错误。
 *
 * - `getSelectionSize` 在 C++ 里是 static，TS 以前写成了实例方法（行为一样，但类型不对）；
 * - `print()` / `setupDefault()` 里的日志以前把 printf 格式串原样传给 TS 的 LOGI/LOGE
 *   （TS 的 LOGI 是 console 转发，不会做 %s / %i 替换）；
 * - `Inventory::add` 的 `return super::add(item)` 曾因 TS 基类形参是 `ItemInstance | null`
 *   而编译不过，后来改回了原句（基类本来就能接 null，见 W19 记录）。
 *
 * 另外钉住 C++ 的几条行为：链接槽的选中物品、removeItemInstance 只从非选中区找、
 * 创造模式 add 直接返回 true、getDestroySpeed 的分支。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContainerType,
  FillingContainer,
  initItems,
  initMaterials,
  initTiles,
  Inventory,
  Item,
  ItemInstance,
  type Player,
  Tile,
} from '@mcpe/world';

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  initMaterials();
  initTiles();
  initItems();
});

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** 造一个只带 Inventory 所需字段的假 Player（setupDefault / add / stillValid 用到的那些） */
function fakePlayer(inv?: Inventory, x = 0, z = 0): Player {
  const p = {
    name: 'Steve',
    removed: false,
    hasFakeInventory: false,
    inventory: inv,
    x,
    z,
    distanceToSqr(other: { x: number; z: number }): number {
      const dx = x - other.x;
      const dz = z - other.z;
      return dx * dx + dz * dz;
    },
    drop: vi.fn(),
  };
  return p as unknown as Player;
}

/** 生存模式的物品栏（add 会读 player，所以造一个假的） */
function survivalInventory(): Inventory {
  const inv = new Inventory(null as unknown as Player, false);
  inv.player = fakePlayer(inv);
  return inv;
}

function creativeInventory(): Inventory {
  const inv = new Inventory(null as unknown as Player, true); // 构造与 setupDefault 不读 player
  inv.player = fakePlayer(inv);
  return inv;
}

describe('Inventory（W19）', () => {
  it('getSelectionSize 是静态方法（C++ 的 static int）', () => {
    expect(Inventory.getSelectionSize()).toBe(Inventory.MAX_SELECTION_SIZE);
    expect(Inventory.getSelectionSize()).toBe(9);
  });

  it('print：名字与每行的 %s/%i 都被替换掉，不会把格式串原样打出来', () => {
    const inv = survivalInventory();
    inv.add(new ItemInstance(Tile.torch, 12));
    // addResource 会把新格链接进第一个空选中槽，print 才打得出 "(Linked)"
    const linked = inv.linkedSlots.findIndex((_, i) => inv.getLinked(i)?.id === Tile.torch.id);
    expect(linked, '前置条件：add 已经把火把链接到某个选中槽').toBeGreaterThanOrEqual(0);
    inv.print();

    const lines = (logSpy.mock.calls as unknown[][]).map((c) => String(c[1] ?? c[0]));
    expect(lines[0]).toBe("Steve's Inventory:\n");
    const torchLine = lines.find((l) => l.includes('torch'));
    expect(torchLine, '应该打出火把那一行').toBeDefined();
    expect(torchLine, '格式串已被替换').not.toContain('%s');
    expect(torchLine).toContain('(12)');
    expect(torchLine).toContain('(Linked)');
  });

  it('setupDefault 的 LOGE 用真正的插值（选中区出现物品时才打）', () => {
    // 正常构造不会触发那条错误；这里直接验证拼好的文字（C++ 原句 "Error: Should not have items on slot %i\n"）
    const inv = creativeInventory();
    inv.items[0] = new ItemInstance(Tile.rock, 1, 0); // 人为在选中区放一个
    // 重新跑一遍 setupDefault（private，只能从 clearInventoryWithDefault 之外的路径触达——这里用原型调用）
    (inv as unknown as { setupDefault: () => void }).setupDefault();
    const text = (errSpy.mock.calls as unknown[][]).map((c) => String(c[1] ?? c[0])).join('');
    expect(text).toContain('Error: Should not have items on slot 0\n');
    expect(text).not.toContain('%i');
  });

  it('getSelected 返回链接槽指向的物品；selectSlot 只接受 0..8', () => {
    const inv = creativeInventory();
    // C++ setupDefault：Sel[0] = addItem(Tile::rock)，所以第 0 个选中槽是石头
    expect(inv.getSelected()?.id, '创造模式默认第 0 个选中槽是石头').toBe(Tile.rock.id);
    expect(inv.linkedSlots[0]!.inventorySlot).toBeGreaterThanOrEqual(Inventory.MAX_SELECTION_SIZE);

    inv.selectSlot(8);
    expect(inv.selected).toBe(8);
    expect(inv.getSelected()?.id, '第 8 个选中槽是橡树苗').toBe(Tile.sapling.id);
    inv.selectSlot(9);
    expect(inv.selected, '越界不改').toBe(8);
    inv.selectSlot(-1);
    expect(inv.selected).toBe(8);
  });

  it('moveToSelectedSlot 链接当前选中槽；moveToEmptySelectionSlot 找第一个空选中槽', () => {
    const inv = creativeInventory();
    inv.selectSlot(0);
    expect(inv.moveToSelectedSlot(20, false)).toBe(true);
    expect(inv.linkedSlots[0]!.inventorySlot).toBe(20);
    expect(inv.moveToSelectedSlot(20, false), '链接到同一格返回 false').toBe(false);

    const empty = inv.linkedSlots.findIndex((l) => l.inventorySlot === -1);
    // 默认物品栏 9 个选中槽都有物品，先清一个
    const slot = inv.linkedSlots[8]!.inventorySlot;
    inv.linkedSlots[8]!.inventorySlot = -1;
    expect(inv.moveToEmptySelectionSlot(slot)).toBe(true);
    expect(inv.linkedSlots[empty >= 0 ? empty : 8]!.inventorySlot).toBe(slot);
  });

  it('removeItemInstance 按指针相等从非选中区找，找到就清空并返回 true', () => {
    const inv = survivalInventory();
    // 注意：add() 走 addResource 时是 clone 进背包的（C++ 也 clone），所以这里拿背包里实际存的那个对象，
    // 与 ArmorScreen 的调用方式一致（它从 getItem 取指针再传回来）。
    inv.add(new ItemInstance(Tile.rock, 5, 0));
    const stored = inv.items.find((it) => it !== null)!;
    expect(stored.id).toBe(Tile.rock.id);
    expect(inv.removeItemInstance(stored)).toBe(true);
    expect(inv.items.includes(stored)).toBe(false);
    expect(inv.removeItemInstance(stored), '第二次找不到').toBe(false);
  });

  it('创造模式 add 直接返回 true，不改背包', () => {
    const inv = creativeInventory();
    const before = inv.items.map((it) => it?.id ?? null);
    expect(inv.add(new ItemInstance(Tile.rock, 1, 0))).toBe(true);
    expect(inv.items.map((it) => it?.id ?? null)).toEqual(before);
  });

  it('getDestroySpeed：空手 1；方块 id < 256 也是 1；工具用 Item.items[id] 的值', () => {
    const inv = survivalInventory();
    expect(inv.getDestroySpeed(Tile.rock), '空手').toBe(1);
    inv.add(new ItemInstance(Tile.rock, 1, 0));
    expect(inv.getDestroySpeed(Tile.rock), '方块 id < 256').toBe(1);
    const pick = new ItemInstance(Item.pickAxe_iron, 1, 0);
    inv.add(pick);
    // 刚 add 的物品不一定在选中的那一格（addResource 只把它链接进第一个空选中槽），
    // 所以先找到它所在的选中槽再选过去，才能测到工具分支。
    const linked = inv.linkedSlots.findIndex(
      (_, i) => inv.getLinked(i)?.id === Item.pickAxe_iron.id,
    );
    expect(linked, '前置条件：铁镐被链接到某个选中槽').toBeGreaterThanOrEqual(0);
    inv.selectSlot(linked);
    expect(inv.getDestroySpeed(Tile.rock), '铁镐挖石头').toBe(
      Item.items[Item.pickAxe_iron.id]!.getDestroySpeed(null, Tile.rock),
    );
  });

  it('getAttackDamage：空手 1，拿剑用物品的值', () => {
    const inv = survivalInventory();
    expect(inv.getAttackDamage({} as never)).toBe(1);
    inv.add(new ItemInstance(Item.sword_iron, 1, 0));
    const linked = inv.linkedSlots.findIndex((_, i) => inv.getLinked(i)?.id === Item.sword_iron.id);
    expect(linked, '前置条件：铁剑被链接到某个选中槽').toBeGreaterThanOrEqual(0);
    inv.selectSlot(linked);
    expect(inv.getAttackDamage({} as never)).toBe(
      new ItemInstance(Item.sword_iron, 1, 0).getAttackDamage({} as never),
    );
  });

  it('canDestroy：alwaysDestroyable 的材质直接 true，否则看物品', () => {
    const inv = survivalInventory();
    const air = Tile.tiles.find((t) => t && t.material.isAlwaysDestroyable())!;
    expect(inv.canDestroy(air)).toBe(true);
    expect(inv.canDestroy(Tile.rock), '空手不能挖石头').toBe(false);
  });

  it('stillValid：player 被移除或距离超过 8 格为 false', () => {
    const inv = survivalInventory();
    const self = fakePlayer(inv);
    inv.player = self;
    expect(inv.stillValid(self)).toBe(true);
    self.removed = true;
    expect(inv.stillValid(self)).toBe(false);
    self.removed = false;
    expect(inv.stillValid(fakePlayer(inv, 9, 0)), '9 格 > 8').toBe(false);
    expect(inv.stillValid(fakePlayer(inv, 8, 0)), '正好 8 格不算超过').toBe(true);
  });

  it('doDrop 转给 player.drop', () => {
    const inv = survivalInventory();
    const p = fakePlayer(inv);
    inv.player = p;
    const item = new ItemInstance(Tile.rock, 1, 0);
    inv.doDrop(item, true);
    expect(p.drop).toHaveBeenCalledWith(item, true);
  });

  it('继承关系：Inventory 是 FillingContainer', () => {
    const inv = survivalInventory();
    expect(inv).toBeInstanceOf(FillingContainer);
    expect(inv.containerType).toBe(ContainerType.INVENTORY);
    expect(inv.numTotalSlots).toBe(36 + 9);
    expect(inv.numLinkedSlots).toBe(9);
  });
});
