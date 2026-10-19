/**
 * 全量审核 Player（W20）：只在数值/语义边界上暴露的移植错误。
 *
 * - `hurt` 的 EASY / HARD 难度分支：C++ 的 dmg 是 int，`dmg / 3`、`dmg * 3 / 2` 是整数除法；
 * - `hurtArmor` 的 `dmg / 4` 同理，以前会把小数写进护甲的 auxValue；
 * - `stopSleepInBed` 的 `Pos standUp = bedPosition` 是值拷贝，以前 TS 引用同一个 Pos，
 *   findStandUpPosition 写输出参数时会把 bedPosition 一起改掉；
 * - `getHeadHeight()` 返回 `0.12f`；
 * - `getRespawnPosition()` 按值返回（改返回值不能改到内部成员）；
 * - `getItemInHandIcon` 的 `(2 * MAX_DRAW_DURATION) / 3` 是 13 而不是 13.33；
 * - 各处 float 字段/运算按 C++ 的每一步舍入（heightOffset、aiStep 的 bob/tilt、travel、die、
 *   drop、setBedOffset、startSleepInBed 的落点、spawnEatParticles 的粒子与声音参数）；
 * - 可见性与 C++ 一致（两个 NBT 方法是 protected、静态 animateRespawn 是 protected static）。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';
import {
  BedSleepingResult,
  BedTile,
  Difficulty,
  Direction,
  initItems,
  initTileEntities,
  Item,
  ItemInstance,
  Level,
  LevelListener,
  type ParticleType,
  Player,
  Pos,
  Tile,
  UseAnim,
  Zombie,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';
import { mockMthRandom } from '../../helpers/mthRandom';

const f = Math.fround;

class TestPlayer extends Player {
  messages: string[] = [];
  override displayClientMessage(m: string): void {
    this.messages.push(m);
  }
}

/** 只记录粒子与声音的监听器 */
class SpyListener extends LevelListener {
  particles: unknown[][] = [];
  sounds: unknown[][] = [];
  override addParticle(
    name: string | ParticleType.Id,
    x: number,
    y: number,
    z: number,
    xa: number,
    ya: number,
    za: number,
    data: number,
  ): void {
    this.particles.push([name, x, y, z, xa, ya, za, data]);
  }
  override playSound(name: string, x: number, y: number, z: number, v: number, p: number): void {
    this.sounds.push([name, x, y, z, v, p]);
  }
}

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
});

beforeEach(() => {
  level.difficulty = Difficulty.NORMAL;
  level.adventureSettings.noMvP = false;
  (level as unknown as { skyDarken: number }).skyDarken = 0;
});

function makePlayer(): TestPlayer {
  return new TestPlayer(level, false);
}

describe('Player.hurt 的难度整数除法（W20）', () => {
  /** 僵尸是 BaseEnemy，会走难度分支 */
  function hurtByZombie(p: TestPlayer, dmg: number): boolean {
    const z = new Zombie(level);
    return p.hurt(z, dmg);
  }

  it('EASY：dmg / 3 + 1 是整数除法', () => {
    level.difficulty = Difficulty.EASY;
    for (const [dmg, expected] of [
      [4, 2],
      [5, 2],
      [2, 1],
      [6, 3],
    ] as const) {
      const p = makePlayer();
      p.bypassArmor = true; // 绕开 getDamageAfterArmorAbsorb 的整数截断，直接看传进去的 dmg
      const before = p.health;
      hurtByZombie(p, dmg);
      expect(before - p.health, `EASY dmg=${dmg}`).toBe(expected);
    }
  });

  it('HARD：dmg * 3 / 2 是整数除法', () => {
    level.difficulty = Difficulty.HARD;
    for (const [dmg, expected] of [
      [3, 4],
      [5, 7],
      [1, 1],
    ] as const) {
      const p = makePlayer();
      p.bypassArmor = true;
      const before = p.health;
      hurtByZombie(p, dmg);
      expect(before - p.health, `HARD dmg=${dmg}`).toBe(expected);
    }
  });

  it('NORMAL 不改伤害；PEACEFUL 归零后直接返回 false', () => {
    const p = makePlayer();
    const before = p.health;
    hurtByZombie(p, 5);
    expect(before - p.health).toBe(5);

    level.difficulty = Difficulty.PEACEFUL;
    const p2 = makePlayer();
    expect(hurtByZombie(p2, 5), '和平难度 dmg=0 → hurt 返回 false').toBe(false);
    expect(p2.health).toBe(Player.MAX_HEALTH);
  });
});

describe('Player.hurtArmor 的整数除法（W20）', () => {
  it('dmg / 4 截断，auxValue 保持整数', () => {
    for (const [dmg, expected] of [
      [5, 1],
      [7, 1],
      [8, 2],
      [3, 1],
    ] as const) {
      const p = makePlayer();
      p.setArmor(0, new ItemInstance(Item.helmet_iron, 1, 0));
      p.hurtArmor(dmg);
      const helm = p.getArmor(0)!;
      expect(helm.getAuxValue(), `dmg=${dmg}`).toBe(expected);
      expect(Number.isInteger(helm.getAuxValue())).toBe(true);
    }
  });

  it('没有护甲时什么都不做', () => {
    const p = makePlayer();
    expect(() => p.hurtArmor(5)).not.toThrow();
    expect(p.getArmor(0)).toBeNull();
  });
});

describe('Player.getHeadHeight / getRespawnPosition（W20）', () => {
  it('getHeadHeight 返回 float 的 0.12', () => {
    const p = makePlayer();
    expect(p.getHeadHeight()).toBe(f(0.12));
    expect(p.getHeadHeight()).not.toBe(0.12);
  });

  it('getRespawnPosition 按值返回：改返回值不影响内部成员', () => {
    const p = makePlayer();
    p.setRespawnPosition(new Pos(10, 64, 20));
    const pos = p.getRespawnPosition();
    pos.set(999, 999, 999);
    expect(p.getRespawnPosition()).toEqual(new Pos(10, 64, 20));
  });

  it('setRespawnPosition 复制 Pos（改实参不影响成员）', () => {
    const p = makePlayer();
    const arg = new Pos(1, 64, 2);
    p.setRespawnPosition(arg);
    arg.set(50, 50, 50);
    expect(p.getRespawnPosition()).toEqual(new Pos(1, 64, 2));
  });
});

describe('Player.getItemInHandIcon 的弓拉弦阈值（W20）', () => {
  function bowPlayer(useItemDuration: number): TestPlayer {
    const p = makePlayer();
    p.startUsingItem(new ItemInstance(Item.bow, 1, 0), useItemDuration);
    return p;
  }

  it('(2 * MAX_DRAW_DURATION) / 3 = 13：13 还是 6 档，14 才进 7 档', () => {
    const bow = new ItemInstance(Item.bow, 1, 0);
    const max = 20 * 60 * 60; // BowItem.getUseDuration
    expect(bowPlayer(max - 13).getItemInHandIcon(bow, 0), 'ticksHeld=13 不大于 13').toBe(
      5 + 6 * 16,
    );
    expect(bowPlayer(max - 14).getItemInHandIcon(bow, 0), 'ticksHeld=14 大于 13').toBe(5 + 7 * 16);
    expect(bowPlayer(max - 18).getItemInHandIcon(bow, 0), '>= MAX_DRAW_DURATION - 2').toBe(
      5 + 8 * 16,
    );
  });

  it('没在拉弓时返回物品图标', () => {
    const p = makePlayer();
    const bow = new ItemInstance(Item.bow, 1, 0);
    expect(p.getItemInHandIcon(bow, 0)).toBe(bow.getIcon());
  });
});

describe('Player 的 float 字段与运算（W20）', () => {
  it('heightOffset = f(1.62)；两个速度常量是 float', () => {
    const p = makePlayer();
    expect(p.heightOffset).toBe(f(1.62));
    expect(Player.DEFAULT_WALK_SPEED).toBe(f(0.1));
    expect(Player.DEFAULT_FLY_SPEED).toBe(f(0.02));
  });

  it('resetPos 写回 f(1.62)', () => {
    const p = makePlayer();
    p.heightOffset = 0;
    p.resetPos(false);
    expect(p.heightOffset).toBe(f(1.62));
  });

  it('aiStep：bob / tilt 每一步都按 float 舍入', () => {
    const p = makePlayer();
    p.onGround = true;
    p.health = Player.MAX_HEALTH;
    p.xd = 0.3;
    p.zd = 0.4;
    p.yd = 0;
    p.bob = f(0.05);
    p.tilt = f(0.1);

    const tBob0 = Mth.sqrt(f(f(p.xd * p.xd) + f(p.zd * p.zd)));
    const tBob = tBob0 > f(0.1) ? f(0.1) : tBob0;
    const expBob = f(p.bob + f(f(tBob - p.bob) * f(0.4)));
    const expTilt = f(p.tilt + f(f(0 - p.tilt) * f(0.8)));

    p.aiStep();
    expect(p.bob).toBe(expBob);
    expect(p.tilt).toBe(expTilt);
  });

  it('travel：飞行时恢复 flyingSpeed，yd = 进入时的 yd * 0.6f', () => {
    const p = makePlayer();
    p.abilities.flying = true;
    p['flyingSpeed'] = f(0.02);
    p.yd = f(0.75);

    // C++: float ydo = yd; ... super::travel(); yd = ydo * 0.6f; —— 用的是进入时的值
    p.travel(0, 0);

    expect(p['flyingSpeed'], '恢复原值').toBe(f(0.02));
    expect(p.yd).toBe(f(f(0.75) * f(0.6)));
  });

  it('die：yd / heightOffset 是 f(0.1)，有伤害来源时 xd/zd 按 float 算', () => {
    const p = makePlayer();
    p.health = 0;
    p.hurtDir = 0;
    p.yRot = 0;
    const z = new Zombie(level);
    p.die(z);
    expect(p.yd).toBe(f(0.1));
    expect(p.heightOffset).toBe(f(0.1));
    const angle = f(f(f(p.hurtDir + p.yRot) * Mth.PI) / f(180));
    expect(p.xd).toBe(f(-Mth.cos(angle) * f(0.1)));
    expect(p.zd).toBe(f(-Mth.sin(angle) * f(0.1)));
  });

  it('drop：掉落物初始位置 y = f(f(y - f(0.3)) + getHeadHeight())', () => {
    const p = makePlayer();
    p.moveTo(10.5, 64, 10.5, 0, 0);
    const added: unknown[] = [];
    vi.spyOn(level, 'addEntity').mockImplementation((e) => {
      added.push(e);
      return true;
    });
    p.drop(new ItemInstance(Tile.rock, 1, 0), true);
    expect(added).toHaveLength(1);
    const item = added[0] as { y: number; throwTime: number };
    expect(item.y).toBe(f(f(p.y - f(0.3)) + p.getHeadHeight()));
    expect(item.throwTime).toBe(40);
  });

  it('setBedOffset：±1.8 是 float', () => {
    const p = makePlayer();
    const call = (dir: number): void =>
      (p as unknown as { setBedOffset(d: number): void }).setBedOffset(dir);
    call(Direction.SOUTH);
    expect(p.bedOffsetZ).toBe(f(-1.8));
    call(Direction.NORTH);
    expect(p.bedOffsetZ).toBe(f(1.8));
    call(Direction.WEST);
    expect(p.bedOffsetX).toBe(f(1.8));
    call(Direction.EAST);
    expect(p.bedOffsetX).toBe(f(-1.8));
  });
});

describe('Player 睡觉相关的值语义（W20）', () => {
  /** 在 (x, z) 放一张朝 dir 的床：床脚在 (x,z)，床头按 HEAD_DIRECTION_OFFSETS 摆放 */
  function placeBed(x: number, z: number, dir = 0): void {
    const off = BedTile.HEAD_DIRECTION_OFFSETS[dir]!;
    level.setTileAndData(x, 64, z, Tile.bed.id, dir);
    level.setTileAndData(x + off[0], 64, z + off[1], Tile.bed.id, dir | BedTile.HEAD_PIECE_DATA);
  }

  it('startSleepInBed 的落点按 float 算：y + 15/16，朝南 z + 0.9', () => {
    placeBed(200, 200);
    const p = makePlayer();
    p.moveTo(200.5, 64, 200.5, 0, 0);
    (level as unknown as { skyDarken: number }).skyDarken = 8;
    expect(p.startSleepInBed(200, 64, 200)).toBe(BedSleepingResult.OK);
    expect(p.heightOffset).toBe(f(0.2));
    expect(p.y).toBe(f(f(64) + f(15.0 / 16.0)));
    expect(p.z).toBe(f(f(200) + f(0.9)));
  });

  it('stopSleepInBed 不会改掉 bedPosition（standUp 是值拷贝）', () => {
    placeBed(210, 200);
    const p = makePlayer();
    p.moveTo(210.5, 64, 200.5, 0, 0);
    (level as unknown as { skyDarken: number }).skyDarken = 8;
    p.startSleepInBed(210, 64, 200);
    expect(p.isSleeping()).toBe(true);
    const bedBefore = p.bedPosition.clone();

    // 床还在（会走进 standUp 那段），findStandUpPosition 会把站立点写进第 6 个参数
    const standUpSpy = vi.spyOn(BedTile, 'findStandUpPosition');
    p.stopSleepInBed(true, true, false);

    expect(p.isSleeping()).toBe(false);
    expect(p.bedPosition).toEqual(bedBefore);
    const out = standUpSpy.mock.calls[0]![5];
    expect(out, 'C++ 的 Pos standUp 是 bedPosition 的副本，不能是同一个对象').not.toBe(
      p.bedPosition,
    );
    standUpSpy.mockRestore();
  });

  it('getSleepRotation 按床的方向返回 90/0/270/180', () => {
    for (const [dir, expected] of [
      [Direction.SOUTH, 90],
      [Direction.WEST, 0],
      [Direction.NORTH, 270],
      [Direction.EAST, 180],
    ] as const) {
      const x = 220 + dir;
      placeBed(x, 200, dir);
      const p = makePlayer();
      p.moveTo(x + 0.5, 64, 200.5, 0, 0);
      (level as unknown as { skyDarken: number }).skyDarken = 8;
      p.startSleepInBed(x, 64, 200);
      expect(p.getSleepRotation(), `direction=${dir}`).toBe(expected);
      p.stopSleepInBed(true, true, false);
    }
  });
});

describe('Player.spawnEatParticles（W20）', () => {
  function callSpawn(p: TestPlayer, item: ItemInstance, count: number): void {
    (p as unknown as { spawnEatParticles(i: ItemInstance, c: number): void }).spawnEatParticles(
      item,
      count,
    );
  }

  it('吃食物：粒子坐标与速度按 float 算，声音参数是 float', () => {
    const p = makePlayer();
    p.moveTo(10.5, 64, 10.5, 0, 0);
    p.xRot = 0;
    p.yRot = 0;
    mockMthRandom(0.5);
    // 粒子里的随机数取自玩家自己的 Random（C++ Mob::random），Mth::random 只用于 d.y
    vi.spyOn(p.random, 'nextFloat').mockReturnValue(0.5);
    vi.spyOn(p.random, 'nextInt').mockReturnValue(1);
    const spy = new SpyListener();
    level.addListener(spy);

    callSpawn(p, new ItemInstance(Item.apple, 1, 0), 1);

    expect(spy.particles).toHaveLength(1);
    const [, px, py, pz, vx, vy, vz] = spy.particles[0] as number[];
    // xx = yy = 0；d = ((0.5-0.5)*0.1, 0.5*0.1+0.1, 0)
    // p = ((0.5-0.5)*0.3, -0.5*0.6-0.3, 0.6) 再平移到玩家位置
    expect(vx).toBe(f(f(0.5 - f(0.5)) * f(0.1)));
    expect(vy).toBe(f(f(f(0.5 * f(0.1)) + f(0.1)) + f(0.05)));
    expect(vz).toBe(0);
    // p.add(x, y + getHeadHeight(), z) 用的是玩家的 y（moveTo 已经把 heightOffset 加进去了）
    expect(py).toBe(f(f(p.y + p.getHeadHeight()) + f(f(-0.5 * f(0.6)) - f(0.3))));
    expect(px).toBe(f(f(10.5) + f(f(0.5 - f(0.5)) * f(0.3))));
    expect(pz).toBe(f(f(10.5) + f(0.6)));

    expect(spy.sounds).toHaveLength(1);
    expect(spy.sounds[0]![0]).toBe('random.eat');
    expect(spy.sounds[0]![4]).toBe(f(f(0.5) + f(f(0.5) * 1)));
  });

  it('喝药水：只有 random.drink 声音，随机数取自 level.random', () => {
    const p = makePlayer();
    const spy = new SpyListener();
    level.addListener(spy);
    const apple = new ItemInstance(Item.apple, 1, 0);
    vi.spyOn(apple, 'getUseAnimation').mockReturnValue(UseAnim.drink);
    const rnd = vi.spyOn(level.random, 'nextFloat').mockReturnValue(0.5);

    callSpawn(p, apple, 1);

    expect(rnd).toHaveBeenCalled();
    expect(spy.particles).toHaveLength(0);
    expect(spy.sounds).toHaveLength(1);
    expect(spy.sounds[0]![0]).toBe('random.drink');
    expect(spy.sounds[0]![4]).toBe(f(0.5));
    expect(spy.sounds[0]![5]).toBe(f(f(0.5 * f(0.1)) + f(0.9)));
  });
});

describe('Player 的 NBT（W20）', () => {
  it('SleepTimer 按 short 语义读写', () => {
    const p = makePlayer();
    p['sleepCounter'] = 100;
    const tag = new CompoundTag();
    (p as unknown as { addAdditonalSaveData(t: CompoundTag): void }).addAdditonalSaveData(tag);
    expect(tag.getShort('SleepTimer')).toBe(100);

    const p2 = makePlayer();
    (p2 as unknown as { readAdditionalSaveData(t: CompoundTag): void }).readAdditionalSaveData(tag);
    expect(p2['sleepCounter']).toBe(100);
  });

  it('静态 animateRespawn 在 C++ 里是 protected', () => {
    // 类型层面的检查：C++ 的 protected static animateRespawn(Player*, Level*) 在外部不合法
    // @ts-expect-error C++ 的 static animateRespawn 是 protected
    const bad = (): unknown => Player.animateRespawnFor;
    void bad;
  });
});
