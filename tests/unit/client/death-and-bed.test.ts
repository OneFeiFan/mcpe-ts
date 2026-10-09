/**
 * 死亡与重生（DeathScreen、Minecraft.resetPlayer / respawnPlayer）以及床（BedTile.use、InBedScreen）。
 * 钉住的 C++ 行为：
 * - resetPlayer：满血、清掉死亡状态，回到床边的重生点（有的话），否则回世界出生点（x+0.5、y+1、z+0.5）；
 * - 死亡界面 30 刻之内按钮不响应；之后“重生”调用 player.respawn 并关掉界面；
 * - 床：白天右键提示“You can only sleep at night”；夜里右键就躺下（isSleeping），床头被标记为占用；再右键同一张床就起床。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DeathScreen, GLES1, glSetContext, Minecraft } from '@mcpe/client';
import { SharedConstants } from '@mcpe/core';
import {
  BedTile,
  FlatDimension,
  GameType,
  initItems,
  initTileEntities,
  Level,
  LevelSettings,
  MemoryLevelStorage,
  Player,
  Pos,
  ServerLevel,
  Tile,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

class TestPlayer extends Player {
  messages: string[] = [];
  respawned = 0;
  override displayClientMessage(m: string): void {
    this.messages.push(m);
  }
  override respawn(): void {
    this.respawned++;
  }
}
let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  glSetContext(new GLES1(null));
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
});

const fakeMc = (player: Player) => ({
  level,
  player,
  isCreativeMode: () => false,
  options: { getIntValue: () => 0, getBooleanValue: () => false },
  font: {
    draw: () => {},
    drawShadow: () => {},
    width: (s: string) => s.length * 6,
    lineHeight: 10,
  },
  textures: { loadAndBindTexture: () => 1, loadTexture: () => 1 },
  width: 960,
  height: 540,
  setScreen: vi.fn(),
  leaveGame: vi.fn(),
  useTouchscreen: () => false,
  platform: () => ({}),
});

describe('Minecraft.resetPlayer', () => {
  it('没有重生点：回到世界出生点，满血、不再是死亡状态', () => {
    const p = new TestPlayer(level, false);
    p.moveTo(100.5, 64, 100.5, 0, 0);
    p.health = 0;
    p.deathTime = 15;
    Minecraft.prototype.resetPlayer.call(fakeMc(p) as never, p);
    const sp = level.getSharedSpawnPos();
    expect([p.x, p.z]).toEqual([sp.x + 0.5, sp.z + 0.5]);
    expect(p.health).toBe(p.getMaxHealth());
    expect(p.deathTime).toBe(0);
    expect(p.isAlive()).toBe(true);
  });

  // 回归：C++ 的 _init 不是 virtual。TS 里写成了 override，Entity.reset 的 this._init() 派发到 Player._init，
  // Entity._init（把 removed、onFire、fallDistance 清掉）从没执行——死后 20 刻被 remove() 的玩家重生后仍是 removed、isAlive 为假。
  it('死透了（已被 remove）也能重生：removed 被清掉、isAlive 为真', () => {
    const p = new TestPlayer(level, false);
    p.health = 0;
    p.remove();
    p.fallDistance = 12;
    Minecraft.prototype.resetPlayer.call(fakeMc(p) as never, p);
    expect(p.removed).toBe(false);
    expect(p.fallDistance).toBe(0);
    expect(p.isAlive()).toBe(true);
  });

  it('有重生点（床）：回到那里', () => {
    const p = new TestPlayer(level, false);
    p.setRespawnPosition(new Pos(140, 64, 120));
    p.health = 0;
    Minecraft.prototype.resetPlayer.call(fakeMc(p) as never, p);
    expect([p.x, p.z]).toEqual([140.5, 120.5]);
  });
});

describe('DeathScreen', () => {
  it('30 刻之内按钮不响应；之后“重生”调 player.respawn 并关界面', () => {
    const p = new TestPlayer(level, false);
    const mc = fakeMc(p);
    const s = new DeathScreen();
    s.init(mc as never, 320, 180);
    const priv = s as unknown as { bRespawn: unknown; buttonClicked(b: unknown): void };
    priv.buttonClicked(priv.bRespawn);
    expect(p.respawned).toBe(0);
    for (let i = 0; i < 30; i++) s.tick();
    priv.buttonClicked(priv.bRespawn);
    expect(p.respawned).toBe(1);
    expect(mc.setScreen).toHaveBeenCalledWith(null);
  });
});

describe('床', () => {
  const placeBed = (x: number, z: number): void => {
    level.setTileAndData(x, 64, z, Tile.bed.id, 0); // 脚，朝向 0：床头在 z+1
    level.setTileAndData(x, 64, z + 1, Tile.bed.id, BedTile.HEAD_PIECE_DATA);
  };
  const lv = () => level as unknown as { skyDarken: number };

  it('白天：提示只能在夜里睡觉，不躺下', () => {
    placeBed(150, 150);
    const p = new TestPlayer(level, false);
    p.moveTo(151.5, 64, 150.5, 0, 0);
    lv().skyDarken = 0;
    expect(Tile.bed.use(level, 150, 64, 150, p)).toBe(true);
    expect(p.isSleeping()).toBe(false);
    expect(p.messages).toContain('You can only sleep at night');
  });

  it('夜里：躺下、床头标记为占用；再右键同一张床就起床', () => {
    placeBed(160, 150);
    const p = new TestPlayer(level, false);
    p.moveTo(161.5, 64, 150.5, 0, 0);
    lv().skyDarken = 8;
    Tile.bed.use(level, 160, 64, 150, p);
    expect(p.messages).toEqual([]);
    expect(p.isSleeping()).toBe(true);
    expect(BedTile.isOccupied(level.getData(160, 64, 151))).toBe(true);
    Tile.bed.use(level, 160, 64, 151, p);
    expect(p.isSleeping()).toBe(false);
    lv().skyDarken = 0;
  });
});

describe('睡到天亮（ServerLevel）', () => {
  // demo 世界与正式存档都是 ServerLevel：所有玩家都睡满 SLEEP_DURATION（100 刻）后，时间跳到下一天的 0 刻（早晨），
  // awakenAllPlayers 叫醒所有人、血补满，并记下床边的重生点。浏览器里“睡几秒就醒、界面自己关掉”就是这个。
  it('夜里躺下，约 100 刻后时间跳到下一天、玩家醒来、满血、记下重生点', () => {
    const sl = new ServerLevel(
      new MemoryLevelStorage(),
      'sleep',
      new LevelSettings(0, GameType.Survival),
      SharedConstants.GeneratorVersion,
      new FlatDimension(),
    );
    prepareLevel(sl);
    const lv = sl as unknown as { skyDarken: number; updateSkyDarken(): void };
    lv.updateSkyDarken = () => {}; // 平坦维度永远白天：冻住天色，模拟夜里
    lv.skyDarken = 8;
    sl.setTime(14000);
    sl.setTileAndData(130, 64, 128, Tile.bed.id, 0);
    sl.setTileAndData(130, 64, 129, Tile.bed.id, BedTile.HEAD_PIECE_DATA);
    const p = new TestPlayer(sl, false);
    p.moveTo(129.5, 64, 128.5, 0, 0);
    sl.addEntity(p);
    p.health = 10;
    Tile.bed.use(sl, 130, 64, 128, p);
    expect(p.isSleeping()).toBe(true);
    let t = 0;
    for (; t < 200 && p.isSleeping(); t++) {
      sl.tick();
      sl.tickEntities();
    }
    expect(p.isSleeping()).toBe(false);
    expect(t).toBeGreaterThanOrEqual(100);
    expect(t).toBeLessThan(110);
    expect(sl.getTime() % Level.TICKS_PER_DAY).toBeLessThan(5);
    expect(sl.getTime()).toBeGreaterThan(14000);
    expect(p.health).toBe(Player.MAX_HEALTH);
    expect(p.hasRespawnPosition()).toBe(true);
  });
});
