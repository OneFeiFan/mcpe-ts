/**
 * 任务单 H4–H8：生物工厂与 9 种生物的关键行为（无头真 Level）。
 * 钉住的 C++ 行为：
 * - MobFactory.CreateMob：类型正确、生命值 = getMaxHealth()、渲染器 id 正确；
 * - 僵尸（旧 AI）：16 格内看得见的玩家成为目标，并产生路径；贴身 2 格内 checkHurtTarget 造成伤害、attackTime = 20；
 * - 苦力怕：checkHurtTarget 连续 30 次（3 格内）后爆炸并移除自己，地面被炸出坑；
 * - 骷髅：10 格内 attackTime 为 0 时射出一支朝向目标的箭，attackTime = 60（3 秒），并原地不动（holdGround）；
 * - 羊：拿剪刀右键 → 剪毛、掉 1–3 个该颜色的羊毛；用染料（interactEnemy）改毛色，已剪毛的羊不能染。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Arrow,
  Chicken,
  Cow,
  Creeper,
  Difficulty,
  DyePowderItem,
  initItems,
  EntityRendererId,
  initTileEntities,
  Item,
  ItemEntity,
  ItemInstance,
  type Level,
  MobFactory,
  MobTypes,
  Pig,
  PigZombie,
  Player,
  Sheep,
  Skeleton,
  Spider,
  Tile,
  Zombie,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

class TestPlayer extends Player {}

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  initItems(); // 骷髅的弓、僵尸猪人的金剑、剪刀、染料都是物品
  initTileEntities();
  level.difficulty = Difficulty.NORMAL; // 和平难度下玩家受到的伤害为 0、怪物会自行移除
  prepareLevel(level);
});

// 注意：Entity::moveTo 给的是脚底高度（内部会加上 heightOffset），所以传地表上一格 64
function newPlayer(x: number, z: number): Player {
  const p = new TestPlayer(level, false);
  p.moveTo(x, 64, z, 0, 0);
  level.addEntity(p);
  return p;
}

describe('MobFactory', () => {
  const table: [number, new (l: Level) => object, number, number][] = [
    [MobTypes.Chicken, Chicken, 4, EntityRendererId.ER_CHICKEN_RENDERER],
    [MobTypes.Cow, Cow, 10, EntityRendererId.ER_COW_RENDERER],
    [MobTypes.Pig, Pig, 10, EntityRendererId.ER_PIG_RENDERER],
    [MobTypes.Sheep, Sheep, 8, EntityRendererId.ER_SHEEP_RENDERER],
    [MobTypes.Creeper, Creeper, 16, EntityRendererId.ER_CREEPER_RENDERER],
    [MobTypes.Zombie, Zombie, 12, EntityRendererId.ER_ZOMBIE_RENDERER],
    [MobTypes.Skeleton, Skeleton, 10, EntityRendererId.ER_SKELETON_RENDERER],
    [MobTypes.Spider, Spider, 8, EntityRendererId.ER_SPIDER_RENDERER],
    [MobTypes.PigZombie, PigZombie, 12, EntityRendererId.ER_ZOMBIE_RENDERER], // C++ 构造函数没改 entityRendererId，沿用僵尸的
  ];
  for (const [type, cls, hp, er] of table) {
    it(`${cls.name}：类型、满血 ${hp}、渲染器 ${er}`, () => {
      const m = MobFactory.CreateMob(type, level)!;
      expect(m).toBeInstanceOf(cls);
      expect(m.health).toBe(hp);
      expect(m.getEntityTypeId()).toBe(type);
      expect(m.entityRendererId).toBe(er);
    });
  }
});

describe('僵尸（旧 AI）', () => {
  it('16 格内看得见的玩家成为目标，并产生路径', () => {
    const p = newPlayer(140.5, 128.5);
    const z = new Zombie(level);
    z.moveTo(132.5, 64, 128.5, 0, 0);
    level.addEntity(z);
    for (let i = 0; i < 3; i++) z.tick();
    expect((z as unknown as { attackTargetId: number }).attackTargetId).toBe(p.entityId);
    expect(z.isPathFinding()).toBe(true);
    level.removeEntity(z);
    level.removeEntity(p);
  });

  it('贴身时 checkHurtTarget 造成伤害、attackTime = 20', () => {
    const p = newPlayer(150.5, 128.5);
    const z = new Zombie(level);
    z.moveTo(149.5, 64, 128.5, 0, 0);
    level.addEntity(z);
    const before = p.health;
    z.attackTime = 0;
    (z as unknown as { checkHurtTarget(t: unknown, d: number): void }).checkHurtTarget(p, 1.0);
    expect(p.health).toBeLessThan(before);
    expect(z.attackTime).toBe(20);
    level.removeEntity(z);
    level.removeEntity(p);
  });
});

describe('苦力怕', () => {
  it('3 格内连续 30 次 checkHurtTarget 后爆炸并移除自己，地面被炸出坑', () => {
    const p = newPlayer(170.5, 128.5);
    const c = new Creeper(level);
    c.moveTo(168.5, 64, 128.5, 0, 0);
    level.addEntity(c);
    const hit = c as unknown as { checkHurtTarget(t: unknown, d: number): void };
    for (let i = 0; i < 29; i++) hit.checkHurtTarget(p, 2.0);
    expect(c.removed).toBe(false);
    expect(c.getSwelling(1)).toBeGreaterThan(0); // a = 1 取当前 swell（a = 0 取上一刻的 oldSwell，没 tick 过就是 0）
    hit.checkHurtTarget(p, 2.0);
    expect(c.removed).toBe(true);
    expect(level.getTile(168, 63, 128)).toBe(0);
    level.removeEntity(p);
  });
});

describe('骷髅', () => {
  it('10 格内射出一支朝向目标的箭，attackTime = 60，原地不动', () => {
    const p = newPlayer(196.5, 140.5);
    const s = new Skeleton(level);
    s.moveTo(196.5, 64, 132.5, 0, 0);
    level.addEntity(s);
    s.attackTime = 0;
    const before = level.getAllEntities().filter((e) => e instanceof Arrow).length;
    (s as unknown as { checkHurtTarget(t: unknown, d: number): void }).checkHurtTarget(p, 8.0);
    const arrows = level.getAllEntities().filter((e) => e instanceof Arrow) as Arrow[];
    expect(arrows.length).toBe(before + 1);
    const a = arrows[arrows.length - 1]!;
    expect(a.zd).toBeGreaterThan(0); // 目标在 +z 方向
    expect(Math.abs(a.xd)).toBeLessThan(Math.abs(a.zd));
    expect(s.attackTime).toBe(60);
    expect((s as unknown as { holdGround: boolean }).holdGround).toBe(true);
    level.removeEntity(p);
  });
});

describe('羊', () => {
  it('剪刀右键：剪毛、掉 1–3 个同色羊毛；已剪毛的羊不能再剪', () => {
    const p = newPlayer(210.5, 128.5);
    const sheep = new Sheep(level);
    sheep.moveTo(211.5, 64, 128.5, 0, 0);
    level.addEntity(sheep);
    sheep.setColor(14);
    p.inventory.add(new ItemInstance(Item.shears)); // 生存模式：add 放进第一个空格并链接到快捷栏第 0 格
    p.inventory.selectSlot(0);
    expect(p.inventory.getSelected()?.id).toBe(Item.shears.id);
    const count0 = level.getAllEntities().filter((e) => e instanceof ItemEntity).length;
    sheep.interact(p);
    expect(sheep.isSheared()).toBe(true);
    const drops = (
      level.getAllEntities().filter((e) => e instanceof ItemEntity) as ItemEntity[]
    ).slice(count0);
    expect(drops.length).toBeGreaterThanOrEqual(1);
    expect(drops.length).toBeLessThanOrEqual(3);
    for (const d of drops) expect([d.item.id, d.item.getAuxValue()]).toEqual([Tile.cloth.id, 14]);
    const n = level.getAllEntities().length;
    sheep.interact(p);
    expect(level.getAllEntities().length).toBe(n);
    level.removeEntity(p);
  });

  it('染料（interactEnemy）改毛色；已剪毛的不改', () => {
    const sheep = new Sheep(level);
    const dye = new ItemInstance(Item.dye_powder, 3, DyePowderItem.BLUE);
    Item.dye_powder.interactEnemy(dye, sheep);
    expect(sheep.getColor()).toBe(15 - DyePowderItem.BLUE);
    expect(dye.count).toBe(2);
    sheep.setSheared(true);
    Item.dye_powder.interactEnemy(new ItemInstance(Item.dye_powder, 1, DyePowderItem.RED), sheep);
    expect(sheep.getColor()).toBe(15 - DyePowderItem.BLUE);
  });
});
