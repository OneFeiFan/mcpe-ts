import { describe, expect, it } from 'vitest';
import { initMaterials, Material } from '@mcpe/world';

describe('Material 注册表', () => {
  it('从 barrel 导入不会触发循环依赖，initMaterials 后静态实例可用', () => {
    initMaterials();
    expect(Material.water.isLiquid()).toBe(true);
    expect(Material.lava.isLiquid()).toBe(true);
    expect(Material.air.isSolid()).toBe(false);
    expect(Material.stone.isSolid()).toBe(true);
    expect(Material.leaves.isFlammable()).toBe(true);
  });
});
