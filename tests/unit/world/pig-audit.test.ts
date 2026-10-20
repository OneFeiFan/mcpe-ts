import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import {
  Animal,
  EntityRendererId,
  initItems,
  initTileEntities,
  Item,
  ItemEntity,
  type Level,
  MobTypes,
  Pig,
  Player,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

/**
 * 全量审核 W30：Pig.ts（工作表 11 行）逐行对照的回归测试。
 * 除 W30（`getBreedOffspring` 按 C++ Pig.h 收成 protected）外，其余各行与参考 C++ 一致。
 */
const f = Math.fround;

let level: Level;

class TestPlayer extends Player {}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createFlatLevel();
  initItems(); // Item.porkChop_raw / porkChop_cooked 未注册时访问 .id 会抛错
  initTileEntities();
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
});

/** 把 protected 的成员露出来（C++ 里都是 protected；同 cow-audit.test.ts 的 TestCow） */
class TestPig extends Pig {
  ambient(): string | null {
    return this.getAmbientSound();
  }
  hurtSound(): string {
    return this.getHurtSound();
  }
  deathSound(): string {
    return this.getDeathSound();
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

function makePig(): TestPig {
  const p = new TestPig(level);
  p.setPos(0.5, 64, 0.5);
  level.addEntity(p);
  return p;
}

function droppedIds(): number[] {
  return level.entities
    .filter((e) => e instanceof ItemEntity)
    .map((e) => (e as ItemEntity).item.id);
}

describe('Pig 审核（工作表 11 行）', () => {
  it('构造函数：类型、渲染器、贴图与 float 尺寸', () => {
    const p = makePig();
    expect(p).toBeInstanceOf(Pig);
    expect(p.getEntityTypeId()).toBe(MobTypes.Pig);
    expect(MobTypes.Pig).toBe(12);
    expect(p.getMaxHealth()).toBe(10);
    expect(p.health).toBe(10);
    expect(p.entityRendererId).toBe(EntityRendererId.ER_PIG_RENDERER);
    expect(p.textureName).toBe('mob/pig.png');
    // C++ 是 setSize(0.9f, 0.9f)：断言能分辨 double（0.9 在 float32 里不可精确表示）
    expect(f(0.9)).not.toBe(0.9);
    expect(p.bbWidth).toBe(f(0.9));
    expect(p.bbHeight).toBe(f(0.9));
  });

  it('声音：环境与受伤都是 mob.pig，死亡是 mob.pigdeath', () => {
    const p = makePig();
    expect(p.ambient()).toBe('mob.pig');
    expect(p.hurtSound()).toBe('mob.pig');
    expect(p.deathSound()).toBe('mob.pigdeath');
  });

  it('getDeathLoot：未着火掉生猪肉 63，着火掉熟猪肉 64', () => {
    const p = makePig();
    expect(p.deathLoot()).toBe(Item.porkChop_raw.id);
    // C++ Item.h:213 构造函数是 `id(256 + id)`，Item.cpp:237 传的是 63 / 64 → 实际 id 319 / 320
    expect(Item.porkChop_raw.id).toBe(256 + 63);
    expect(Item.porkChop_cooked.id).toBe(256 + 64);
    expect(Item.porkChop_raw.id).toBe(319);
    expect(Item.porkChop_cooked.id).toBe(320);
    p.onFire = 20;
    expect(p.isOnFire()).toBe(true);
    expect(p.deathLoot()).toBe(Item.porkChop_cooked.id);
  });

  it('死亡掉落：走 Mob.dropDeathLoot，只按 this.random.nextInt(3) 掉 0~2 块生猪肉', () => {
    const p = makePig();
    p.random.setSeed(20261020);
    const ref = new Random(20261020);
    const count = ref.nextInt(3);
    const nextInt = vi.spyOn(p.random, 'nextInt');
    p.loot();
    expect(nextInt).toHaveBeenCalledTimes(1);
    expect(nextInt).toHaveBeenCalledWith(3);
    expect(droppedIds()).toEqual(Array<number>(count).fill(Item.porkChop_raw.id));
    expect(count).toBeGreaterThanOrEqual(0);
    expect(count).toBeLessThanOrEqual(2);
  });

  it('死亡掉落：着火时每一块都是熟猪肉', () => {
    const p = makePig();
    p.onFire = 20;
    p.random.setSeed(20261020);
    const ref = new Random(20261020);
    const count = ref.nextInt(3);
    p.loot();
    expect(droppedIds()).toEqual(Array<number>(count).fill(Item.porkChop_cooked.id));
  });

  it('hasSaddle 恒为 false、setSaddle 空函数、interact 恒为 false（C++ 的鞍同步代码全被注释掉）', () => {
    const p = makePig();
    expect(p.hasSaddle()).toBe(false);
    p.setSaddle(true);
    expect(p.hasSaddle()).toBe(false);
    const player = new TestPlayer(level, false);
    expect(p.interact(player)).toBe(false);
  });

  it('getBreedOffspring 造一只新的 Pig（全参考源码零调用方，照抄）', () => {
    const p = makePig();
    const kid = p.breedOffspring(p);
    expect(kid).toBeInstanceOf(Pig);
    expect(kid).not.toBe(p);
    expect(kid.level).toBe(level);
  });

  it('W30：getBreedOffspring / getDeathLoot 在 C++ 里是 protected，hasSaddle 是 public', () => {
    // 类型层面的检查：C++ Pig.h 第 37 行起是 protected 段
    type PigPublicKeys = keyof Pig;
    const breedIsPublic: 'getBreedOffspring' extends PigPublicKeys ? true : false = false;
    const deathLootIsPublic: 'getDeathLoot' extends PigPublicKeys ? true : false = false;
    const hasSaddleIsPublic: 'hasSaddle' extends PigPublicKeys ? true : false = true;
    void breedIsPublic;
    void deathLootIsPublic;
    void hasSaddleIsPublic;
  });
});
