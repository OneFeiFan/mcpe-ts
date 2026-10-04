import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EntityRendererId, FallingTile, initItems } from '@mcpe/world';
import {
  EntityRenderer,
  EntityRenderDispatcher,
  FallingTileRenderer,
  ItemRenderer,
} from '@mcpe/client';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// D2.5：FallingTileRenderer 本身只有 30 行，真正容易丢的是**注册那一行** ——
// 忘了 assign 的话渲染器类还在、编译也过，但 `EntityRenderDispatcher.renderAt`
// 拿不到它就跳过，画面上下落的方块又是隐形的（这正是 D2 结束时用户报的现象）。
// 所以这条测试钉的是"注册表里真的有它"，不是"这个类能 new 出来"。

beforeAll(() => {
  // ⚠ D9.5 起，分派器的构造函数里会读 `Item.egg` / `Item.snowBall`（照 C++ 的 assign 那两行），
  // 所以**必须先把物品注册好再建单例** —— 真机顺序就是这样（NinecraftApp.initApp 里
  // initTiles → initItems 都在渲染之前）。这个 beforeAll 是补上那个真实顺序，不是改断言。
  createFlatLevel(); // initHeadless：initMaterials → initTestTiles → initBiomes…
  initItems();
});

afterEach(() => {
  EntityRenderDispatcher.destroy(); // 单例，别让用例之间互相污染
});

describe('FallingTileRenderer（D2.5）', () => {
  it('ER_FALLINGTILE_RENDERER 注册的就是 FallingTileRenderer', () => {
    const erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRendererById(EntityRendererId.ER_FALLINGTILE_RENDERER)).toBeInstanceOf(
      FallingTileRenderer,
    );
  });

  it('掉落物那个也还在（别为了加新的把旧的挤掉）', () => {
    const erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRendererById(EntityRendererId.ER_ITEM_RENDERER)).toBeInstanceOf(ItemRenderer);
  });

  it('rendererId 对得上的 FallingTile 能拿到渲染器；没注册的仍然返回 null', () => {
    const level = createFlatLevel();
    prepareLevel(level);

    const e = new FallingTile(level, 130.5, 70.5, 130.5, 12, 0);
    expect(e.entityRendererId).toBe(EntityRendererId.ER_FALLINGTILE_RENDERER);

    const erd = EntityRenderDispatcher.getInstance();
    expect(erd.getRenderer(e)).toBeInstanceOf(FallingTileRenderer);

    // 对照：取一个**还没做渲染器**的 id，必须是 null（C++ 找不到时也是什么都不画）。
    // ⚠ 原来拿 ER_ARROW_RENDERER 当例子 —— D11.5 把箭的渲染器补上之后它不再是 null 了，
    //   换成仍然没注册的 ER_PAINTING_RENDERER。**断言本身没改，只换了例子。**
    e.entityRendererId = EntityRendererId.ER_PAINTING_RENDERER;
    expect(erd.getRenderer(e)).toBeNull();
  });

  it('C++ 构造里那句 shadowRadius = 0.5f（十进制带 f 后缀 → 过 f()）', () => {
    // ⚠ 这条**钉不住 `f()` 本身**，别拿它做扰动：
    //   `f(0.5)` 和 `0.5` 是**逐位相等**的（0.5 在 float32 里精确可表示），
    //   把源码改成 `= 0.5` 这条测试照样绿 —— 实测过，是个无效扰动。
    //   （和 D1 那条 `f(0.04)` 是同一类问题，但那个还差一个 ULP 的 1/130，这个干脆相等。）
    //   改成 `f(0.4)` 会红，说明**断言本身是活的**、量到的是那个数值。
    const r = new FallingTileRenderer();
    // shadowRadius 是 EntityRenderer 的 protected 成员
    const shadow = (r as unknown as { shadowRadius: number }).shadowRadius;
    expect(shadow).toBe(Math.fround(0.5));
    // 顺带确认它确实是 EntityRenderer 的子类（渲染器分派器按基类用）
    expect(r).toBeInstanceOf(EntityRenderer);
  });
});
