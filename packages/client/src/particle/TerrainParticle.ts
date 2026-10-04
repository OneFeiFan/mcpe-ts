/**
 * 1:1 移植自 src/client/particle/TerrainParticle.h（63 行，整个内联在头文件里）。
 *
 * **挖方块时溅出来的碎屑**（`ParticleEngine::destroy` / `crack` 造的就是它），
 * 贴的是 `terrain.png` 里那一格 —— 所以碎屑的颜色和方块一致。
 *
 * 【贴图档是 TERRAIN_TEXTURE，不是 MISC】`getParticleTexture()` 返回 1，
 * 于是 `ParticleEngine.render` 会为它 bind `terrain.png`。
 *
 * 【UV 是 1/4 格的，和基类完全不同】
 *   `u0 = ((tex & 15) + uo / 4.0f) / 16.0f`，`u1 = u0 + 0.999f / 16.0f / 4` ——
 *   用 **位运算 `& 15` / `>> 4`** 取格号（不是 `% 16` / `/ 16`），
 *   再把 `uo/vo`（基类构造里抽的那两个随机数）当**格内的 1/4 抖动**用。
 *   ⚠ 基类的 render 不用 uo/vo，这两个字段就是为 Terrain/BreakingItem 准备的。
 *   顶点顺序也和基类**不一样**（u 方向反着贴）。
 *
 * 【`init(x,y,z)` 要单独调】构造完不会自动染色，调用方（`destroy`/`crack`）再调一次。
 * 草方块**直接 return this**（不乘颜色）—— 因为草方块的 getColor 是生物群系色，
 * 已经烘在贴图里了。
 */
import { Tile, type Level, type LevelSource } from '@mcpe/world';
import { Particle } from './Particle';
import { Tesselator } from '../renderer/Tesselator';
import { TERRAIN_TEXTURE } from './ParticleTextures';

const f = Math.fround;

export class TerrainParticle extends Particle {
  private readonly tile: Tile;

  constructor(
    level: Level,
    x: number,
    y: number,
    z: number,
    xa: number,
    ya: number,
    za: number,
    tile: Tile,
    data: number,
  ) {
    super(level, x, y, z, xa, ya, za);
    this.tile = tile;

    this.tex = tile.getTexture(2, data);
    this.gravity = tile.gravity;
    this.rCol = f(0.6);
    this.gCol = f(0.6);
    this.bCol = f(0.6);
    this.size = f(this.size / 2);
  }

  /** C++ `TerrainParticle* init(int x, int y, int z)` —— 乘上方块自己的颜色 */
  init(x: number, y: number, z: number): this {
    if (this.tile === Tile.grass) return this;
    const col = this.tile.getColor(this.level as unknown as LevelSource, x, y, z);
    this.rCol = f(this.rCol * f(((col >> 16) & 0xff) / f(255.0)));
    this.gCol = f(this.gCol * f(((col >> 8) & 0xff) / f(255.0)));
    this.bCol = f(this.bCol * f((col & 0xff) / f(255.0)));
    return this;
  }

  override getParticleTexture(): number {
    return TERRAIN_TEXTURE;
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
    const u0 = ((this.tex & 15) + this.uo / f(4.0)) / f(16.0);
    const u1 = u0 + f(0.999) / f(16.0) / 4;
    const v0 = ((this.tex >> 4) + this.vo / f(4.0)) / f(16.0);
    const v1 = v0 + f(0.999) / f(16.0) / 4;
    const r = f(0.1) * this.size;
    const x = this.xo + (this.x - this.xo) * a - Particle.xOff;
    const y = this.yo + (this.y - this.yo) * a - Particle.yOff;
    const z = this.zo + (this.z - this.zo) * a - Particle.zOff;
    const br = this.getBrightness(a);
    t.color(br * this.rCol, br * this.gCol, br * this.bCol);
    // ⚠ 顶点顺序与基类不同（u 方向反着贴），照抄
    t.vertexUV(x - xa * r - xa2 * r, y - ya * r, z - za * r - za2 * r, u0, v1);
    t.vertexUV(x - xa * r + xa2 * r, y + ya * r, z - za * r + za2 * r, u0, v0);
    t.vertexUV(x + xa * r + xa2 * r, y + ya * r, z + za * r + za2 * r, u1, v0);
    t.vertexUV(x + xa * r - xa2 * r, y - ya * r, z + za * r - za2 * r, u1, v1);
  }
}
