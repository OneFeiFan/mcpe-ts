/**
 * 读档恢复玩家（Level.loadPlayer、LevelData.setLoadedPlayerTo、PlayerData.loadPlayer）。
 * 之前 Level.loadPlayer 里读回存档玩家的三句是 DEFERRED，进存档后玩家回到出生点、背包空、满血。
 * 钉住的 C++ 行为：
 * - level.dat 的 "Player" 复合标签 → LevelData 的 loadedPlayerTag；loadPlayer 用它 player.load()，然后清空（只用一次）；
 * - 没有标签时走 setLoadedPlayerTo：只有旧版（playerDataVersion == 1）存档才用 PlayerData 恢复（位置夹到 4..252 / 4..126）。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initItems, initTileEntities, Inventory, Item, ItemInstance, type Level, LevelData, Player, Tile } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

class TestPlayer extends Player {}
let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
});

const levelDataOf = (l: Level): LevelData => (l as unknown as { levelData: LevelData }).levelData;

describe('读档恢复玩家', () => {
  it('level.dat 里的 Player 标签：位置、生命值、背包都读回来，标签只用一次', () => {
    const a = new TestPlayer(level, false);
    a.moveTo(100.5, 70, 120.5, 30, 0);
    a.health = 7;
    a.inventory.add(new ItemInstance(Item.ironIngot, 5));
    a.inventory.add(new ItemInstance(Tile.torch, 12));
    // 走存档的真实路径：createTagForPlayers → 写进 level.dat → 读出 LevelData(tag)
    const datTag = levelDataOf(level).createTagForPlayers([a]);
    const loaded = new LevelData(datTag);
    expect(loaded.getLoadedPlayerTag()).not.toBeNull();
    levelDataOf(level).assign(loaded);

    const b = new TestPlayer(level, false);
    level.loadPlayer(b, false);
    expect([b.x, b.y, b.z]).toEqual([a.x, a.y, a.z].map(Math.fround)); // NBT 里 Pos 存的是 float
    expect(b.health).toBe(7);
    const count = (p: Player, id: number): number => {
      let n = 0;
      for (let i = Inventory.MAX_SELECTION_SIZE; i < p.inventory.getContainerSize(); i++) {
        const it = p.inventory.getItem(i);
        if (it && it.id === id) n += it.count;
      }
      return n;
    };
    expect(count(b, Item.ironIngot.id)).toBe(5);
    expect(count(b, Tile.torch.id)).toBe(12);
    expect(levelDataOf(level).getLoadedPlayerTag()).toBeNull(); // 用过就清空
  });

  // 原样保留的 C++ 行为：loadPlayer 先把 x/y/z 夹到 4..252 / 4..126，最后一句却是 setPos(pos.x, pos.y, pos.z)（未夹的原值），
  // 夹过的值被覆盖——最终位置就是存档里的原值，只有 xo/xOld 等是夹过的。
  it('没有 Player 标签、旧版存档（playerDataVersion = 1）：用 PlayerData 恢复位置（最后的 setPos 用的是未夹的原值）', () => {
    const ld = levelDataOf(level);
    ld.setLoadedPlayerTag(null);
    ld.playerDataVersion = 1;
    ld.playerData.pos.set(300, 200, 50.5);
    ld.playerData.yRot = 45;
    const p = new TestPlayer(level, false);
    level.loadPlayer(p, false);
    expect([p.x, p.y, p.z]).toEqual([300, 200, 50.5]);
    expect([p.xo, p.yo]).toEqual([252, 126]);
    expect(p.yRot).toBe(45);
    ld.playerDataVersion = -1;
  });

  it('没有标签、新版存档：不动玩家', () => {
    const ld = levelDataOf(level);
    ld.setLoadedPlayerTag(null);
    ld.playerDataVersion = -1;
    const p = new TestPlayer(level, false);
    p.moveTo(128.5, 64, 128.5, 0, 0);
    level.loadPlayer(p, false);
    expect([p.x, p.z]).toEqual([128.5, 128.5]);
  });
});
