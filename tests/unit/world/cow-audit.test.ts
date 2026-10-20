import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import {
  Animal,
  Cow,
  EntityRendererId,
  initItems,
  Item,
  ItemEntity,
  type Level,
  MobTypes,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

/**
 * 全量审核 W29：Cow.ts（工作表 13 行）逐行对照的回归测试。
 * 除 W29（`getBreedOffspring` 按 C++ Cow.h 收成 protected）外，其余各行与参考 C++ 一致。
 */
const f = Math.fround;

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createFlatLevel();
  initItems(); // Item.leather / beef_raw / beef_cooked 未注册时访问 .id 会抛错
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
});

/** 把 protected 的成员露出来（C++ 里都是 protected；同 tests/unit/world/chicken.test.ts 的 TestChicken） */
class TestCow extends Cow {
  ambient(): string | null {
    return this.getAmbientSound();
  }
  hurtSound(): string {
    return this.getHurtSound();
  }
  deathSound(): string {
    return this.getDeathSound();
  }
  soundVolume(): number {
    return this.getSoundVolume();
  }
  deathLoot(): number {
    return this.getDeathLoot();
  }
  loot(): void {
    this.dropDeathLoot();
  }
  breedOffspring(target: Animal): Animal {
    return this.getBreedOffspring(target);
  }
}

function makeCow(): TestCow {
  const c = new TestCow(level);
  c.setPos(0.5, 64, 0.5);
  level.addEntity(c);
  return c;
}

function droppedIds(): number[] {
  return level.entities
    .filter((e) => e instanceof ItemEntity)
    .map((e) => (e as ItemEntity).item.id);
}

describe('Cow 审核（工作表 13 行）', () => {
  it('构造函数：类型、渲染器、贴图与 float 尺寸', () => {
    const c = makeCow();
    expect(c).toBeInstanceOf(Cow);
    expect(c.getEntityTypeId()).toBe(MobTypes.Cow);
    expect(MobTypes.Cow).toBe(11);
    expect(c.getMaxHealth()).toBe(10);
    expect(c.health).toBe(10);
    expect(c.entityRendererId).toBe(EntityRendererId.ER_COW_RENDERER);
    expect(c.textureName).toBe('mob/cow.png');
    // C++ 是 setSize(0.9f, 1.3f)：断言能分辨 double（0.9 在 float32 里不可精确表示）
    expect(f(0.9)).not.toBe(0.9);
    expect(c.bbWidth).toBe(f(0.9));
    expect(c.bbHeight).toBe(f(1.3));
  });

  it('声音：mob.cow / mob.cowhurt，音量 0.4f', () => {
    const c = makeCow();
    expect(c.ambient()).toBe('mob.cow');
    expect(c.hurtSound()).toBe('mob.cowhurt');
    expect(c.deathSound()).toBe('mob.cowhurt');
    expect(f(0.4)).not.toBe(0.4);
    expect(c.soundVolume()).toBe(f(0.4));
  });

  it('getDeathLoot 返回皮革 id', () => {
    expect(makeCow().deathLoot()).toBe(Item.leather.id);
  });

  it('死亡掉落：先掉 0~2 个皮革，再掉 1~3 个生牛肉（随机数正好取两次）', () => {
    const c = makeCow();
    c.random.setSeed(20261020);
    const ref = new Random(20261020);
    const leathers = ref.nextInt(3);
    const beefs = ref.nextInt(3) + 1;
    c.loot();
    expect(droppedIds()).toEqual([
      ...Array<number>(leathers).fill(Item.leather.id),
      ...Array<number>(beefs).fill(Item.beef_raw.id),
    ]);
    expect(leathers).toBeGreaterThanOrEqual(0);
    expect(leathers).toBeLessThanOrEqual(2);
    expect(beefs).toBeGreaterThanOrEqual(1);
    expect(beefs).toBeLessThanOrEqual(3);
  });

  it('死亡掉落：着火时每一块都是熟牛肉', () => {
    const c = makeCow();
    c.onFire = 20;
    expect(c.isOnFire()).toBe(true);
    c.random.setSeed(20261020);
    const ref = new Random(20261020);
    const leathers = ref.nextInt(3);
    const beefs = ref.nextInt(3) + 1;
    c.loot();
    expect(droppedIds()).toEqual([
      ...Array<number>(leathers).fill(Item.leather.id),
      ...Array<number>(beefs).fill(Item.beef_cooked.id),
    ]);
  });

  it('getBreedOffspring 造一只新的 Cow（全参考源码零调用方，照抄）', () => {
    const c = makeCow();
    const kid = c.breedOffspring(c);
    expect(kid).toBeInstanceOf(Cow);
    expect(kid).not.toBe(c);
    expect(kid.level).toBe(level);
  });

  it('W29：getBreedOffspring 在 C++ 里是 protected', () => {
    // 类型层面的检查：C++ Cow.h 的 getBreedOffspring 写在 protected 段
    // @ts-expect-error C++ Cow.h 的 getBreedOffspring 是 protected
    const bad = (): unknown => Cow.prototype.getBreedOffspring;
    void bad;
  });
});
