/**
 * 熔炉与箱子界面（FurnaceScreen / ChestScreen / BaseContainerScreen）的行为。
 * 钉住的 C++ 行为：
 * - 打开时 player.containerMenu 指向界面的菜单；关闭（closeContainer）后清空、界面关闭；
 * - 熔炉：左边只列燃料与能烧的东西；选中原料格后点铁矿放 1 个进去；选燃料格放 1 块煤；熔炉 tick 后点燃并开始烧；
 *   再点一次已选中的原料格把原料取回；
 * - 箱子：点背包里的石头，1 个移到箱子里（背包少 1）；点箱子里的再移回来。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ChestScreen, FurnaceScreen, GLES1, glSetContext } from '@mcpe/client';
import {
  ChestTileEntity,
  FurnaceTileEntity,
  initItems,
  initTileEntities,
  Inventory,
  Item,
  ItemInstance,
  type Level,
  Player,
  Tile,
} from '@mcpe/world';
import { I18n } from '@mcpe/locale';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

class TestPlayer extends Player {
  closed = 0;
  override closeContainer(): void {
    super.closeContainer();
    this.closed++;
  }
}
let level: Level;
let player: TestPlayer;

const fakeMc = () => ({
  player,
  level,
  textures: {
    loadAndBindTexture: () => 1,
    loadTexture: () => 1,
    getTemporaryTextureData: () => ({ w: 256, h: 256 }),
  },
  font: {
    draw: () => {},
    drawShadow: () => {},
    drawWordWrap: () => {},
    width: (s: string) => s.length * 6,
    lineHeight: 10,
  },
  width: 960,
  height: 540,
  screen: null as unknown,
  setScreen: vi.fn(),
  useTouchscreen: () => false,
  isCreativeMode: () => false,
  isLevelGenerated: () => true,
  platform: () => ({}),
  options: { getIntValue: () => 0, getBooleanValue: () => false },
  gui: { inventoryUpdated: () => {}, renderSlotText: () => {}, setScissorRect: () => {} },
});

const countOf = (id: number): number => {
  let n = 0;
  for (let i = Inventory.MAX_SELECTION_SIZE; i < player.inventory.getContainerSize(); i++) {
    const it = player.inventory.getItem(i);
    if (it && it.id === id) n += it.count;
  }
  return n;
};

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

type FurnacePriv = {
  inventoryItems: (ItemInstance | null)[];
  addItem(p: unknown, i: number): boolean;
  buttonClicked(b: unknown): void;
  btnFuel: unknown;
  btnIngredient: unknown;
};

describe('熔炉界面', () => {
  it('放原料与燃料、点燃、取回原料', () => {
    level.setTile(130, 64, 128, Tile.furnace.id);
    const furnace = level.getTileEntity(130, 64, 128) as FurnaceTileEntity;
    player.inventory.add(new ItemInstance(Tile.ironOre, 5));
    player.inventory.add(new ItemInstance(Item.coal, 3));
    const s = new FurnaceScreen(player, furnace);
    s.init(fakeMc() as never, 320, 180);
    expect(player.containerMenu).not.toBeNull();
    const p = s as unknown as FurnacePriv;
    const ids = p.inventoryItems.map((it) => it?.id);
    expect(ids).toContain(Tile.ironOre.id);
    expect(ids).toContain(Item.coal.id);
    p.addItem(null, ids.indexOf(Tile.ironOre.id)); // 选中的是原料格（默认）
    expect(furnace.getItem(FurnaceTileEntity.SLOT_INGREDIENT)!.id).toBe(Tile.ironOre.id);
    expect(countOf(Tile.ironOre.id)).toBe(4);
    p.buttonClicked(p.btnFuel); // 选燃料格
    const ids2 = p.inventoryItems.map((it) => it?.id);
    p.addItem(null, ids2.indexOf(Item.coal.id));
    expect(furnace.getItem(FurnaceTileEntity.SLOT_FUEL)!.id).toBe(Item.coal.id);
    furnace.tick();
    expect(furnace.isLit()).toBe(true);
    p.buttonClicked(p.btnIngredient); // 切回原料格
    p.buttonClicked(p.btnIngredient); // 再点一次已选中的格子 → 取回
    expect(furnace.getItem(FurnaceTileEntity.SLOT_INGREDIENT)!.isNull()).toBe(true);
    expect(countOf(Tile.ironOre.id)).toBe(5);
  });
});

describe('箱子界面', () => {
  it('背包 → 箱子 1 个；箱子 → 背包 1 个；关闭时清空 containerMenu', () => {
    level.setTile(132, 64, 128, Tile.chest.id);
    const chest = level.getTileEntity(132, 64, 128) as ChestTileEntity;
    player.inventory.add(new ItemInstance(Tile.rock, 10));
    const s = new ChestScreen(player, chest);
    s.init(fakeMc() as never, 320, 180);
    const p = s as unknown as {
      inventoryPane: unknown;
      chestPane: unknown;
      getItems(p: unknown): (ItemInstance | null)[];
      addItem(p: unknown, i: number): boolean;
      keyPressed(k: number): void;
    };
    const invItems = p.getItems(p.inventoryPane);
    const idx = invItems.findIndex((it) => it && it.id === Tile.rock.id);
    expect(p.addItem(p.inventoryPane, idx)).toBe(true);
    expect(countOf(Tile.rock.id)).toBe(9);
    const chestItems = p.getItems(p.chestPane);
    const cidx = chestItems.findIndex((it) => it && it.id === Tile.rock.id);
    expect(chestItems[cidx]!.count).toBe(1);
    expect(p.addItem(p.chestPane, cidx)).toBe(true);
    expect(countOf(Tile.rock.id)).toBe(10);
    const closedBefore = player.closed;
    p.keyPressed(27); // Esc → closeContainer
    expect(player.closed).toBe(closedBefore + 1);
    expect(player.containerMenu).toBeNull();
  });
});
