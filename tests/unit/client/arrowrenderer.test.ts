import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Arrow, EntityRendererId, initItems } from '@mcpe/world';
import { ArrowRenderer, EntityRenderDispatcher } from '@mcpe/client';
import { createFlatLevel } from '../../helpers/headlessLevel';

// D11.5：`ArrowRenderer`（62 行）+ **注册那一行**。
// 和 D2.5 / D9.5 一个道理：类在、能 new 不等于注册表里有它 —— 少了 assign，
// 箭在画面上就是隐形的（D11 结束时正是这个现象）。

beforeAll(() => {
  // ⚠ 分派器的构造函数会读 `Item.egg` / `Item.snowBall`（D9.5 那两行 assign），
  // 所以必须先 initItems 再建单例 —— 真机顺序（NinecraftApp.initApp）就是这样。
  createFlatLevel();
  initItems();
});

afterEach(() => {
  EntityRenderDispatcher.destroy(); // 单例，别让用例之间互相污染
});

describe('ArrowRenderer（D11.5）', () => {
  it('ER_ARROW_RENDERER 注册的就是 ArrowRenderer', () => {
    const erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRendererById(EntityRendererId.ER_ARROW_RENDERER)).toBeInstanceOf(ArrowRenderer);
  });

  it('rendererId 是 ER_ARROW_RENDERER 的箭能拿到它（不再返回 null）', () => {
    const level = createFlatLevel();
    const a = new Arrow(level);
    expect(a.entityRendererId).toBe(EntityRendererId.ER_ARROW_RENDERER);
    const erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRenderer(a)).toBeInstanceOf(ArrowRenderer);
  });

  it('⚠ 前面补的那几个渲染器都没被挤掉', () => {
    const erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRendererById(EntityRendererId.ER_SNOWBALL_RENDERER)).not.toBeNull();
    expect(erd.getRendererById(EntityRendererId.ER_THROWNEGG_RENDERER)).not.toBeNull();
    expect(erd.getRendererById(EntityRendererId.ER_FALLINGTILE_RENDERER)).not.toBeNull();
    expect(erd.getRendererById(EntityRendererId.ER_ITEM_RENDERER)).not.toBeNull();
    // 对照：还没做的那个仍然是 null（C++ 找不到时也是什么都不画）
    expect(erd.getRendererById(EntityRendererId.ER_PAINTING_RENDERER)).toBeNull();
  });
});
