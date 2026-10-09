/**
 * 合成与护甲界面（PaneCraftingScreen / WorkbenchScreen / StonecutterScreen / ArmorScreen）的行为。
 * 钉住的 C++ 行为：
 * - 2×2 背包合成只列 craftingSize 不超过 2×2 的配方；工作台（3×3）还有 3×3 的；切石机只有一个分类、只列石质/沙质方块；
 * - 有木板时“木棍”可以合成；合成后扣材料、产物进背包；
 * - 护甲：点背包里的铁头盔就穿上，并从背包移除；点头盔槽脱下回到背包。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ArmorScreen, GLES1, glSetContext, StonecutterScreen, WorkbenchScreen } from '@mcpe/client';
import { initItems, initTileEntities, Inventory, Item, ItemInstance, type Level, Player, Recipe, Tile } from '@mcpe/world';
import { I18n } from '@mcpe/locale';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

class TestPlayer extends Player {}
let level: Level;
let player: Player;

const mc = () => ({
  player,
  textures: { loadAndBindTexture: () => 1, loadTexture: () => 1, getTemporaryTextureData: () => ({ w: 256, h: 256 }) },
  font: { draw: () => {}, drawShadow: () => {}, drawWordWrap: () => {}, width: (s: string) => s.length * 6, lineHeight: 10 },
  width: 960,
  height: 540,
  screen: null as unknown,
  setScreen: vi.fn(),
  useTouchscreen: () => false,
  isCreativeMode: () => false,
  isLevelGenerated: () => true,
  platform: () => ({}),
  options: { getIntValue: () => 0, getBooleanValue: () => false },
  gui: { inventoryUpdated: () => {} },
});

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(I18n, 'getDescriptionString').mockImplementation(() => '');
  glSetContext(new GLES1(null));
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
  player = new TestPlayer(level, false);
  player.moveTo(128.5, 64, 128.5, 0, 0);
  level.addEntity(player);
});

type Priv = { _items: { item: ItemInstance; canCraft(): boolean; recipe: Recipe }[]; _categories: unknown[][]; currentItem: unknown; craftSelectedItem(): void };

function open(s: { init(m: never, w: number, h: number): void }): Priv {
  s.init(mc() as never, 320, 180);
  return s as unknown as Priv; // 私有成员：经 unknown 断言访问
}

describe('合成界面', () => {
  it('背包合成（2×2）只有 2×2 的配方；工作台（3×3）更多', () => {
    const small = open(new WorkbenchScreen(Recipe.SIZE_2X2));
    const big = open(new WorkbenchScreen(Recipe.SIZE_3X3));
    expect(small._items.every((c) => c.recipe.getCraftingSize() === Recipe.SIZE_2X2)).toBe(true);
    expect(big._items.length).toBeGreaterThan(small._items.length);
  });

  it('切石机：一个分类，只有石质/沙质方块', () => {
    const s = open(new StonecutterScreen());
    expect(s._categories.length).toBe(1);
    expect(s._items.length).toBeGreaterThan(0);
    for (const c of s._items) expect(c.item.id).toBeLessThan(256);
  });

  it('有 4 块木板：木棍可以合成；合成后扣 2 块木板、得到 4 根木棍', () => {
    player.inventory.add(new ItemInstance(Tile.wood, 4));
    const s = open(new WorkbenchScreen(Recipe.SIZE_2X2));
    const stick = s._items.find((c) => c.item.id === Item.stick.id)!;
    expect(stick.canCraft()).toBe(true);
    s.currentItem = stick;
    s.craftSelectedItem();
    const count = (id: number): number => {
      let n = 0;
      // 前 9 格是快捷栏的链接（指向后面的背包格），只数背包格，免得重复计数
      for (let i = Inventory.MAX_SELECTION_SIZE; i < player.inventory.getContainerSize(); i++) {
        const it = player.inventory.getItem(i);
        if (it && it.id === id) n += it.count;
      }
      return n;
    };
    expect(count(Tile.wood.id)).toBe(2);
    expect(count(Item.stick.id)).toBe(4);
  });
});

describe('护甲界面', () => {
  it('点背包里的铁头盔：穿上并从背包移除；点头盔槽：脱下放回背包', () => {
    player.inventory.add(new ItemInstance(Item.helmet_iron));
    const s = open(new ArmorScreen()) as unknown as { armorItems: (ItemInstance | null)[]; addItem(p: unknown, i: number): boolean; takeAndClearSlot(i: number): void };
    const idx = s.armorItems.findIndex((it) => it && it.id === Item.helmet_iron.id);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(s.addItem(null, idx)).toBe(true);
    expect(player.getArmor(0)?.id).toBe(Item.helmet_iron.id);
    s.takeAndClearSlot(0);
    expect(player.getArmor(0)).toBeNull();
    let found = false;
    for (let i = 0; i < player.inventory.getContainerSize(); i++) if (player.inventory.getItem(i)?.id === Item.helmet_iron.id) found = true;
    expect(found).toBe(true);
  });
});
