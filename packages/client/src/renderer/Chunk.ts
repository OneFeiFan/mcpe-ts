/**
 * 1:1 移植自 src/client/renderer/Chunk.h 与 Chunk.cpp（S7）：一个 16×16×16 的渲染区块。
 * rebuild() 用 Region（向外多取 1 格）和 TileRenderer 把方块写进 Tesselator，USE_VBO 下用 end(true, vboBuffers[l]) 上传到
 * 这个区块自己的 VBO。#ifndef USE_VBO 的显示列表分支（glNewList 等）不移植（D2）。
 * 排序器与 distanceToSqr 只读 Entity 的 x、y、z（前向声明）。
 */
import { AABB, type Entity, type Level, LevelChunk, Mth, Region, Tile } from './chunkDeps';
import type { Culler } from './culling/Culler';
import { glTranslatef2 } from './gles';
import { RenderChunk } from './RenderChunk';
import { Tesselator } from './Tesselator';
import { TileRenderer } from './TileRenderer';

export class Chunk {
  private static readonly NumLayers = 3;
  static updates = 0;

  level: Level;
  x = 0;
  y = 0;
  z = 0;
  xs: number;
  ys: number;
  zs: number;
  empty: boolean[] = new Array<boolean>(Chunk.NumLayers).fill(false);
  xm = 0;
  ym = 0;
  zm = 0;
  radius: number;
  bb = new AABB(0, 0, 0, 1, 1, 1);
  id = 0; // C++ 未初始化，由 LevelRenderer 赋值
  visible = false;
  occlusion_visible = true;
  occlusion_querying = false;
  occlusion_id = 0;
  skyLit = false;
  renderChunk: RenderChunk[] = Array.from({ length: Chunk.NumLayers }, () => new RenderChunk());

  private t: Tesselator;
  private lists: number;
  private vboBuffers: ArrayLike<number> | null;
  private compiled = false;
  private dirty = false;
  private _empty = true;

  constructor(level_: Level, x: number, y: number, z: number, size: number, lists_: number, ptrBuf: ArrayLike<number> | null = null) {
    this.level = level_;
    this.xs = this.ys = this.zs = size;
    this.lists = lists_;
    this.vboBuffers = ptrBuf;
    this.t = Tesselator.instance;
    this.radius = Mth.sqrt(this.xs * this.xs + this.ys * this.ys + this.zs * this.zs) * 0.5;
    this.x = -999;
    this.setPos(x, y, z);
  }

  setPos(x: number, y: number, z: number): void {
    if (x === this.x && y === this.y && z === this.z) return;
    this.reset();
    this.x = x;
    this.y = y;
    this.z = z;
    this.xm = x + ((this.xs / 2) | 0);
    this.ym = y + ((this.ys / 2) | 0);
    this.zm = z + ((this.zs / 2) | 0);
    const xzg = 1.0;
    const yp = 2.0;
    const yn = 0.0;
    this.bb.set(x - xzg, y - yn, z - xzg, x + this.xs + xzg, y + this.ys + yp, z + this.zs + xzg);
    this.setDirty();
  }

  private translateToPos(): void {
    glTranslatef2(this.x, this.y, this.z);
  }

  rebuild(): void {
    if (!this.dirty) return;
    Chunk.updates++;
    const x0 = this.x;
    const y0 = this.y;
    const z0 = this.z;
    const x1 = this.x + this.xs;
    const y1 = this.y + this.ys;
    const z1 = this.z + this.zs;
    for (let l = 0; l < Chunk.NumLayers; l++) {
      this.empty[l] = true;
    }
    this._empty = true;
    LevelChunk.touchedSky = false;
    const r = 1;
    const region = new Region(this.level, x0 - r, y0 - r, z0 - r, x1 + r, y1 + r, z1 + r);
    const tileRenderer = new TileRenderer(region);
    const doRenderLayer = [true, false, false];
    for (let l = 0; l < Chunk.NumLayers; l++) {
      if (!doRenderLayer[l]) continue;
      let renderNextLayer = false;
      let rendered = false;
      let started = false;
      let cindex = -1;
      for (let y = y0; y < y1; y++) {
        for (let z = z0; z < z1; z++) {
          for (let x = x0; x < x1; x++) {
            ++cindex;
            const tileId = region.getTile(x, y, z);
            if (tileId > 0) {
              if (!started) {
                started = true;
                // #ifndef USE_VBO：glNewList、glPushMatrix、translateToPos、微缩放 —— 不移植（D2）
                this.t.begin();
                this.t.offset(-this.x, -this.y, -this.z);
              }
              const tile = Tile.tiles[tileId]!;
              const renderLayer = tile.getRenderLayer();
              if (renderLayer > l) {
                renderNextLayer = true;
                doRenderLayer[renderLayer] = true;
              } else if (renderLayer === l) {
                rendered = tileRenderer.tesselateInWorld(tile, x, y, z) || rendered;
              }
            }
          }
        }
      }
      void cindex;
      if (started) {
        // USE_VBO
        this.renderChunk[l] = this.t.end(true, this.vboBuffers![l]!);
        this.renderChunk[l]!.pos.x = this.x;
        this.renderChunk[l]!.pos.y = this.y;
        this.renderChunk[l]!.pos.z = this.z;
        this.t.offset(0, 0, 0);
      } else {
        rendered = false;
      }
      if (rendered) {
        this.empty[l] = false;
        this._empty = false;
      }
      if (!renderNextLayer) break;
    }
    this.skyLit = LevelChunk.touchedSky;
    this.compiled = true;
  }

  distanceToSqr(player: Entity): number {
    const xd = player.x - this.xm;
    const yd = player.y - this.ym;
    const zd = player.z - this.zm;
    return xd * xd + yd * yd + zd * zd;
  }

  squishedDistanceToSqr(player: Entity): number {
    const xd = player.x - this.xm;
    const yd = (player.y - this.ym) * 2;
    const zd = player.z - this.zm;
    return xd * xd + yd * yd + zd * zd;
  }

  reset(): void {
    for (let i = 0; i < Chunk.NumLayers; i++) {
      this.empty[i] = true;
    }
    this.visible = false;
    this.compiled = false;
    this._empty = true;
  }

  getList(layer: number): number {
    if (!this.visible) return -1;
    if (!this.empty[layer]) return this.lists + layer;
    return -1;
  }

  getRenderChunk(layer: number): RenderChunk {
    return this.renderChunk[layer]!;
  }

  getAllLists(displayLists: number[], p: number, layer: number): number {
    if (!this.visible) return p;
    if (!this.empty[layer]) displayLists[p++] = this.lists + layer;
    return p;
  }

  cull(culler: Culler): void {
    this.visible = culler.isVisible(this.bb);
  }

  renderBB(): void {}

  isEmpty(): boolean {
    return this.compiled && this._empty; //empty[0] && empty[1] && empty[2];
  }

  setDirty(): void {
    this.dirty = true;
  }

  setClean(): void {
    this.dirty = false;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  static resetUpdates(): void {
    Chunk.updates = 0;
  }
}
