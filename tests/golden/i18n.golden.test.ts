import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { I18n, type AssetSource } from '@mcpe/locale';
import { initItems, initMaterials, initTiles, Item, ItemInstance, Tile } from '@mcpe/world';

/**
 * 黄金样本 G11-5（tools/golden/harness_i18n.cpp）：读 lang/en_US.lang 后，每个已注册方块、物品的 "<descriptionId>.name" 翻译
 * 与 I18n::getDescriptionString（aux 0；羊毛另取 aux 1），以及一个缺失键。
 * S12 才注册的方块、物品跳过（TS 里还没有它们）。
 */
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/i18n.json', import.meta.url), 'utf8')) as {
  missing: string; names: { id: number; aux: number; name: string; desc: string }[];
};
const files: AssetSource = {
  readAssetFile(name: string) {
    const data = new Uint8Array(readFileSync(new URL(`../../apps/web/public/${name}`, import.meta.url)));
    return { data, size: data.length };
  },
};

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  initMaterials();
  initTiles();
  initItems();
  I18n.loadLanguage(files, 'en_US');
});

describe('G11-5 本地化', () => {
  it('缺失的键返回 id + "<"', () => {
    expect(I18n.get('no.such.key')).toBe(G.missing);
  });
  it('名字与描述文字与 C++ 一致', () => {
    let compared = 0;
    const skipped: number[] = [];
    for (const g of G.names) {
      const reg = g.id < 256 ? Tile.tiles[g.id] : Item.items[g.id];
      if (!reg) { skipped.push(g.id); continue; }
      const desc = g.id < 256 ? Tile.tiles[g.id]!.getDescriptionId() : Item.items[g.id]!.getDescriptionId();
      expect(I18n.get(desc + '.name'), `${g.id} 的名字`).toBe(g.name);
      expect(I18n.getDescriptionString(new ItemInstance(g.id, 1, g.aux)), `${g.id}:${g.aux} 的描述`).toBe(g.desc);
      compared++;
    }
    console.info(`G11-5：已比较 ${compared} 条；S12 才注册而跳过 ${skipped.length} 条`);
    expect(compared).toBeGreaterThan(130);
  });
});
