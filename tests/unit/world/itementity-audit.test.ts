/**
 * 全量审核 ItemEntity（W21）：
 * - 构造函数里的 float 分步（bobOffs / heightOffset / yRot / xd / zd）；
 * - tick 的岩浆分支（yd/xd/zd、random.fizz 的 float 参数）、checkInTile 的 speed 与 `1 - x`；
 * - playerTouch 的 random.pop 音高按 float 分步、音量 0.3f；
 * - C++ ItemEntity.h:44 自己声明的 `int tickCount` 遮蔽 Entity 的同名字段（R10 改名 itemTickCount）；
 * - `~ItemEntity()` 登记 OMIT；`(char) health` 的 8 位截断保留。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';
import {
  Entity,
  Item,
  ItemEntity,
  ItemInstance,
  type Level,
  LevelListener,
  type ParticleType,
  Tile,
  initItems,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';
import { mockMthRandom } from '../../helpers/mthRandom';

const f = Math.fround;

class SpyListener extends LevelListener {
  sounds: unknown[][] = [];
  override playSound(name: string, x: number, y: number, z: number, v: number, p: number): void {
    this.sounds.push([name, x, y, z, v, p]);
  }
  override addParticle(
    _name: string | ParticleType.Id,
    _x: number,
    _y: number,
    _z: number,
    _xa: number,
    _ya: number,
    _za: number,
    _data: number,
  ): void {}
}

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  level = createFlatLevel();
  initItems();
  prepareLevel(level);
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ItemEntity 构造函数的 float 分步（W21）', () => {
  it('bobOffs = f(f(random * PI) * 2)，heightOffset = bbHeight / 2 按 float', () => {
    mockMthRandom(0.25);
    const e = new ItemEntity(level, 1, 2, 3, new ItemInstance(Tile.rock.id, 1, 0));
    expect(e.bobOffs).toBe(f(f(f(0.25) * Mth.PI) * f(2)));
    expect(e.heightOffset).toBe(f(f(0.25) / f(2)));
    expect(e.yd).toBe(f(0.2));
    expect((e as unknown as { makeStepSound: boolean }).makeStepSound).toBe(false);
  });

  it('yRot / xd / zd 都按 float 计算', () => {
    mockMthRandom(0.75);
    const e = new ItemEntity(level, 1, 2, 3, new ItemInstance(Tile.rock.id, 1, 0));
    expect(e.yRot).toBe(f(f(0.75) * f(360)));
    expect(e.xd).toBe(f(f(f(0.75) * f(0.2)) - f(0.1)));
    expect(e.zd).toBe(f(f(f(0.75) * f(0.2)) - f(0.1)));
  });

  it('单参构造不设 yRot/xd/zd、不调 setPos，但仍消耗一次 Mth::random()', () => {
    mockMthRandom(0.5);
    const e = new ItemEntity(level);
    expect(e.bobOffs).toBe(f(f(f(0.5) * Mth.PI) * f(2)));
    expect([e.x, e.y, e.z]).toEqual([0, 0, 0]);
    expect(e.item.isNull()).toBe(true);
  });
});

describe('ItemEntity.tick 的 tickCount 遮蔽（W21）', () => {
  it('ItemEntity 自己的 tickCount 与 Entity.tickCount 是两个字段，各自递增', () => {
    const e = new ItemEntity(level, 8.5, 70, 8.5, new ItemInstance(Tile.rock.id, 1, 0));
    expect(e.tickCount).toBe(0);
    expect((e as unknown as { itemTickCount: number }).itemTickCount).toBe(0);

    e.tick();
    // baseTick 让 Entity.tickCount +1，ItemEntity::tick 让被遮蔽的那个 +1
    expect(e.tickCount).toBe(1);
    expect((e as unknown as { itemTickCount: number }).itemTickCount).toBe(1);

    e.tick();
    expect(e.tickCount).toBe(2);
    expect((e as unknown as { itemTickCount: number }).itemTickCount).toBe(2);
  });
});

describe('ItemEntity.tick 的岩浆分支（W21）', () => {
  it('random.fizz 的音量 0.4f、音高 2.0f + nextFloat * 0.4f 按 float', () => {
    // 把 y 放在岩浆里：y = 63.5 落在第 63 层（flat 世界地表 63 是草，换成岩浆）
    level.setTileNoUpdate(30, 63, 30, Tile.lava.id);
    const e = new ItemEntity(level, 30.5, 63.5, 30.5, new ItemInstance(Tile.rock.id, 1, 0));
    const spy = new SpyListener();
    level.addListener(spy);
    vi.spyOn(Entity.sharedRandom, 'nextFloat').mockReturnValue(0.5);

    e.tick();

    // tick 后半段还会乘摩擦、落地反弹，这里只看岩浆分支产生的声音参数
    const fizz = spy.sounds.find((s) => s[0] === 'random.fizz');
    expect(fizz).toBeDefined();
    expect(fizz![4]).toBe(f(0.4));
    expect(fizz![5]).toBe(f(f(2.0) + f(f(0.5) * f(0.4))));
    level.removeListener(spy);
  });
});

describe('ItemEntity.playerTouch 的 random.pop（W21）', () => {
  it('音量 0.3f，音高 ((a - b) * 0.7f + 1.0f) * 2.f 按 float 分步', () => {
    // 用假玩家：只实现 playerTouch 用到的四个成员
    const added: ItemInstance[] = [];
    const fakePlayer = {
      isAlive: () => true,
      inventory: {
        add: (it: ItemInstance) => {
          added.push(it);
          return true;
        },
      },
      take: () => {},
    };
    const e = new ItemEntity(level, 8.5, 70, 8.5, new ItemInstance(Tile.rock.id, 3, 0));
    const spy = new SpyListener();
    level.addListener(spy);
    vi.spyOn(Entity.sharedRandom, 'nextFloat').mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);

    e.playerTouch(fakePlayer as never);

    expect(added).toHaveLength(1);
    expect(e.removed).toBe(true);
    const pop = spy.sounds.find((s) => s[0] === 'random.pop');
    expect(pop).toBeDefined();
    expect(pop![4]).toBe(f(0.3));
    const pitch = f(f(f(f(0.25) - f(0.75)) * f(0.7)) + f(1.0));
    expect(pop![5]).toBe(f(pitch * f(2.0)));
    level.removeListener(spy);
  });

  it('throwTime > 0 时拾取不了', () => {
    const fakePlayer = {
      isAlive: () => true,
      inventory: { add: () => true },
      take: () => {},
    };
    const e = new ItemEntity(level, 8.5, 70, 8.5, new ItemInstance(Tile.rock.id, 1, 0));
    e.throwTime = 5;
    e.playerTouch(fakePlayer as never);
    expect(e.removed).toBe(false);
  });
});

describe('ItemEntity 的 NBT 与常量（W21）', () => {
  it('Health 按 (char) 截断后写 short；Age 按 short 截断', () => {
    const e = new ItemEntity(level, 1, 2, 3, new ItemInstance(Tile.rock.id, 1, 0));
    (e as unknown as { health: number }).health = -200; // (char)(-200) = 56
    e.age = 70000; // (short)70000 = 4464
    const tag = new CompoundTag();
    (e as unknown as { addAdditonalSaveData(t: unknown): void }).addAdditonalSaveData(tag);
    expect(tag.getShort('Health')).toBe(56);
    expect(tag.getShort('Age')).toBe(4464);
  });

  it('LIFETIME = 5 * 60 * TicksPerSecond', () => {
    expect(ItemEntity.LIFETIME).toBe(5 * 60 * 20);
  });
});
