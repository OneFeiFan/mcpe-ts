/**
 * 全量审核（W34，PigZombie）锁定测试。
 * W34：useNewAi / getAttackTime 的可见性 —— C++ PigZombie.h 把两者写在 public 段
 * （基类 Mob.h 的 useNewAi、Monster.h 的 getAttackTime 是 protected），TS 原写成
 * protected override，类外无法以 PigZombie 类型调用，与 C++ 不一致。已改 public override。
 * 这里从类外直接调用：撤掉修复（改回 protected）时 `npx tsc -p tests/tsconfig.json --noEmit`
 * 报 TS2445（先红），恢复后 0 错误（后绿）；vitest 断言行为。
 * 顺带钉住：构造函数状态、stunedTime 抑制找目标、愤怒音效计时与数值、
 * hurt→alert 群体激怒（自己不被 alert、目标用 sourceEntity）、箭主人的判定与空指针怪癖、
 * Anger 的 short 存取。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import {
  Arrow,
  Difficulty,
  initItems,
  initTileEntities,
  Item,
  type Level,
  MobTypes,
  PigZombie,
  Player,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

const f = Math.fround;

class TestPlayer extends Player {}
let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  initItems(); // 僵尸猪人的金剑是物品（未注册时读 .id 会抛，PITFALLS 18）
  initTileEntities();
  prepareLevel(level);
  level.difficulty = Difficulty.NORMAL;
});

/** 透视 private/protected 成员（angerTime 等在 C++ 里也是 private/protected） */
function priv<T>(pz: PigZombie, key: string): T {
  return (pz as unknown as Record<string, T>)[key] as T;
}

/** moveTo 的 y 是脚底高度（PITFALLS 30，同 mobs.test.ts） */
function newPigZombie(x: number, z: number): PigZombie {
  const pz = new PigZombie(level);
  pz.moveTo(x, 64, z, 0, 0);
  level.addEntity(pz);
  return pz;
}

function newPlayer(x: number, z: number): Player {
  const p = new TestPlayer(level, false);
  p.moveTo(x, 64, z, 0, 0);
  level.addEntity(p);
  return p;
}

/** findAttackTarget 在 C++/TS 里都是 protected，测试透视调用 */
function findAttackTargetOf(pz: PigZombie): unknown {
  return (pz as unknown as { findAttackTarget(): unknown }).findAttackTarget();
}

describe('W34：useNewAi / getAttackTime 可见性（PigZombie.h 的 public 段）', () => {
  it('类外以 PigZombie 类型调用：useNewAi() === false、getAttackTime() === 40', () => {
    const pz = new PigZombie(level);
    expect(pz.useNewAi()).toBe(false);
    expect(pz.getAttackTime()).toBe(40);
  });
});

describe('PigZombie 构造函数（PigZombie.cpp:7）', () => {
  it('贴图、速度、免疫火、攻击力、晕眩 3 秒、金剑（count 1）、类型 id', () => {
    const pz = new PigZombie(level);
    expect(pz.getTexture()).toBe('mob/pigzombie.png');
    expect(pz.textureName).toBe('mob/pigzombie.png');
    expect(priv<number>(pz, 'runSpeed')).toBe(f(0.7));
    expect(priv<boolean>(pz, 'fireImmune')).toBe(true);
    expect(priv<number>(pz, 'attackDamage')).toBe(5);
    expect(priv<number>(pz, 'stunedTime')).toBe(60); // SharedConstants.TicksPerSecond(20) * 3
    const weapon = pz.getCarriedItem();
    expect(weapon).not.toBeNull();
    expect(weapon!.id).toBe(Item.sword_gold.id);
    expect(weapon!.count).toBe(1); // C++ ItemInstance(const Item*) → init(id, 1, 0)
    expect(pz.getEntityTypeId()).toBe(MobTypes.PigZombie);
  });
});

describe('PigZombie::tick（PigZombie.cpp:23）', () => {
  it('stunedTime 每刻减 1；playAngrySoundIn 减到 0 的那一刻播放 zpigangry（音量 2、音高逐步舍入）', () => {
    const pz = newPigZombie(170.5, 170.5);
    (pz as unknown as { playAngrySoundIn: number }).playAngrySoundIn = 1;

    // 音高 ((f1 - f2) * 0.2f + 1.0f) * 1.8f 的前两次 nextFloat() 给定值，其余走原实现
    // （super.tick 的旧 AI 还会取随机数）。⚠ f1、f2 的求值顺序在 C++ 里未指定
    // （DEFERRED(待确认)），这里锁定 TS 按从左到右的既定取舍。
    const origNextFloat = pz.random.nextFloat.bind(pz.random);
    let n = 0;
    vi.spyOn(pz.random, 'nextFloat').mockImplementation(() => {
      n++;
      if (n === 1) return 0.25;
      if (n === 2) return 0.75;
      return origNextFloat();
    });
    const playSound = vi.spyOn(level, 'playSound').mockImplementation(() => {});

    pz.tick(); // playAngrySoundIn 1→0，播放（音效块在 super.tick 之前，先取随机数）
    expect((pz as unknown as { playAngrySoundIn: number }).playAngrySoundIn).toBe(0);
    expect(priv<number>(pz, 'stunedTime')).toBe(59);

    pz.tick(); // playAngrySoundIn 已是 0，不再播放
    expect(priv<number>(pz, 'stunedTime')).toBe(58);

    const angry = playSound.mock.calls.filter((c) => c[3] === 'mob.zombiepig.zpigangry');
    expect(angry).toHaveLength(1);
    const angryCall = angry[0]!;
    expect(angryCall[4]).toBe(f(1 * 2)); // getSoundVolume() = 1
    // ((0.25 - 0.75) * 0.2f + 1.0f) * 1.8f，每一步 f()
    expect(angryCall[5]).toBe(f(f(f(f(0.25 - 0.75) * f(0.2)) + f(1.0)) * f(1.8)));

    playSound.mockRestore();
    level.removeEntity(pz);
  });
});

describe('PigZombie::hurt → alert 群体激怒（PigZombie.cpp:66 / 94）', () => {
  it('被玩家打到：12 格内的同类一起被激怒（自己除外）；先取 nextInt(400) 再 nextInt(40)', () => {
    const player = newPlayer(142.5, 140.5);
    const self = newPigZombie(140.5, 140.5); // 被打的这只
    const near = newPigZombie(145.5, 144.5); // 约 6.4 格 < 12
    const far = newPigZombie(140.5, 156.5); // 16 格 > 12
    const playSound = vi.spyOn(level, 'playSound').mockImplementation(() => {});

    // alert 的随机取用顺序：angerTime = 20*20*nextInt(400) 在前，playAngrySoundIn = nextInt(40) 在后
    vi.spyOn(near.random, 'nextInt').mockReturnValue(7);
    vi.spyOn(self.random, 'nextInt').mockReturnValue(11); // 不应被用到（自己不被 alert）
    vi.spyOn(far.random, 'nextInt').mockReturnValue(13); // 不应被用到（12 格外）

    expect(self.hurt(player, 1)).toBe(true);

    // 自己：getEntities(this, ...) 把第一个参数排除掉（C++ 同），不走 alert；
    // 但 Monster::hurt 会把 attackTargetId 设成 sourceEntity
    expect(priv<number>(self, 'angerTime')).toBe(0);
    expect(priv<number>(self, 'playAngrySoundIn')).toBe(0);
    expect(priv<number>(self, 'attackTargetId')).toBe(player.entityId);
    // 12 格内的同类：alert(sourceEntity) —— 目标是打人的玩家
    expect(priv<number>(near, 'attackTargetId')).toBe(player.entityId);
    expect(priv<number>(near, 'angerTime')).toBe(20 * 20 * 7);
    expect(priv<number>(near, 'playAngrySoundIn')).toBe(7);
    // 12 格外不受影响
    expect(priv<number>(far, 'attackTargetId')).toBe(0);
    expect(priv<number>(far, 'angerTime')).toBe(0);
    expect(priv<number>(far, 'playAngrySoundIn')).toBe(0);

    playSound.mockRestore();
    for (const e of [self, near, far, player]) level.removeEntity(e);
  });

  it('打它的是箭：主人不是玩家不激怒；主人是玩家时 alert 的目标是箭本身（怪癖）；主人查不到时空指针怪癖照旧抛错', () => {
    const victim = newPigZombie(150.5, 150.5);
    const shooter = newPigZombie(149.5, 150.5); // 箭的主人：生物不是玩家
    const neighbor = newPigZombie(152.5, 150.5);
    const playSound = vi.spyOn(level, 'playSound').mockImplementation(() => {});
    vi.spyOn(neighbor.random, 'nextInt').mockReturnValue(5);

    const notPlayerArrow = new Arrow(level);
    notPlayerArrow.ownerId = shooter.entityId;
    expect(victim.hurt(notPlayerArrow, 1)).toBe(true);
    expect(priv<number>(victim, 'angerTime')).toBe(0);
    expect(priv<number>(neighbor, 'angerTime')).toBe(0); // attacker 不是玩家 → 不进 alert 分支

    const player = newPlayer(150.5, 149.5);
    const playerArrow = new Arrow(level);
    playerArrow.ownerId = player.entityId;
    // victim 刚受过一次伤（invulnerableTime = 20 > 10 且 dmg 1 <= lastHurt 1）→ super.hurt 返回 false，
    // 但 alert 在 super.hurt 之前执行，照样激怒 —— C++ 同样如此
    expect(victim.hurt(playerArrow, 1)).toBe(false);
    expect(priv<number>(neighbor, 'attackTargetId')).toBe(playerArrow.entityId); // 怪癖：目标是箭，不是射箭的玩家
    expect(priv<number>(neighbor, 'angerTime')).toBe(20 * 20 * 5);
    expect(priv<number>(neighbor, 'playAngrySoundIn')).toBe(5);

    // 主人查不到：C++ 里 attacker->isPlayer() 解引用空指针（崩溃）；TS 的 attacker!.isPlayer() 同样抛错（怪癖保留）
    const ghostArrow = new Arrow(level);
    ghostArrow.ownerId = 999999;
    expect(() => victim.hurt(ghostArrow, 1)).toThrow();

    playSound.mockRestore();
    for (const e of [victim, shooter, neighbor, player]) level.removeEntity(e);
  });
});

describe('PigZombie::findAttackTarget（PigZombie.cpp:53）', () => {
  it('晕眩期间（stunedTime != 0）返回 null，即使玩家贴脸', () => {
    const pz = newPigZombie(120.5, 120.5);
    const player = newPlayer(121.5, 120.5);
    expect(priv<number>(pz, 'stunedTime')).toBe(60);
    expect(findAttackTargetOf(pz)).toBeNull();
    level.removeEntity(pz);
    level.removeEntity(player);
  });

  it('angerTime == 0 时只认 5 格内的目标；angerTime != 0 时不受 5 格限制', () => {
    const pz = newPigZombie(120.5, 122.5);
    (pz as unknown as { stunedTime: number }).stunedTime = 0;

    const near = newPlayer(121.5, 122.5); // 1 格
    expect(findAttackTargetOf(pz)).toBe(near);
    level.removeEntity(near);

    const far = newPlayer(128.5, 122.5); // 8 格：在 Monster 的 16 格内、但超过 PigZombie 的 5 格
    expect(findAttackTargetOf(pz)).toBeNull();

    (pz as unknown as { angerTime: number }).angerTime = 100; // 被激怒后不受 5 格限制
    expect(findAttackTargetOf(pz)).toBe(far);

    level.removeEntity(pz);
    level.removeEntity(far);
  });
});

describe('PigZombie 存档（PigZombie.cpp:43 / 48）', () => {
  it('Anger 以 short 写入：0x1F123 截断成 0xF123 再符号扩展读回 -3805', () => {
    const pz = new PigZombie(level);
    (pz as unknown as { angerTime: number }).angerTime = 0x1f123;
    const tag = new CompoundTag();
    pz.addAdditonalSaveData(tag); // C++ 原文的拼写就是 addAdditonal（不带 d 的笔误，两侧一致）
    expect(tag.getShort('Anger')).toBe(-3805); // (short)0x1F123 = (short)0xF123 = -3805

    const pz2 = new PigZombie(level);
    pz2.readAdditionalSaveData(tag);
    expect(priv<number>(pz2, 'angerTime')).toBe(-3805); // getShort 返回带符号 short
  });
});
