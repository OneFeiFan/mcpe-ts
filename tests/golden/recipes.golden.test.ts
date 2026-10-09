/**
 * 黄金样本 G18-1（合成，tools/golden/harness_recipes.cpp）：Recipes 单例的全部 123 个配方与 13 个熔炉配方。
 * 逐个比较：类型（有形状/无形状）、产物（id、数量、aux）、size()、getCraftingSize()、材料表 ItemPack（键 → 数量，按键有序）。
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { FurnaceRecipes, initItems, Recipes, ShapedRecipe, ShapelessRecipe } from '@mcpe/world';
import { createFlatLevel } from '../helpers/headlessLevel';

type Rec = {
  kind: string;
  result: number[];
  size: number;
  craftingSize: number;
  pack: [number, number][];
};
const G = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/recipes.json', import.meta.url), 'utf8'),
) as { recipes: Rec[]; furnace: number[][] };

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  createFlatLevel(); // 注册方块
  initItems();
});

describe('G18-1 合成配方', () => {
  it('数量：123 个配方', () => {
    expect(Recipes.getInstance().getRecipes().length).toBe(G.recipes.length);
  });

  it('逐个配方：类型、产物、大小、材料表与 C++ 相同（顺序也相同）', () => {
    const list = Recipes.getInstance().getRecipes();
    G.recipes.forEach((want, i) => {
      const r = list[i]!;
      const res = r.getResultItem();
      const kind =
        r instanceof ShapedRecipe ? 'shaped' : r instanceof ShapelessRecipe ? 'shapeless' : '?';
      const pack = (r.getItemPack() as unknown as { items: Map<number, number> }).items;
      const got = {
        kind,
        result: [res.id, res.count, res.getAuxValue()],
        size: r.size(),
        craftingSize: r.getCraftingSize(),
        pack: [...pack.entries()].sort((a, b) => a[0] - b[0]),
      };
      expect(got, `第 ${i} 个配方`).toEqual(want);
    });
  });

  it('熔炉配方 13 个：原料 → 产物', () => {
    const got = FurnaceRecipes.getInstance()
      .getRecipes()
      .map(([id, r]) => [id, r.id, r.count, r.getAuxValue()]);
    expect(got).toEqual(G.furnace);
  });
});
