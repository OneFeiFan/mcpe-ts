/**
 * 1:1 移植自 src/client/renderer/entity/FallingTileRenderer.h 与 .cpp（整个类 32 行 + 头 22 行）。
 *
 * 画下落的沙子/沙砾：一个跟 `TileRenderer` 的方块渲染没两样，只是位置跟着实体走。
 *
 * 【为什么补这个】D2 把 `FallingTile` 接上线之后，方块确实会掉了 —— **但画面上看不见**，
 * 落地那一刻才重新出现。原因是**实体渲染器整个没移植**（D0 划出去的那一块），
 * `EntityRenderDispatcher.renderAt` 拿不到渲染器就直接跳过（`EntityRenderDispatcher.ts:94-100`）。
 * 这个类是那一批里唯一一个**不依赖模型系统**的，所以能单拎出来先补。
 *
 * 【它靠的 TileRenderer 早就移植过了】那 3227 行在 S11 就做完了，这里只是拿来用。
 *
 * 【照抄的两处小地方】
 *   1. `Level* level = tile->getLevel();` 这一句在 C++ 里写在 **`if (tt != NULL)` 之前**，
 *      哪怕后面根本没用到它也要先取。顺序照抄（取值本身无副作用，但句子位置照原样）。
 *   2. `shadowRadius = 0.5f` 是十进制字面量带 `f` 后缀 → 过 `f()`（PITFALLS 第 3 条）。
 *
 * 【一处在 C++ 里是 UB、这里没法照抄的】`Tile::tiles[tile->tile]` 的下标来自 NBT
 * （FallingTile 读存档时**没有 `& 0xff`**，见 FallingTile.ts 文件头第 2 条），所以**可能是负数**。
 * C++ 那边是读数组前面的野内存（未定义行为，可能画出乱七八糟的东西、也可能崩）；
 * TS 里越界索引就是 `undefined`，下面的 `tt != null` 会挡住、不画。
 * 这是"没法照抄的 UB"，不是"改写了原句"。
 */
import { Mth } from '@mcpe/util';
import { type Entity, type FallingTile, Tile } from '@mcpe/world';
import { glPopMatrix2, glPushMatrix2, glTranslatef2 } from '../gles';
import { TileRenderer } from '../TileRenderer';
import { EntityRenderer } from './EntityRenderer';

const f = Math.fround;

// OMIT(EntityRender): FallingTileRenderer::~FallingTileRenderer() { delete tileRenderer; }  FallingTileRenderer.cpp:12
//   析构函数整个没移植 —— JS 没有析构函数，这个成员由 GC 管，没有对应的写法。
//   （同文件的 ItemRenderer 那边是把 `delete tileRenderer` 写成 teardown_static() 手工调的，
//    那是因为 C++ 那边它是个**静态**成员；这里是非静态的，所以连那个先例也不适用。）

export class FallingTileRenderer extends EntityRenderer {
  private tileRenderer: TileRenderer;

  constructor() {
    super();
    this.shadowRadius = f(0.5);
    this.tileRenderer = new TileRenderer();
  }

  override render(e: Entity, x: number, y: number, z: number, _rot: number, _a: number): void {
    const tile = e as FallingTile;

    glPushMatrix2();
    glTranslatef2(x, y, z);

    this.bindTexture('terrain.png');
    const tt = Tile.tiles[tile.tile];

    const level = tile.getLevel();

    if (tt != null) {
      this.tileRenderer.renderBlock(
        tt,
        level,
        Mth.floor(tile.x),
        Mth.floor(tile.y),
        Mth.floor(tile.z),
      );
    }

    glPopMatrix2();
  }
}
