import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import {
  AgableMob,
  Animal,
  Chicken,
  EntityRendererId,
  Item,
  ItemEntity,
  type Level,
  LevelListener,
  Mob,
  MobTypes,
  PathfinderMob,
  Tile,
  initItems,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D10b：`Animal` + `Chicken`。
//
// ⚠ 这里**不测 AI**（PathfinderMob.updateAi 整条 OMIT 了，见 D10a 的注释）。
//   测的是：身份/尺寸/血量、Animal 那几条覆盖、`aiStep` 的扇翅膀数值、
//   以及**下蛋**（5~10 分钟一次的计时是随机的，所以直接改 eggTime 把那一刻提前）。

const f = Math.fround;
const X = 130;
const Y = 64;
const Z = 130;
const TPS = 20;
let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // ⚠ `createFlatLevel()` 里的 initHeadless 只做方块（initTestTiles），**不注册物品** ——
  // 而 `dropDeathLoot` 里 `Item.feather.id` 那几句要有物品才不炸（未注册的是会抛错的哨兵）。
  // 真机顺序也是 initTiles → initItems（NinecraftApp.initApp）。
  createFlatLevel();
  initItems();
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  // 一片平地：Y-1 是草，上面全掏空
  for (let x = X - 6; x <= X + 6; x++)
    for (let z = Z - 6; z <= Z + 6; z++) {
      level.setTileNoUpdate(x, Y - 1, z, Tile.grass.id);
      for (let y = Y; y <= Y + 5; y++) level.setTileNoUpdate(x, y, z, 0);
    }
});

/** 收声音的监听器（下蛋那句 playSound） */
class RecordingListener extends LevelListener {
  sounds: Array<[string, number, number]> = [];
  override playSound(
    name: string,
    _x: number,
    _y: number,
    _z: number,
    volume: number,
    pitch: number,
  ): void {
    this.sounds.push([name, volume, pitch]);
  }
}

/** 把 protected 的成员露出来（这些在 C++ 里都是 protected，测试从子类走） */
class TestChicken extends Chicken {
  setTargetId(id: number): void {
    this.attackTargetId = id;
  }
  targetId(): number {
    return this.attackTargetId;
  }
  flee(): number {
    return this.fleeTime;
  }
  farAway(): boolean {
    return this.removeWhenFarAway();
  }
  findTarget(): Animal | null {
    return this.findAttackTarget() as Animal | null;
  }
  loot(): void {
    this.dropDeathLoot();
  }
  fall(d: number): void {
    this.causeFallDamage(d);
  }
  /** 三个声音方法在 Mob 里是 protected */
  ambient(): string | null {
    return this.getAmbientSound();
  }
  hurtSound(): string {
    return this.getHurtSound();
  }
  deathSound(): string {
    return this.getDeathSound();
  }
}

function makeChicken(): TestChicken {
  const c = new TestChicken(level);
  c.setPos(X + 0.5, Y, Z + 0.5);
  level.addEntity(c);
  return c;
}

/**
 * 一只**悬在空中**的鸡（脚底下那格也是空气）。
 * ⚠ 测"飞行/下落"那几条必须用它：站在地上的鸡跑一遍 `aiStep` 会被 `travel()` 落到地上、
 * `onGround` 变回 true，Chicken 那几行就全走"在地面"的分支了（第一版就是这么写错的）。
 */
function makeAirChicken(): TestChicken {
  const c = new TestChicken(level);
  c.setPos(X + 0.5, Y + 4, Z + 0.5);
  level.addEntity(c);
  return c;
}

/** 世界里所有掉落物的 item id（死亡掉落/下蛋都靠它） */
function droppedIds(): number[] {
  return level.entities
    .filter((e) => e instanceof ItemEntity)
    .map((e) => (e as ItemEntity).item.id);
}

describe('Chicken / Animal（D10b）', () => {
  describe('身份与初值', () => {
    it('继承链：Chicken → Animal → AgableMob → PathfinderMob → Mob', () => {
      const c = makeChicken();
      expect(c).toBeInstanceOf(Animal);
      expect(c).toBeInstanceOf(AgableMob);
      expect(c).toBeInstanceOf(PathfinderMob);
      expect(c).toBeInstanceOf(Mob);
    });

    it('type id 是 MobTypes.Chicken，血量 4，尺寸 0.3×0.7，渲染器/贴图都设了', () => {
      const c = makeChicken();
      expect(c.getEntityTypeId()).toBe(MobTypes.Chicken);
      expect(c.getMaxHealth()).toBe(4);
      expect([c.bbWidth, c.bbHeight]).toEqual([f(0.3), f(0.7)]);
      expect(c.entityRendererId).toBe(EntityRendererId.ER_CHICKEN_RENDERER);
      expect(c.textureName).toBe('mob/chicken.png');
    });

    it('扇翅膀那五个字段的初值（flapping 是 1，其余 0）', () => {
      const c = makeChicken();
      expect([c.sheared, c.flap, c.oFlap, c.flapSpeed, c.oFlapSpeed]).toEqual([false, 0, 0, 0, 0]);
      expect(c.flapping).toBe(1);
    });

    it('⚠ eggTime 初值落在 [5 分钟, 10 分钟) 的刻数里', () => {
      const lo = TPS * 60 * 5;
      for (let i = 0; i < 20; i++) {
        const c = makeChicken();
        expect(c.eggTime).toBeGreaterThanOrEqual(lo);
        expect(c.eggTime).toBeLessThan(2 * lo);
      }
    });
  });

  describe('Animal 覆盖的那几条', () => {
    it('getCreatureBaseType 是 BaseCreature', () => {
      expect(makeChicken().getCreatureBaseType()).toBe(MobTypes.BaseCreature);
    });

    it('getAmbientSoundInterval = 12 * TicksPerSecond = 240', () => {
      expect(makeChicken().getAmbientSoundInterval()).toBe(12 * TPS);
    });

    it('⚠ hurt 会把 fleeTime 设成 3 秒、攻击目标清 0（Animal.hurt 那三句）', () => {
      const c = makeChicken();
      c.setTargetId(7);
      expect(c.hurt(null, 1)).toBe(true);
      expect(c.flee()).toBe(3 * TPS);
      expect(c.targetId()).toBe(0);
    });

    it('getWalkTargetValue：脚下是草 → 10；不是草 → 亮度减 0.5', () => {
      const c = makeChicken();
      expect(c.getWalkTargetValue(X, Y, Z), 'Y-1 是草').toBe(10);
      level.setTileNoUpdate(X, Y - 1, Z, Tile.rock.id);
      expect(c.getWalkTargetValue(X, Y, Z)).toBe(f(level.getBrightness(X, Y, Z) - f(0.5)));
    });

    it('canSpawn：草地上 true；换成石头就 false（Animal 那三句）', () => {
      const c = new TestChicken(level); // 先不加进世界（canSpawn 会被自己挡住）
      c.setPos(X + 0.5, Y, Z + 0.5);
      expect(c.canSpawn()).toBe(true);
      level.setTileNoUpdate(X, Y - 1, Z, Tile.rock.id);
      expect(c.canSpawn()).toBe(false);
    });

    it('removeWhenFarAway 恒 false（动物不会被距离卸载）；findAttackTarget 是 null', () => {
      const c = makeChicken();
      expect(c.farAway()).toBe(false);
      expect(c.findTarget()).toBeNull();
    });
  });

  describe('aiStep 的扇翅膀数值', () => {
    it('站在地上：flapSpeed 被夹到 0、flapping × 0.9、flap += flapping*2', () => {
      const c = makeChicken();
      // ⚠ 先让它真的落地：`aiStep` 里 `super.aiStep()`（Mob）会先跑 `travel()`，
      //   `onGround` 以**那之后**的值为准。站在地上但 yd=0 时 travel 不产生落地碰撞，
      //   `onGround` 会被算成 false（第一版就这么踩的）。给个向下的速度让它压到地面。
      c.yd = f(-1);
      c.flap = 0;
      c.flapping = 1;
      c.flapSpeed = 0;
      c.aiStep();
      expect(c.onGround, '前置条件：这一步之后它在地上').toBe(true);
      expect(c.flapSpeed, '-1 * 0.3 → 夹到 0').toBe(0);
      expect(c.flapping).toBe(f(1 * f(0.9)));
      expect(c.flap).toBe(f(0 + f(f(1 * f(0.9)) * 2)));
      // oFlap / oFlapSpeed 记的是**改动前**的值
      expect(c.oFlap).toBe(0);
      expect(c.oFlapSpeed).toBe(0);
    });

    it('在空中：flapping 被抬回 1；flapSpeed 已经到 1 就不再涨', () => {
      const c = makeAirChicken();
      c.onGround = false;
      c.flapping = f(0.2);
      c.flapSpeed = 1;
      c.aiStep();
      expect(c.onGround, '前置条件：还在空中').toBe(false);
      expect(c.flapSpeed, '夹在上界').toBe(1);
      expect(c.flapping, 'flapping < 1 被抬回 1，再 ×0.9').toBe(f(1 * f(0.9)));
    });

    it('⚠ 在空中且 yd < 0 时下落速度被乘 0.6', () => {
      // ⚠ 这条只能断言**不等式**：`super.aiStep()` 里的 `travel()` 先动过 yd
      //   （阻力 + 重力），测试这边不重新实现一遍那套算式。
      //   不带 ×0.6 时 travel 的结果比初值更负（≈ -1.06），带 ×0.6 时明显变浅 ——
      //   所以 `> -1` 这条能咬住"把这行删掉"（扰动验过）。
      const c = makeAirChicken();
      c.onGround = false;
      c.flapping = 1;
      c.yd = f(-1);
      c.aiStep();
      expect(c.onGround).toBe(false);
      expect(c.yd, `下落速度被压小了（实测 ${c.yd}）`).toBeGreaterThan(-1);
      expect(c.yd).toBeLessThan(0);
    });
  });

  describe('下蛋', () => {
    it('⚠ eggTime 减到 0 那一刻掉一个蛋，并重新抽 5~10 分钟', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      const c = makeChicken();
      expect(c.eggTime).toBeGreaterThan(1000);

      c.eggTime = 1; // 把那一刻提前
      const before = level.entities.length;
      c.aiStep();

      expect(level.entities.length, '多了一个掉落物').toBe(before + 1);
      const dropped = level.entities[level.entities.length - 1]!;
      expect(dropped).toBeInstanceOf(ItemEntity);
      expect((dropped as ItemEntity).item.id, '掉的是蛋').toBe(Item.egg.id);
      expect((dropped as ItemEntity).item.count).toBe(1);
      expect(rec.sounds.length).toBe(1);
      expect(rec.sounds[0]![0]).toBe('mob.chickenplop');
      expect(c.eggTime, '重新抽过').toBeGreaterThan(1000);
    });

    it('eggTime 还没到（= 2）时不掉蛋，只减到 1', () => {
      const c = makeChicken();
      c.eggTime = 2;
      const before = level.entities.length;
      c.aiStep();
      expect(level.entities.length).toBe(before);
      expect(c.eggTime, '前置自减：2 → 1').toBe(1);
    });

    it('⚠ 客户端不掉蛋，而且 `--eggTime` **根本不执行**（`&&` 短路）', () => {
      level.isClientSide = true;
      const c = makeChicken();
      c.eggTime = 1;
      const before = level.entities.length;
      c.aiStep();
      expect(level.entities.length).toBe(before);
      expect(c.eggTime, '原句是 `!isClientSide && --eggTime <= 0`，短路了就不减').toBe(1);
    });

    it('幼崽不掉蛋（外面那层 !isBaby）', () => {
      const c = makeChicken();
      // ⚠ 不能用 `setAge(-1)`：`aiStep` 里 `super.aiStep()`（AgableMob）会先把 age 往上加一格
      //   （-1 → 0），等 Chicken 那几行跑到 `isBaby()` 时它**已经是成年**了 —— 于是照样下蛋。
      //   这是原样行为。要让它"这一步之后仍然是幼崽"，age 得给得更小。
      c.setAge(-100);
      c.eggTime = 1;
      const before = level.entities.length;
      c.aiStep();
      expect(c.getAge(), 'age 只往上加一格，还是幼崽').toBe(-99);
      expect(c.isBaby()).toBe(true);
      expect(level.entities.length, '没掉蛋').toBe(before);
    });
  });

  describe('死亡掉落', () => {
    it('先掉 0~2 根羽毛、再掉生鸡肉', () => {
      const c = makeChicken();
      c.loot();
      const ids = droppedIds();
      expect(ids[ids.length - 1], '最后一个是生鸡肉').toBe(Item.chicken_raw.id);
      const feathers = ids.filter((id) => id === Item.feather.id).length;
      expect(feathers, '羽毛 0~2 根').toBeGreaterThanOrEqual(0);
      expect(feathers).toBeLessThanOrEqual(2);
    });

    it('⚠ 身上着火时掉的是**熟**鸡肉', () => {
      const c = makeChicken();
      c.onFire = 1;
      expect(c.isOnFire()).toBe(true);
      c.loot();
      const ids = droppedIds();
      expect(ids[ids.length - 1]).toBe(Item.chicken_cooked.id);
      expect(ids).not.toContain(Item.chicken_raw.id);
    });
  });

  describe('零碎', () => {
    it('causeFallDamage 是空函数体（鸡摔不死）', () => {
      const c = makeChicken();
      expect(() => c.fall(100)).not.toThrow();
    });

    it('三个声音名照 C++', () => {
      const c = makeChicken();
      expect(c.ambient()).toBe('mob.chicken');
      expect(c.hurtSound()).toBe('mob.chickenhurt');
      expect(c.deathSound()).toBe('mob.chickenhurt');
    });

    it('getBreedOffspring 造一只新的鸡（全参考源码零调用方，照抄）', () => {
      const c = makeChicken();
      const kid = c.getBreedOffspring(c);
      expect(kid).toBeInstanceOf(Chicken);
      expect(kid).not.toBe(c);
    });

    it('存档往返：Age 是 AgableMob 那层写的，Chicken 自己不额外加字段', () => {
      const c = makeChicken();
      c.setAge(-3);
      const tag = new CompoundTag();
      expect(c.save(tag), '前置条件：能存下来').toBe(true);
      expect(tag.getInt('Age')).toBe(-3);

      const back = new Chicken(level);
      back.load(tag);
      expect(back.getAge()).toBe(-3);
      expect(back.isBaby()).toBe(true);
      expect(back.getEntityTypeId()).toBe(MobTypes.Chicken);
    });
  });
});
