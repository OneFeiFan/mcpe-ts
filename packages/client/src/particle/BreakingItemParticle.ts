/**
 * 1:1 移植自 src/client/particle/BreakingItemParticle.h（66 行，整个内联在头文件里）。
 *
 * 物品碎屑：`iconcrack`（拿工具砸东西）和 `snowballpoof`（雪球/蛋炸开）都造它，
 * 贴的是 `gui/items.png` 里那一格 —— 所以碎屑长得像那个物品。
 *
 * 【⚠ `_init` 改名成 `_initBreakingItem`】C++ 里叫 `_init(Item*)`，但 TS 的
 * `Entity._init()` 已经是别的东西（无参、protected、构造函数里显式调的那个）——
 * 同名会撞签名（D11 的 `Arrow._init()` 也是这么改成 `_initArrow` 的）。**只改了名字，行为没动。**
 *
 * 【两个构造不一样】四参那个 `super(...,0,0,0)` 之后就完事；七参那个在 `_init` 之后
 * 还要 `×0.1f` 再 `+= 形参`（和 SmokeParticle 同款）。
 *
 * 【`gravity = Tile.snow->gravity`】拿的是**雪的** gravity（雪方块没覆盖，就是默认 1.0）——
 * 为什么不直接用 1.0 只有原作者知道，照抄。
 *
 * 【UV 和 TerrainParticle 是一对】都是 1/4 格 + `uo/vo` 抖动，但取格号的方式不同：
 * 这里是 `tex % 16` 和 **`tex / 16`（整数除法）**，TerrainParticle 那边是 `& 15` 和 `>> 4`。
 * 两者对非负数等价，但写法照抄不改。
 */
import { Item, Tile, type Level } from '@mcpe/world';
import { Particle } from './Particle';
import { Tesselator } from '../renderer/Tesselator';
import { ITEM_TEXTURE } from './ParticleTextures';

const f = Math.fround;

export class BreakingItemParticle extends Particle {
  /** C++ `BreakingItemParticle(Level*, float, float, float, Item*)` */
  constructor(level: Level, x: number, y: number, z: number, item: Item);
  /** C++ `BreakingItemParticle(Level*, float x6, Item*)` */
  constructor(
    level: Level,
    x: number,
    y: number,
    z: number,
    xa: number,
    ya: number,
    za: number,
    item: Item,
  );
  constructor(
    level: Level,
    x: number,
    y: number,
    z: number,
    a: number | Item,
    b?: number,
    c?: number,
    d?: Item,
  ) {
    super(level, x, y, z, 0, 0, 0);
    if (d === undefined) {
      // C++ 的四参构造：只有 _init
      this._initBreakingItem(a as Item);
      return;
    }
    // C++ 的七参构造：_init 之后还要 ×0.1f 再加形参
    this._initBreakingItem(d);
    const xa = a as number;
    const ya = b!;
    const za = c!;
    this.xd = f(this.xd * f(0.1));
    this.yd = f(this.yd * f(0.1));
    this.zd = f(this.zd * f(0.1));
    this.xd = f(this.xd + xa);
    this.yd = f(this.yd + ya);
    this.zd = f(this.zd + za);
  }

  /** C++ `void _init(Item* item)` —— 改名见文件头 */
  private _initBreakingItem(item: Item): void {
    this.tex = item.getIcon(0);
    this.rCol = f(1.0);
    this.gCol = f(1.0);
    this.bCol = f(1.0);
    this.gravity = Tile.snow.gravity;
    this.size = f(this.size / 2);
  }

  override getParticleTexture(): number {
    return ITEM_TEXTURE;
  }

  override render(
    t: Tesselator,
    a: number,
    xa: number,
    ya: number,
    za: number,
    xa2: number,
    za2: number,
  ): void {
    const u0 = ((this.tex % 16) + this.uo / f(4.0)) / f(16.0);
    const u1 = u0 + f(0.999) / f(16.0) / 4;
    const v0 = (Math.trunc(this.tex / 16) + this.vo / f(4.0)) / f(16.0);
    const v1 = v0 + f(0.999) / f(16.0) / 4;
    const r = f(0.1) * this.size;
    const x = this.xo + (this.x - this.xo) * a - Particle.xOff;
    const y = this.yo + (this.y - this.yo) * a - Particle.yOff;
    const z = this.zo + (this.z - this.zo) * a - Particle.zOff;
    const br = this.getBrightness(a);
    t.color(br * this.rCol, br * this.gCol, br * this.bCol);
    // ⚠ 顶点顺序与基类不同（u 方向反着贴），和 TerrainParticle 一致
    t.vertexUV(x - xa * r - xa2 * r, y - ya * r, z - za * r - za2 * r, u0, v1);
    t.vertexUV(x - xa * r + xa2 * r, y + ya * r, z - za * r + za2 * r, u0, v0);
    t.vertexUV(x + xa * r + xa2 * r, y + ya * r, z + za * r + za2 * r, u1, v0);
    t.vertexUV(x + xa * r - xa2 * r, y - ya * r, z + za * r - za2 * r, u1, v1);
  }
}
