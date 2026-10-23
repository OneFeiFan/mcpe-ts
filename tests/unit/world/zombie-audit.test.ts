/**
 * 全量审核（W37，Zombie）锁定测试。
 * W37：aiStep 阳光燃烧粒子的坐标 —— C++ `x + random.nextFloat() * bbWidth * 2 - bbWidth`
 * 是 float 逐步运算（加、减各舍入一次），TS 以前只对乘积舍入，加/减在 double 里做完直接传给
 * addParticle。这里用一对能让两种写法结果不同的随机值锁定 x/y/z 三个坐标。
 * 同时钉住：fireCheckTick 隔刻检查的怪癖、同一表达式多个 nextFloat() 的读取顺序
 * （C++ 未指定 → DEFERRED(待确认)，现行从左到右）、die 掉羽毛的 nextInt(4)/nextInt(1) 怪癖、
 * 构造函数状态与 getArmorValue 的 public 可见性（ADAPTED(Cpp)）。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EntityRendererId,
  GoalSelector,
  initItems,
  Item,
  ItemEntity,
  JumpControl,
  type Level,
  LevelListener,
  MobTypes,
  MoveControl,
  Zombie,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

const f = Math.fround;

/** 收粒子的监听器 */
class Recorder extends LevelListener {
  particles: Array<[string | number, number, number, number, number, number, number]> = [];
  override addParticle(
    name: string | number,
    x: number,
    y: number,
    z: number,
    xa: number,
    ya: number,
    za: number,
    _data: number,
  ): void {
    this.particles.push([name, x, y, z, xa, ya, za]);
  }
}

/** 把 protected 成员暴露出来（C++ 里它们在 protected 段） */
class ExposedZombie extends Zombie {
  isNewAi(): boolean {
    return this.useNewAi();
  }
  getRunSpeed(): number {
    return this.runSpeed;
  }
  getAttackDamageValue(): number {
    return this.attackDamage;
  }
}

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createFlatLevel();
  initItems();
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
});

describe('Zombie 构造函数（Zombie.cpp:15）', () => {
  it('贴图、速度 0.5f、攻击力 4、渲染器、四个 AI 组件、新 AI 默认关闭', () => {
    const z = new ExposedZombie(level);
    expect(z.textureName).toBe('mob/zombie.png');
    expect(z.entityRendererId).toBe(EntityRendererId.ER_ZOMBIE_RENDERER);
    expect(z.getRunSpeed()).toBe(f(0.5));
    expect(z.getAttackDamageValue()).toBe(4);
    expect(z.getMaxHealth()).toBe(12);
    expect(z.getEntityTypeId()).toBe(MobTypes.Zombie);
    expect(z.targetSelector).toBeInstanceOf(GoalSelector);
    expect(z.goalSelector).toBeInstanceOf(GoalSelector);
    expect(z.moveControl).toBeInstanceOf(MoveControl);
    expect(z.jumpControl).toBeInstanceOf(JumpControl);
    expect(z.isNewAi()).toBe(false);
    z.setUseNewAi(true);
    expect(z.isNewAi()).toBe(true);
  });

  it('getArmorValue：基类 0 + 2；C++ 在 protected 段，TS 不能收窄，保持 public（ADAPTED(Cpp)）', () => {
    const z = new Zombie(level);
    expect(z.getArmorValue()).toBe(2);
  });
});

describe('aiStep 阳光燃烧（Zombie.cpp:53）', () => {
  it('W37：粒子 x/y/z 按 C++ 逐步 float 舍入，不是整段 double', () => {
    const rec = new Recorder();
    level.addListener(rec);
    const z = new Zombie(level);
    z.moveTo(130.5, 64, 130.5, 0, 0);

    expect(level.isDay(), '前提：白天').toBe(true);
    expect(z.getBrightness(1), '前提：亮度 > 0.5f').toBeGreaterThan(f(0.5));
    expect(level.canSeeSky(130, 64, 130), '前提：露天').toBe(true);

    // 第一次 nextFloat 给燃烧条件；后面 9 个是循环第一轮的 xa/ya/za + 三个粒子坐标。
    // x、y 两对值能让“逐步 float”和“整段 double”得到不同结果。
    const rXa1 = f(0.00008);
    const rXa2 = f(0.99992);
    const rYa1 = f(0.125);
    const rYa2 = f(0.875);
    const rZa1 = f(0.375);
    const rZa2 = f(0.625);
    const rX = f(0.00008);
    const rY = f(0.00001);
    const rZ = f(0.00008);
    vi.spyOn(z.random, 'nextFloat')
      .mockReturnValueOnce(f(0.05))
      .mockReturnValueOnce(rXa1)
      .mockReturnValueOnce(rXa2)
      .mockReturnValueOnce(rYa1)
      .mockReturnValueOnce(rYa2)
      .mockReturnValueOnce(rZa1)
      .mockReturnValueOnce(rZa2)
      .mockReturnValueOnce(rX)
      .mockReturnValueOnce(rY)
      .mockReturnValueOnce(rZ);

    const sx = z.x;
    const sy = z.y;
    const sz = z.z;
    const bw = z.bbWidth;
    const bh = z.bbHeight;
    z.aiStep();

    expect(rec.particles.length).toBe(5);
    const [name, px, py, pz, xa, ya, za] = rec.particles[0]!;
    expect(name, 'PARTICLETYPE(explode) 宏实际传的是字符串').toBe('explode');

    // C++：x + (r * bbWidth) * 2 - bbWidth —— 加、减各舍入一次
    const wantX = f(f(sx + f(f(rX * bw) * 2)) - bw);
    const wantY = f(sy + f(rY * bh));
    const wantZ = f(f(sz + f(f(rZ * bw) * 2)) - bw);
    expect(px).toBe(wantX);
    expect(py).toBe(wantY);
    expect(pz).toBe(wantZ);
    // 旧写法（加/减在 double 里做完再传给 addParticle）得到的是不同的值
    expect(px).not.toBe(sx + f(rX * bw * 2) - bw);
    expect(py).not.toBe(sy + f(rY * bh));

    // xa/ya/za：(2r-1)*(2r-1)*0.02f，每步 float；先取的两个随机数是左操作数
    const term = (r: number) => f(f(2 * r) - 1);
    expect(xa).toBe(f(f(term(rXa1) * term(rXa2)) * f(0.02)));
    expect(ya).toBe(f(f(term(rYa1) * term(rYa2)) * f(0.02)));
    expect(za).toBe(f(f(term(rZa1) * term(rZa2)) * f(0.02)));
    expect(xa, '乘积先舍入再乘 0.02f（不是整段 double）').not.toBe(
      f(term(rXa1) * term(rXa2) * f(0.02)),
    );
    expect(z.onFire).toBe(160);
  });

  it('fireCheckTick 隔刻检查：第二刻不再检查、不再着火', () => {
    const rec = new Recorder();
    level.addListener(rec);
    const z = new Zombie(level);
    z.moveTo(130.5, 64, 130.5, 0, 0);
    vi.spyOn(z.random, 'nextFloat').mockReturnValue(f(0.05));

    z.aiStep(); // ++fireCheckTick = 1，& 1 == 1
    expect(rec.particles.length).toBe(5);
    expect(z.onFire).toBe(160);

    z.aiStep(); // ++fireCheckTick = 2，& 1 == 0
    expect(rec.particles.length).toBe(5);
    expect(z.onFire).toBe(160);
  });
});

describe('die 掉羽毛（Zombie.cpp:109）', () => {
  it('nextInt(4) == 0 时掉 1 根羽毛；数量 nextInt(1)+1 恒为 1（怪癖保留）', () => {
    const z = new Zombie(level);
    z.moveTo(130.5, 64, 130.5, 0, 0);
    const nextInt = vi.spyOn(z.random, 'nextInt').mockReturnValueOnce(0).mockReturnValueOnce(0);

    z.die(null);

    expect(nextInt).toHaveBeenNthCalledWith(1, 4);
    expect(nextInt).toHaveBeenNthCalledWith(2, 1);
    const dropped = level.entities.filter((e) => e instanceof ItemEntity) as ItemEntity[];
    expect(dropped.length).toBe(1);
    expect(dropped[0]!.item.id).toBe(Item.feather.id);
    expect(dropped[0]!.item.count).toBe(1);
  });

  it('nextInt(4) != 0 时不掉', () => {
    const z = new Zombie(level);
    z.moveTo(130.5, 64, 130.5, 0, 0);
    vi.spyOn(z.random, 'nextInt').mockReturnValueOnce(3);

    z.die(null);

    expect(level.entities.filter((e) => e instanceof ItemEntity).length).toBe(0);
  });
});
