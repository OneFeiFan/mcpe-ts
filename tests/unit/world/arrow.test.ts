import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import { Random } from '@mcpe/util';
import {
  Arrow,
  Entity,
  EntityRendererId,
  EntityTypes,
  type Entity as EntityType,
  HitResult,
  type Level,
  LevelListener,
  Mob,
  MobTypes,
  ParticleType,
  Player,
  Tile,
  initItems,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D11a：`Arrow`（346 行，这批最大的）。
//
// ⚠ 它继承 **`Entity`**，不是 `Throwable` —— 所以 `shoot`/`lerpMotion`/`tick` 是
// 和 Throwable 相似但**有差异**的另一份代码，这个文件专门钉那些差异：
//   1. `shoot` **没有除零保护**（方向为 0 时直接除出 NaN）
//   2. 落地存活是 `++life == 60 * TicksPerSecond`（Throwable 那边硬编码 20*60）
//   3. 重力写死 0.05f（Throwable 用虚函数 getGravity）
//   4. `tick` 开头有一段"自己是不是在某个方块碰撞盒里" → 会把 inGround 置 true
//   5. 命中实体的伤害是**自己算的** `ceil(|v| * 2.0f)`

const f = Math.fround;
const X = 130;
const Y = 64;
const Z = 130;
const TPS = 20;
let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // ⚠ `playerTouch` 里要 `new ItemInstance(Item.arrow, 1)` —— 物品得先注册好
  // （无头的 createFlatLevel 只做方块）。真机顺序也是 initTiles → initItems。
  createFlatLevel();
  initItems();
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
  for (let x = X - 8; x <= X + 8; x++)
    for (let z = Z - 8; z <= Z + 8; z++) {
      level.setTileNoUpdate(x, Y - 1, z, 2); // grass
      for (let y = Y; y <= Y + 8; y++) level.setTileNoUpdate(x, y, z, 0);
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

/** 可被命中、hurt 结果可控的目标 */
class Target extends Arrow {
  hurtResult = true;
  hurtCalls: number[] = [];
  override isPickable(): boolean {
    return !this.removed;
  }
  override hurt(_source: EntityType | null, dmg: number): boolean {
    this.hurtCalls.push(dmg);
    return this.hurtResult;
  }
}

/** 把 private 露出来 */
class TestArrow extends Arrow {
  tiles(): [number, number, number, number, number] {
    const self = this as unknown as {
      xTile: number;
      yTile: number;
      zTile: number;
      lastTile: number;
      lastData: number;
    };
    return [self.xTile, self.yTile, self.zTile, self.lastTile, self.lastData];
  }
  lifeValue(): number {
    return (this as unknown as { life: number }).life;
  }
  flight(): number {
    return (this as unknown as { flightTime: number }).flightTime;
  }
  isInGround(): boolean {
    return (this as unknown as { inGround: boolean }).inGround;
  }
  setLastTile(v: number): void {
    (this as unknown as { lastTile: number }).lastTile = v;
  }
}

function fakeMob(): Mob {
  return {
    entityId: 77,
    x: 10.5,
    y: 70,
    z: 10.5,
    yRot: 0,
    xRot: 0,
    heightOffset: 0,
    getHeadHeight: () => 1.6,
    isPlayer: () => false,
  } as unknown as Mob;
}

describe('Arrow（D11a）', () => {
  describe('三个构造与 _init', () => {
    it('单参构造：_init 的初值逐项', () => {
      const a = new TestArrow(level);
      expect(a.entityRendererId).toBe(EntityRendererId.ER_ARROW_RENDERER);
      expect([a.bbWidth, a.bbHeight]).toEqual([f(0.5), f(0.5)]);
      expect(a.shakeTime).toBe(0);
      expect(a.critArrow).toBe(false);
      expect(a.playerArrow).toBe(false);
      expect(a.ownerId).toBe(0);
      expect(a.isInGround()).toBe(false);
      expect(a.tiles()).toEqual([-1, -1, -1, 0, 0]);
      expect(a.lifeValue()).toBe(0);
      expect(a.flight()).toBe(0);
    });

    it('三参构造：setPos + heightOffset 归零', () => {
      const a = new TestArrow(level, 12.5, 71.5, 13.5);
      expect([a.x, a.y, a.z]).toEqual([12.5, 71.5, 13.5]);
      expect(a.heightOffset).toBe(0);
    });

    it('Mob 构造：ownerId/playerArrow 取自作 owner，速度方向大致沿视线、大小是 power*1.5', () => {
      const a = new TestArrow(level, fakeMob(), 1);
      expect(a.ownerId).toBe(77);
      expect(a.playerArrow).toBe(false);
      const speed = Math.sqrt(a.xd * a.xd + a.yd * a.yd + a.zd * a.zd);
      // 1.5f * 1 再加三个 gaussian 扰动（半径 0.0075）—— 允许一点点偏差
      expect(speed).toBeGreaterThan(1.4);
      expect(speed).toBeLessThan(1.6);
      expect(a.heightOffset).toBe(0);
    });

    it('Mob 是玩家时 playerArrow 为 true', () => {
      const mob = fakeMob();
      (mob as unknown as { isPlayer: () => boolean }).isPlayer = () => true;
      expect(new TestArrow(level, mob, 1).playerArrow).toBe(true);
    });
  });

  describe('shoot', () => {
    it('uncertainty 为 0 时：方向归一化 × power，朝向也设好', () => {
      const a = new TestArrow(level, 0, 0, 0);
      a.shoot(0, 0, 1, 2, 0);
      expect([a.xd, a.yd, a.zd]).toEqual([0, 0, 2]);
      expect(a.yRot).toBeCloseTo(0, 5);
      expect(a.xRot).toBeCloseTo(0, 5);
      expect(a.lifeValue()).toBe(0);
    });

    it('⚠ **没有除零保护**：方向向量为 0 时直接除出 NaN（Throwable 那边有守卫，这里没有）', () => {
      const a = new TestArrow(level, 0, 0, 0);
      a.shoot(0, 0, 0, 1, 0);
      expect(Number.isNaN(a.xd), `xd=${a.xd}`).toBe(true);
      expect(Number.isNaN(a.yd)).toBe(true);
      expect(Number.isNaN(a.zd)).toBe(true);
    });
  });

  describe('lerpMotion', () => {
    it('朝向是 0 时顺手算朝向、moveTo、life 归零（Throwable 那边没有后两句）', () => {
      const a = new TestArrow(level, 5.5, 70.5, 5.5);
      a.lerpMotion(0, 0, 1);
      expect([a.xd, a.yd, a.zd]).toEqual([0, 0, 1]);
      expect(a.yRot).toBeCloseTo(0, 5);
      expect(a.lifeValue()).toBe(0);
    });

    it('朝向已经设过时只改速度', () => {
      const a = new TestArrow(level, 5.5, 70.5, 5.5);
      a.yRotO = 90;
      a.xRotO = 45;
      a.lerpMotion(1, 0, 0);
      expect([a.yRot, a.xRot]).toEqual([0, 0]);
    });
  });

  describe('tick', () => {
    it('飞出去：位置前进、重力 0.05 把 yd 往下拉（Throwable 是 0.03）', () => {
      const a = new TestArrow(level, X + 0.5, Y + 5, Z + 0.5);
      a.shoot(0, 0, 1, 1, 0);
      level.addEntity(a);
      const z0 = a.z;
      level.tickEntities();
      expect(a.z).toBeGreaterThan(z0);
      // 0.99 * 0 - 0.05
      expect(a.yd).toBe(f(f(0) - f(0.05)));
    });

    it('撞到方块 → inGround true、shakeTime 7、critArrow 清掉、位置往后退 0.05', () => {
      for (let y = Y; y <= Y + 4; y++)
        for (let x = X - 1; x <= X + 1; x++) level.setTileNoUpdate(x, y, Z + 3, Tile.rock.id);
      const a = new TestArrow(level, X + 0.5, Y + 1, Z + 0.5);
      a.shoot(0, 0, 1, 2, 0);
      a.critArrow = true;
      level.addEntity(a);
      for (let i = 0; i < 20 && !a.isInGround(); i++) level.tickEntities();
      expect(a.isInGround()).toBe(true);
      expect(a.shakeTime).toBe(7);
      expect(a.critArrow, '插住之后暴击标记清掉').toBe(false);
      expect(a.z, '没穿进墙里').toBeLessThan(Z + 3);
    });

    it('⚠ 插住之后 life 一直涨，到 `60 * TicksPerSecond` 那刻才 remove（是**等于**判断）', () => {
      // 用读存档那条路进入"插住"状态（inGround 只有它和 tick 的 AABB 判断会写）
      const tag = new CompoundTag();
      tag.putShort('xTile', X);
      tag.putShort('yTile', Y);
      tag.putShort('zTile', Z);
      tag.putByte('inTile', Tile.rock.id);
      tag.putByte('inData', 0);
      tag.putByte('shake', 0);
      tag.putByte('inGround', 1);
      tag.putBoolean('player', false);
      const a = new TestArrow(level, X + 0.5, Y, Z + 0.5);
      a.load(tag);
      a.setPos(X + 0.5, Y, Z + 0.5);
      level.setTileNoUpdate(X, Y, Z, Tile.rock.id);
      level.addEntity(a);

      for (let i = 0; i < 60 * TPS - 1; i++) level.tickEntities();
      expect(a.lifeValue()).toBe(60 * TPS - 1);
      expect(a.removed, `life=${60 * TPS - 1} 时还在`).toBe(false);
      level.tickEntities();
      expect(a.removed, 'life == 60*TPS 那刻 remove').toBe(true);
    });

    it('插住的那格方块换了 → 掉出来（速度被随机数缩到 0.2 倍以内）', () => {
      const a = new TestArrow(level, X + 0.5, Y, Z + 0.5);
      a.xd = f(1);
      a.yd = 0;
      a.zd = 0;
      const tag = new CompoundTag();
      tag.putShort('xTile', X);
      tag.putShort('yTile', Y);
      tag.putShort('zTile', Z);
      tag.putByte('inTile', 0); // 存档里记的方块是 0（空气），世界里放的是石头 → 不等
      tag.putByte('inData', 0);
      tag.putByte('shake', 0);
      tag.putByte('inGround', 1);
      tag.putBoolean('player', false);
      a.load(tag);
      a.setPos(X + 0.5, Y, Z + 0.5);
      a.xd = f(1);
      level.setTileNoUpdate(X, Y, Z, Tile.rock.id);
      level.addEntity(a);
      level.tickEntities();
      expect(a.isInGround(), '方块变了 → 掉出来').toBe(false);
      expect(Math.abs(a.xd)).toBeLessThanOrEqual(f(0.2));
      expect(a.flight(), 'flightTime 归零').toBe(0);
    });

    it('⚠ 在水里：阻力从 0.99 变成 0.80，还会冒 4 个气泡粒子', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      // 在箭经过的地方灌一格水
      for (let y = Y + 4; y <= Y + 6; y++) level.setTileNoUpdate(X, y, Z, Tile.water.id);
      const a = new TestArrow(level, X + 0.5, Y + 5.5, Z + 0.5);
      a.shoot(0, 0, 1, 1, 0);
      level.addEntity(a);
      expect(a.isInWater(), '前置条件：泡在水里').toBe(true);
      const zd0 = a.zd;
      level.tickEntities();
      const bubbles = rec.particles.filter((p) => p[0] === ParticleType.bubble);
      expect(bubbles.length).toBe(4);
      // ⚠ 水的阻力是 0.8（不是 0.99）；这里断言**精确值**，别用"小于 zd0*0.9"那种阈值 ——
      //   `f(0.9) = 0.899999976…` 比 double 的 0.9 小，阈值比较会把"改成 0.9"的扰动放过去（实测踩过）。
      expect(a.zd).toBe(f(zd0 * f(0.8)));
    });

    it('⚠ `tick` 开头那段"自己是不是在方块碰撞盒里"会把 inGround 置 true（另一条路是撞墙）', () => {
      // 造一个"箭已经在石头方块内部"的状态：xTile/yTile/zTile 指着那块石头、
      // lastTile 也记成它（不然下面那条 `tile != lastTile` 会立刻把它又设回 false）
      level.setTileNoUpdate(X, Y, Z, Tile.rock.id);
      const a = new TestArrow(level, X + 0.5, Y + 0.5, Z + 0.5);
      const tag = new CompoundTag();
      tag.putShort('xTile', X);
      tag.putShort('yTile', Y);
      tag.putShort('zTile', Z);
      tag.putByte('inTile', Tile.rock.id);
      tag.putByte('inData', 0);
      tag.putByte('shake', 0);
      tag.putByte('inGround', 0);
      tag.putBoolean('player', false);
      a.load(tag);
      a.setPos(X + 0.5, Y + 0.5, Z + 0.5);
      level.addEntity(a);
      expect(a.isInGround(), '前置条件：还没插住').toBe(false);

      level.tickEntities();
      expect(a.isInGround(), 'AABB 包含住它 → 置 true').toBe(true);
      expect(a.lifeValue(), '还是同一块石头 → 走 ++life 那条').toBe(1);
    });

    it('命中实体：伤害 = ceil(|v| * 2.0f)，命中后自己 remove', () => {
      const target = new Target(level, X + 0.5, Y + 2, Z + 2.5);
      level.addEntity(target);
      const a = new TestArrow(level, X + 0.5, Y + 2, Z + 0.5);
      a.ownerId = 0; // 别当成 owner 跳过
      a.shoot(0, 0, 1, 1, 0);
      level.addEntity(a);
      for (let i = 0; i < 30 && target.hurtCalls.length === 0; i++) level.tickEntities();
      expect(target.hurtCalls.length).toBeGreaterThan(0);
      expect(target.hurtCalls[0], '速度 1 → ceil(1*2)=2').toBe(2);
      expect(a.removed).toBe(true);
    });

    it('打不动（hurt 返回 false）→ 反弹：速度乘 -0.1、yRot 加 180、flightTime 归零', () => {
      const target = new Target(level, X + 0.5, Y + 2, Z + 2.5);
      target.hurtResult = false;
      level.addEntity(target);
      const a = new TestArrow(level, X + 0.5, Y + 2, Z + 0.5);
      a.ownerId = 0;
      a.shoot(0, 0, 1, 1, 0);
      level.addEntity(a);
      for (let i = 0; i < 30 && target.hurtCalls.length === 0; i++) level.tickEntities();
      expect(target.hurtCalls.length).toBeGreaterThan(0);
      expect(a.removed, '没被删掉').toBe(false);
      expect(a.flight(), 'flightTime 归零').toBe(0);
      expect(a.zd, 'z 方向速度反了').toBeLessThan(0);
      // ⚠ 只断言"反了"是不够的（把 -0.1 改成 -0.5 照样是负的，实测过一次假绿）——
      //   速度大约 1，乘 0.1 之后 |zd| 应该是 0.1 上下，明显小于 0.2
      expect(Math.abs(a.zd), `反弹后速度被压到 0.1 倍（实测 ${a.zd}）`).toBeLessThan(0.2);
    });

    it('⚠ 暴击时多打一次随机：dmg += nextInt(dmg/2 + 2)（用种子把这次抽取钉死）', () => {
      // ⚠ 不能只断言"落在 [2,4] 里"：那样把 `+2` 改成 `+20` 也能碰运气过（实测过一次假绿）。
      //   这里先播种，再用一个探针 Random 按同样的次数抽一遍，把期望值**算出来**。
      const SEED = 4242;
      const probe = new Random();
      probe.setSeed(SEED);
      probe.nextGaussian(); // shoot 里那三个 gaussian（uncertainty=0 也照样抽）
      probe.nextGaussian();
      probe.nextGaussian();
      const baseDmg = 2; // ceil(|v| * 2.0f)，v = 1
      const expected = baseDmg + probe.nextInt(Math.trunc(baseDmg / 2) + 2);

      const target = new Target(level, X + 0.5, Y + 2, Z + 2.5);
      level.addEntity(target);
      const a = new TestArrow(level, X + 0.5, Y + 2, Z + 0.5);
      a.ownerId = 0;
      a.critArrow = true;
      Entity.sharedRandom.setSeed(SEED);
      a.shoot(0, 0, 1, 1, 0);
      level.addEntity(a);
      for (let i = 0; i < 30 && target.hurtCalls.length === 0; i++) level.tickEntities();
      expect(target.hurtCalls.length).toBeGreaterThan(0);
      expect(target.hurtCalls[0], `期望 ${expected}（= 2 + nextInt(3)）`).toBe(expected);
      expect(expected).toBeGreaterThanOrEqual(2);
      expect(expected).toBeLessThanOrEqual(4);
    });

    it('暴击标记在飞的时候会撒 crit 粒子（起飞前先设上）', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      const a = new TestArrow(level, X + 0.5, Y + 5, Z + 0.5);
      a.critArrow = true;
      a.shoot(0, 0, 1, 1, 0);
      level.addEntity(a);
      level.tickEntities();
      const crits = rec.particles.filter((p) => p[0] === ParticleType.crit);
      expect(crits.length).toBe(4);
      expect(a.critArrow, '没插住就还留着标记').toBe(true);
    });

    it('⚠ 调了 super.tick()：baseTick 会把 xo/yo/zo 对齐（与 FallingTile/PrimedTnt 相反）', () => {
      const a = new TestArrow(level, X + 0.5, Y + 5, Z + 0.5);
      a.shoot(0, 0, 1, 1, 0);
      level.addEntity(a);
      a.xo = -999;
      a.yo = -999;
      a.zo = -999;
      const [x0, y0, z0] = [a.x, a.y, a.z];
      level.tickEntities();
      expect([a.xo, a.yo, a.zo]).toEqual([x0, y0, z0]);
      expect(a.tickCount).toBeGreaterThan(0);
    });
  });

  describe('存档往返', () => {
    it('xTile/yTile/zTile 按 short；inTile/inData/shake 按 byte 且**读时带 & 0xff**；player 是布尔', () => {
      const a = new TestArrow(level, X + 0.5, Y, Z + 0.5);
      a.shakeTime = 5;
      a.playerArrow = true;
      const tag = new CompoundTag();
      expect(a.save(tag), '前置条件：能存下来').toBe(true);
      for (const k of ['xTile', 'yTile', 'zTile', 'inTile', 'inData', 'shake', 'inGround', 'player']) {
        expect(tag.contains(k), `存档里应当有 ${k}`).toBe(true);
      }
      expect(tag.getBoolean('player')).toBe(true);

      const back = new TestArrow(level);
      back.load(tag);
      expect(back.shakeTime).toBe(5);
      expect(back.playerArrow).toBe(true);
      expect(back.isInGround()).toBe(false);
    });

    it('shake 存 200 读回来是 200（`& 0xff` 那一步没漏）', () => {
      const a = new TestArrow(level);
      a.shakeTime = 200;
      const tag = new CompoundTag();
      a.save(tag);
      const back = new TestArrow(level);
      back.load(tag);
      expect(back.shakeTime).toBe(200);
    });

    it('⚠ inTile 也带 `& 0xff`：存 200 读回来是 200（不 mask 的话是 -56）', () => {
      const a = new TestArrow(level);
      a.setLastTile(200); // 方块 id 里不会有 200，但这条钉的是**那个 mask 本身**
      const tag = new CompoundTag();
      a.save(tag);
      const back = new TestArrow(level);
      back.load(tag);
      expect(back.tiles()[3], 'lastTile').toBe(200);
    });
  });

  describe('playerTouch（玩家走过去把箭捡回来）', () => {
    function stuckArrow(): TestArrow {
      const a = new TestArrow(level, X + 0.5, Y, Z + 0.5);
      const tag = new CompoundTag();
      tag.putShort('xTile', X);
      tag.putShort('yTile', Y);
      tag.putShort('zTile', Z);
      tag.putByte('inTile', Tile.rock.id);
      tag.putByte('inData', 0);
      tag.putByte('shake', 0);
      tag.putByte('inGround', 1);
      tag.putBoolean('player', true);
      a.load(tag);
      a.playerArrow = true;
      a.setPos(X + 0.5, Y, Z + 0.5);
      level.addEntity(a);
      return a;
    }

    it('插在地上 + 是玩家射的 + shakeTime<=0 → 进背包 + playSound + remove', () => {
      const a = stuckArrow();
      const rec = new RecordingListener();
      level.addListener(rec);
      let p: Player;
      const fakePlayer = {
        inventory: {
          add: (item: unknown) => {
            (fakePlayer as unknown as { _added: unknown })._added = item;
            return true;
          },
        },
        take: () => {
          (fakePlayer as unknown as { _took: number })._took = 1;
        },
      } as unknown as Player;
      p = fakePlayer;
      a.playerTouch(p);
      expect((p as unknown as { _added: unknown })._added, '往背包里加了一支箭').toBeTruthy();
      expect((p as unknown as { _took: number })._took).toBe(1);
      expect(a.removed).toBe(true);
      expect(rec.particles.length, '粒子没参与，这里只是确认监听器没被别的东西调用').toBe(0);
    });

    it('客户端直接 return（不捡）', () => {
      const a = stuckArrow();
      level.isClientSide = true;
      const p = { inventory: { add: () => true }, take: () => {} } as unknown as Player;
      a.playerTouch(p);
      expect(a.removed).toBe(false);
    });

    it('shakeTime > 0 时不捡（刚插上去还在抖）', () => {
      const a = stuckArrow();
      a.shakeTime = 3;
      const p = { inventory: { add: () => true }, take: () => {} } as unknown as Player;
      a.playerTouch(p);
      expect(a.removed).toBe(false);
    });

    it('背包塞不进去（add 返回 false）时不捡、不删', () => {
      const a = stuckArrow();
      const p = { inventory: { add: () => false }, take: () => {} } as unknown as Player;
      a.playerTouch(p);
      expect(a.removed).toBe(false);
    });
  });

  describe('零碎', () => {
    it('type id 是 IdArrow；getAuxData 给 ownerId；getShadowHeightOffs 是 0', () => {
      const a = new TestArrow(level);
      a.ownerId = 12;
      expect(a.getEntityTypeId()).toBe(EntityTypes.IdArrow);
      expect(a.getAuxData()).toBe(12);
      expect(a.getShadowHeightOffs()).toBe(0);
    });

    it('ARROW_BASE_DAMAGE 是 2.0f', () => {
      expect(Arrow.ARROW_BASE_DAMAGE).toBe(f(2.0));
    });

    it('继承的是 Entity（不是 Throwable）', () => {
      const a = new TestArrow(level);
      expect(a).toBeInstanceOf(Entity);
      expect(a).not.toBeInstanceOf(Mob);
      expect(EntityTypes.IdArrow).toBeDefined();
      expect(MobTypes.Chicken).toBeDefined();
    });
  });
});
