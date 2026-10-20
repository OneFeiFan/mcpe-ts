import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import {
  type Entity,
  EntityRendererId,
  initItems,
  Item,
  type Level,
  MobTypes,
  Player,
  Spider,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

/**
 * 全量审核 W36：Spider.ts（工作表 17 行）逐行对照的回归测试。
 * 唯一的行为修复是 W36：`void Spider::checkHurtTarget(Entity* target, float d)` 的形参 d
 * 在 C++ 入口按 float 舍入，TS 原来直接拿 double 比较 `d > 2` / `d < 6`。
 * 其余各行与参考 C++ 一致（见 docs/审核记录/entity-spider.md）。
 */
const f = Math.fround;

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createFlatLevel();
  initItems(); // getDeathLoot 读 Item.string.id；未注册时访问 .id 会抛错
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
});

class TestPlayer extends Player {}

/** 把 protected 的成员露出来（C++ 里都在 protected 段；同 creeper-audit / cow-audit 的写法） */
class ExposedSpider extends Spider {
  hit(target: Entity, d: number): void {
    this.checkHurtTarget(target, d);
  }
  target(): Entity | null {
    return this.findAttackTarget();
  }
  stepSound(): boolean {
    return this.makeStepSoundMethod();
  }
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
  runSpeedValue(): number {
    return this.runSpeed;
  }
  stuckInWeb(): boolean {
    return this.isStuckInWeb;
  }
  setTargetId(id: number): void {
    this.attackTargetId = id;
  }
  getTargetId(): number {
    return this.attackTargetId;
  }
}

function makeSpider(x = 8, y = 64, z = 8): ExposedSpider {
  const s = new ExposedSpider(level);
  s.moveTo(x, y, z, 0, 0);
  return s;
}

/**
 * 找一个种子：亮处时 checkHurtTarget 先取 nextInt(100)，第二个条件成立再取 nextInt(10)。
 * 返回第一个满足这两个值条件的种子。
 */
function findSeed(first: (v: number) => boolean, second: (v: number) => boolean): number {
  for (let seed = 0; seed < 100000; seed++) {
    const r = new Random(seed);
    if (first(r.nextInt(100)) && second(r.nextInt(10))) return seed;
  }
  throw new Error('找不到满足条件的种子');
}

describe('Spider 审核（W36）', () => {
  it('W36：checkHurtTarget 的 float 形参 d 在入口舍入（d<6 与 d>2 的边界）', () => {
    const seed = findSeed(
      (v) => v !== 0,
      (v) => v === 0,
    );
    const spider = makeSpider();
    const target = makeSpider(12, 64, 8);
    // 亮处：第一个条件里的 nextInt(100) 一定会被取用（种子序列的前提）
    expect(spider.getBrightness(1)).toBeGreaterThan(0.5);
    spider.onGround = true;

    // 该 double 略小于 6，舍入成 float 后正好是 6.f：C++ 的 d < 6 为假 → 不扑跳，走 super（2 格内才攻击）
    const dHigh = 5.999999999999999;
    expect(f(dHigh)).toBe(6);
    expect(dHigh < 6).toBe(true);
    spider.random.setSeed(seed);
    spider.hit(target, dHigh);
    expect(spider.yd).toBe(0);

    // 该 double 略大于 2，舍入后正好是 2.f：C++ 的 d > 2 为假 → 不扑跳
    const dLow = 2.0000000000000004;
    expect(f(dLow)).toBe(2);
    expect(dLow > 2).toBe(true);
    spider.random.setSeed(seed);
    spider.hit(target, dLow);
    expect(spider.yd).toBe(0);
  });

  it('2–6 格、nextInt(10)==0 且 onGround 时向目标扑跳（xd=0.4、zd=0、yd=0.4）', () => {
    const seed = findSeed(
      (v) => v !== 0,
      (v) => v === 0,
    );
    const spider = makeSpider();
    const target = makeSpider(12, 64, 8); // x 方向 4 格
    spider.onGround = true;
    spider.random.setSeed(seed);
    spider.hit(target, 4);
    expect(spider.xd).toBe(f(0.4));
    expect(spider.zd).toBe(0);
    expect(spider.yd).toBe(f(0.4));
  });

  it('亮处 nextInt(100)==0 时清空 attackTargetId 并直接返回（不扑跳）', () => {
    const seed = findSeed(
      (v) => v === 0,
      () => true,
    );
    const spider = makeSpider();
    const target = makeSpider(12, 64, 8);
    spider.onGround = true;
    spider.setTargetId(123);
    spider.random.setSeed(seed);
    spider.hit(target, 4);
    expect(spider.getTargetId()).toBe(0);
    expect(spider.yd).toBe(0);
  });

  it('findAttackTarget：亮处返回 null；暗处返回 16 格内最近的玩家', () => {
    const bright = makeSpider();
    const p1 = new TestPlayer(level, false);
    p1.moveTo(10, 64, 8, 0, 0);
    level.addEntity(p1);
    expect(bright.getBrightness(1)).toBeGreaterThan(0.5);
    expect(bright.target()).toBeNull();

    // 与 mobspawner.test.ts 相同：平坦 demo 维度永远是白天，直接把 skyDarken 设成夜里的值 8
    level.skyDarken = 8;
    const dark = makeSpider();
    const p2 = new TestPlayer(level, false);
    p2.moveTo(8, 64, 8.5, 0, 0); // 比上面的 p1（距离 2）更近
    level.addEntity(p2);
    expect(dark.getBrightness(1)).toBeLessThan(0.5);
    expect(dark.target()).toBe(p2);
  });

  it('构造函数：生命 8、类型 35、渲染器、贴图、尺寸、runSpeed、初始未攀爬', () => {
    const s = makeSpider();
    expect(s.getMaxHealth()).toBe(8);
    expect(s.getEntityTypeId()).toBe(MobTypes.Spider);
    expect(s.entityRendererId).toBe(EntityRendererId.ER_SPIDER_RENDERER);
    expect(s.textureName).toBe('mob/spider.png');
    expect(s.bbWidth).toBe(f(1.4));
    expect(s.bbHeight).toBe(f(0.9));
    expect(s.runSpeedValue()).toBe(f(0.5));
    expect(s.isClimbing()).toBe(false);
  });

  it('攀爬标志：setClimbing/isClimbing；onLadder 恒等于 isClimbing（原版怪癖）', () => {
    const s = makeSpider();
    s.setClimbing(true);
    expect(s.isClimbing()).toBe(true);
    expect(s.onLadder()).toBe(true); // 附近没有梯子也返回 true
    s.setClimbing(false);
    expect(s.isClimbing()).toBe(false);
    expect(s.onLadder()).toBe(false);
  });

  it('makeStuckInWeb 为空（蜘蛛不被网粘住）；makeStepSoundMethod 恒 false；getModelScale 为 1', () => {
    const s = makeSpider();
    s.fallDistance = f(1.5);
    s.makeStuckInWeb();
    expect(s.stuckInWeb()).toBe(false);
    expect(s.fallDistance).toBe(f(1.5));
    expect(s.stepSound()).toBe(false);
    expect(s.getModelScale()).toBe(1);
  });

  it('声音与掉落：mob.spider / mob.spiderdeath / 线（Item.string，C++ id = 256 + 31）', () => {
    const s = makeSpider();
    expect(s.ambient()).toBe('mob.spider');
    expect(s.hurtSound()).toBe('mob.spider');
    expect(s.deathSound()).toBe('mob.spiderdeath');
    expect(s.deathLoot()).toBe(Item.string.id);
    // C++ Item.h:213 `id(256 + id)`；Item::string 用 31 → 287
    expect(Item.string.id).toBe(256 + 31);
  });
});
