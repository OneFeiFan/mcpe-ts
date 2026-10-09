import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import {
  Chicken,
  EggItem,
  Entity,
  EntityRendererId,
  EntityTypes,
  HitResult,
  Item,
  ItemInstance,
  type Level,
  LevelListener,
  ParticleType,
  ThrownEgg,
  initItems,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D10c：`ThrownEgg`（63 行，纯头文件）+ 接线（EggItem / EntityFactory）。
//
// ⚠ 三处和 `Snowball` 对照着记：
//   1. `onHit` 在这里是 **protected**（Snowball 那边是 public）—— 所以下面用 `TestEgg` 露出来，
//      Snowball 的测试是直接调的。这两条测试合起来就钉住了"可见性不一致是原样"。
//   2. 孵鸡用的是 **`Entity.sharedRandom`**（静态量），测试里用 `setSeed` 把抽取结果固定住。
//   3. 两次抽取连着：先 `nextInt(8)==0` 决定孵不孵，再 `nextInt(32)==0` 决定 1 只还是 4 只。

const f = Math.fround;
const X = 130;
const Y = 64;
const Z = 130;
let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // ⚠ 无头 helper 只做方块（initTestTiles），**不注册物品** ——
  // 而下面要断言 `Item.egg.id`（未注册的是会抛错的哨兵）。真机顺序也是 initTiles → initItems。
  createFlatLevel();
  initItems();
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  for (let x = X - 8; x <= X + 8; x++)
    for (let z = Z - 8; z <= Z + 8; z++) {
      level.setTileNoUpdate(x, Y - 1, z, 2); // grass
      for (let y = Y; y <= Y + 5; y++) level.setTileNoUpdate(x, y, z, 0);
    }
});

/** 收粒子的监听器 */
class RecordingListener extends LevelListener {
  particles: Array<[string | number, number, number, number]> = [];
  override addParticle(
    name: string | ParticleType.Id,
    x: number,
    y: number,
    z: number,
    _xa: number,
    _ya: number,
    _za: number,
    _data: number,
  ): void {
    this.particles.push([name, x, y, z]);
  }
}

/** `onHit` 是 protected —— 从子类露出来（顺带就是"它确实是 protected"的编译期证明） */
class TestEgg extends ThrownEgg {
  hit(res: HitResult): void {
    this.onHit(res);
  }
}

/**
 * 找一个能让 `nextInt(8) === 0`（会孵）的种子。
 * `Random` 是确定性的，同一个种子在探针实例和 `Entity.sharedRandom` 上抽出的序列一样。
 */
function findSeed(pred: (r: Random) => boolean): number {
  for (let s = 1; s < 5000; s++) {
    const r = new Random();
    r.setSeed(s);
    if (pred(r)) return s;
  }
  throw new Error('找不到种子');
}

const HATCH_SEED = findSeed((r) => r.nextInt(8) === 0);
const NO_HATCH_SEED = findSeed((r) => r.nextInt(8) !== 0);
const FOUR_SEED = findSeed((r) => r.nextInt(8) === 0 && r.nextInt(32) === 0);

/** 一个只记 hurt 调用的目标 */
function fakeTarget(): { entity: Entity; calls: Array<[Entity, number]> } {
  const calls: Array<[Entity, number]> = [];
  const entity = {
    x: 1,
    y: 2,
    z: 3,
    hurt: (source: Entity, dmg: number) => {
      calls.push([source, dmg]);
      return true;
    },
  } as unknown as Entity;
  return { entity, calls };
}

function chickensInWorld(): Chicken[] {
  return level.entities.filter((e) => e instanceof Chicken) as Chicken[];
}

describe('ThrownEgg（D10c）', () => {
  describe('身份', () => {
    it('三个构造函数都设 ER_THROWNEGG_RENDERER，type id 是 IdThrownEgg', () => {
      const a = new TestEgg(level);
      expect(a.entityRendererId).toBe(EntityRendererId.ER_THROWNEGG_RENDERER);
      expect(a.getEntityTypeId()).toBe(EntityTypes.IdThrownEgg);

      const b = new TestEgg(level, 12.5, 71.5, 13.5);
      expect(b.entityRendererId).toBe(EntityRendererId.ER_THROWNEGG_RENDERER);
      expect([b.x, b.y, b.z]).toEqual([12.5, 71.5, 13.5]);

      const c = new TestEgg(level, {
        entityId: 9,
        x: 1,
        y: 70,
        z: 1,
        yRot: 0,
        xRot: 0,
        heightOffset: 0,
        getHeadHeight: () => 1.6,
        isPlayer: () => false,
      } as never);
      expect(c.entityRendererId).toBe(EntityRendererId.ER_THROWNEGG_RENDERER);
      expect(c.getAuxData(), 'ownerId 记的也是 mob.entityId').toBe(9);
    });
  });

  describe('onHit 的公共部分', () => {
    it('撞实体：hurt(this, 0)（伤害 0，和雪球一样）', () => {
      const { entity, calls } = fakeTarget();
      const e = new TestEgg(level, 5.5, 70.5, 5.5);
      e.hit(new HitResult(entity));
      expect(calls.length).toBe(1);
      expect(calls[0]![0]).toBe(e);
      expect(calls[0]![1]).toBe(0);
    });

    it('6 个 snowballpoof 粒子，坐标是蛋自己的位置', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      const e = new TestEgg(level, 5.5, 70.5, 5.5);
      e.hit(new HitResult(fakeTarget().entity));
      expect(rec.particles.length).toBe(6);
      for (const p of rec.particles) {
        expect(p[0]).toBe(ParticleType.snowballpoof);
        expect([p[1], p[2], p[3]]).toEqual([f(5.5), f(70.5), f(5.5)]);
      }
    });

    it('服务端命中后 remove()；客户端不 remove', () => {
      const a = new TestEgg(level, 5.5, 70.5, 5.5);
      a.hit(new HitResult(fakeTarget().entity));
      expect(a.removed).toBe(true);

      level.isClientSide = true;
      const b = new TestEgg(level, 5.5, 70.5, 5.5);
      b.hit(new HitResult(fakeTarget().entity));
      expect(b.removed).toBe(false);
    });
  });

  describe('孵鸡（用 setSeed 把随机数固定住）', () => {
    it('⚠ 抽中 nextInt(8)==0：孵 1 只鸡，位置/朝向 = 蛋的（moveTo(x,y,z,yRot,0)）', () => {
      Entity.sharedRandom.setSeed(HATCH_SEED);
      const e = new TestEgg(level, X + 0.5, Y + 2, Z + 0.5);
      e.yRot = 77;
      level.addEntity(e);

      e.hit(new HitResult(fakeTarget().entity));

      const chickens = chickensInWorld();
      expect(chickens.length).toBe(1);
      expect([chickens[0]!.x, chickens[0]!.y, chickens[0]!.z]).toEqual([X + 0.5, Y + 2, Z + 0.5]);
      expect(chickens[0]!.yRot).toBe(77);
      expect(chickens[0]!.xRot, '第五个参数写死 0').toBe(0);
    });

    it('没抽中（nextInt(8)!=0）：一只都不孵，但照样放粒子 + remove', () => {
      Entity.sharedRandom.setSeed(NO_HATCH_SEED);
      const rec = new RecordingListener();
      level.addListener(rec);
      const e = new TestEgg(level, X + 0.5, Y + 2, Z + 0.5);
      level.addEntity(e);

      e.hit(new HitResult(fakeTarget().entity));

      expect(chickensInWorld().length).toBe(0);
      expect(rec.particles.length).toBe(6);
      expect(e.removed).toBe(true);
    });

    it('⚠ 两次都抽中：孵 **4** 只（第二次 nextInt(32)==0 那个分支）', () => {
      Entity.sharedRandom.setSeed(FOUR_SEED);
      const e = new TestEgg(level, X + 0.5, Y + 2, Z + 0.5);
      level.addEntity(e);
      e.hit(new HitResult(fakeTarget().entity));
      expect(chickensInWorld().length).toBe(4);
    });

    it('客户端：哪怕抽中了也不孵（守卫在抽取**之前**）', () => {
      Entity.sharedRandom.setSeed(HATCH_SEED);
      level.isClientSide = true;
      const e = new TestEgg(level, X + 0.5, Y + 2, Z + 0.5);
      level.addEntity(e);
      e.hit(new HitResult(fakeTarget().entity));
      expect(chickensInWorld().length).toBe(0);
    });
  });

  describe('EggItem 接线', () => {
    // 蛋的物品 id 是 88 + 256 = 344（Item 构造函数里的 +256 偏移）
    const EGG_ID = 88 + 256;
    function fakePlayer(instabuild: boolean): never {
      return {
        entityId: 42,
        x: 12.5,
        y: 64,
        z: 13.5,
        yRot: 0,
        xRot: 0,
        heightOffset: 0,
        getHeadHeight: () => 1.6,
        isPlayer: () => true,
        aimDirection: { x: 0, y: 0, z: 1 },
        abilities: { instabuild },
      } as never;
    }

    it('服务端 use：造一个 ThrownEgg；创造模式不减数量', () => {
      const item = new EggItem(88);
      expect(item.id).toBe(EGG_ID);
      expect(Item.egg.id).toBe(EGG_ID);
      const inst = new ItemInstance(EGG_ID, 16, 0);
      const before = level.entities.length;
      item.use(inst, level, fakePlayer(true));
      expect(level.entities.length).toBe(before + 1);
      expect(level.entities[level.entities.length - 1]).toBeInstanceOf(ThrownEgg);
      expect(inst.count, '创造模式不减').toBe(16);
    });

    it('客户端 use：不造实体', () => {
      level.isClientSide = true;
      const item = new EggItem(88);
      const inst = new ItemInstance(EGG_ID, 16, 0);
      const before = level.entities.length;
      item.use(inst, level, fakePlayer(false));
      expect(level.entities.length).toBe(before);
      expect(inst.count, '非创造模式照减').toBe(15);
    });
  });
});
