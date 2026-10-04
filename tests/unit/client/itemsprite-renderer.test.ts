import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EntityRendererId, Item, initItems } from '@mcpe/world';
import {
  EntityRenderer,
  EntityRenderDispatcher,
  FallingTileRenderer,
  ItemRenderer,
  ItemSpriteRenderer,
} from '@mcpe/client';
import { createFlatLevel } from '../../helpers/headlessLevel';

// D9.5：`ItemSpriteRenderer`（41 行）+ **注册那两行**。
// 和 D2.5 一个道理：类在、能 new，不等于注册表里有它 —— 少了 assign，
// 雪球和蛋在画面上就是隐形的（D9 结束时正是这个现象）。
//
// 【顺序】构造函数里 `Item.egg.getIcon(0)` 那两句要在 `initItems()` 之后跑，
// 真机就是那个顺序；测试里用 beforeAll 复现。

let erd: EntityRenderDispatcher;

beforeAll(() => {
  createFlatLevel(); // initHeadless
  initItems();
});

afterEach(() => {
  EntityRenderDispatcher.destroy(); // 单例，别让用例之间互相污染
});

function icon(r: ItemSpriteRenderer): number {
  return (r as unknown as { icon: number }).icon;
}

describe('ItemSpriteRenderer（D9.5）', () => {
  it('ER_SNOWBALL_RENDERER / ER_THROWNEGG_RENDERER 注册的都是它', () => {
    erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRendererById(EntityRendererId.ER_SNOWBALL_RENDERER)).toBeInstanceOf(
      ItemSpriteRenderer,
    );
    expect(erd.getRendererById(EntityRendererId.ER_THROWNEGG_RENDERER)).toBeInstanceOf(
      ItemSpriteRenderer,
    );
  });

  it('⚠ 图标格号来自 Item 自己的 getIcon(0)，不是写死的数（雪球 14、蛋 12）', () => {
    erd = EntityRenderDispatcher.getInstance();
    const snow = erd.getRendererById(EntityRendererId.ER_SNOWBALL_RENDERER) as ItemSpriteRenderer;
    const egg = erd.getRendererById(EntityRendererId.ER_THROWNEGG_RENDERER) as ItemSpriteRenderer;
    expect(icon(snow)).toBe(Item.snowBall.getIcon(0));
    expect(icon(egg)).toBe(Item.egg.getIcon(0));
    // 两个都写死成同一个数（或者互相接错）时，上面两条各自还是会过 —— 所以再钉一次字面量：
    // Item.snowBall 是 setIcon(14, 0)、Item.egg 是 setIcon(12, 0)（Item.ts:538,570）
    expect(icon(snow)).toBe(14);
    expect(icon(egg)).toBe(12);
  });

  it('旧的两个没被挤掉、没注册的还是 null', () => {
    erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRendererById(EntityRendererId.ER_ITEM_RENDERER)).toBeInstanceOf(ItemRenderer);
    expect(erd.getRendererById(EntityRendererId.ER_FALLINGTILE_RENDERER)).toBeInstanceOf(
      FallingTileRenderer,
    );
    // ⚠ D11.5 起 ER_ARROW_RENDERER 也注册了，换成仍然没注册的画画那个（断言没改）
    expect(erd.getRendererById(EntityRendererId.ER_PAINTING_RENDERER)).toBeNull();
  });

  it('它是个 EntityRenderer（分派器按基类用），且照 C++ 没设 shadowRadius', () => {
    const r = new ItemSpriteRenderer(14);
    expect(r).toBeInstanceOf(EntityRenderer);
    expect((r as unknown as { shadowRadius: number }).shadowRadius, 'C++ 构造函数只有 icon(icon)').toBe(
      0,
    );
  });
});
