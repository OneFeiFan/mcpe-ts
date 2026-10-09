/**
 * 1:1 移植自 src/client/renderer/LevelRenderer.h 与 LevelRenderer.cpp（S9）：渲染区块的网格、排序、剔除与逐层绘制。
 *
 * 构造取 OPENGL_ES 分支（CMake 对所有目标都定义了 OPENGL_ES，D2）：一次 glGenBuffers 出 33×33×8×3 = 26,136 个区块缓冲，
 * 另有天空、虚空、星星三个缓冲，并调用 generateStars、generateSky。
 * 【OMIT】renderDebug、render(const AABB&)、renderHit、renderHitOutline、renderHitSelect、renderEntities、gatherStats1、renderSky、
 *   renderClouds、renderAdvancedClouds，以及监听器回调 playSound、addParticle×2、entityAdded、takePicture、levelEvent、
 *   skyColorChanged（退回 LevelListener 的空实现）。
 * 【C++ 未初始化】LastTint、LastSideTint 不在初始化列表里（未定义值），这里取 false（与默认选项一致，不会多触发一次 allChanged）。
 * 排序：std::sort 用 sorterComparator 套给 Array.sort（不稳定排序与 C++ 一样不保证相等元素的次序）。
 */
import { LOGI, Stopwatch } from '@mcpe/platform';
import { Mth, Random, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH } from '@mcpe/util';
import {
  type AABB,
  type Entity,
  FoliageColor,
  GrassColor,
  type HitResult,
  HitResultType,
  type Level,
  LevelConstants,
  LevelListener,
  type Mob,
  type Player,
  Tile,
  type Vec3,
} from '@mcpe/world';
import { Minecraft } from '../Minecraft';
import { OptionId } from '../Options';
import { Chunk } from './Chunk';
import { EntityRenderDispatcher } from './entity/EntityRenderDispatcher';
import { TileEntityRenderDispatcher } from './tileentity/TileEntityRenderDispatcher';
import type { Culler } from './culling/Culler';
import { DirtyChunkSorter, sorterComparator } from './DirtyChunkSorter';
import { DistanceChunkSorter } from './DistanceChunkSorter';
import {
  GL_ALPHA_TEST,
  GL_BLEND,
  GL_DEPTH_TEST,
  GL_DST_COLOR,
  GL_FOG,
  GL_LIGHTING,
  GL_LINE_STRIP,
  GL_LINES,
  GL_ONE,
  GL_ONE_MINUS_SRC_ALPHA,
  GL_POLYGON_OFFSET_FILL,
  GL_SRC_ALPHA,
  GL_SRC_COLOR,
  GL_TEXTURE_2D,
  glBlendFunc2,
  glColor4f2,
  glColorMask,
  glDepthMask,
  glDisable2,
  glEnable2,
  glGenBuffers2,
  glLineWidth,
  glPolygonOffset,
  glPopMatrix2,
  glPushMatrix2,
  glTranslatef2,
  GL_VERTEX_ARRAY,
  GL_TEXTURE_COORD_ARRAY,
  glEnableClientState2,
  glDisableClientState2,
  GL_CULL_FACE,
  GL_TRIANGLE_FAN,
  drawArrayVT,
  glColor4f,
  glDisable,
  glEnable,
  glPopMatrix,
  glPushMatrix,
  glRotatef,
  glScalef,
  glBlendFunc,
  glTranslatef,
} from './gles';
import { Item, LevelEvent, ParticleType } from '@mcpe/world';
import { BreakingItemParticle } from '../particle/BreakingItemParticle';
import { BubbleParticle } from '../particle/BubbleParticle';
import { CritParticle2 } from '../particle/CritParticle2';
import { ExplodeParticle } from '../particle/ExplodeParticle';
import { FlameParticle } from '../particle/FlameParticle';
import { LavaParticle } from '../particle/LavaParticle';
import { RedDustParticle } from '../particle/RedDustParticle';
import { SmokeParticle } from '../particle/SmokeParticle';
import { RenderList } from './RenderList';
import { Tesselator } from './Tesselator';
import { Lighting } from './Lighting';
import type { Textures } from './Textures';
import { TileRenderer } from './TileRenderer';

/** LevelRenderer.cpp 的全局 int _t_keepPic = -1;（GameRenderer 每 tick 减 1）。ES 模块不能给导入的变量赋值，所以包一层 */
export const _t_keepPic = { value: -1 };

const INT_MAX = 2147483647;
const INT_MIN = -2147483648;

/** `ParticleType` 的反查表：数字 id → C++ 字符串梯子里用的那个名字（见 addParticle 的说明） */
const PARTICLE_NAME_BY_ID: readonly string[] = (() => {
  const out: string[] = [];
  for (const [k, v] of Object.entries(ParticleType)) out[v as number] = k;
  return out;
})();

const f = Math.fround;

export class LevelRenderer extends LevelListener {
  static readonly CHUNK_SIZE = 16; // 没有定义 GFX_SMALLER_CHUNKS
  static readonly MAX_VISIBLE_REBUILDS_PER_FRAME = 3;
  static readonly MAX_INVISIBLE_REBUILDS_PER_FRAME = 1;

  xOld = -9999;
  yOld = -9999;
  zOld = -9999;
  destroyProgress = 0;
  tileRenderer: TileRenderer | null = null;

  private noEntityRenderFrames = 2;
  private totalEntities = 0;
  private renderedEntities = 0;
  private culledEntities = 0;
  private _renderChunks: Chunk[] = [];
  private cullStep = 0;
  private renderList = new RenderList();
  private totalChunks = 0;
  private offscreenChunks = 0;
  private occludedChunks = 0;
  private renderedChunks = 0;
  private emptyChunks = 0;
  private chunkFixOffs = 0;
  private xMinChunk = 0;
  private yMinChunk = 0;
  private zMinChunk = 0;
  private xMaxChunk = 0;
  private yMaxChunk = 0;
  private zMaxChunk = 0;
  private level: Level | null = null;
  private dirtyChunks: (Chunk | null)[] = [];
  private chunks: Chunk[] | null = null;
  private sortedChunks: Chunk[] | null = null;
  private chunksLength = 0;
  private xChunks = 0;
  private yChunks = 0;
  private zChunks = 0;
  private chunkLists = 0;
  private mc: Minecraft;
  private occlusionCheck = false;
  private lastViewDistance = -1;
  private lastFogType = -1;
  private LastTint = false;
  private LastSideTint = false;
  private ticks = 0;
  private starList = 0;
  private skyList = 0;
  private darkList = 0;
  private numListsOrBuffers: number;
  private chunkBuffers: Uint32Array;
  private skyBuffer = 0;
  private skyVertexCount = 0;
  private voidBuffer = 0;
  private voidVertexCount = 0;
  private starBuffer = 0;
  private starVertexCount = 0;
  private textures: Textures | null;

  constructor(mc: Minecraft) {
    super();
    this.mc = mc;
    this.textures = mc.textures;
    // #ifdef OPENGL_ES
    const maxChunksWidth = ((2 * LevelConstants.LEVEL_WIDTH) / LevelRenderer.CHUNK_SIZE + 1) | 0;
    this.numListsOrBuffers =
      maxChunksWidth * maxChunksWidth * ((128 / LevelRenderer.CHUNK_SIZE) | 0) * 3;
    this.chunkBuffers = new Uint32Array(this.numListsOrBuffers);
    glGenBuffers2(this.numListsOrBuffers, this.chunkBuffers);
    LOGI(`numBuffers: ${this.numListsOrBuffers}`);
    const one = [0];
    glGenBuffers2(1, one);
    this.skyBuffer = one[0]!;
    glGenBuffers2(1, one);
    this.voidBuffer = one[0]!;
    glGenBuffers2(1, one);
    this.starBuffer = one[0]!;
    this.generateStars();
    this.generateSky();
  }

  // 析构函数不移植（R3）

  private generateSky(): void {
    const t = Tesselator.instance;
    const s = 128;
    const d = ((256 / s) | 0) + 2;
    let yy = 16;
    t.begin();
    this.skyVertexCount = 0;
    for (let xx = -s * d; xx <= s * d; xx += s) {
      for (let zz = -s * d; zz <= s * d; zz += s) {
        t.vertex(xx + 0, yy, zz + 0);
        t.vertex(xx + s, yy, zz + 0);
        t.vertex(xx + s, yy, zz + s);
        t.vertex(xx + 0, yy, zz + s);
        this.skyVertexCount += 4;
      }
    }
    t.end(true, this.skyBuffer);
    yy = -16;
    t.begin();
    this.voidVertexCount = 0;
    for (let xx = -s * d; xx <= s * d; xx += s) {
      for (let zz = -s * d; zz <= s * d; zz += s) {
        t.vertex(xx + 0, yy, zz + s);
        t.vertex(xx + s, yy, zz + s);
        t.vertex(xx + s, yy, zz + 0);
        t.vertex(xx + 0, yy, zz + 0);
        this.voidVertexCount += 4;
      }
    }
    t.end(true, this.voidBuffer);
  }

  generateStars(): void {
    const f = Math.fround;
    const random = new Random(10842);
    const t = Tesselator.instance;
    t.begin();
    this.starVertexCount = 0;
    for (let i = 0; i < 1500; i++) {
      let d = f(random.nextFloat() * 2.0 - 1.0);
      let e = f(random.nextFloat() * 2.0 - 1.0);
      let g2 = f(random.nextFloat() * 2.0 - 1.0);
      const g = f(0.25 + random.nextFloat() * 0.25);
      let h = f(d * d + e * e + g2 * g2);
      if (h < 1.0 && h > 0.01) {
        h = f(1.0 / Mth.sqrt(h));
        d = f(d * h);
        e = f(e * h);
        g2 = f(g2 * h);
        const j = d * 100.0;
        const k = e * 100.0;
        const l = g2 * 100.0;
        const m = Mth.atan2(d, g2);
        const n = Mth.sin(m);
        const o = Mth.cos(m);
        const p = Mth.atan2(Mth.sqrt(d * d + g2 * g2), e);
        const q = Mth.sin(p);
        const r = Mth.cos(p);
        const s = random.nextDouble() * Mth.PI * 2.0;
        const t2 = Mth.sin(s);
        const u = Mth.cos(s);
        for (let v = 0; v < 4; v++) {
          const w = 0.0;
          const x = ((v & 2) - 1) * g;
          const y = (((v + 1) & 2) - 1) * g;
          const aa = x * u - y * t2;
          const ab = y * u + x * t2;
          const ad = aa * q + w * r;
          const ae = w * q - aa * r;
          const af = ae * n - ab * o;
          const ah = ab * n + ae * o;
          t.vertex(j + af, k + ad, l + ah);
        }
        this.starVertexCount += 4;
      }
    }
    t.end(true, this.starBuffer);
  }

  setLevel(level: Level | null): void {
    if (this.level !== null) {
      this.level.removeListener(this);
    }
    this.xOld = -9999;
    this.yOld = -9999;
    this.zOld = -9999;
    EntityRenderDispatcher.getInstance().setLevel(level);
    EntityRenderDispatcher.getInstance().setMinecraft(this.mc);
    TileEntityRenderDispatcher.getInstance().setLevel(level);
    this.level = level;
    this.tileRenderer = new TileRenderer(level);
    if (level !== null) {
      level.addListener(this);
      this.allChanged();
    }
  }

  override allChanged(): void {
    const mc = this.mc;
    this.deleteChunks();
    const fancy = mc.options.getBooleanValue(OptionId.OPTIONS_FANCY_GRAPHICS);
    Tile.leaves.setFancy(fancy);
    Tile.leaves_carried.setFancy(fancy);
    this.lastViewDistance = mc.options.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE);
    this.lastFogType = mc.options.getIntValue(OptionId.OPTIONS_FOG_TYPE);
    // #ifndef __APPLE__
    const tint = mc.options.getBooleanValue(OptionId.OPTIONS_FOLIAGE_TINT);
    const sideTint = mc.options.getBooleanValue(OptionId.OPTIONS_TINTED_SIDE);
    FoliageColor.setUseTint(tint);
    GrassColor.setUseTint(tint);
    TileRenderer.setUseTint(sideTint);

    let dist = (512 >> 3) << (3 - this.lastViewDistance);
    if (this.lastViewDistance <= 2 && mc.isPowerVR()) dist = Math.trunc(dist * 0.8);
    LOGI(`last: ${this.lastViewDistance}, power: ${mc.isPowerVR() ? 1 : 0}`);
    if (dist > 400) dist = 400;
    const CS = LevelRenderer.CHUNK_SIZE;
    this.xChunks = ((dist / CS) | 0) + 1;
    this.yChunks = (128 / CS) | 0;
    this.zChunks = ((dist / CS) | 0) + 1;
    this.chunksLength = this.xChunks * this.yChunks * this.zChunks;
    LOGI(`chunksLength: ${this.chunksLength}. Distance: ${dist}`);
    const chunks: Chunk[] = new Array<Chunk>(this.chunksLength);
    const sortedChunks: Chunk[] = new Array<Chunk>(this.chunksLength);
    this.chunks = chunks;
    this.sortedChunks = sortedChunks;
    let id = 0;
    let count = 0;
    this.xMinChunk = 0;
    this.yMinChunk = 0;
    this.zMinChunk = 0;
    this.xMaxChunk = this.xChunks;
    this.yMaxChunk = this.yChunks;
    this.zMaxChunk = this.zChunks;
    this.dirtyChunks.length = 0;
    for (let x = 0; x < this.xChunks; x++) {
      for (let y = 0; y < this.yChunks; y++) {
        for (let z = 0; z < this.zChunks; z++) {
          const c = this.getLinearCoord(x, y, z);
          const chunk = new Chunk(
            this.level!,
            x * CS,
            y * CS,
            z * CS,
            CS,
            this.chunkLists + id,
            this.chunkBuffers.subarray(id, id + 3),
          ); // &chunkBuffers[id]
          if (this.occlusionCheck) {
            chunk.occlusion_id = 0; //occlusionCheckIds.get(count);
          }
          chunk.occlusion_querying = false;
          chunk.occlusion_visible = true;
          chunk.visible = true;
          chunk.id = count++;
          chunk.setDirty();
          chunks[c] = chunk;
          sortedChunks[c] = chunk;
          this.dirtyChunks.push(chunk);
          id += 3;
        }
      }
    }
    if (this.level !== null) {
      const player = mc.cameraTargetPlayer;
      if (player !== null) {
        this.resortChunks(Mth.floor(player.x), Mth.floor(player.y), Mth.floor(player.z));
        sortedChunks.sort(sorterComparator(new DistanceChunkSorter(player)));
      }
    }
    this.noEntityRenderFrames = 2;
  }

  private deleteChunks(): void {
    // C++ 逐个 delete 区块对象；这里交给垃圾回收
    this.chunks = null;
    this.sortedChunks = null;
  }

  private resortChunks(xc: number, yc: number, zc: number): void {
    const CS = LevelRenderer.CHUNK_SIZE;
    xc -= (CS / 2) | 0;
    void yc;
    zc -= (CS / 2) | 0;
    this.xMinChunk = INT_MAX;
    this.yMinChunk = INT_MAX;
    this.zMinChunk = INT_MAX;
    this.xMaxChunk = INT_MIN;
    this.yMaxChunk = INT_MIN;
    this.zMaxChunk = INT_MIN;
    let dirty = 0;
    const s2 = this.xChunks * CS;
    const s1 = (s2 / 2) | 0;
    for (let x = 0; x < this.xChunks; x++) {
      let xx = x * CS;
      let xOff = xx + s1 - xc;
      if (xOff < 0) xOff -= s2 - 1;
      xOff = (xOff / s2) | 0; // C++ 整数除法向零截断
      xx -= xOff * s2;
      if (xx < this.xMinChunk) this.xMinChunk = xx;
      if (xx > this.xMaxChunk) this.xMaxChunk = xx;
      for (let z = 0; z < this.zChunks; z++) {
        let zz = z * CS;
        let zOff = zz + s1 - zc;
        if (zOff < 0) zOff -= s2 - 1;
        zOff = (zOff / s2) | 0;
        zz -= zOff * s2;
        if (zz < this.zMinChunk) this.zMinChunk = zz;
        if (zz > this.zMaxChunk) this.zMaxChunk = zz;
        for (let y = 0; y < this.yChunks; y++) {
          const yy = y * CS;
          if (yy < this.yMinChunk) this.yMinChunk = yy;
          if (yy > this.yMaxChunk) this.yMaxChunk = yy;
          const chunk = this.chunks![(z * this.yChunks + y) * this.xChunks + x]!;
          const wasDirty = chunk.isDirty();
          chunk.setPos(xx, yy, zz);
          if (!wasDirty && chunk.isDirty()) {
            this.dirtyChunks.push(chunk);
            ++dirty;
          }
        }
      }
    }
  }

  /** C++ 的 int render(Mob* player, int layer, float alpha)；render(const AABB&) 是 OMIT */
  render(player: Mob, layer: number, alpha: number): number {
    const mc = this.mc;
    if (mc.options.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE) !== this.lastViewDistance) {
      this.allChanged();
    }
    const currentFogType = mc.options.getIntValue(OptionId.OPTIONS_FOG_TYPE);
    if (currentFogType !== this.lastFogType) {
      this.lastFogType = currentFogType;
      if (this.level && this.level.dimension) {
        this.level.dimension.FogType = currentFogType; // use new fog stuff
      }
      this.allChanged();
    }
    const SmoothLightState = mc.options.getBooleanValue(OptionId.OPTIONS_AMBIENT_OCCLUSION);
    if (SmoothLightState !== Minecraft.useAmbientOcclusion) {
      // mc->useAmbientOcclusion 是静态成员
      Minecraft.useAmbientOcclusion = SmoothLightState;
      this.allChanged();
    }
    const tint = mc.options.getBooleanValue(OptionId.OPTIONS_FOLIAGE_TINT);
    if (tint !== this.LastTint) {
      this.LastTint = tint;
      FoliageColor.setUseTint(tint);
      GrassColor.setUseTint(tint);
      this.allChanged();
    }
    const sideTint = mc.options.getBooleanValue(OptionId.OPTIONS_TINTED_SIDE);
    if (sideTint !== this.LastSideTint) {
      this.LastSideTint = sideTint;
      TileRenderer.setUseTint(sideTint);
      this.allChanged();
    }

    TIMER_PUSH('sortchunks');
    const chunks = this.chunks!;
    for (let i = 0; i < 10; i++) {
      this.chunkFixOffs = (this.chunkFixOffs + 1) % this.chunksLength;
      const c = chunks[this.chunkFixOffs]!;
      if (c.isDirty() && this.dirtyChunks.indexOf(c) < 0) {
        this.dirtyChunks.push(c);
      }
    }
    if (layer === 0) {
      this.totalChunks = 0;
      this.offscreenChunks = 0;
      this.occludedChunks = 0;
      this.renderedChunks = 0;
      this.emptyChunks = 0;
    }
    const xOff = player.xOld + (player.x - player.xOld) * alpha;
    const yOff = player.yOld + (player.y - player.yOld) * alpha;
    const zOff = player.zOld + (player.z - player.zOld) * alpha;
    const xd = player.x - this.xOld;
    const yd = player.y - this.yOld;
    const zd = player.z - this.zOld;
    if (xd * xd + yd * yd + zd * zd > 4 * 4) {
      this.xOld = player.x;
      this.yOld = player.y;
      this.zOld = player.z;
      this.resortChunks(Mth.floor(player.x), Mth.floor(player.y), Mth.floor(player.z));
      this.sortedChunks!.sort(sorterComparator(new DistanceChunkSorter(player)));
    }
    let count = 0;
    if (
      this.occlusionCheck &&
      !mc.options.getBooleanValue(OptionId.OPTIONS_ANAGLYPH_3D) &&
      layer === 0
    ) {
      // 遮挡查询分支：occlusionCheck 恒为 false，照原样保留
      const sorted = this.sortedChunks!;
      let from = 0;
      let to = 16;
      for (let i = from; i < to; i++) {
        sorted[i]!.occlusion_visible = true;
      }
      count += this.renderChunks(from, to, layer, alpha);
      do {
        from = to;
        to = to * 2;
        if (to > this.chunksLength) to = this.chunksLength;
        glDisable2(GL_TEXTURE_2D);
        glDisable2(GL_LIGHTING);
        glDisable2(GL_ALPHA_TEST);
        glDisable2(GL_FOG);
        glColorMask(false, false, false, false);
        glDepthMask(false);
        glPushMatrix2();
        let xo = 0;
        let yo = 0;
        let zo = 0;
        for (let i = from; i < to; i++) {
          const ci = sorted[i]!;
          if (ci.isEmpty()) {
            ci.visible = false;
            continue;
          }
          if (!ci.visible) {
            ci.occlusion_visible = true;
          }
          if (ci.visible && !ci.occlusion_querying) {
            const dist = Mth.sqrt(ci.distanceToSqr(player));
            const frequency = Math.trunc(1 + dist / 128);
            if (this.ticks % frequency === i % frequency) {
              const xt = ci.x - xOff;
              const yt = ci.y - yOff;
              const zt = ci.z - zOff;
              const xdd = xt - xo;
              const ydd = yt - yo;
              const zdd = zt - zo;
              if (xdd !== 0 || ydd !== 0 || zdd !== 0) {
                glTranslatef2(xdd, ydd, zdd);
                xo += xdd;
                yo += ydd;
                zo += zdd;
              }
              ci.renderBB();
              ci.occlusion_querying = true;
            }
          }
        }
        glPopMatrix2();
        glColorMask(true, true, true, true);
        glDepthMask(true);
        glEnable2(GL_TEXTURE_2D);
        glEnable2(GL_ALPHA_TEST);
        glEnable2(GL_FOG);
        count += this.renderChunks(from, to, layer, alpha);
      } while (to < this.chunksLength);
    } else {
      TIMER_POP_PUSH('render');
      count += this.renderChunks(0, this.chunksLength, layer, alpha);
    }
    TIMER_POP();
    return count;
  }

  // OMIT(Debug): renderDebug(b, a)  LevelRenderer.cpp:504
  // OMIT(Debug): render(const AABB& b)  LevelRenderer.cpp:570

  private renderChunks(from: number, to: number, layer: number, alpha: number): number {
    const sorted = this.sortedChunks!;
    this._renderChunks.length = 0;
    let count = 0;
    for (let i = from; i < to; i++) {
      const c = sorted[i]!;
      if (layer === 0) {
        this.totalChunks++;
        if (c.empty[layer]) this.emptyChunks++;
        else if (!c.visible) this.offscreenChunks++;
        else if (this.occlusionCheck && !c.occlusion_visible) this.occludedChunks++;
        else this.renderedChunks++;
      }
      if (!c.empty[layer] && c.visible && c.occlusion_visible) {
        const list = c.getList(layer);
        if (list >= 0) {
          this._renderChunks.push(c);
          count++;
        }
      }
    }
    const player = this.mc.cameraTargetPlayer!;
    const xOff = player.xOld + (player.x - player.xOld) * alpha;
    const yOff = player.yOld + (player.y - player.yOld) * alpha;
    const zOff = player.zOld + (player.z - player.zOld) * alpha;
    this.renderList.clear();
    this.renderList.init(xOff, yOff, zOff);
    for (let i = 0; i < this._renderChunks.length; ++i) {
      const chunk = this._renderChunks[i]!;
      // USE_VBO
      this.renderList.addR(chunk.getRenderChunk(layer));
      this.renderList.next();
    }
    this.renderSameAsLast(layer, alpha);
    return count;
  }

  renderSameAsLast(_layer: number, _alpha: number): void {
    this.renderList.render();
  }

  tick(): void {
    this.ticks++;
  }

  updateDirtyChunks(player: Mob, force: boolean): boolean {
    const slow = false;
    const dirtyChunks = this.dirtyChunks;
    if (slow) {
      // 慢速分支：slow 恒为 false，照原样保留
      (dirtyChunks as Chunk[]).sort(sorterComparator(new DirtyChunkSorter(player)));
      const s = dirtyChunks.length - 1;
      const amount = dirtyChunks.length;
      for (let i = 0; i < amount; i++) {
        const chunk = dirtyChunks[s - i]!;
        if (!force) {
          if (chunk.distanceToSqr(player) > 16 * 16) {
            if (chunk.visible) {
              if (i >= LevelRenderer.MAX_VISIBLE_REBUILDS_PER_FRAME) return false;
            } else {
              if (i >= LevelRenderer.MAX_INVISIBLE_REBUILDS_PER_FRAME) return false;
            }
          }
        } else {
          if (!chunk.visible) continue;
        }
        chunk.rebuild();
        dirtyChunks.splice(dirtyChunks.indexOf(chunk), 1); // @q: s-i?
        chunk.setClean();
      }
      return dirtyChunks.length === 0;
    } else {
      const count = 3;
      const dirtyChunkSorter = new DirtyChunkSorter(player);
      const toAdd: (Chunk | null)[] = [null, null, null];
      let nearChunks: Chunk[] | null = null;
      const pendingChunkSize = dirtyChunks.length;
      let pendingChunkRemoved = 0;
      for (let i = 0; i < pendingChunkSize; i++) {
        const chunk = dirtyChunks[i]!;
        if (!force) {
          if (chunk.distanceToSqr(player) > 1024.0) {
            let index: number;
            for (index = 0; index < count; index++) {
              if (
                toAdd[index] !== null &&
                dirtyChunkSorter.compare(toAdd[index]!, chunk) === false
              ) {
                break;
              }
            }
            index--;
            if (index > 0) {
              let x = index;
              while (--x !== 0) {
                toAdd[x - 1] = toAdd[x]!;
              }
              toAdd[index] = chunk;
            }
            continue;
          }
        } else if (!chunk.visible) {
          continue;
        }
        if (nearChunks === null) {
          nearChunks = [];
        }
        pendingChunkRemoved++;
        nearChunks.push(chunk);
        dirtyChunks[i] = null;
      }
      const MaxFrameTime = 1.0 / 100.0;
      const chunkWatch = new Stopwatch();
      chunkWatch.start();
      if (nearChunks !== null) {
        if (nearChunks.length > 1) {
          nearChunks.sort(sorterComparator(dirtyChunkSorter));
        }
        for (let i = nearChunks.length - 1; i >= 0; i--) {
          const chunk = nearChunks[i]!;
          chunk.rebuild();
          chunk.setClean();
        }
      }
      let secondaryRemoved = 0;
      for (let i = count - 1; i >= 0; i--) {
        const chunk = toAdd[i];
        if (chunk !== null && chunk !== undefined) {
          const ttt = chunkWatch.stopContinue();
          if (ttt >= MaxFrameTime) {
            break;
          }
          if (!chunk.visible && i !== count - 1) {
            toAdd[i] = null;
            toAdd[0] = null;
            break;
          }
          toAdd[i]!.rebuild();
          toAdd[i]!.setClean();
          secondaryRemoved++;
        }
      }
      let cursor = 0;
      let target = 0;
      const arraySize = dirtyChunks.length;
      while (cursor !== arraySize) {
        const chunk = dirtyChunks[cursor];
        if (chunk !== null && chunk !== undefined) {
          let remove = false;
          for (let i = 0; i < count && !remove; i++)
            if (chunk === toAdd[i]) {
              remove = true;
            }
          if (!remove) {
            if (target !== cursor) {
              dirtyChunks[target] = chunk;
            }
            target++;
          }
        }
        cursor++;
      }
      if (cursor > target) dirtyChunks.length = target;
      return pendingChunkSize === pendingChunkRemoved + secondaryRemoved;
    }
  }

  renderHit(player: Player, h: HitResult, mode: number, _inventoryItem: unknown, a: number): void {
    if (mode === 0) {
      if (this.destroyProgress > 0) {
        const t = Tesselator.instance;
        glEnable2(GL_BLEND);
        glBlendFunc2(GL_DST_COLOR, GL_SRC_COLOR);
        this.textures!.loadAndBindTexture('terrain.png');
        glPushMatrix2();
        const level = this.level!;
        const tileId = level.getTile(h.x, h.y, h.z);
        let tile = tileId > 0 ? (Tile.tiles[tileId] ?? null) : null;
        glPolygonOffset(-3.0, -3.0);
        glEnable2(GL_POLYGON_OFFSET_FILL);
        t.begin();
        t.color(1.0, 1.0, 1.0, 0.5);
        t.noColor();
        const xo = player.xOld + (player.x - player.xOld) * a;
        const yo = player.yOld + (player.y - player.yOld) * a;
        const zo = player.zOld + (player.z - player.zOld) * a;
        t.offset(-xo, -yo, -zo);
        if (tile === null) tile = Tile.rock;
        const progress = Math.trunc(this.destroyProgress * 10);
        this.tileRenderer!.tesselateInWorld(tile, h.x, h.y, h.z, 15 * 16 + progress);
        t.draw();
        t.offset(0, 0, 0);
        glPolygonOffset(0.0, 0.0);
        glDisable2(GL_POLYGON_OFFSET_FILL);
        glDisable2(GL_BLEND);
        glDepthMask(true);
        glPopMatrix2();
      }
    }
  }
  renderHitOutline(
    player: Player,
    h: HitResult,
    mode: number,
    _inventoryItem: unknown,
    a: number,
  ): void {
    if (mode === 0 && h.type === HitResultType.TILE) {
      glEnable2(GL_BLEND);
      glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
      glColor4f2(0, 0, 0, 0.4);
      glLineWidth(1.0);
      glDisable2(GL_TEXTURE_2D);
      glDepthMask(false);
      const ss = 0.002;
      const level = this.level!;
      const tileId = level.getTile(h.x, h.y, h.z);
      if (tileId > 0) {
        Tile.tiles[tileId]!.updateShape(level, h.x, h.y, h.z);
        const xo = player.xOld + (player.x - player.xOld) * a;
        const yo = player.yOld + (player.y - player.yOld) * a;
        const zo = player.zOld + (player.z - player.zOld) * a;
        this.renderAABB(
          Tile.tiles[tileId]!.getTileAABB(level, h.x, h.y, h.z)
            .grow(ss, ss, ss)
            .cloneMove(-xo, -yo, -zo),
        );
      }
      glDepthMask(true);
      glEnable2(GL_TEXTURE_2D);
      glDisable2(GL_BLEND);
    }
  }

  /** C++ 的 render(const AABB&)：与 render(Mob*, int, float) 同名（R10 情形 B） */
  renderAABB(b: AABB): void {
    const t = Tesselator.instance;
    glLineWidth(2.0); // make it more thick - shredder
    t.begin(GL_LINE_STRIP);
    t.vertex(b.x0, b.y0, b.z0);
    t.vertex(b.x1, b.y0, b.z0);
    t.vertex(b.x1, b.y0, b.z1);
    t.vertex(b.x0, b.y0, b.z1);
    t.vertex(b.x0, b.y0, b.z0);
    t.draw();
    t.begin(GL_LINE_STRIP);
    t.vertex(b.x0, b.y1, b.z0);
    t.vertex(b.x1, b.y1, b.z0);
    t.vertex(b.x1, b.y1, b.z1);
    t.vertex(b.x0, b.y1, b.z1);
    t.vertex(b.x0, b.y1, b.z0);
    t.draw();
    t.begin(GL_LINES);
    t.vertex(b.x0, b.y0, b.z0);
    t.vertex(b.x0, b.y1, b.z0);
    t.vertex(b.x1, b.y0, b.z0);
    t.vertex(b.x1, b.y1, b.z0);
    t.vertex(b.x1, b.y0, b.z1);
    t.vertex(b.x1, b.y1, b.z1);
    t.vertex(b.x0, b.y0, b.z1);
    t.vertex(b.x0, b.y1, b.z1);
    t.offset(0, 0, 0);
    t.draw();
  }

  setDirty(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const CS = LevelRenderer.CHUNK_SIZE;
    const _x0 = Mth.intFloorDiv(x0, CS);
    const _y0 = Mth.intFloorDiv(y0, CS);
    const _z0 = Mth.intFloorDiv(z0, CS);
    const _x1 = Mth.intFloorDiv(x1, CS);
    const _y1 = Mth.intFloorDiv(y1, CS);
    const _z1 = Mth.intFloorDiv(z1, CS);
    for (let x = _x0; x <= _x1; x++) {
      let xx = x % this.xChunks;
      if (xx < 0) xx += this.xChunks;
      for (let y = _y0; y <= _y1; y++) {
        let yy = y % this.yChunks;
        if (yy < 0) yy += this.yChunks;
        for (let z = _z0; z <= _z1; z++) {
          let zz = z % this.zChunks;
          if (zz < 0) zz += this.zChunks;
          const p = (zz * this.yChunks + yy) * this.xChunks + xx;
          const chunk = this.chunks![p]!;
          if (!chunk.isDirty()) {
            this.dirtyChunks.push(chunk);
            chunk.setDirty();
          }
        }
      }
    }
  }

  override tileChanged(x: number, y: number, z: number): void {
    this.setDirty(x - 1, y - 1, z - 1, x + 1, y + 1, z + 1);
  }

  override setTilesDirty(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  ): void {
    this.setDirty(x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1);
  }

  cull(culler: Culler, _a: number): void {
    const chunks = this.chunks!;
    for (let i = 0; i < this.chunksLength; i++) {
      if (!chunks[i]!.isEmpty()) {
        if (!chunks[i]!.visible || ((i + this.cullStep) & 15) === 0) {
          chunks[i]!.cull(culler);
        }
      }
    }
    this.cullStep++;
  }

  /** C++ `void LevelRenderer::skyColorChanged()`：天色变了，受天空光照的区块全部标脏重建 */
  override skyColorChanged(): void {
    for (let i = 0; i < this.chunksLength; i++) {
      const c = this.chunks![i]!;
      if (c.skyLit) {
        if (!c.isDirty()) {
          this.dirtyChunks.push(c);
          c.setDirty();
        }
      }
    }
  }
  renderEntities(cam: Vec3, culler: Culler, a: number): void {
    if (this.noEntityRenderFrames > 0) {
      this.noEntityRenderFrames--;
      return;
    }
    const mc = this.mc;
    const level = this.level!;
    TIMER_PUSH('prepare');
    TileEntityRenderDispatcher.getInstance().prepare(
      level,
      this.textures,
      mc.font,
      mc.cameraTargetPlayer!,
      a,
    );
    const disp = EntityRenderDispatcher.getInstance();
    disp.prepare(level, mc.font, mc.cameraTargetPlayer!, mc.options, a);
    this.totalEntities = 0;
    this.renderedEntities = 0;
    this.culledEntities = 0;
    const player = mc.cameraTargetPlayer!;
    EntityRenderDispatcher.xOff = TileEntityRenderDispatcher.xOff =
      player.xOld + (player.x - player.xOld) * a;
    EntityRenderDispatcher.yOff = TileEntityRenderDispatcher.yOff =
      player.yOld + (player.y - player.yOld) * a;
    EntityRenderDispatcher.zOff = TileEntityRenderDispatcher.zOff =
      player.zOld + (player.z - player.zOld) * a;
    glEnableClientState2(GL_VERTEX_ARRAY);
    glEnableClientState2(GL_TEXTURE_COORD_ARRAY);
    TIMER_POP_PUSH('entities');
    const entities = level.getAllEntities();
    this.totalEntities = entities.length;
    if (this.totalEntities > 0) {
      const toRender: Entity[] = [];
      for (let i = 0; i < this.totalEntities; i++) {
        const entity = entities[i]!;
        const thirdPerson = mc.options.getBooleanValue(OptionId.OPTIONS_THIRD_PERSON_VIEW);
        if (entity.shouldRender(cam) && culler.isVisible(entity.bb)) {
          if (
            entity === mc.cameraTargetPlayer &&
            !thirdPerson &&
            mc.cameraTargetPlayer.isPlayer() &&
            !(mc.cameraTargetPlayer as Player).isSleeping()
          )
            continue;
          if (entity === mc.cameraTargetPlayer && !thirdPerson) continue;
          if (!level.hasChunkAt(Mth.floor(entity.x), Mth.floor(entity.y), Mth.floor(entity.z)))
            continue;
          toRender.push(entity);
          this.renderedEntities++;
        }
      }
      if (this.renderedEntities > 0) {
        toRender.sort((x, y) => x.entityRendererId - y.entityRendererId); // entityRenderPredicate（std::sort 不稳定，同类次序不保证）
        for (let i = 0; i < this.renderedEntities; ++i) disp.render(toRender[i]!, a);
      }
    }
    TIMER_POP_PUSH('tileentities');
    for (let i = 0; i < level.tileEntities.length; i++) {
      TileEntityRenderDispatcher.getInstance().render(level.tileEntities[i]!, a);
    }
    glDisableClientState2(GL_VERTEX_ARRAY);
    glDisableClientState2(GL_TEXTURE_COORD_ARRAY);
    TIMER_POP();
  }
  gatherStats1(): string {
    return `C: ${this.renderedChunks}/${this.totalChunks}. F: ${this.offscreenChunks}, O: ${this.occludedChunks}, E: ${this.emptyChunks}\n`;
  }

  gatherStats2(): string {
    return `E: ${this.renderedEntities}/${this.totalEntities}. B: ${this.culledEntities}, I: ${this.totalEntities - this.culledEntities - this.renderedEntities}\n`;
  }
  /**
   * C++ `void LevelRenderer::renderSky(float alpha)`（LevelRenderer.cpp:1130）：天空平面（雾里的天空色）、日出日落的扇形光晕、太阳、月亮、星星、
   * 以及 Beta 天空时的下方“虚空”平面。只有“美丽天空”选项开着才画日月星辰和光晕。
   * 原样保留：
   *   - 太阳月亮前 `glTranslatef(sc.x, sc.y, sc.z)`——拿天空**颜色**当平移量（C++ 原句）；
   *   - glPushMatrix 在“美丽天空”分支里、glPopMatrix 在分支外（选项关着时 pop 不配对，C++ 同）；
   *   - 天空平面只在 OPENGL_ES 构建里画（Web 构建是 ES，照画）；
   *   - 光晕的 `t.color(c[0], c[1], c[2], 0.0f)` 之后各顶点共用这个颜色。
   */
  renderSky(alpha: number): void {
    const mc = this.mc;
    const level = this.level!;
    if (mc.level!.dimension!.foggy) return;
    glDisable2(GL_TEXTURE_2D);
    const sc = level.getSkyColor(mc.cameraTargetPlayer!, alpha);
    let sr = f(sc.x);
    let sg = f(sc.y);
    let sb = f(sc.z);
    if (mc.options.getBooleanValue(OptionId.OPTIONS_ANAGLYPH_3D)) {
      const srr = f(f(f(f(sr * 30.0) + f(sg * 59.0)) + f(sb * 11.0)) / 100.0);
      const sgg = f(f(f(sr * 30.0) + f(sg * 70.0)) / 100.0);
      const sbb = f(f(f(sr * 30.0) + f(sb * 70.0)) / 100.0);
      sr = srr;
      sg = sgg;
      sb = sbb;
    }
    glColor4f2(sr, sg, Mth.Min(1.0, sb), 1);
    const t = Tesselator.instance;
    if (mc.options.getBooleanValue(OptionId.OPTIONS_BETA_SKY)) {
      glDepthMask(false);
    }
    glEnable2(GL_FOG);
    glColor4f2(sr, sg, sb, 1.0);
    drawArrayVT(this.skyBuffer, this.skyVertexCount); // #ifdef OPENGL_ES
    glDisable(GL_FOG);
    glDisable(GL_ALPHA_TEST);
    if (mc.options.getBooleanValue(OptionId.OPTIONS_BEAUTIFUL_SKY)) {
      glEnable(GL_BLEND);
      glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
      Lighting.turnOff();
      const c = level.dimension!.getSunriseColor(level.getTimeOfDay(alpha), alpha);
      if (c !== null) {
        glDisable(GL_TEXTURE_2D);
        glPushMatrix();
        glRotatef(90.0, 1.0, 0.0, 0.0);
        glRotatef(level.getTimeOfDay(alpha) > f(0.5) ? 180 : 0, 0.0, 0.0, 1.0);
        t.begin(GL_TRIANGLE_FAN);
        t.color(c[0]!, c[1]!, c[2]!, c[3]!);
        t.vertex(0.0, 100.0, 0.0);
        t.color(c[0]!, c[1]!, c[2]!, 0.0);
        const steps = 16;
        for (let i = 0; i <= steps; i++) {
          const a = f(f(f(i * f(3.1415927)) * 2.0) / steps);
          const sin = Mth.sin(a);
          const cos = Mth.cos(a);
          t.vertex(f(sin * 120.0), f(cos * 120.0), f(f(f(-cos * 40.0)) * c[3]!));
        }
        t.draw();
        glPopMatrix();
      }
      glEnable(GL_TEXTURE_2D);
      glBlendFunc(GL_SRC_ALPHA, GL_ONE);
      glPushMatrix();
      glColor4f(1.0, 1.0, 1.0, 1.0);
      glTranslatef(sc.x, sc.y, sc.z);
      glRotatef(0.0, 0.0, 0.0, 1.0);
      glRotatef(f(level.getTimeOfDay(alpha) * 360.0), 1.0, 0.0, 0.0);
      let ss = 30.0;
      this.textures!.loadAndBindTexture('terrain/sun.png');
      t.begin();
      t.vertexUV(-ss, 100.0, -ss, 0.0, 0.0);
      t.vertexUV(ss, 100.0, -ss, 1.0, 0.0);
      t.vertexUV(ss, 100.0, ss, 1.0, 1.0);
      t.vertexUV(-ss, 100.0, ss, 0.0, 1.0);
      t.draw();
      ss = 20.0;
      this.textures!.loadAndBindTexture('terrain/moon.png');
      t.begin();
      t.vertexUV(-ss, -100.0, ss, 1.0, 1.0);
      t.vertexUV(ss, -100.0, ss, 0.0, 1.0);
      t.vertexUV(ss, -100.0, -ss, 0.0, 0.0);
      t.vertexUV(-ss, -100.0, -ss, 1.0, 0.0);
      t.draw();
      glDisable(GL_TEXTURE_2D);
      const a = level.getStarBrightness(alpha);
      if (a > 0.0) {
        glColor4f(a, a, a, a);
        drawArrayVT(this.starBuffer, this.starVertexCount);
      }
    }
    glColor4f(1.0, 1.0, 1.0, 1.0);
    glDisable(GL_BLEND);
    glEnable(GL_ALPHA_TEST);
    glEnable(GL_FOG);
    glPopMatrix(); // 原样：push 在上面的 if 分支里
    glColor4f(
      f(f(sc.x * f(0.2)) + f(0.04)),
      f(f(sc.y * f(0.2)) + f(0.04)),
      f(f(sc.z * f(0.6)) + f(0.1)),
      1.0,
    );
    glDisable(GL_TEXTURE_2D);
    if (mc.options.getBooleanValue(OptionId.OPTIONS_BETA_SKY)) {
      drawArrayVT(this.voidBuffer, this.voidVertexCount);
    }
    glEnable(GL_TEXTURE_2D);
    if (mc.options.getBooleanValue(OptionId.OPTIONS_BETA_SKY)) {
      glDepthMask(true);
    }
  }

  /**
   * C++ `void LevelRenderer::renderClouds(float alpha)`（LevelRenderer.cpp:1263）：PE 的平面云——一大片 512×512 的贴图平面，
   * 高度 128，随时间往 +x 漂（每刻 0.03 格）。“高画质 + Beta 天空”时改画立体云（renderAdvancedClouds）。
   * 原样保留：t.begin() 之后用 t.endOverrideAndDraw() 收尾（没有 beginOverride）。
   */
  renderClouds(alpha: number): void {
    const mc = this.mc;
    if (
      mc.options.getBooleanValue(OptionId.OPTIONS_FANCY_GRAPHICS) &&
      mc.options.getBooleanValue(OptionId.OPTIONS_BETA_SKY)
    ) {
      this.renderAdvancedClouds(alpha);
      return;
    }
    const player = mc.player!;
    glEnable2(GL_TEXTURE_2D);
    glDisable(GL_CULL_FACE);
    const yOffs = f(player.yOld + f((player.y - player.yOld) * alpha));
    const s = 32;
    const d = Math.trunc(256 / s);
    const t = Tesselator.instance;
    this.textures!.loadAndBindTexture('environment/clouds.png');
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    const cc = this.level!.getCloudColor(alpha);
    const cr = f(cc.x);
    const cg = f(cc.y);
    const cb = f(cc.z);
    const scale = f(1 / 2048.0);
    const time = f(this.ticks + alpha);
    let xo = f(f(player.xo + f((player.x - player.xo) * alpha)) + f(time * f(0.03)));
    let zo = f(player.zo + f((player.z - player.zo) * alpha));
    const xOffs = Mth.floor(f(xo / 2048));
    const zOffs = Mth.floor(f(zo / 2048));
    xo = f(xo - xOffs * 2048);
    zo = f(zo - zOffs * 2048);
    const yy = f(f(128 - yOffs) + f(0.33));
    const uo = f(xo * scale);
    const vo = f(zo * scale);
    t.begin();
    t.color(cr, cg, cb, f(0.8));
    for (let xx = -s * d; xx < +s * d; xx += s) {
      for (let zz = -s * d; zz < +s * d; zz += s) {
        t.vertexUV(xx, yy, zz + s, f(f(xx * scale) + uo), f(f((zz + s) * scale) + vo));
        t.vertexUV(xx + s, yy, zz + s, f(f((xx + s) * scale) + uo), f(f((zz + s) * scale) + vo));
        t.vertexUV(xx + s, yy, zz, f(f((xx + s) * scale) + uo), f(f(zz * scale) + vo));
        t.vertexUV(xx, yy, zz, f(f(xx * scale) + uo), f(f(zz * scale) + vo));
      }
    }
    t.endOverrideAndDraw();
    glColor4f(1, 1, 1, 1.0);
    glDisable(GL_BLEND);
    glEnable(GL_CULL_FACE);
  }

  /** C++ `void LevelRenderer::renderAdvancedClouds(float alpha)`（LevelRenderer.cpp:1317）：立体云（6×6 块、每块 8×8 格、厚 4），两遍：先只写深度，再画颜色 */
  renderAdvancedClouds(alpha: number): void {
    const mc = this.mc;
    const player = mc.player!;
    glDisable(GL_CULL_FACE);
    const px = f(player.xOld + f((player.x - player.xOld) * alpha));
    const py = f(player.yOld + f((player.y - player.yOld) * alpha));
    const pz = f(player.zOld + f((player.z - player.zOld) * alpha));
    const t = Tesselator.instance;
    const ss = f(12.0);
    const h = f(4.0);
    const cloudTime = f(this.ticks + alpha);
    let xo = f(f(px + f(cloudTime * f(0.03))) / ss);
    let zo = f(f(pz / ss) + f(0.33));
    const yy = f(f(108.0 - py) + f(0.33));
    const xWraps = Mth.floor(xo / 2048.0);
    const zWraps = Mth.floor(zo / 2048.0);
    xo = f(xo - xWraps * 2048);
    zo = f(zo - zWraps * 2048);
    this.textures!.loadAndBindTexture('environment/clouds.png');
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    const cc = this.level!.getCloudColor(alpha);
    const cr = f(cc.x);
    const cg = f(cc.y);
    const cb = f(cc.z);
    const uvScale = f(1.0 / 256.0);
    const uo = f(Mth.floor(xo) * uvScale);
    const vo = f(Mth.floor(zo) * uvScale);
    const xOffs = f(xo - Mth.floor(xo));
    const zOffs = f(zo - Mth.floor(zo));
    const D = 8;
    const radius = 3;
    const e = f(1.0 / 1024.0);
    const U = (v: number): number => f(f(v * uvScale) + uo);
    const V = (v: number): number => f(f(v * uvScale) + vo);
    glPushMatrix();
    glScalef(ss, 1.0, ss);
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 0) glColorMask(false, false, false, false);
      else glColorMask(true, true, true, true);
      for (let xPos = -radius + 1; xPos <= radius; xPos++) {
        for (let zPos = -radius + 1; zPos <= radius; zPos++) {
          t.begin();
          const xx = xPos * D;
          const zz = zPos * D;
          const xp = f(xx - xOffs);
          const zp = f(zz - zOffs);
          if (yy > f(-h - 1.0)) {
            t.color(f(cr * f(0.7)), f(cg * f(0.7)), f(cb * f(0.7)), f(0.8));
            t.normal(0.0, -1.0, 0.0);
            t.vertexUV(f(xp + 0), f(yy + 0), f(zp + D), U(xx + 0), V(zz + D));
            t.vertexUV(f(xp + D), f(yy + 0), f(zp + D), U(xx + D), V(zz + D));
            t.vertexUV(f(xp + D), f(yy + 0), f(zp + 0), U(xx + D), V(zz + 0));
            t.vertexUV(f(xp + 0), f(yy + 0), f(zp + 0), U(xx + 0), V(zz + 0));
          }
          if (yy <= f(h + 1.0)) {
            t.color(cr, cg, cb, f(0.8));
            t.normal(0.0, 1.0, 0.0);
            const top = f(f(yy + h) - e);
            t.vertexUV(f(xp + 0), top, f(zp + D), U(xx + 0), V(zz + D));
            t.vertexUV(f(xp + D), top, f(zp + D), U(xx + D), V(zz + D));
            t.vertexUV(f(xp + D), top, f(zp + 0), U(xx + D), V(zz + 0));
            t.vertexUV(f(xp + 0), top, f(zp + 0), U(xx + 0), V(zz + 0));
          }
          t.color(f(cr * f(0.9)), f(cg * f(0.9)), f(cb * f(0.9)), f(0.8));
          if (xPos > -1) {
            t.normal(-1.0, 0.0, 0.0);
            for (let i = 0; i < D; i++) {
              const x = f(f(xp + i) + 0);
              const u = U(f(f(xx + i) + f(0.5)));
              t.vertexUV(x, f(yy + 0), f(zp + D), u, V(zz + D));
              t.vertexUV(x, f(yy + h), f(zp + D), u, V(zz + D));
              t.vertexUV(x, f(yy + h), f(zp + 0), u, V(zz + 0));
              t.vertexUV(x, f(yy + 0), f(zp + 0), u, V(zz + 0));
            }
          }
          if (xPos <= 1) {
            t.normal(1.0, 0.0, 0.0);
            for (let i = 0; i < D; i++) {
              const x = f(f(f(xp + i) + 1) - e);
              const u = U(f(f(xx + i) + f(0.5)));
              t.vertexUV(x, f(yy + 0), f(zp + D), u, V(zz + D));
              t.vertexUV(x, f(yy + h), f(zp + D), u, V(zz + D));
              t.vertexUV(x, f(yy + h), f(zp + 0), u, V(zz + 0));
              t.vertexUV(x, f(yy + 0), f(zp + 0), u, V(zz + 0));
            }
          }
          t.color(f(cr * f(0.8)), f(cg * f(0.8)), f(cb * f(0.8)), f(0.8));
          if (zPos > -1) {
            t.normal(0.0, 0.0, -1.0);
            for (let i = 0; i < D; i++) {
              const z = f(f(zp + i) + 0);
              const v = V(f(f(zz + i) + f(0.5)));
              t.vertexUV(f(xp + 0), f(yy + h), z, U(xx + 0), v);
              t.vertexUV(f(xp + D), f(yy + h), z, U(xx + D), v);
              t.vertexUV(f(xp + D), f(yy + 0), z, U(xx + D), v);
              t.vertexUV(f(xp + 0), f(yy + 0), z, U(xx + 0), v);
            }
          }
          if (zPos <= 1) {
            t.normal(0.0, 0.0, 1.0);
            for (let i = 0; i < D; i++) {
              const z = f(f(f(zp + i) + 1) - e);
              const v = V(f(f(zz + i) + f(0.5)));
              t.vertexUV(f(xp + 0), f(yy + h), z, U(xx + 0), v);
              t.vertexUV(f(xp + D), f(yy + h), z, U(xx + D), v);
              t.vertexUV(f(xp + D), f(yy + 0), z, U(xx + D), v);
              t.vertexUV(f(xp + 0), f(yy + 0), z, U(xx + 0), v);
            }
          }
          t.endOverrideAndDraw();
        }
      }
    }
    glPopMatrix();
    glColor4f(1.0, 1.0, 1.0, 1.0);
    glDisable(GL_BLEND);
    glEnable(GL_CULL_FACE);
  }
  /**
   * C++ `LevelRenderer::playSound(name, x, y, z, volume, pitch)`（LevelRenderer.cpp:1453）——
   * `Level.playSound` 在**客户端**的这一端（另外两处 OMIT 是同一条重载的重复记录）。
   *
   * ⚠ 这里才是 `SOUND_DISTANCE = 16` 那道**硬剔除**生效的地方（`dd * dd` 和平方距离比）：
   *   过不去就**根本不调**声音引擎。`SoundEngine::play` 里那句同款代码是复制粘贴的残骸。
   */
  override playSound(
    name: string,
    x: number,
    y: number,
    z: number,
    volume: number,
    pitch: number,
  ): void {
    // @todo: deny sounds here if sound is off (rather than waiting 'til SoundEngine)
    let dd = 16;
    if (volume > 1) dd *= volume;
    const player = this.mc?.cameraTargetPlayer ?? null;
    if (player !== null && player.distanceToSqr(x, y, z) < dd * dd) {
      this.mc!.soundEngine?.play(name, x, y, z, volume, pitch);
    }
  }
  // OMIT(Particle): addParticle(ParticleType::Id, ...)  LevelRenderer.cpp:1509
  //   —— C++ 那个重载**整段在注释里**（`PARTICLETYPE(x)` 宏是逗号表达式，
  //      永远走字符串那条；见下面 addParticle 的说明），所以这里也是死的。
  /**
   * C++ `LevelRenderer::addParticle(const std::string& name, float x6, int data)`
   * （LevelRenderer.cpp:1463-1505）。
   *
   * ⚠ **数字 → 名字的单点归一化（ADAPTED(Cpp)）**：C++ 实际传的**永远是字符串** ——
   * `PARTICLETYPE(x)` 宏是 `(ParticleType::x, #x)` 这个逗号表达式（EntityTypes.h:74），
   * 枚举那半被丢弃。但 TS 里已有的调用点混着两种写法（`Snowball.ts` 传数字 10、
   * `FireTile` 传 `'largesmoke'`），而且**已有四条断言钉的就是数字**
   * （`snowball.test.ts:167`、`thrownegg.test.ts:147`、`arrow.test.ts:291/388`），
   * 按仓库规矩不能改。所以这里归一化一次，再走下面**逐字照抄**的字符串梯子。
   * 这是本文件唯一一处非 1:1 的地方。
   */
  override addParticle(
    name: string | ParticleType.Id,
    x: number,
    y: number,
    z: number,
    xa: number,
    ya: number,
    za: number,
    data: number,
  ): void {
    const id: string = typeof name === 'string' ? name : PARTICLE_NAME_BY_ID[name]!;
    const mc = this.mc;
    if (mc.cameraTargetPlayer != null) {
      const xd = mc.cameraTargetPlayer.x - x;
      const yd = mc.cameraTargetPlayer.y - y;
      const zd = mc.cameraTargetPlayer.z - z;
      const distanceSquared = xd * xd + yd * yd + zd * zd;

      // C++ 里这里还留着一段被注释掉的 hugeexplosion / largeexplode 分支，照抄保留：
      // Particle* p = NULL;
      // if (name == "hugeexplosion") p = new HugeExplosionSeedParticle(level, x, y, z, xa, ya, za);
      // else if (name == "largeexplode") p = new HugeExplosionParticle(textures, level, x, y, z, xa, ya, za);
      // if (p) { if (distanceSquared < 32 * 32) { mc->particleEngine->add(p); } else { delete p; } return; }

      const particleDistance = 16;
      if (distanceSquared > particleDistance * particleDistance) return;

      const level = this.level!;
      const pe = mc.particleEngine!;
      if (id === 'bubble') pe.add(new BubbleParticle(level, x, y, z, xa, ya, za));
      else if (id === 'crit') pe.add(new CritParticle2(level, x, y, z, xa, ya, za));
      else if (id === 'smoke') pe.add(new SmokeParticle(level, x, y, z, xa, ya, za));
      // else if (name == "note") mc->particleEngine->add(new NoteParticle(level, x, y, z, xa, ya, za));
      else if (id === 'explode') pe.add(new ExplodeParticle(level, x, y, z, xa, ya, za));
      else if (id === 'flame') pe.add(new FlameParticle(level, x, y, z, xa, ya, za));
      else if (id === 'lava') pe.add(new LavaParticle(level, x, y, z));
      // else if (name == "splash") mc->particleEngine->add(new SplashParticle(level, x, y, z, xa, ya, za));
      else if (id === 'largesmoke') pe.add(new SmokeParticle(level, x, y, z, xa, ya, za, f(2.5)));
      else if (id === 'reddust') pe.add(new RedDustParticle(level, x, y, z, xa, ya, za));
      else if (id === 'iconcrack')
        pe.add(new BreakingItemParticle(level, x, y, z, xa, ya, za, Item.items[data]!));
      else if (id === 'snowballpoof')
        pe.add(new BreakingItemParticle(level, x, y, z, Item.snowBall));
      // else if (name == "slime") mc->particleEngine->add(new BreakingItemParticle(level, x, y, z, xa, ya, za, Item::slimeBall));
      // else if (name == "heart") mc->particleEngine->add(new HeartParticle(level, x, y, z, xa, ya, za));
    }
  }
  renderHitSelect(
    player: Player,
    h: HitResult,
    mode: number,
    _inventoryItem: unknown,
    a: number,
  ): void {
    if (mode === 0) {
      const t = Tesselator.instance;
      glEnable2(GL_BLEND);
      glDisable2(GL_TEXTURE_2D);
      glBlendFunc2(GL_SRC_ALPHA, GL_ONE);
      glBlendFunc2(GL_DST_COLOR, GL_SRC_COLOR);
      glEnable2(GL_DEPTH_TEST);
      this.textures!.loadAndBindTexture('terrain.png');
      const level = this.level!;
      const tileId = level.getTile(h.x, h.y, h.z);
      let tile = tileId > 0 ? (Tile.tiles[tileId] ?? null) : null;
      glDisable2(GL_ALPHA_TEST);
      const br = 0.65;
      glColor4f2(br * 1.0, br * 1.0, br * 1.0, br * 1.0);
      glPushMatrix2();
      glPolygonOffset(-1, -1); // Implementation dependent units
      glEnable2(GL_POLYGON_OFFSET_FILL);
      const xo = player.xOld + (player.x - player.xOld) * a;
      const yo = player.yOld + (player.y - player.yOld) * a;
      const zo = player.zOld + (player.z - player.zOld) * a;
      t.begin();
      t.offset(-xo, -yo, -zo);
      t.noColor();
      if (tile === null) tile = Tile.rock;
      this.tileRenderer!.tesselateInWorld(tile, h.x, h.y, h.z);
      t.draw();
      t.offset(0, 0, 0);
      glPolygonOffset(0.0, 0.0);
      glDisable2(GL_POLYGON_OFFSET_FILL);
      glEnable2(GL_TEXTURE_2D);
      glDepthMask(true);
      glPopMatrix2();
      glEnable2(GL_ALPHA_TEST);
      glDisable2(GL_BLEND);
    }
  }

  onGraphicsReset(): void {
    this.generateStars();
    this.generateSky();
    // #ifdef OPENGL_ES
    glGenBuffers2(this.numListsOrBuffers, this.chunkBuffers);
    this.allChanged();
  }

  override entityAdded(entity: Entity): void {
    if (!entity.isPlayer()) return;
    EntityRenderDispatcher.getInstance().onGraphicsReset();
  }
  // OMIT(Entity): takePicture(cam, entity)  LevelRenderer.cpp:1641
  /** C++ `void LevelRenderer::levelEvent(Player*, int type, int x, int y, int z, int data)`：只处理开关门的声音（一半概率开门声、一半关门声） */
  override levelEvent(
    _player: Player | null,
    type: number,
    x: number,
    y: number,
    z: number,
    _data: number,
  ): void {
    const level = this.level!;
    switch (type) {
      case LevelEvent.SOUND_OPEN_DOOR:
        if (Mth.random() < f(0.5)) {
          level.playSound(
            f(x + 0.5),
            f(y + 0.5),
            f(z + 0.5),
            'random.door_open',
            1,
            f(f(level.random.nextFloat() * f(0.1)) + f(0.9)),
          );
        } else {
          level.playSound(
            f(x + 0.5),
            f(y + 0.5),
            f(z + 0.5),
            'random.door_close',
            1,
            f(f(level.random.nextFloat() * f(0.1)) + f(0.9)),
          );
        }
        break;
    }
  }

  private getLinearCoord(x: number, y: number, z: number): number {
    return (z * this.yChunks + y) * this.xChunks + x;
  }

  /** ADAPTED(Test)：只给测试与 dev 页读统计用 */
  _statsForTest(): {
    xChunks: number;
    yChunks: number;
    zChunks: number;
    chunksLength: number;
    dirty: number;
    rendered: number;
    level: Level | null;
  } {
    return {
      xChunks: this.xChunks,
      yChunks: this.yChunks,
      zChunks: this.zChunks,
      chunksLength: this.chunksLength,
      dirty: this.dirtyChunks.length,
      rendered: this.renderedChunks,
      level: this.level,
    };
  }
}
