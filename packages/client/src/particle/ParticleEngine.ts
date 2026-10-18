/**
 * 1:1 移植自 src/client/particle/ParticleEngine.h 与 ParticleEngine.cpp（54 + 157 行）。
 *
 * 粒子系统的容器与渲染：4 个纹理档各一条列表，`tick` 推进、`render` 画前 3 档、
 * `renderLit` 画第 4 档；`destroy`/`crack` 是"造碎屑"的两个入口（挖方块时用）。
 *
 * 【照抄的五处】
 *   1. `tick()` 是**边遍历边删**（C++ `list.erase(list.begin() + (i--))`）——
 *      TS 里 `splice(i, 1); i--`，顺序错了会漏 tick 粒子。
 *   2. `render()` 的主循环只跑 **tt < 3**；空档直接 `continue`（**不 bind、不 begin/draw**）。
 *      每档在循环里 `t.begin()`，内层跑完再 `t.draw()`。
 *   3. `renderLit()` **既不 bind 也不 begin/draw** —— 它只逐个调 `p->render`。
 *      C++ 就是这样（那批顶点其实永远没被 draw，是原作者的行为，原样保留）。
 *   4. `crack()` 用的是引擎**自己的** `Random random` 成员，不是 `Entity.sharedRandom`。
 *   5. 两个算相机基向量的函数**算式不一样**：`render` 用 `Mth::PI / 180`，
 *      `renderLit` 用 `Mth::DEGRAD`（后者是 `f(PI/180)`，两者可能差 1 个 ULP）—— 照抄，别统一。
 *
 * 【textureIds[4] 没有移植】C++ 那个成员在网页版里从没被读过（bind 走的是
 * `textures->loadAndBindTexture`），标 `OMIT(Particle)`。
 *
 * 【为什么这个文件的下标要加 `if (tile)`】C++ `Tile::tiles[tid]` 拿到空指针会直接崩；
 * TS 里读出来是 undefined，加个守卫报出方块号更容易查（和 `Arrow.ts` 同一处理由）。
 */
import { Mth, Random } from '@mcpe/util';
import { Entity, Tile, type Level } from '@mcpe/world';
import { Tesselator } from '../renderer/Tesselator';
import { Textures } from '../renderer/Textures';
import { Particle } from './Particle';
import {
  ENTITY_PARTICLE_TEXTURE,
  ITEM_TEXTURE,
  MISC_TEXTURE,
  TERRAIN_TEXTURE,
  TEXTURE_COUNT,
} from './ParticleTextures';
import { TerrainParticle } from './TerrainParticle';

const f = Math.fround;

export class ParticleEngine {
  /** C++ `ParticleEngine::MISC_TEXTURE` 等五个常量（挪到 ParticleTextures.ts 了，这里转出去） */
  static readonly MISC_TEXTURE = MISC_TEXTURE;
  static readonly TERRAIN_TEXTURE = TERRAIN_TEXTURE;
  static readonly ITEM_TEXTURE = ITEM_TEXTURE;
  static readonly ENTITY_PARTICLE_TEXTURE = ENTITY_PARTICLE_TEXTURE;
  static readonly TEXTURE_COUNT = TEXTURE_COUNT;

  /** ⚠ C++ 里这个指针在 `Minecraft::init` 时是 **NULL**（`setLevel` 之后才有值），所以类型带上 null */
  protected level: Level | null;
  private readonly particles: Particle[][] = [[], [], [], []];
  private readonly textures: Textures;
  /** C++ `Random random;` —— `crack` 用的就是它（不是 sharedRandom） */
  private readonly random = new Random();

  constructor(level: Level | null, textures: Textures) {
    this.level = level;
    this.textures = textures;
    textures.loadTexture('particles.png');
  }

  /** C++ `void add(Particle* p)` */
  add(p: Particle): void {
    const t = p.getParticleTexture();
    this.particles[t]!.push(p);
  }

  /** C++ `void setLevel(Level* level)` */
  setLevel(level: Level | null): void {
    this.level = level;
    this.clear();
  }

  /** C++ `void tick()` —— ⚠ 边遍历边删，`i--` 是关键 */
  tick(): void {
    for (let tt = 0; tt < TEXTURE_COUNT; tt++) {
      const list = this.particles[tt]!;
      let size = list.length;
      for (let i = 0; i < size; ++i) {
        const p = list[i]!;
        p.tick();
        if (p.removed) {
          list.splice(i, 1);
          i--; // C++ `list.erase(list.begin() + (i--))`
          size--;
        }
      }
    }
  }

  /** C++ `void render(Entity* player, float a)` */
  render(player: Entity, a: number): void {
    const xa = Math.cos(f(f(player.yRot * Mth.PI) / 180));
    const za = Math.sin(f(f(player.yRot * Mth.PI) / 180));
    const xa2 = -za * Math.sin(f(f(player.xRot * Mth.PI) / 180));
    const za2 = xa * Math.sin(f(f(player.xRot * Mth.PI) / 180));
    const ya = Math.cos(f(f(player.xRot * Mth.PI) / 180));
    Particle.xOff = player.xOld + (player.x - player.xOld) * a;
    Particle.yOff = player.yOld + (player.y - player.yOld) * a;
    Particle.zOff = player.zOld + (player.z - player.zOld) * a;
    for (let tt = 0; tt < 3; tt++) {
      const list = this.particles[tt]!;
      if (list.length === 0) continue; // 空档：不 bind、不 begin、不 draw
      if (tt === MISC_TEXTURE) this.textures.loadAndBindTexture('particles.png');
      else if (tt === TERRAIN_TEXTURE) this.textures.loadAndBindTexture('terrain.png');
      else if (tt === ITEM_TEXTURE) this.textures.loadAndBindTexture('gui/items.png');
      const t = Tesselator.instance;
      t.begin();
      for (let i = 0; i < list.length; i++) {
        list[i]!.render(t, a, xa, ya, za, xa2, za2);
      }
      t.draw();
    }
    this.renderLit(player, a);
  }

  /** C++ `void renderLit(Entity* player, float a)` —— 第 4 档，不 bind 也不 begin/draw */
  renderLit(player: Entity, a: number): void {
    const tt = ENTITY_PARTICLE_TEXTURE;
    const pl = this.particles[tt]!;
    const size = pl.length;
    if (size === 0) return;
    // ⚠ 这里用的是 DEGRAD（不是 render 里的 PI/180）
    const xa = Math.cos(f(player.yRot * Mth.DEGRAD));
    const za = Math.sin(f(player.yRot * Mth.DEGRAD));
    const xs = Math.sin(f(player.xRot * Mth.DEGRAD));
    const xa2 = -za * xs;
    const za2 = xa * xs;
    const ya = Math.cos(f(player.xRot * Mth.DEGRAD));
    const t = Tesselator.instance;
    for (let i = 0; i < size; i++) {
      pl[i]!.render(t, a, xa, ya, za, xa2, za2);
    }
  }

  /** C++ `void destroy(int x, int y, int z)` —— 撒 3×2×3 = 18 个碎屑 */
  destroy(x: number, y: number, z: number): void {
    const level = this.level!; // 这两个入口只会在有世界之后被调
    const tid = level.getTile(x, y, z);
    if (tid === 0) return;
    const data = level.getData(x, y, z);
    const tile = Tile.tiles[tid];
    if (!tile) return; // C++ 这里会崩；TS 里报方块号更好查
    const SD = 3;
    for (let xx = 0; xx < SD; xx++) {
      for (let yy = 1; yy < SD; yy++) {
        for (let zz = 0; zz < SD; zz++) {
          const xp = x + f(f(xx + f(0.5)) / SD);
          const yp = y + f(f(yy + f(0.5)) / SD);
          const zp = z + f(f(zz + f(0.5)) / SD);
          this.add(
            new TerrainParticle(
              level,
              xp,
              yp,
              zp,
              f(2 * f(f(xp - x) - f(0.5))),
              f(2 * f(f(yp - y) - f(0.5))),
              f(2 * f(f(zp - z) - f(0.5))),
              tile,
              data,
            ).init(x, y, z),
          );
        }
      }
    }
  }

  /** C++ `void crack(int x, int y, int z, int face)` —— 按住挖掘时每刻撒 1 个 */
  crack(x: number, y: number, z: number, face: number): void {
    const level = this.level!;
    const tid = level.getTile(x, y, z);
    if (tid === 0) return;
    const data = level.getData(x, y, z);
    const tile = Tile.tiles[tid];
    if (!tile) return;
    const r = f(0.1);
    let xp = x + f(this.random.nextFloat() * f(tile.xx1 - tile.xx0 - f(r * 2))) + r + tile.xx0;
    let yp = y + f(this.random.nextFloat() * f(tile.yy1 - tile.yy0 - f(r * 2))) + r + tile.yy0;
    let zp = z + f(this.random.nextFloat() * f(tile.zz1 - tile.zz0 - f(r * 2))) + r + tile.zz0;
    // C++：`float yp = y + tile->yy0 - r;` 是 (y + yy0) - r 两个 float 步骤。
    switch (face) {
      case 0:
        yp = f(f(y + tile.yy0) - r);
        break;
      case 1:
        yp = f(f(y + tile.yy1) + r);
        break;
      case 2:
        zp = f(f(z + tile.zz0) - r);
        break;
      case 3:
        zp = f(f(z + tile.zz1) + r);
        break;
      case 4:
        xp = f(f(x + tile.xx0) - r);
        break;
      case 5:
        xp = f(f(x + tile.xx1) + r);
        break;
    }
    this.add(
      new TerrainParticle(level, xp, yp, zp, 0, 0, 0, tile, data)
        .init(x, y, z)
        .setPower(f(0.2))
        .scale(f(0.6)),
    );
  }

  /** C++ `std::string countParticles()` */
  countParticles(): string {
    let count = 0;
    for (let i = 0; i < TEXTURE_COUNT; ++i) count += this.particles[i]!.length;
    return String(count);
  }

  /** C++ `void clear()`（protected） */
  protected clear(): void {
    for (let tt = 0; tt < TEXTURE_COUNT; tt++) this.particles[tt]!.length = 0;
  }

  // OMIT(Particle): GLuint textureIds[4]  ParticleEngine.h:33
  //   网页版里从没被读过（bind 走 textures->loadAndBindTexture），是死成员。
  // OMIT(Particle): ~ParticleEngine() { clear(); }  ParticleEngine.cpp:9
  //   JS 没有析构函数，GC 管；clear() 本身移植了。
}
