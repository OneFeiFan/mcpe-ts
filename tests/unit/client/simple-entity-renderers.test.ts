/**
 * 不依赖模型系统的三个实体渲染器（任务单 D 补的）：落沙 FallingTileRenderer、雪球与蛋 ItemSpriteRenderer、箭 ArrowRenderer。
 * 每个 describe 对应原来的一个测试文件（2026-10-09 整理时合并），内容未改；各自的 beforeAll / afterEach 留在各自的 describe 里。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  GLES1,
  glSetContext,
  EntityRenderer,
  EntityRenderDispatcher,
  FallingTileRenderer,
  ItemRenderer,
  ItemSpriteRenderer,
  ArrowRenderer,
} from '@mcpe/client';
import { EntityRendererId, FallingTile, initItems, Item, Arrow } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

describe('FallingTileRenderer（原 fallingtile-renderer.test.ts）', () => {
  // D2.5：FallingTileRenderer 本身只有 30 行，真正容易丢的是**注册那一行** ——
  // 忘了 assign 的话渲染器类还在、编译也过，但 `EntityRenderDispatcher.renderAt`
  // 拿不到它就跳过，画面上下落的方块又是隐形的（这正是 D2 结束时用户报的现象）。
  // 所以这条测试钉的是"注册表里真的有它"，不是"这个类能 new 出来"。

  beforeAll(() => {
    // ⚠ G9 起构造函数还会 `new ChickenModel()`（`ModelPart` 的构造要 GL 上下文，gles.ts 会抛），
    // 所以先铺一个 headless GL —— 真机里 GL 上下文本就早于分派器。不改断言。
    glSetContext(new GLES1(null));
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

      // 对照：取一个**没注册**的 id，必须是 null（C++ 找不到时也是什么都不画）。
      // ⚠ 这个例子换过两次：先是 ER_ARROW_RENDERER（D11.5 补上）、后是 ER_PAINTING_RENDERER
      //   （G10 补上），现在换成 ER_TRIPODCAMERA_RENDERER —— 它是 C++ **永久**不注册的那个
      //   （EntityRenderDispatcher.h:55 只有注释）。**断言本身没改，只换了例子。**
      e.entityRendererId = EntityRendererId.ER_TRIPODCAMERA_RENDERER;
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
});

describe('ItemSpriteRenderer（原 itemsprite-renderer.test.ts）', () => {
  // D9.5：`ItemSpriteRenderer`（41 行）+ **注册那两行**。
  // 和 D2.5 一个道理：类在、能 new，不等于注册表里有它 —— 少了 assign，
  // 雪球和蛋在画面上就是隐形的（D9 结束时正是这个现象）。
  //
  // 【顺序】构造函数里 `Item.egg.getIcon(0)` 那两句要在 `initItems()` 之后跑，
  // 真机就是那个顺序；测试里用 beforeAll 复现。

  let erd: EntityRenderDispatcher;

  beforeAll(() => {
    // ⚠ G9 起分派器的构造函数还会 `new ChickenModel()`（`ModelPart` 的构造要 GL 上下文，
    // gles.ts 会抛），所以先铺一个 headless GL —— 真机里 GL 上下文本就早于分派器。不改断言。
    glSetContext(new GLES1(null));
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
      // ⚠ 这个例子换过两次：D11.5 起 ER_ARROW_RENDERER 注册了、G10 起 ER_PAINTING_RENDERER 也注册了，
      //   现在换成 ER_TRIPODCAMERA_RENDERER（C++ 永久不注册）。断言没改。
      expect(erd.getRendererById(EntityRendererId.ER_TRIPODCAMERA_RENDERER)).toBeNull();
    });

    it('它是个 EntityRenderer（分派器按基类用），且照 C++ 没设 shadowRadius', () => {
      const r = new ItemSpriteRenderer(14);
      expect(r).toBeInstanceOf(EntityRenderer);
      expect(
        (r as unknown as { shadowRadius: number }).shadowRadius,
        'C++ 构造函数只有 icon(icon)',
      ).toBe(0);
    });
  });
});

describe('ArrowRenderer（原 arrowrenderer.test.ts）', () => {
  // D11.5：`ArrowRenderer`（62 行）+ **注册那一行**。
  // 和 D2.5 / D9.5 一个道理：类在、能 new 不等于注册表里有它 —— 少了 assign，
  // 箭在画面上就是隐形的（D11 结束时正是这个现象）。

  beforeAll(() => {
    // ⚠ G9 起构造函数还会 `new ChickenModel()` —— `ModelPart` 的构造要 GL 上下文
    // （gles.ts 的 glGenBuffers 没上下文会抛），所以先铺一个 headless 的。
    // 真机里 GL 上下文本就先于分派器存在，这里只是把那个顺序补上，不改断言。
    glSetContext(new GLES1(null));
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
      // 对照：没注册的那个仍然是 null（C++ 找不到时也是什么都不画）。
      // ⚠ 原来拿 ER_PAINTING_RENDERER 当例子 —— G10 把画补上之后换成相机：
      //   它是 C++ **永久**不注册的（EntityRenderDispatcher.h:55 是注释行）。**断言没改，只换了例子。**
      expect(erd.getRendererById(EntityRendererId.ER_TRIPODCAMERA_RENDERER)).toBeNull();
    });
  });
});
