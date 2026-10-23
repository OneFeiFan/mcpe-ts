/**
 * 全量审核 W62/W63：MobSpawner / MobSpawnerHooks。
 * 钉住的点：
 * - W62 makeBabyMob 的 probability 在 C++ 里是 float 形参，传入的 double 要先舍入；
 * - W62 C++ 的 bedEnemies 在 protected 段，TS 不能从类外看到；
 * - getRandomPosWithin 的随机数顺序是 x → y → z；
 * - W63 MobSpawnerHooks 的注入槽在 MobSpawner 模块加载后直接指向 postProcessSpawnMobs，且参数类型不是 never。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import { Animal, Chicken, MobSpawner, initItems, initTileEntities, type Level } from '@mcpe/world';
import { MobSpawnerHooks } from '../../../packages/world/src/level/MobSpawnerHooks';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  initItems();
  initTileEntities();
  prepareLevel(level);
});

describe('MobSpawner 审核（W62）', () => {
  it('W62 makeBabyMob：probability 形参按 C++ float 先舍入', () => {
    // 0.5000000001 舍入到 float 恰好是 0.5；C++ 里 nextFloat() < 0.5f 在 nextFloat()==0.5 时为假。
    const spy = vi.spyOn(Random.prototype, 'nextFloat').mockReturnValue(0.5);
    try {
      const chicken = new Chicken(level);
      MobSpawner.makeBabyMob(chicken, 0.5000000001);
      expect((chicken as Animal).isBaby()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('W62 bedEnemies 与 C++ 一样是 protected（keyof 不列出）', () => {
    // 编译期断言：C++ MobSpawner.h 把 bedEnemies 放在 protected 段。
    type BedEnemiesHidden = 'bedEnemies' extends keyof typeof MobSpawner ? false : true;
    const bedEnemiesHidden: BedEnemiesHidden = true;
    expect(bedEnemiesHidden).toBe(true);
  });

  it('getRandomPosWithin：随机数顺序 x → y → z，y ∈ [0, 128)', () => {
    const seed = 123456789;
    level.random.setSeed(seed);
    const ref = new Random(seed);
    const pos = MobSpawner.getRandomPosWithin(level, 32, -48);
    expect(pos).toEqual([32 + ref.nextInt(16), ref.nextInt(128), -48 + ref.nextInt(16)]);
  });
});

describe('MobSpawnerHooks 审核（W63）', () => {
  it('W63 接缝：MobSpawner 加载后注入槽直接指向 postProcessSpawnMobs', () => {
    expect(MobSpawnerHooks.postProcessSpawnMobs).toBe(MobSpawner.postProcessSpawnMobs);
  });

  it('W63 接缝：注入槽的参数类型对应 Level（不是 never）', () => {
    type HookAcceptsLevel = Level extends Parameters<
      NonNullable<typeof MobSpawnerHooks.postProcessSpawnMobs>
    >[0]
      ? true
      : false;
    const hookAcceptsLevel: HookAcceptsLevel = true;
    expect(hookAcceptsLevel).toBe(true);
  });
});
