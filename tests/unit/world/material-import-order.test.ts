import { describe, expect, it } from 'vitest';

// 回归测试：旧写法下“先 import 子类”会报 Class extends value undefined
describe('Material 导入顺序', () => {
  it('先加载子类模块也能正常求值', async () => {
    const { LiquidMaterial } =
      await import('../../../packages/world/src/level/material/LiquidMaterial');
    const { initMaterials } =
      await import('../../../packages/world/src/level/material/MaterialInclude');
    const { Material } = await import('../../../packages/world/src/level/material/Material');
    initMaterials();
    expect(Material.water).toBeInstanceOf(LiquidMaterial);
  });
});
