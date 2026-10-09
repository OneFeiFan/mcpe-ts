/**
 * 回归：吃东西后背包里那一叠被清成 id 0、数量 0，下次右键 ItemInstance.use 崩溃（getItem() 为 null）。
 * 原因：Player.startUsingItem 存的是引用；C++ 的 `void startUsingItem(ItemInstance instance, …)` 按值传参、`useItem = instance` 是复制。
 * 这里用一个照 LocalPlayer::tick 写的倒计时（--useItemDuration == 0 时 completeUsingItem），吃两个苹果再吃面包。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initItems, initTileEntities, Item, ItemInstance, type Level, Player } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

/** LocalPlayer::tick 里与吃东西有关的那一段（LocalPlayer 在 client 包里，需要 Minecraft，这里不构造它） */
class EatingPlayer extends Player {
  override tick(): void {
    super.tick();
    const self = this as unknown as { useItem: ItemInstance; useItemDuration: number };
    if (!self.useItem.isNull()) {
      const item = this.inventory.getSelected();
      if (item !== null && item.equals(self.useItem)) {
        if (--self.useItemDuration === 0) this.completeUsingItem();
      } else this.stopUsingItem();
    }
  }
}

let level: Level;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
});

function eatOnce(p: Player): ItemInstance {
  const it = p.inventory.getSelected()!;
  expect(it.getItem(), `选中的是 id ${it.id}`).not.toBeNull();
  it.use(level, p); // SurvivalMode.useItem → FoodItem.use → startUsingItem
  for (let t = 0; t < 60 && p.isUsingItem(); t++) p.tick();
  expect(p.isUsingItem()).toBe(false);
  return it;
}

describe('吃东西（startUsingItem 按值复制）', () => {
  it('两个苹果：吃一个剩一个（不会变成 id 0），吃完这一格被清掉，再选面包照常能吃', () => {
    const p = new EatingPlayer(level, false);
    p.moveTo(128.5, 64, 128.5, 0, 0);
    level.addEntity(p);
    p.inventory.add(new ItemInstance(Item.apple, 2));
    p.inventory.add(new ItemInstance(Item.bread, 1));
    p.inventory.selectSlot(0);
    p.health = 10;
    eatOnce(p);
    const left = p.inventory.getSelected()!;
    expect([left.id, left.count]).toEqual([Item.apple.id, 1]);
    p.health = 10;
    eatOnce(p);
    // 吃完：C++ completeUsingItem 里 `if (selected->count == 0) inventory->clearSlot(selected)`，快捷栏压紧后第 0 格变成面包
    const next = p.inventory.getSelected()!;
    expect(next.id).toBe(Item.bread.id);
    p.health = 10;
    eatOnce(p);
    expect(p.inventory.getSelected()).toBeNull();
    level.removeEntity(p);
  });

  it('startUsingItem 存的是副本：stopUsingItem 不会动到背包里的物品', () => {
    const p = new EatingPlayer(level, false);
    const stack = new ItemInstance(Item.apple, 3);
    p.startUsingItem(stack, 32);
    p.stopUsingItem();
    expect([stack.id, stack.count]).toEqual([Item.apple.id, 3]);
  });
});
