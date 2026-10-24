import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DecorationMaterial,
  GasMaterial,
  LiquidMaterial,
  Material,
  WebMaterial,
} from '@mcpe/world';
import { initMaterials } from '../../../packages/world/src/level/material/MaterialInclude';

// 全量审核 W88–W93（packages/world/src/level/material）：
//   W88–W90 / W93 四个子类；W91 Material 本体（initMaterials 的 27 个静态实例与标志位）；
//   W92 MaterialInclude（ADAPTED(ESM)：把 C++ include 全部子类再 new 的那段拆成注入）。
// 本轮没有运行时修改，测试用于锁定 C++ 的材质表。

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initMaterials();
});

describe('Material 审核（W88–W93）', () => {
  it('W91：initMaterials 的 27 个静态实例与 C++ 逐个对应', () => {
    expect([
      Material.air instanceof GasMaterial,
      Material.dirt.constructor === Material,
      Material.wood.constructor === Material,
      Material.stone.constructor === Material,
      Material.metal.constructor === Material,
      Material.water instanceof LiquidMaterial,
      Material.lava instanceof LiquidMaterial,
      Material.leaves.constructor === Material,
      Material.plant instanceof DecorationMaterial,
      Material.replaceable_plant instanceof DecorationMaterial,
      Material.sponge.constructor === Material,
      Material.cloth.constructor === Material,
      Material.fire instanceof GasMaterial,
      Material.sand.constructor === Material,
      Material.decoration instanceof DecorationMaterial,
      Material.glass.constructor === Material,
      Material.explosive.constructor === Material,
      Material.coral.constructor === Material,
      Material.ice.constructor === Material,
      Material.topSnow instanceof DecorationMaterial,
      Material.snow.constructor === Material,
      Material.cactus.constructor === Material,
      Material.clay.constructor === Material,
      Material.vegetable.constructor === Material,
      Material.portal.constructor === Material,
      Material.cake.constructor === Material,
      Material.web instanceof WebMaterial,
    ]).toEqual(new Array(27).fill(true));
  });

  it('W91：flammable / notAlwaysDestroyable / replaceable 三个标志位与 C++ 一致', () => {
    // C++ 里调用过 flammable() 的：wood、leaves、replaceable_plant、cloth、explosive
    expect(
      [
        Material.wood,
        Material.leaves,
        Material.replaceable_plant,
        Material.cloth,
        Material.explosive,
      ].map((m) => m.isFlammable()),
    ).toEqual([true, true, true, true, true]);
    expect([Material.dirt.isFlammable(), Material.stone.isFlammable()]).toEqual([false, false]);

    // notAlwaysDestroyable()：stone、metal、topSnow、snow、web
    expect(
      [Material.stone, Material.metal, Material.topSnow, Material.snow, Material.web].map((m) =>
        m.isAlwaysDestroyable(),
      ),
    ).toEqual([false, false, false, false, false]);
    expect(Material.dirt.isAlwaysDestroyable()).toBe(true);

    // replaceable()：GasMaterial / LiquidMaterial 构造函数各调一次，另有 replaceable_plant、topSnow
    expect(
      [
        Material.air,
        Material.fire,
        Material.water,
        Material.lava,
        Material.replaceable_plant,
        Material.topSnow,
      ].map((m) => m.isReplaceable()),
    ).toEqual([true, true, true, true, true, true]);
    expect(Material.dirt.isReplaceable()).toBe(false);
  });

  it('W88–W91：isSolidBlocking 由 _neverBuildable 与 blocksMotion 决定', () => {
    // neverBuildable()：leaves、glass、explosive、ice、topSnow、cactus
    expect(
      [
        Material.leaves,
        Material.glass,
        Material.explosive,
        Material.ice,
        Material.topSnow,
        Material.cactus,
      ].map((m) => m.isSolidBlocking()),
    ).toEqual([false, false, false, false, false, false]);
    expect(Material.dirt.isSolidBlocking()).toBe(true); // 普通方块
    expect(Material.glass.blocksMotion()).toBe(true); // glass 不是靠 blocksMotion=false，而是 neverBuildable
    expect(Material.web.isSolidBlocking()).toBe(false); // WebMaterial 只把 blocksMotion 设为 false
  });

  it('W88–W90：四种材质的虚函数组合与 C++ 一致', () => {
    // GasMaterial（air / fire）
    expect(
      [Material.air, Material.fire].map((m) => [
        m.isLiquid(),
        m.isSolid(),
        m.blocksLight(),
        m.blocksMotion(),
        m.letsWaterThrough(),
      ]),
    ).toEqual([
      [false, false, false, false, true],
      [false, false, false, false, true],
    ]);

    // LiquidMaterial（water / lava）
    expect(
      [Material.water, Material.lava].map((m) => [
        m.isLiquid(),
        m.isSolid(),
        m.blocksMotion(),
        m.letsWaterThrough(),
      ]),
    ).toEqual([
      [true, false, false, false],
      [true, false, false, false],
    ]);

    // DecorationMaterial（plant / decoration）
    expect(
      [Material.plant, Material.decoration].map((m) => [
        m.isLiquid(),
        m.isSolid(),
        m.blocksLight(),
        m.blocksMotion(),
        m.letsWaterThrough(),
      ]),
    ).toEqual([
      [false, false, false, false, true],
      [false, false, false, false, true],
    ]);

    // 基类 Material（dirt）
    expect([
      Material.dirt.isLiquid(),
      Material.dirt.isSolid(),
      Material.dirt.blocksLight(),
      Material.dirt.blocksMotion(),
      Material.dirt.letsWaterThrough(),
    ]).toEqual([false, true, true, true, false]);

    // WebMaterial（web）
    expect([Material.web.blocksMotion(), Material.web.isSolid()]).toEqual([false, true]);
  });

  it('W91：Material 的构造函数是 protected（C++ Material.h 同）', () => {
    type MaterialConstructor = typeof Material;
    const canNew: MaterialConstructor extends new () => Material ? true : false = false;
    void canNew;
  });

  it('W92：MaterialInclude 注入四个子类，重复调用会重建整张表', () => {
    const before = Material.air;
    initMaterials();
    expect(Material.air).not.toBe(before);
    expect(Material.air).toBeInstanceOf(GasMaterial);
  });
});
