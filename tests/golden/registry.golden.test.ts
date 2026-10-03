import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initItems, initMaterials, initTiles, Item, Material, Tile } from '@mcpe/world';

/**
 * 黄金样本 G11-1、G11-2：方块与物品注册表快照（tools/golden/harness_registry.cpp）。
 * - 逐位比较：整数完全相等，float 比较 32 位位模式（fround 后的位模式）。
 * - 夹具里带 "uninit" 的字段在 C++ 里读了未初始化的内存，结果是未定义行为，不比较：
 *   多数方块的 explosionResistance（setDestroyTime 拿它和 destroyTime×5 比较之前从未赋值；TS 初值为 0，实际与零初始化的结果一致）、
 *   CarriedTile（253）的 tex（构造函数把尚未初始化的成员 tex 传给了基类）、info_reserved6（255）的硬度。
 * - REQUIRE_ALL：S11 阶段 C 把剩下的方块、物品注册完之后改为 true；在此之前只比较 TS 已经注册的条目，并列出尚未注册的 id。
 */
const REQUIRE_ALL = true; // S12 起方块与物品全部注册
/** 还没注册的方块（S12 起没有） */
const S12_IDS = new Set<number>();
/** 方块形状属于第二档（结构一致、数值放宽）：C++ 用 float 计算（如 0.5f - 0.4f），TS 用 double，末位可差 1 ulp */
const BOUNDS_TOL = 1e-6;
type TileRec = {
  id: number; cls: string; desc: string; tex: number; mat: string; destroy: number; resist: number; light: number; lightBlock: number;
  tick: number; translucent: number; entity: number; solidRender: number; cube: number; shape: number; layer: number; category: number;
  friction: number; gravity: number; sound: [string, string, number, number]; bounds: number[]; tex6: number[]; texData: number[]; uninit?: string[];
};
type ItemRec = {
  id: number; cls: string; desc: string; icon: number; maxStack: number; maxDamage: number; category: number; hand: number; stacked: number;
  food: number; armor: number; tileId: number; iconAux: number[];
};
const G = JSON.parse(readFileSync(new URL('../../fixtures/golden/registry.json', import.meta.url), 'utf8')) as { tiles: (TileRec | null)[]; items: (ItemRec | null)[] };
const fbuf = new DataView(new ArrayBuffer(4));
const bits = (x: number) => (fbuf.setFloat32(0, x), fbuf.getUint32(0));
const b = (x: boolean) => (x ? 1 : 0);

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  initMaterials();
  initTiles();
  initItems();
});

/** 依赖尚未注册的方块（例如 StoneSlabTile 的某些 data 用到 stoneBrickSmooth）时取不到值：记为待定，用夹具值占位 */
let pending: string[] = [];
function safe<T>(what: string, f: () => T, fallback: T): T {
  try {
    return f();
  } catch (e) {
    if (String(e).includes('尚未注册')) {
      pending.push(what);
      return fallback;
    }
    throw e;
  }
}

function snapshotTile(t: Tile, g: TileRec): Omit<TileRec, 'uninit'> {
  const id = t.id;
  const mat = Object.entries(Material).find(([, v]) => v === t.material)?.[0] ?? '?';
  return {
    id, cls: t.constructor.name, desc: t.getDescriptionId(), tex: t.tex, mat, destroy: bits(t.destroySpeed), resist: bits(t.explosionResistance),
    light: Tile.lightEmission[id]!, lightBlock: Tile.lightBlock[id]!, tick: b(Tile.shouldTick[id]!), translucent: b(Tile.translucent[id]!),
    entity: b(Tile.isEntityTile[id]!), solidRender: b(t.isSolidRender()), cube: b(t.isCubeShaped()), shape: t.getRenderShape(), layer: t.getRenderLayer(),
    category: t.category, friction: bits(t.friction), gravity: bits(t.gravity),
    sound: [t.soundType.getStepSound(), t.soundType.getBreakSound(), bits(t.soundType.getVolume()), bits(t.soundType.getPitch())],
    bounds: [t.xx0, t.yy0, t.zz0, t.xx1, t.yy1, t.zz1].map(bits),
    tex6: [0, 1, 2, 3, 4, 5].map((f) => safe(`${id}.tex6[${f}]`, () => t.getTexture(f), g.tex6[f]!)),
    texData: Array.from({ length: 16 }, (_, d) => safe(`${id}.texData[${d}]`, () => t.getTexture(2, d), g.texData[d]!)),
  };
}

describe('G11-1 方块注册表', () => {
  it('TS 已注册的每个方块与 C++ 逐项一致；TS 不多注册任何 id', () => {
    const missing: number[] = [];
    let compared = 0;
    for (let id = 0; id < 256; id++) {
      const g = G.tiles[id];
      const t = Tile.tiles[id];
      if (!g) {
        expect(t ?? null, `id ${id} 在 C++ 里没有注册`).toBeNull();
        continue;
      }
      if (!t) { missing.push(id); continue; }
      expect(S12_IDS.has(id), `方块 ${id} 应在 S12 才注册`).toBe(false);
      const { uninit, bounds: wantBounds, ...want } = g;
      const { bounds: gotBits, ...got } = snapshotTile(t, g);
      for (const k of uninit ?? []) {
        delete (want as Record<string, unknown>)[k];
        delete (got as Record<string, unknown>)[k];
      }
      expect(got, `方块 ${id}（${g.desc}）`).toEqual(want);
      const toF = (b: number) => (fbuf.setUint32(0, b), fbuf.getFloat32(0));
      gotBits.forEach((b, k) => expect(Math.abs(toF(b) - toF(wantBounds[k]!)), `方块 ${id} 形状[${k}]`).toBeLessThan(BOUNDS_TOL));
      compared++;
    }
    console.info(`G11-1：已比较 ${compared} 个方块；尚未注册 ${missing.length} 个：${missing.join(', ')}；因依赖未注册方块而待定的字段 ${pending.length} 个`);
    if (REQUIRE_ALL) expect(pending).toEqual([]);
    expect(missing.filter((id) => !S12_IDS.has(id))).toEqual([]); // S11 之后：除 S12 的 20 个以外全部注册
    if (REQUIRE_ALL) expect(missing).toEqual([]);
    expect(compared).toBeGreaterThan(0);
  });
});

describe('G11-2 物品注册表', () => {
  it('TS 已注册的每个物品与 C++ 逐项一致', () => {
    const missing: number[] = [];
    let compared = 0;
    for (let id = 256; id < 512; id++) {
      const g = G.items[id - 256];
      const it = Item.items[id];
      if (!g) continue;
      if (!it) { missing.push(id); continue; }
      const got: ItemRec = {
        id, cls: it.constructor.name, desc: it.getDescriptionId(), icon: it.icon, maxStack: it.getMaxStackSize(), maxDamage: it.getMaxDamage(),
        category: it.category, hand: b(it.isHandEquipped()), stacked: b(it.isStackedByData()), food: b(it.isFood()), armor: b(it.isArmor()),
        tileId: 'getTileId' in it ? (it as unknown as { getTileId(): number }).getTileId() : -1,
        iconAux: Array.from({ length: 16 }, (_, d) => it.getIcon(d)),
      };
      expect(got, `物品 ${id}（${g.desc}）`).toEqual(g);
      compared++;
    }
    console.info(`G11-2：已比较 ${compared} 个物品；尚未注册 ${missing.length} 个`);
    if (REQUIRE_ALL) expect(missing).toEqual([]);
  });
});
