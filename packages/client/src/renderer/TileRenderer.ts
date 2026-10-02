/**
 * 1:1 移植自 src/client/renderer/TileRenderer.h 与 TileRenderer.cpp（S7）：把方块网格化写进 Tesselator.instance。
 *
 * 本步移植：tesselateInWorld 的分派与带 fixedTexture 的重载、tesselateInWorldNoCulling、tesselateBlockInWorld 两个重载、
 *   tesselateBlockInWorldWithAmbienceOcclusion（AO 平滑光照）、renderFaceDown/Up/North/South/West/East、renderBlock、canRender、
 *   getWaterHeight、setUseTint。demo 里只有标准方块（石头、泥土、草、基岩）。
 * 其余形状（水、火、火把、楼梯、栅栏、门、床 …）与物品渲染（renderTile、renderGuiTile）放到 S11：函数本身标 OMIT(TileShape)，
 *   分派里的调用标 DEFERRED(TileShape)，暂时按“什么都没画”返回 false。
 * 渲染用的颜色属于三档规则的“自由处理”，按 JS 数值计算；Tesselator.color(r, g, b) 是 float 版重载（与 C++ 实参一致）。
 * C++ 里 ll000 等成员在构造时没有初始化，这里取 0（第一次读到之前一定会被赋值）。
 */
import { type LevelSource, LiquidTile, type Material, Tile } from '@mcpe/world';
import { Facing } from '@mcpe/world';
import { Minecraft } from '../Minecraft';
import { Tesselator } from './Tesselator';

export class TileRenderer {
  private static sideTinting = false;

  private level: LevelSource | null;
  private fixedTexture = -1;
  private xFlipTexture = false;
  private noCulling = false;
  private applyAmbienceOcclusion = false;
  private ll000 = 0; private llx00 = 0; private ll0y0 = 0; private ll00z = 0; private llX00 = 0; private ll0Y0 = 0; private ll00Z = 0;
  private llxyz = 0; private llxy0 = 0; private llxyZ = 0; private ll0yz = 0; private ll0yZ = 0; private llXyz = 0; private llXy0 = 0;
  private llXyZ = 0; private llxYz = 0; private llxY0 = 0; private llxYZ = 0; private ll0Yz = 0; private llXYz = 0; private llXY0 = 0;
  private ll0YZ = 0; private llXYZ = 0; private llx0z = 0; private llX0z = 0; private llx0Z = 0; private llX0Z = 0;
  private blsmooth = 1;
  private c1r = 0; private c2r = 0; private c3r = 0; private c4r = 0;
  private c1g = 0; private c2g = 0; private c3g = 0; private c4g = 0;
  private c1b = 0; private c2b = 0; private c3b = 0; private c4b = 0;
  private llTrans0Yz = false; private llTransXY0 = false; private llTransxY0 = false; private llTrans0YZ = false;
  private llTransx0z = false; private llTransX0Z = false; private llTransx0Z = false; private llTransX0z = false;
  private llTrans0yz = false; private llTransXy0 = false; private llTransxy0 = false; private llTrans0yZ = false;

  constructor(level: LevelSource | null = null) {
    this.level = level;
  }

  static setUseTint(value: boolean): void {
    TileRenderer.sideTinting = value;
  }

  /** C++ 的两个重载：tesselateInWorld(tile, x, y, z, fixedTexture)（void）与 tesselateInWorld(tt, x, y, z)（bool） */
  tesselateInWorld(tile: Tile, x: number, y: number, z: number, fixedTexture: number): void;
  tesselateInWorld(tt: Tile, x: number, y: number, z: number): boolean;
  tesselateInWorld(tt: Tile, x: number, y: number, z: number, fixedTexture?: number): boolean | void {
    if (fixedTexture !== undefined) {
      this.fixedTexture = fixedTexture;
      this.tesselateInWorld(tt, x, y, z);
      this.fixedTexture = -1;
      return;
    }
    const shape = tt.getRenderShape();
    tt.updateShape(this.level!, x, y, z);
    if (shape === Tile.SHAPE_BLOCK) {
      return this.tesselateBlockInWorld(tt, x, y, z);
    } else if (shape === Tile.SHAPE_WATER) {
      // DEFERRED(TileShape): return tesselateWaterInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_CACTUS) {
      // DEFERRED(TileShape): return tesselateCactusInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_CROSS_TEXTURE) {
      // DEFERRED(TileShape): return tesselateCrossInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_STEM) {
      // DEFERRED(TileShape): return tesselateStemInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_ROWS) {
      // DEFERRED(TileShape): return tesselateRowInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_TORCH) {
      // DEFERRED(TileShape): return tesselateTorchInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_FIRE) {
      // DEFERRED(TileShape): return tesselateFireInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_LADDER) {
      // DEFERRED(TileShape): return tesselateLadderInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_DOOR) {
      // DEFERRED(TileShape): return tesselateDoorInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_STAIRS) {
      // DEFERRED(TileShape): return tesselateStairsInWorld((StairTile*)tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_FENCE) {
      // DEFERRED(TileShape): return tesselateFenceInWorld((FenceTile*)tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_FENCE_GATE) {
      // DEFERRED(TileShape): return tesselateFenceGateInWorld((FenceGateTile*) tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_IRON_FENCE) {
      // DEFERRED(TileShape): return tesselateThinFenceInWorld((ThinFenceTile*) tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_BED) {
      // DEFERRED(TileShape): return tesselateBedInWorld(tt, x, y, z);
      return false;
    } else {
      return false;
    }
  }

  tesselateInWorldNoCulling(tile: Tile, x: number, y: number, z: number): void {
    this.noCulling = true;
    this.tesselateInWorld(tile, x, y, z);
    this.noCulling = false;
  }

  // OMIT(TileShape): tesselateTorchInWorld(tt, x, y, z)  TileRenderer.cpp:222
  // OMIT(TileShape): tesselateFireInWorld(tt, x, y, z)  TileRenderer.cpp:249
  // OMIT(TileShape): tesselateLadderInWorld(tt, x, y, z)  TileRenderer.cpp:521
  // OMIT(TileShape): tesselateCrossInWorld(tt, x, y, z)  TileRenderer.cpp:571
  // OMIT(TileShape): tesselateStemInWorld(tt, x, y, z)  TileRenderer.cpp:606
  // OMIT(TileShape): tesselateTorch(tt, x, y, z, xxa, zza)  TileRenderer.cpp:629
  // OMIT(TileShape): tesselateCrossTexture(tt, data, x, y, z)  TileRenderer.cpp:683
  // OMIT(TileShape): tesselateStemTexture(tt, data, h, x, y, z)  TileRenderer.cpp:722
  // OMIT(TileShape): tesselateStemDirTexture(tt, data, dir, h, x, y, z)  TileRenderer.cpp:758
  // OMIT(TileShape): tesselateWaterInWorld(tt, x, y, z)  TileRenderer.cpp:809（它是 getWaterHeight 唯一的调用方）

  private getWaterHeight(x: number, y: number, z: number, m: Material): number {
    const level = this.level!;
    let count = 0;
    let h = 0;
    for (let i = 0; i < 4; i++) {
      const xx = x - (i & 1);
      const yy = y;
      const zz = z - ((i >> 1) & 1);
      if (level.getMaterial(xx, yy + 1, zz) === m) {
        return 1;
      }
      const tm = level.getMaterial(xx, yy, zz);
      if (tm === m) {
        const d = level.getData(xx, yy, zz);
        if (d >= 8 || d === 0) {
          h += LiquidTile.getHeight(d) * 10;
          count += 10;
        }
        h += LiquidTile.getHeight(d);
        count++;
      } else if (!tm.isSolid()) {
        h += 1;
        count++;
      }
    }
    return 1 - h / count;
  }

  renderBlock(tt: Tile, level: LevelSource, x: number, y: number, z: number): void {
    const c10 = 0.5;
    const c11 = 1;
    const c2 = 0.8;
    const c3 = 0.6;
    const t = Tesselator.instance;
    t.begin();
    const center = tt.getBrightness(level, x, y, z);
    let br = tt.getBrightness(level, x, y - 1, z);
    if (br < center) br = center;
    t.color(c10 * br, c10 * br, c10 * br);
    this.renderFaceDown(tt, -0.5, -0.5, -0.5, tt.getTexture(0));
    br = tt.getBrightness(level, x, y + 1, z);
    if (br < center) br = center;
    t.color(c11 * br, c11 * br, c11 * br);
    this.renderFaceUp(tt, -0.5, -0.5, -0.5, tt.getTexture(1));
    br = tt.getBrightness(level, x, y, z - 1);
    if (br < center) br = center;
    t.color(c2 * br, c2 * br, c2 * br);
    this.renderNorth(tt, -0.5, -0.5, -0.5, tt.getTexture(2));
    br = tt.getBrightness(level, x, y, z + 1);
    if (br < center) br = center;
    t.color(c2 * br, c2 * br, c2 * br);
    this.renderSouth(tt, -0.5, -0.5, -0.5, tt.getTexture(3));
    br = tt.getBrightness(level, x - 1, y, z);
    if (br < center) br = center;
    t.color(c3 * br, c3 * br, c3 * br);
    this.renderWest(tt, -0.5, -0.5, -0.5, tt.getTexture(4));
    br = tt.getBrightness(level, x + 1, y, z);
    if (br < center) br = center;
    t.color(c3 * br, c3 * br, c3 * br);
    this.renderEast(tt, -0.5, -0.5, -0.5, tt.getTexture(5));
    t.draw();
  }

  /** C++ 的两个重载：tesselateBlockInWorld(tt, x, y, z) 先取方块颜色再选 AO 或普通路径；带 r、g、b 的是普通路径本身 */
  tesselateBlockInWorld(tt: Tile, x: number, y: number, z: number): boolean;
  tesselateBlockInWorld(tt: Tile, x: number, y: number, z: number, r: number, g: number, b: number): boolean;
  tesselateBlockInWorld(tt: Tile, x: number, y: number, z: number, r?: number, g?: number, b?: number): boolean {
    if (r === undefined) {
      const col = tt.getColor(this.level!, x, y, z);
      const rr = ((col >> 16) & 0xff) / 255.0;
      const gg = ((col >> 8) & 0xff) / 255.0;
      const bb = (col & 0xff) / 255.0; // xFlipTexture = (x & 1) != (y & 1);
      if (Minecraft.useAmbientOcclusion) {
        return this.tesselateBlockInWorldWithAmbienceOcclusion(tt, x, y, z, rr, gg, bb);
      } else {
        return this.tesselateBlockInWorld(tt, x, y, z, rr, gg, bb);
      }
    }
    return this.tesselateBlockInWorldRGB(tt, x, y, z, r, g!, b!);
  }

  private tesselateBlockInWorldRGB(tt: Tile, x: number, y: number, z: number, r: number, g: number, b: number): boolean {
    const level = this.level!;
    this.applyAmbienceOcclusion = false;
    const xf = x;
    const yf = y;
    const zf = z;
    const t = Tesselator.instance;
    let changed = false;
    const c10 = 0.5;
    const c11 = 1;
    const c2 = 0.8;
    const c3 = 0.6;
    // added these to get biome color and save it before its overriden - shredder
    const biomeR = r;
    const biomeG = g;
    const biomeB = b;
    const r11 = c11 * r;
    const g11 = c11 * g;
    const b11 = c11 * b;
    if (tt === Tile.grass) {
      r = g = b = 1.0;
    }
    const r10 = c10 * r;
    const r2 = c2 * r;
    const r3 = c3 * r;
    const g10 = c10 * g;
    const g2 = c2 * g;
    const g3 = c3 * g;
    const b10 = c10 * b;
    const b2 = c2 * b;
    const b3 = c3 * b;
    const centerBrightness = tt.getBrightness(level, x, y, z);
    if (this.noCulling || tt.shouldRenderFace(level, x, y - 1, z, Facing.DOWN)) {
      const br = tt.getBrightness(level, x, y - 1, z);
      t.color(r10 * br, g10 * br, b10 * br);
      this.renderFaceDown(tt, xf, yf, zf, tt.getTexture(level, x, y, z, 0));
      changed = true;
    }
    if (this.noCulling || tt.shouldRenderFace(level, x, y + 1, z, Facing.UP)) {
      let br = tt.getBrightness(level, x, y + 1, z);
      if (tt.yy1 !== 1 && !tt.material.isLiquid()) br = centerBrightness;
      t.color(r11 * br, g11 * br, b11 * br);
      this.renderFaceUp(tt, xf, yf, zf, tt.getTexture(level, x, y, z, 1));
      changed = true;
    }
    if (this.noCulling || tt.shouldRenderFace(level, x, y, z - 1, Facing.NORTH)) {
      let br = tt.getBrightness(level, x, y, z - 1);
      if (tt.zz0 > 0) br = centerBrightness;
      t.color(r2 * br, g2 * br, b2 * br);
      this.renderNorth(tt, xf, yf, zf, tt.getTexture(level, x, y, z, 2));
      if (tt.getTexture(level, x, y, z, 2) === 3 && TileRenderer.sideTinting) { // checking if the texture from terrain.png is the normal grass side texture
        t.color(c2 * br * biomeR, c2 * br * biomeG, c2 * br * biomeB);
        this.renderNorth(tt, xf, yf, zf, 38); // grayscale grass fringe tinted by biome colors
      }
      changed = true;
    }
    if (this.noCulling || tt.shouldRenderFace(level, x, y, z + 1, Facing.SOUTH)) {
      let br = tt.getBrightness(level, x, y, z + 1);
      if (tt.zz1 < 1) br = centerBrightness;
      t.color(r2 * br, g2 * br, b2 * br);
      this.renderSouth(tt, xf, yf, zf, tt.getTexture(level, x, y, z, 3));
      if (tt.getTexture(level, x, y, z, 3) === 3 && TileRenderer.sideTinting) {
        t.color(c2 * br * biomeR, c2 * br * biomeG, c2 * br * biomeB);
        this.renderSouth(tt, xf, yf, zf, 38);
      }
      changed = true;
    }
    if (this.noCulling || tt.shouldRenderFace(level, x - 1, y, z, Facing.WEST)) {
      let br = tt.getBrightness(level, x - 1, y, z);
      if (tt.xx0 > 0) br = centerBrightness;
      t.color(r3 * br, g3 * br, b3 * br);
      this.renderWest(tt, xf, yf, zf, tt.getTexture(level, x, y, z, 4));
      if (tt.getTexture(level, x, y, z, 4) === 3 && TileRenderer.sideTinting) {
        t.color(c2 * br * biomeR, c2 * br * biomeG, c2 * br * biomeB);
        this.renderWest(tt, xf, yf, zf, 38);
      }
      changed = true;
    }
    if (this.noCulling || tt.shouldRenderFace(level, x + 1, y, z, Facing.EAST)) {
      let br = tt.getBrightness(level, x + 1, y, z);
      if (tt.xx1 < 1) br = centerBrightness;
      t.color(r3 * br, g3 * br, b3 * br);
      this.renderEast(tt, xf, yf, zf, tt.getTexture(level, x, y, z, 5));
      if (tt.getTexture(level, x, y, z, 5) === 3 && TileRenderer.sideTinting) {
        t.color(c2 * br * biomeR, c2 * br * biomeG, c2 * br * biomeB);
        this.renderEast(tt, xf, yf, zf, 38);
      }
      changed = true;
    }
    return changed;
  }

  /** 把四个角的颜色设为同一底色再分别乘以四个角的亮度 */
  private setCorners(base: number, ll1: number, ll2: number, ll3: number, ll4: number, r: number, g: number, b: number): void {
    this.c1r = this.c2r = this.c3r = this.c4r = r * base;
    this.c1g = this.c2g = this.c3g = this.c4g = g * base;
    this.c1b = this.c2b = this.c3b = this.c4b = b * base;
    this.c1r *= ll1; this.c1g *= ll1; this.c1b *= ll1;
    this.c2r *= ll2; this.c2g *= ll2; this.c2b *= ll2;
    this.c3r *= ll3; this.c3g *= ll3; this.c3b *= ll3;
    this.c4r *= ll4; this.c4g *= ll4; this.c4b *= ll4;
  }

  /** 侧面草边（贴图 38）再乘一次群系色 */
  private tintCorners(r: number, g: number, b: number): void {
    this.c1r *= r; this.c1g *= g; this.c1b *= b;
    this.c2r *= r; this.c2g *= g; this.c2b *= b;
    this.c3r *= r; this.c3g *= g; this.c3b *= b;
    this.c4r *= r; this.c4g *= g; this.c4b *= b;
  }

  tesselateBlockInWorldWithAmbienceOcclusion(tt: Tile, pX: number, pY: number, pZ: number, pBaseRed: number, pBaseGreen: number, pBaseBlue: number): boolean {
    const level = this.level!;
    const br = (x: number, y: number, z: number) => tt.getBrightness(level, x, y, z);
    const trans = (x: number, y: number, z: number) => Tile.translucent[level.getTile(x, y, z)]!;
    this.applyAmbienceOcclusion = true;
    let i = false;
    let ll1 = this.ll000;
    let ll2 = this.ll000;
    let ll3 = this.ll000;
    let ll4 = this.ll000;
    let tint0 = true;
    const tint1 = true;
    let tint2 = true;
    let tint3 = true;
    let tint4 = true;
    let tint5 = true;
    this.ll000 = br(pX, pY, pZ);
    this.llx00 = br(pX - 1, pY, pZ);
    this.ll0y0 = br(pX, pY - 1, pZ);
    this.ll00z = br(pX, pY, pZ - 1);
    this.llX00 = br(pX + 1, pY, pZ);
    this.ll0Y0 = br(pX, pY + 1, pZ);
    this.ll00Z = br(pX, pY, pZ + 1);
    this.llTransXY0 = trans(pX + 1, pY + 1, pZ);
    this.llTransXy0 = trans(pX + 1, pY - 1, pZ);
    this.llTransX0Z = trans(pX + 1, pY, pZ + 1);
    this.llTransX0z = trans(pX + 1, pY, pZ - 1);
    this.llTransxY0 = trans(pX - 1, pY + 1, pZ);
    this.llTransxy0 = trans(pX - 1, pY - 1, pZ);
    this.llTransx0z = trans(pX - 1, pY, pZ - 1);
    this.llTransx0Z = trans(pX - 1, pY, pZ + 1);
    this.llTrans0YZ = trans(pX, pY + 1, pZ + 1);
    this.llTrans0Yz = trans(pX, pY + 1, pZ - 1);
    this.llTrans0yZ = trans(pX, pY - 1, pZ + 1);
    this.llTrans0yz = trans(pX, pY - 1, pZ - 1);
    if (tt.tex === 3) tint0 = tint2 = tint3 = tint4 = tint5 = false;

    // ---- 下（face 0）
    if (this.noCulling || tt.shouldRenderFace(level, pX, pY - 1, pZ, 0)) {
      if (this.blsmooth > 0) {
        pY--;
        this.llxy0 = br(pX - 1, pY, pZ);
        this.ll0yz = br(pX, pY, pZ - 1);
        this.ll0yZ = br(pX, pY, pZ + 1);
        this.llXy0 = br(pX + 1, pY, pZ);
        this.llxyz = this.llTrans0yz || this.llTransxy0 ? br(pX - 1, pY, pZ - 1) : this.llxy0;
        this.llxyZ = this.llTrans0yZ || this.llTransxy0 ? br(pX - 1, pY, pZ + 1) : this.llxy0;
        this.llXyz = this.llTrans0yz || this.llTransXy0 ? br(pX + 1, pY, pZ - 1) : this.llXy0;
        this.llXyZ = this.llTrans0yZ || this.llTransXy0 ? br(pX + 1, pY, pZ + 1) : this.llXy0;
        pY++;
        ll1 = (this.llxyZ + this.llxy0 + this.ll0yZ + this.ll0y0) / 4.0;
        ll4 = (this.ll0yZ + this.ll0y0 + this.llXyZ + this.llXy0) / 4.0;
        ll3 = (this.ll0y0 + this.ll0yz + this.llXy0 + this.llXyz) / 4.0;
        ll2 = (this.llxy0 + this.llxyz + this.ll0y0 + this.ll0yz) / 4.0;
      } else ll1 = ll2 = ll3 = ll4 = this.ll0y0;
      this.setCorners(0.5, ll1, ll2, ll3, ll4, tint0 ? pBaseRed : 1.0, tint0 ? pBaseGreen : 1.0, tint0 ? pBaseBlue : 1.0);
      this.renderFaceDown(tt, pX, pY, pZ, tt.getTexture(level, pX, pY, pZ, 0));
      i = true;
    }
    // ---- 上（face 1）
    if (this.noCulling || tt.shouldRenderFace(level, pX, pY + 1, pZ, 1)) {
      if (this.blsmooth > 0) {
        pY++;
        this.llxY0 = br(pX - 1, pY, pZ);
        this.llXY0 = br(pX + 1, pY, pZ);
        this.ll0Yz = br(pX, pY, pZ - 1);
        this.ll0YZ = br(pX, pY, pZ + 1);
        this.llxYz = this.llTrans0Yz || this.llTransxY0 ? br(pX - 1, pY, pZ - 1) : this.llxY0;
        this.llXYz = this.llTrans0Yz || this.llTransXY0 ? br(pX + 1, pY, pZ - 1) : this.llXY0;
        this.llxYZ = this.llTrans0YZ || this.llTransxY0 ? br(pX - 1, pY, pZ + 1) : this.llxY0;
        this.llXYZ = this.llTrans0YZ || this.llTransXY0 ? br(pX + 1, pY, pZ + 1) : this.llXY0;
        pY--;
        ll4 = (this.llxYZ + this.llxY0 + this.ll0YZ + this.ll0Y0) / 4.0;
        ll1 = (this.ll0YZ + this.ll0Y0 + this.llXYZ + this.llXY0) / 4.0;
        ll2 = (this.ll0Y0 + this.ll0Yz + this.llXY0 + this.llXYz) / 4.0;
        ll3 = (this.llxY0 + this.llxYz + this.ll0Y0 + this.ll0Yz) / 4.0;
      } else ll1 = ll2 = ll3 = ll4 = this.ll0Y0;
      this.setCorners(1.0, ll1, ll2, ll3, ll4, tint1 ? pBaseRed : 1.0, tint1 ? pBaseGreen : 1.0, tint1 ? pBaseBlue : 1.0);
      this.renderFaceUp(tt, pX, pY, pZ, tt.getTexture(level, pX, pY, pZ, 1));
      i = true;
    }
    // ---- 北（face 2）
    if (this.noCulling || tt.shouldRenderFace(level, pX, pY, pZ - 1, 2)) {
      if (this.blsmooth > 0) {
        pZ--;
        this.llx0z = br(pX - 1, pY, pZ);
        this.ll0yz = br(pX, pY - 1, pZ);
        this.ll0Yz = br(pX, pY + 1, pZ);
        this.llX0z = br(pX + 1, pY, pZ);
        this.llxyz = this.llTransx0z || this.llTrans0yz ? br(pX - 1, pY - 1, pZ) : this.llx0z;
        this.llxYz = this.llTransx0z || this.llTrans0Yz ? br(pX - 1, pY + 1, pZ) : this.llx0z;
        this.llXyz = this.llTransX0z || this.llTrans0yz ? br(pX + 1, pY - 1, pZ) : this.llX0z;
        this.llXYz = this.llTransX0z || this.llTrans0Yz ? br(pX + 1, pY + 1, pZ) : this.llX0z;
        pZ++;
        ll1 = (this.llx0z + this.llxYz + this.ll00z + this.ll0Yz) / 4.0;
        ll2 = (this.ll00z + this.ll0Yz + this.llX0z + this.llXYz) / 4.0;
        ll3 = (this.ll0yz + this.ll00z + this.llXyz + this.llX0z) / 4.0;
        ll4 = (this.llxyz + this.llx0z + this.ll0yz + this.ll00z) / 4.0;
      } else ll1 = ll2 = ll3 = ll4 = this.ll00z;
      this.setCorners(0.8, ll1, ll2, ll3, ll4, tint2 ? pBaseRed : 1.0, tint2 ? pBaseGreen : 1.0, tint2 ? pBaseBlue : 1.0);
      this.renderNorth(tt, pX, pY, pZ, tt.getTexture(level, pX, pY, pZ, 2));
      if (tt.getTexture(level, pX, pY, pZ, 2) === 3 && TileRenderer.sideTinting) {
        this.tintCorners(pBaseRed, pBaseGreen, pBaseBlue);
        this.renderNorth(tt, pX, pY, pZ, 38);
      }
      i = true;
    }
    // ---- 南（face 3）
    if (this.noCulling || tt.shouldRenderFace(level, pX, pY, pZ + 1, 3)) {
      if (this.blsmooth > 0) {
        pZ++;
        this.llx0Z = br(pX - 1, pY, pZ);
        this.llX0Z = br(pX + 1, pY, pZ);
        this.ll0yZ = br(pX, pY - 1, pZ);
        this.ll0YZ = br(pX, pY + 1, pZ);
        this.llxyZ = this.llTransx0Z || this.llTrans0yZ ? br(pX - 1, pY - 1, pZ) : this.llx0Z;
        this.llxYZ = this.llTransx0Z || this.llTrans0YZ ? br(pX - 1, pY + 1, pZ) : this.llx0Z;
        this.llXyZ = this.llTransX0Z || this.llTrans0yZ ? br(pX + 1, pY - 1, pZ) : this.llX0Z;
        this.llXYZ = this.llTransX0Z || this.llTrans0YZ ? br(pX + 1, pY + 1, pZ) : this.llX0Z;
        pZ--;
        ll1 = (this.llx0Z + this.llxYZ + this.ll00Z + this.ll0YZ) / 4.0;
        ll4 = (this.ll00Z + this.ll0YZ + this.llX0Z + this.llXYZ) / 4.0;
        ll3 = (this.ll0yZ + this.ll00Z + this.llXyZ + this.llX0Z) / 4.0;
        ll2 = (this.llxyZ + this.llx0Z + this.ll0yZ + this.ll00Z) / 4.0;
      } else ll1 = ll2 = ll3 = ll4 = this.ll00Z;
      this.setCorners(0.8, ll1, ll2, ll3, ll4, tint3 ? pBaseRed : 1.0, tint3 ? pBaseGreen : 1.0, tint3 ? pBaseBlue : 1.0);
      this.renderSouth(tt, pX, pY, pZ, tt.getTexture(level, pX, pY, pZ, 3));
      if (tt.getTexture(level, pX, pY, pZ, 3) === 3 && TileRenderer.sideTinting) {
        this.tintCorners(pBaseRed, pBaseGreen, pBaseBlue);
        this.renderSouth(tt, pX, pY, pZ, 38);
      }
      i = true;
    }
    // ---- 西（face 4）
    if (this.noCulling || tt.shouldRenderFace(level, pX - 1, pY, pZ, 4)) {
      if (this.blsmooth > 0) {
        pX--;
        this.llxy0 = br(pX, pY - 1, pZ);
        this.llx0z = br(pX, pY, pZ - 1);
        this.llx0Z = br(pX, pY, pZ + 1);
        this.llxY0 = br(pX, pY + 1, pZ);
        this.llxyz = this.llTransx0z || this.llTransxy0 ? br(pX, pY - 1, pZ - 1) : this.llx0z;
        this.llxyZ = this.llTransx0Z || this.llTransxy0 ? br(pX, pY - 1, pZ + 1) : this.llx0Z;
        this.llxYz = this.llTransx0z || this.llTransxY0 ? br(pX, pY + 1, pZ - 1) : this.llx0z;
        this.llxYZ = this.llTransx0Z || this.llTransxY0 ? br(pX, pY + 1, pZ + 1) : this.llx0Z;
        pX++;
        ll4 = (this.llxy0 + this.llxyZ + this.llx00 + this.llx0Z) / 4.0;
        ll1 = (this.llx00 + this.llx0Z + this.llxY0 + this.llxYZ) / 4.0;
        ll2 = (this.llx0z + this.llx00 + this.llxYz + this.llxY0) / 4.0;
        ll3 = (this.llxyz + this.llxy0 + this.llx0z + this.llx00) / 4.0;
      } else ll1 = ll2 = ll3 = ll4 = this.llx00;
      this.setCorners(0.6, ll1, ll2, ll3, ll4, tint4 ? pBaseRed : 1.0, tint4 ? pBaseGreen : 1.0, tint4 ? pBaseBlue : 1.0);
      this.renderWest(tt, pX, pY, pZ, tt.getTexture(level, pX, pY, pZ, 4));
      if (tt.getTexture(level, pX, pY, pZ, 4) === 3 && TileRenderer.sideTinting) {
        this.tintCorners(pBaseRed, pBaseGreen, pBaseBlue);
        this.renderWest(tt, pX, pY, pZ, 38);
      }
      i = true;
    }
    // ---- 东（face 5）
    if (this.noCulling || tt.shouldRenderFace(level, pX + 1, pY, pZ, 5)) {
      if (this.blsmooth > 0) {
        pX++;
        this.llXy0 = br(pX, pY - 1, pZ);
        this.llX0z = br(pX, pY, pZ - 1);
        this.llX0Z = br(pX, pY, pZ + 1);
        this.llXY0 = br(pX, pY + 1, pZ);
        this.llXyz = this.llTransXy0 || this.llTransX0z ? br(pX, pY - 1, pZ - 1) : this.llX0z;
        this.llXyZ = this.llTransXy0 || this.llTransX0Z ? br(pX, pY - 1, pZ + 1) : this.llX0Z;
        this.llXYz = this.llTransXY0 || this.llTransX0z ? br(pX, pY + 1, pZ - 1) : this.llX0z;
        this.llXYZ = this.llTransXY0 || this.llTransX0Z ? br(pX, pY + 1, pZ + 1) : this.llX0Z;
        pX--;
        ll1 = (this.llXy0 + this.llXyZ + this.llX00 + this.llX0Z) / 4.0;
        ll4 = (this.llX00 + this.llX0Z + this.llXY0 + this.llXYZ) / 4.0;
        ll3 = (this.llX0z + this.llX00 + this.llXYz + this.llXY0) / 4.0;
        ll2 = (this.llXyz + this.llXy0 + this.llX0z + this.llX00) / 4.0;
      } else ll1 = ll2 = ll3 = ll4 = this.llX00;
      this.setCorners(0.6, ll1, ll2, ll3, ll4, tint5 ? pBaseRed : 1.0, tint5 ? pBaseGreen : 1.0, tint5 ? pBaseBlue : 1.0);
      this.renderEast(tt, pX, pY, pZ, tt.getTexture(level, pX, pY, pZ, 5));
      if (tt.getTexture(level, pX, pY, pZ, 5) === 3 && TileRenderer.sideTinting) {
        this.tintCorners(pBaseRed, pBaseGreen, pBaseBlue);
        this.renderEast(tt, pX, pY, pZ, 38);
      }
      i = true;
    }
    this.applyAmbienceOcclusion = false;
    return i;
  }

  // OMIT(TileShape): tesselateCactusInWorld(tt, x, y, z)  TileRenderer.cpp:1423
  // OMIT(TileShape): tesselateCactusInWorld(tt, x, y, z, r, g, b)  TileRenderer.cpp:1431
  // OMIT(TileShape): tesselateFenceInWorld(tt, x, y, z)  TileRenderer.cpp:1532
  // OMIT(TileShape): tesselateFenceGateInWorld(tt, x, y, z)  TileRenderer.cpp:1587
  // OMIT(TileShape): tesselateBedInWorld(tt, x, y, z)  TileRenderer.cpp:1782
  // OMIT(TileShape): tesselateStairsInWorld(tt, x, y, z)  TileRenderer.cpp:1956
  // OMIT(TileShape): tesselateDoorInWorld(tt, x, y, z)  TileRenderer.cpp:1975
  // OMIT(TileShape): tesselateRowInWorld(tt, x, y, z)  TileRenderer.cpp:2070

  /** 贴图坐标：tex 的低 4 位是列、高 4 位是行；方块边界越出 [0, 1] 时用整格 */
  private static uv(tex: number): [number, number] {
    return [(tex & 0xf) << 4, tex & 0xf0];
  }

  renderFaceDown(tt: Tile, x: number, y: number, z: number, tex: number): void {
    const t = Tesselator.instance;
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const [xt, yt] = TileRenderer.uv(tex);
    let u0 = (xt + tt.xx0 * 16) / 256.0;
    let u1 = (xt + tt.xx1 * 16 - 0.01) / 256.0;
    let v0 = (yt + tt.zz0 * 16) / 256.0;
    let v1 = (yt + tt.zz1 * 16 - 0.01) / 256.0;
    if (tt.xx0 < 0 || tt.xx1 > 1) {
      u0 = (xt + 0 * 15.99) / 256.0;
      u1 = (xt + 1 * 15.99) / 256.0;
    }
    if (tt.zz0 < 0 || tt.zz1 > 1) {
      v0 = (yt + 0 * 15.99) / 256.0;
      v1 = (yt + 1 * 15.99) / 256.0;
    }
    const x0 = x + tt.xx0;
    const x1 = x + tt.xx1;
    const y0 = y + tt.yy0;
    const z0 = z + tt.zz0;
    const z1 = z + tt.zz1;
    if (this.applyAmbienceOcclusion) {
      t.color(this.c1r, this.c1g, this.c1b);
      t.vertexUV(x0, y0, z1, u0, v1);
      t.color(this.c2r, this.c2g, this.c2b);
      t.vertexUV(x0, y0, z0, u0, v0);
      t.color(this.c3r, this.c3g, this.c3b);
      t.vertexUV(x1, y0, z0, u1, v0);
      t.color(this.c4r, this.c4g, this.c4b);
      t.vertexUV(x1, y0, z1, u1, v1);
    } else {
      t.vertexUV(x0, y0, z1, u0, v1);
      t.vertexUV(x0, y0, z0, u0, v0);
      t.vertexUV(x1, y0, z0, u1, v0);
      t.vertexUV(x1, y0, z1, u1, v1);
    }
  }

  renderFaceUp(tt: Tile, x: number, y: number, z: number, tex: number): void {
    const t = Tesselator.instance;
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const [xt, yt] = TileRenderer.uv(tex);
    let u0 = (xt + tt.xx0 * 16) / 256.0;
    let u1 = (xt + tt.xx1 * 16 - 0.01) / 256.0;
    let v0 = (yt + tt.zz0 * 16) / 256.0;
    let v1 = (yt + tt.zz1 * 16 - 0.01) / 256.0;
    if (tt.xx0 < 0 || tt.xx1 > 1) {
      u0 = (xt + 0 * 15.99) / 256.0;
      u1 = (xt + 1 * 15.99) / 256.0;
    }
    if (tt.zz0 < 0 || tt.zz1 > 1) {
      v0 = (yt + 0 * 15.99) / 256.0;
      v1 = (yt + 1 * 15.99) / 256.0;
    }
    const x0 = x + tt.xx0;
    const x1 = x + tt.xx1;
    const y1 = y + tt.yy1;
    const z0 = z + tt.zz0;
    const z1 = z + tt.zz1;
    if (this.applyAmbienceOcclusion) {
      t.color(this.c1r, this.c1g, this.c1b);
      t.vertexUV(x1, y1, z1, u1, v1);
      t.color(this.c2r, this.c2g, this.c2b);
      t.vertexUV(x1, y1, z0, u1, v0);
      t.color(this.c3r, this.c3g, this.c3b);
      t.vertexUV(x0, y1, z0, u0, v0);
      t.color(this.c4r, this.c4g, this.c4b);
      t.vertexUV(x0, y1, z1, u0, v1);
    } else {
      t.vertexUV(x1, y1, z1, u1, v1);
      t.vertexUV(x1, y1, z0, u1, v0);
      t.vertexUV(x0, y1, z0, u0, v0);
      t.vertexUV(x0, y1, z1, u0, v1);
    }
  }

  renderNorth(tt: Tile, x: number, y: number, z: number, tex: number): void {
    const t = Tesselator.instance;
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const [xt, yt] = TileRenderer.uv(tex);
    let u0 = (xt + tt.xx0 * 16) / 256.0;
    let u1 = (xt + tt.xx1 * 16 - 0.01) / 256.0;
    let v0 = (yt + 16 - tt.yy1 * 16) / 256.0;
    let v1 = (yt + 16 - tt.yy0 * 16 - 0.01) / 256.0;
    if (this.xFlipTexture) {
      const tmp = u0;
      u0 = u1;
      u1 = tmp;
    }
    if (tt.xx0 < 0 || tt.xx1 > 1) {
      u0 = (xt + 0 * 15.99) / 256.0;
      u1 = (xt + 1 * 15.99) / 256.0;
    }
    if (tt.yy0 < 0 || tt.yy1 > 1) {
      v0 = (yt + 0 * 15.99) / 256.0;
      v1 = (yt + 1 * 15.99) / 256.0;
    }
    const x0 = x + tt.xx0;
    const x1 = x + tt.xx1;
    const y0 = y + tt.yy0;
    const y1 = y + tt.yy1;
    const z0 = z + tt.zz0;
    if (this.applyAmbienceOcclusion) {
      t.color(this.c1r, this.c1g, this.c1b);
      t.vertexUV(x0, y1, z0, u1, v0);
      t.color(this.c2r, this.c2g, this.c2b);
      t.vertexUV(x1, y1, z0, u0, v0);
      t.color(this.c3r, this.c3g, this.c3b);
      t.vertexUV(x1, y0, z0, u0, v1);
      t.color(this.c4r, this.c4g, this.c4b);
      t.vertexUV(x0, y0, z0, u1, v1);
    } else {
      t.vertexUV(x0, y1, z0, u1, v0);
      t.vertexUV(x1, y1, z0, u0, v0);
      t.vertexUV(x1, y0, z0, u0, v1);
      t.vertexUV(x0, y0, z0, u1, v1);
    }
  }

  renderSouth(tt: Tile, x: number, y: number, z: number, tex: number): void {
    const t = Tesselator.instance;
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const [xt, yt] = TileRenderer.uv(tex);
    let u0 = (xt + tt.xx0 * 16) / 256.0;
    let u1 = (xt + tt.xx1 * 16 - 0.01) / 256.0;
    let v0 = (yt + 16 - tt.yy1 * 16) / 256.0;
    let v1 = (yt + 16 - tt.yy0 * 16 - 0.01) / 256.0;
    if (this.xFlipTexture) {
      const tmp = u0;
      u0 = u1;
      u1 = tmp;
    }
    if (tt.xx0 < 0 || tt.xx1 > 1) {
      u0 = (xt + 0 * 15.99) / 256.0;
      u1 = (xt + 1 * 15.99) / 256.0;
    }
    if (tt.yy0 < 0 || tt.yy1 > 1) {
      v0 = (yt + 0 * 15.99) / 256.0;
      v1 = (yt + 1 * 15.99) / 256.0;
    }
    const x0 = x + tt.xx0;
    const x1 = x + tt.xx1;
    const y0 = y + tt.yy0;
    const y1 = y + tt.yy1;
    const z1 = z + tt.zz1;
    if (this.applyAmbienceOcclusion) {
      t.color(this.c1r, this.c1g, this.c1b);
      t.vertexUV(x0, y1, z1, u0, v0);
      t.color(this.c2r, this.c2g, this.c2b);
      t.vertexUV(x0, y0, z1, u0, v1);
      t.color(this.c3r, this.c3g, this.c3b);
      t.vertexUV(x1, y0, z1, u1, v1);
      t.color(this.c4r, this.c4g, this.c4b);
      t.vertexUV(x1, y1, z1, u1, v0);
    } else {
      t.vertexUV(x0, y1, z1, u0, v0);
      t.vertexUV(x0, y0, z1, u0, v1);
      t.vertexUV(x1, y0, z1, u1, v1);
      t.vertexUV(x1, y1, z1, u1, v0);
    }
  }

  renderWest(tt: Tile, x: number, y: number, z: number, tex: number): void {
    const t = Tesselator.instance;
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const [xt, yt] = TileRenderer.uv(tex);
    let u0 = (xt + tt.zz0 * 16) / 256.0;
    let u1 = (xt + tt.zz1 * 16 - 0.01) / 256.0;
    let v0 = (yt + 16 - tt.yy1 * 16) / 256.0;
    let v1 = (yt + 16 - tt.yy0 * 16 - 0.01) / 256.0;
    if (this.xFlipTexture) {
      const tmp = u0;
      u0 = u1;
      u1 = tmp;
    }
    if (tt.zz0 < 0 || tt.zz1 > 1) {
      u0 = (xt + 0 * 15.99) / 256.0;
      u1 = (xt + 1 * 15.99) / 256.0;
    }
    if (tt.yy0 < 0 || tt.yy1 > 1) {
      v0 = (yt + 0 * 15.99) / 256.0;
      v1 = (yt + 1 * 15.99) / 256.0;
    }
    const x0 = x + tt.xx0;
    const y0 = y + tt.yy0;
    const y1 = y + tt.yy1;
    const z0 = z + tt.zz0;
    const z1 = z + tt.zz1;
    if (this.applyAmbienceOcclusion) {
      t.color(this.c1r, this.c1g, this.c1b);
      t.vertexUV(x0, y1, z1, u1, v0);
      t.color(this.c2r, this.c2g, this.c2b);
      t.vertexUV(x0, y1, z0, u0, v0);
      t.color(this.c3r, this.c3g, this.c3b);
      t.vertexUV(x0, y0, z0, u0, v1);
      t.color(this.c4r, this.c4g, this.c4b);
      t.vertexUV(x0, y0, z1, u1, v1);
    } else {
      t.vertexUV(x0, y1, z1, u1, v0);
      t.vertexUV(x0, y1, z0, u0, v0);
      t.vertexUV(x0, y0, z0, u0, v1);
      t.vertexUV(x0, y0, z1, u1, v1);
    }
  }

  renderEast(tt: Tile, x: number, y: number, z: number, tex: number): void {
    const t = Tesselator.instance;
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const [xt, yt] = TileRenderer.uv(tex);
    let u0 = (xt + tt.zz0 * 16) / 256.0;
    let u1 = (xt + tt.zz1 * 16 - 0.01) / 256.0;
    let v0 = (yt + 16 - tt.yy1 * 16) / 256.0;
    let v1 = (yt + 16 - tt.yy0 * 16 - 0.01) / 256.0;
    if (this.xFlipTexture) {
      const tmp = u0;
      u0 = u1;
      u1 = tmp;
    }
    if (tt.zz0 < 0 || tt.zz1 > 1) {
      u0 = (xt + 0 * 15.99) / 256.0;
      u1 = (xt + 1 * 15.99) / 256.0;
    }
    if (tt.yy0 < 0 || tt.yy1 > 1) {
      v0 = (yt + 0 * 15.99) / 256.0;
      v1 = (yt + 1 * 15.99) / 256.0;
    }
    const x1 = x + tt.xx1;
    const y0 = y + tt.yy0;
    const y1 = y + tt.yy1;
    const z0 = z + tt.zz0;
    const z1 = z + tt.zz1;
    if (this.applyAmbienceOcclusion) {
      t.color(this.c1r, this.c1g, this.c1b);
      t.vertexUV(x1, y0, z1, u0, v1);
      t.color(this.c2r, this.c2g, this.c2b);
      t.vertexUV(x1, y0, z0, u1, v1);
      t.color(this.c3r, this.c3g, this.c3b);
      t.vertexUV(x1, y1, z0, u1, v0);
      t.color(this.c4r, this.c4g, this.c4b);
      t.vertexUV(x1, y1, z1, u0, v0);
    } else {
      t.vertexUV(x1, y0, z1, u0, v1);
      t.vertexUV(x1, y0, z0, u1, v1);
      t.vertexUV(x1, y1, z0, u1, v0);
      t.vertexUV(x1, y1, z1, u0, v0);
    }
  }

  // OMIT(TileShape): renderTile(tile, data)  TileRenderer.cpp:2367（物品与手持方块，S11）
  // OMIT(TileShape): renderGuiTile(tile, data)  TileRenderer.cpp:2585（物品栏图标，S11）
  // OMIT(TileShape): tesselateThinFenceInWorld(tt, x, y, z)  TileRenderer.cpp:2717
  // OMIT(TileShape): tesselateRowTexture(tt, data, x, y, z)  TileRenderer.cpp:3165

  static canRender(renderShape: number): boolean {
    if (renderShape === Tile.SHAPE_BLOCK) return true;
    if (renderShape === Tile.SHAPE_CACTUS) return true;
    if (renderShape === Tile.SHAPE_STAIRS) return true;
    if (renderShape === Tile.SHAPE_FENCE) return true;
    if (renderShape === Tile.SHAPE_FENCE_GATE) return true;
    return false;
  }

  /** 只给测试用：getWaterHeight 是 private，唯一的调用方 tesselateWaterInWorld 还没移植 */
  _getWaterHeightForTest(x: number, y: number, z: number, m: Material): number {
    return this.getWaterHeight(x, y, z, m);
  }
}
