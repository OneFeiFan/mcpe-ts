import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type Entity,
  EntityRendererId,
  EntityTypes,
  HitResult,
  ItemInstance,
  type Level,
  LevelListener,
  type Mob,
  ParticleType,
  type Player,
  Snowball,
  SnowballItem,
  Vec3,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D9：`Snowball`（50 行，纯头文件类）+ 接线（SnowballItem / EntityFactory）。
//
// ⚠ 这个文件里最要紧的三条"原样行为"：
//   1. `onHit` 里 `hurt(this, 0)` —— **伤害是 0**，雪球打人不掉血；
//   2. `onHit` 是 **public**（ThrownEgg 那边是 protected）—— 下面直接调它，
//      **这行代码本身就是编译期证明**：改成 protected 这个文件就 typecheck 不过；
//   3. `onHit` **不设 `inGround`** —— 雪球不会走 Throwable 那条"插在地上躺 20 分钟"的路。

const f = Math.fround;
let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
});

/** 收粒子/声音的监听器（Level.addParticle 只转给 listener） */
class RecordingListener extends LevelListener {
  particles: Array<[string | number, number, number, number, number, number, number, number]> = [];
  sounds: Array<[string, number, number, number]> = [];

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

  override playSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void {
    this.sounds.push([name, volume, pitch, x]);
  }
}

/**
 * `Throwable(Level*, Mob*)` 只读 owner 这几个成员 —— 给个最小替身就够。
 * `isPlayer()` 返回 true 时会走 `shootVec(mob.aimDirection, …)`。
 */
function fakeMob(opts: { isPlayer?: boolean } = {}): Mob {
  return {
    entityId: 77,
    x: 10.5,
    y: 70,
    z: 10.5,
    yRot: 0,
    xRot: 0,
    heightOffset: 0,
    getHeadHeight: () => 1.6,
    isPlayer: () => opts.isPlayer === true,
    aimDirection: new Vec3(0, 0, 1),
  } as unknown as Mob;
}

function fakePlayer(instabuild: boolean): Player {
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
    aimDirection: new Vec3(0, 0, 1),
    abilities: { instabuild },
  } as unknown as Player;
}

/** 一个只记 hurt 调用的目标（HitResult(Entity*) 那条路） */
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

describe('Snowball（D9）', () => {
  describe('构造与身份', () => {
    it('单参构造：尺寸照基类 0.25×0.25，渲染器 id 是 ER_SNOWBALL_RENDERER', () => {
      const s = new Snowball(level);
      expect([s.bbWidth, s.bbHeight]).toEqual([f(0.25), f(0.25)]);
      expect(s.entityRendererId).toBe(EntityRendererId.ER_SNOWBALL_RENDERER);
      expect([s.x, s.y, s.z]).toEqual([0, 0, 0]);
    });

    it('三参构造：setPos 到位，渲染器 id 也设了（三个构造各写了一遍）', () => {
      const s = new Snowball(level, 12.5, 71.5, 13.5);
      expect([s.x, s.y, s.z]).toEqual([12.5, 71.5, 13.5]);
      expect(s.entityRendererId).toBe(EntityRendererId.ER_SNOWBALL_RENDERER);
      expect(s.heightOffset, '基类三参构造会把 heightOffset 归零').toBe(0);
    });

    it('带 owner 的构造：ownerId 记的是 mob.entityId，出生点在 mob 身上', () => {
      const mob = fakeMob();
      const s = new Snowball(level, mob);
      expect(s.entityRendererId).toBe(EntityRendererId.ER_SNOWBALL_RENDERER);
      expect(s.getAuxData(), 'getAuxData() 给的就是 ownerId').toBe(77);
      // mob 在 (10.5, 70, 10.5)，雪球从"眼睛高度 - 0.1、朝身后偏 0.16"出来
      expect(s.x).toBeCloseTo(10.34, 5);
      expect(s.y).toBeCloseTo(71.5, 5);
      expect(s.z).toBeCloseTo(10.5, 5);
    });

    it('getEntityTypeId() 返回 IdSnowball', () => {
      expect(new Snowball(level).getEntityTypeId()).toBe(EntityTypes.IdSnowball);
    });
  });

  describe('onHit', () => {
    it('撞到实体：hurt(this, 0)，收到的是雪球自己、伤害是 0', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      const { entity, calls } = fakeTarget();

      const s = new Snowball(level, 5.5, 70.5, 5.5);
      s.onHit(new HitResult(entity)); // public —— 这行是编译期证明

      expect(calls.length).toBe(1);
      expect(calls[0]![0], '伤害来源是雪球自己').toBe(s);
      expect(calls[0]![1], '⚠ 原句就是 hurt(this, 0)：雪球不掉血').toBe(0);
    });

    it('撞任何东西都放 6 个 snowballpoof 粒子，坐标是雪球自己的位置', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      const s = new Snowball(level, 5.5, 70.5, 5.5);
      s.onHit(new HitResult(fakeTarget().entity));

      expect(rec.particles.length).toBe(6);
      for (const p of rec.particles) {
        expect(p[0]).toBe(ParticleType.snowballpoof);
        expect([p[1], p[2], p[3]], '粒子的速度三个分量都是 0').toEqual([f(5.5), f(70.5), f(5.5)]);
        expect([p[4], p[5], p[6], p[7]]).toEqual([0, 0, 0, 0]);
      }
    });

    it('撞到方块（非 ENTITY 那条路）：不调 hurt，粒子照样放', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      const s = new Snowball(level, 5.5, 70.5, 5.5);
      s.onHit(new HitResult(5, 70, 5, 0, new Vec3(5.5, 70.5, 5.5)));
      expect(rec.particles.length).toBe(6);
    });

    it('服务端：onHit 之后自己 remove()', () => {
      const s = new Snowball(level, 5.5, 70.5, 5.5);
      expect(s.removed).toBe(false);
      s.onHit(new HitResult(fakeTarget().entity));
      expect(s.removed).toBe(true);
    });

    it('客户端：不 remove（`if (!level->isClientSide)` 那道守卫），粒子照放', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      level.isClientSide = true;
      const s = new Snowball(level, 5.5, 70.5, 5.5);
      s.onHit(new HitResult(fakeTarget().entity));
      expect(s.removed, '客户端这颗雪球是服务器同步过来的，命中了也不能自己删').toBe(false);
      expect(rec.particles.length).toBe(6);
    });

    it('⚠ onHit 不设 inGround —— 雪球永远走不到"插在地上"那条路', () => {
      const s = new Snowball(level, 5.5, 70.5, 5.5);
      s.onHit(new HitResult(fakeTarget().entity));
      expect((s as unknown as { inGround: boolean }).inGround).toBe(false);
    });
  });

  describe('SnowballItem 接线', () => {
    it('服务端 use：造一个 Snowball、owner 是玩家、数量减一', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      const player = fakePlayer(false);
      const item = new SnowballItem(83);
      const inst = new ItemInstance(83 + 256, 3, 0);
      const before = level.entities.length;

      const ret = item.use(inst, level, player);

      expect(level.entities.length, '雪球进世界了').toBe(before + 1);
      const s = level.entities[level.entities.length - 1]!;
      expect(s).toBeInstanceOf(Snowball);
      expect(s.getAuxData(), 'owner 就是扔它的玩家').toBe(42);
      expect(inst.count).toBe(2);
      expect(ret).toBe(inst);
      expect(rec.sounds.length, 'random.bow 那句照旧').toBe(1);
      expect(rec.sounds[0]![0]).toBe('random.bow');
      expect(rec.sounds[0]![1]).toBe(0.5);
    });

    it('创造模式：数量不减，雪球照扔', () => {
      const player = fakePlayer(true);
      const item = new SnowballItem(83);
      const inst = new ItemInstance(83 + 256, 3, 0);
      item.use(inst, level, player);
      expect(inst.count).toBe(3);
    });

    it('客户端 use：只放声音不造实体（`!isClientSide` 守卫）', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      level.isClientSide = true;
      const player = fakePlayer(false);
      const item = new SnowballItem(83);
      const inst = new ItemInstance(83 + 256, 3, 0);
      const before = level.entities.length;

      item.use(inst, level, player);

      expect(level.entities.length).toBe(before);
      expect(inst.count, '数量照减（原句先减再判 isClientSide）').toBe(2);
      expect(rec.sounds.length).toBe(1);
    });
  });
});
