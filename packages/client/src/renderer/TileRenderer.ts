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
import { BedTile, Direction, type FenceTile, type LevelSource, LiquidTile, type Material, type StemTile, type ThinFenceTile, Tile } from '@mcpe/world';
import { Mth } from '@mcpe/util';
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
      return this.tesselateWaterInWorld(tt, x, y, z);
    } else if (shape === Tile.SHAPE_CACTUS) {
      // DEFERRED(TileShape): return tesselateCactusInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_CROSS_TEXTURE) {
      return this.tesselateCrossInWorld(tt, x, y, z);
    } else if (shape === Tile.SHAPE_STEM) {
      return this.tesselateStemInWorld(tt, x, y, z);
    } else if (shape === Tile.SHAPE_ROWS) {
      // DEFERRED(TileShape): return tesselateRowInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_TORCH) {
      return this.tesselateTorchInWorld(tt, x, y, z);
    } else if (shape === Tile.SHAPE_FIRE) {
      return this.tesselateFireInWorld(tt, x, y, z);
    } else if (shape === Tile.SHAPE_LADDER) {
      return this.tesselateLadderInWorld(tt, x, y, z);
    } else if (shape === Tile.SHAPE_DOOR) {
      // DEFERRED(TileShape): return tesselateDoorInWorld(tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_STAIRS) {
      // DEFERRED(TileShape): return tesselateStairsInWorld((StairTile*)tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_FENCE) {
      return this.tesselateFenceInWorld(tt as FenceTile, x, y, z);
    } else if (shape === Tile.SHAPE_FENCE_GATE) {
      // DEFERRED(TileShape): return tesselateFenceGateInWorld((FenceGateTile*) tt, x, y, z);
      return false;
    } else if (shape === Tile.SHAPE_IRON_FENCE) {
      return this.tesselateThinFenceInWorld(tt as ThinFenceTile, x, y, z);
    } else if (shape === Tile.SHAPE_BED) {
      return this.tesselateBedInWorld(tt, x, y, z);
    } else {
      return false;
    }
  }

  tesselateInWorldNoCulling(tile: Tile, x: number, y: number, z: number): void {
    this.noCulling = true;
    this.tesselateInWorld(tile, x, y, z);
    this.noCulling = false;
  }

  /** 照 C++ 逐句移植（大量 (float) 强转在 TS 里去掉；int 的 x / 2 写成 (x / 2) | 0） */
  tesselateFireInWorld(tt: Tile, x: number, y: number, z: number): boolean {
    const level = this.level!;
    const t = Tesselator.instance;
    let tex = tt.getTexture(0);
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const br = tt.getBrightness( level, x, y, z );
    t.color( br, br, br );
    const xt = ((tex & 0xf) << 4);
    const yt = tex & 0xf0;
    let u0 = (xt) / 256.0;
    let u1 = (xt + 15.99) / 256.0;
    let v0 = (yt) / 256.0;
    let v1 = (yt + 15.99) / 256.0;
    let h = 1.4;
    if ( level.isSolidBlockingTile( x, y - 1, z ) || Tile.fire.canBurn( level, x, y - 1, z ) )
    {
      let x0 = x + 0.5 + 0.2;
      let x1 = x + 0.5 - 0.2;
      let z0 = z + 0.5 + 0.2;
      let z1 = z + 0.5 - 0.2;
      let x0_ = x + 0.5 - 0.3;
      let x1_ = x + 0.5 + 0.3;
      let z0_ = z + 0.5 - 0.3;
      let z1_ = z + 0.5 + 0.3;
      t.vertexUV( ( x0_ ), ( y + h ), ( z + 1 ), ( u1 ), ( v0 ) );
      t.vertexUV( ( x0 ), ( y + 0 ), ( z + 1 ), ( u1 ), ( v1 ) );
      t.vertexUV( ( x0 ), ( y + 0 ), ( z + 0 ), ( u0 ), ( v1 ) );
      t.vertexUV( ( x0_ ), ( y + h ), ( z + 0 ), ( u0 ), ( v0 ) );
      t.vertexUV( ( x1_ ), ( y + h ), ( z + 0 ), ( u1 ), ( v0 ) );
      t.vertexUV( ( x1 ), ( y + 0 ), ( z + 0 ), ( u1 ), ( v1 ) );
      t.vertexUV( ( x1 ), ( y + 0 ), ( z + 1 ), ( u0 ), ( v1 ) );
      t.vertexUV( ( x1_ ), ( y + h ), ( z + 1 ), ( u0 ), ( v0 ) );
      u0 = (xt) / 256.0;
      u1 = (xt + 15.99) / 256.0;
      v0 = (yt) / 256.0;
      v1 = (yt + 15.99) / 256.0;
      t.vertexUV( ( x + 1 ), ( y + h ), ( z1_ ), ( u1 ), ( v0 ) );
      t.vertexUV( ( x + 1 ), ( y + 0 ), ( z1 ), ( u1 ), ( v1 ) );
      t.vertexUV( ( x + 0 ), ( y + 0 ), ( z1 ), ( u0 ), ( v1 ) );
      t.vertexUV( ( x + 0 ), ( y + h ), ( z1_ ), ( u0 ), ( v0 ) );
      t.vertexUV( ( x + 0 ), ( y + h ), ( z0_ ), ( u1 ), ( v0 ) );
      t.vertexUV( ( x + 0 ), ( y + 0 ), ( z0 ), ( u1 ), ( v1 ) );
      t.vertexUV( ( x + 1 ), ( y + 0 ), ( z0 ), ( u0 ), ( v1 ) );
      t.vertexUV( ( x + 1 ), ( y + h ), ( z0_ ), ( u0 ), ( v0 ) );
      x0 = x + 0.5 - 0.5;
      x1 = x + 0.5 + 0.5;
      z0 = z + 0.5 - 0.5;
      z1 = z + 0.5 + 0.5;
      x0_ = x + 0.5 - 0.4;
      x1_ = x + 0.5 + 0.4;
      z0_ = z + 0.5 - 0.4;
      z1_ = z + 0.5 + 0.4;
      t.vertexUV( ( x0_ ), ( y + h ), ( z + 0 ), ( u0 ), ( v0 ) );
      t.vertexUV( ( x0 ), ( y + 0 ), ( z + 0 ), ( u0 ), ( v1 ) );
      t.vertexUV( ( x0 ), ( y + 0 ), ( z + 1 ), ( u1 ), ( v1 ) );
      t.vertexUV( ( x0_ ), ( y + h ), ( z + 1 ), ( u1 ), ( v0 ) );
      t.vertexUV( ( x1_ ), ( y + h ), ( z + 1 ), ( u0 ), ( v0 ) );
      t.vertexUV( ( x1 ), ( y + 0 ), ( z + 1 ), ( u0 ), ( v1 ) );
      t.vertexUV( ( x1 ), ( y + 0 ), ( z + 0 ), ( u1 ), ( v1 ) );
      t.vertexUV( ( x1_ ), ( y + h ), ( z + 0 ), ( u1 ), ( v0 ) );
      u0 = (xt) / 256.0;
      u1 = (xt + 15.99) / 256.0;
      v0 = (yt) / 256.0;
      v1 = (yt + 15.99) / 256.0;
      t.vertexUV( ( x + 0 ), ( y + h ), ( z1_ ), ( u0 ), ( v0 ) );
      t.vertexUV( ( x + 0 ), ( y + 0 ), ( z1 ), ( u0 ), ( v1 ) );
      t.vertexUV( ( x + 1 ), ( y + 0 ), ( z1 ), ( u1 ), ( v1 ) );
      t.vertexUV( ( x + 1 ), ( y + h ), ( z1_ ), ( u1 ), ( v0 ) );
      t.vertexUV( ( x + 1 ), ( y + h ), ( z0_ ), ( u0 ), ( v0 ) );
      t.vertexUV( ( x + 1 ), ( y + 0 ), ( z0 ), ( u0 ), ( v1 ) );
      t.vertexUV( ( x + 0 ), ( y + 0 ), ( z0 ), ( u1 ), ( v1 ) );
      t.vertexUV( ( x + 0 ), ( y + h ), ( z0_ ), ( u1 ), ( v0 ) );
    }
    else
    {
      const r = 0.2;
      const yo = 1 / 16.0;
      if ( ( ( x + y + z ) & 1 ) === 1 )
      {
        u0 = (xt) / 256.0;
        u1 = (xt + 15.99) / 256.0;
        v0 = (yt) / 256.0;
        v1 = (yt + 15.99) / 256.0;
      }
      if ( ((((x / 2) | 0) + ((y / 2) | 0) + ((z / 2) | 0)) & 1 ) === 1 )
      {
        const tmp = u1;
        u1 = u0;
        u0 = tmp;
      }
      if ( Tile.fire.canBurn( level, x - 1, y, z ) )
      {
        t.vertexUV( ( x + r ), ( y + h + yo ), ( z + 1.0 ), ( u1 ), ( v0 ) );
        t.vertexUV( ( x + 0.0 ), ( y + 0.0 + yo ), ( z + 1.0 ), ( u1 ), ( v1 ) );
        t.vertexUV( ( x + 0.0 ), ( y + 0.0 + yo ), ( z + 0.0 ), ( u0 ), ( v1 ) );
        t.vertexUV( ( x + r ), ( y + h + yo ), ( z + 0.0 ), ( u0 ), ( v0 ) );
        t.vertexUV( ( x + r ), ( y + h + yo ), ( z + 0.0 ), ( u0 ), ( v0 ) );
        t.vertexUV( ( x + 0.0 ), ( y + 0.0 + yo ), ( z + 0.0 ), ( u0 ), ( v1 ) );
        t.vertexUV( ( x + 0.0 ), ( y + 0.0 + yo ), ( z + 1.0 ), ( u1 ), ( v1 ) );
        t.vertexUV( ( x + r ), ( y + h + yo ), ( z + 1.0 ), ( u1 ), ( v0 ) );
      }
      if ( Tile.fire.canBurn( level, x + 1, y, z ) )
      {
        t.vertexUV( ( x + 1 - r ), ( y + h + yo ), ( z + 0.0 ), ( u0 ), ( v0 ) );
        t.vertexUV( ( x + 1 - 0 ), ( y + 0 + yo ), ( z + 0.0 ), ( u0 ), ( v1 ) );
        t.vertexUV( ( x + 1 - 0 ), ( y + 0 + yo ), ( z + 1.0 ), ( u1 ), ( v1 ) );
        t.vertexUV( ( x + 1 - r ), ( y + h + yo ), ( z + 1.0 ), ( u1 ), ( v0 ) );
        t.vertexUV( ( x + 1.0 - r ), ( y + h + yo ), ( z + 1.0 ), ( u1 ), ( v0 ) );
        t.vertexUV( ( x + 1.0 - 0.0 ), ( y + 0.0 + yo ), ( z + 1.0 ), ( u1 ), ( v1 ) );
        t.vertexUV( ( x + 1.0 - 0 ), ( y + 0.0 + yo ), ( z + 0.0 ), ( u0 ), ( v1 ) );
        t.vertexUV( ( x + 1.0 - r ), ( y + h + yo ), ( z + 0.0 ), ( u0 ), ( v0 ) );
      }
      if ( Tile.fire.canBurn( level, x, y, z - 1 ) )
      {
        t.vertexUV( ( x + 0.0 ), ( y + h + yo ), ( z + r ), ( u1 ), ( v0 ) );
        t.vertexUV( ( x + 0.0 ), ( y + 0.0 + yo ), ( z + 0.0 ), ( u1 ), ( v1 ) );
        t.vertexUV( ( x + 1.0 ), ( y + 0.0 + yo ), ( z + 0.0 ), ( u0 ), ( v1 ) );
        t.vertexUV( ( x + 1.0 ), ( y + h + yo ), ( z + r ), ( u0 ), ( v0 ) );
        t.vertexUV( ( x + 1.0 ), ( y + h + yo ), ( z + r ), ( u0 ), ( v0 ) );
        t.vertexUV( ( x + 1.0 ), ( y + 0.0 + yo ), ( z + 0.0 ), ( u0 ), ( v1 ) );
        t.vertexUV( ( x + 0.0 ), ( y + 0.0 + yo ), ( z + 0.0 ), ( u1 ), ( v1 ) );
        t.vertexUV( ( x + 0.0 ), ( y + h + yo ), ( z + r ), ( u1 ), ( v0 ) );
      }
      if ( Tile.fire.canBurn( level, x, y, z + 1 ) )
      {
        t.vertexUV( ( x + 1.0 ), ( y + h + yo ), ( z + 1.0 - r ), ( u0 ), ( v0 ) );
        t.vertexUV( ( x + 1.0 ), ( y + 0.0 + yo ), ( z + 1.0 - 0.0 ), ( u0 ), ( v1 ) );
        t.vertexUV( ( x + 0.0 ), ( y + 0.0 + yo ), ( z + 1.0 - 0.0 ), ( u1 ), ( v1 ) );
        t.vertexUV( ( x + 0.0 ), ( y + h + yo ), ( z + 1.0 - r ), ( u1 ), ( v0 ) );
        t.vertexUV( ( x + 0.0 ), ( y + h + yo ), ( z + 1.0 - r ), ( u1 ), ( v0 ) );
        t.vertexUV( ( x + 0.0 ), ( y + 0.0 + yo ), ( z + 1.0 - 0.0 ), ( u1 ), ( v1 ) );
        t.vertexUV( ( x + 1.0 ), ( y + 0.0 + yo ), ( z + 1.0 - 0.0 ), ( u0 ), ( v1 ) );
        t.vertexUV( ( x + 1.0 ), ( y + h + yo ), ( z + 1.0 - r ), ( u0 ), ( v0 ) );
      }
      if ( Tile.fire.canBurn( level, x, y + 1.0, z ) )
      {
        const x0 = x + 0.5 + 0.5;
        const x1 = x + 0.5 - 0.5;
        const z0 = z + 0.5 + 0.5;
        const z1 = z + 0.5 - 0.5;
        const x0_ = x + 0.5 - 0.5;
        const x1_ = x + 0.5 + 0.5;
        const z0_ = z + 0.5 - 0.5;
        const z1_ = z + 0.5 + 0.5;
        u0 = (xt) / 256.0;
        u1 = (xt + 15.99) / 256.0;
        v0 = (yt) / 256.0;
        v1 = (yt + 15.99) / 256.0;
        y += 1;
        h = -0.2;
        if ( ( ( x + y + z ) & 1 ) === 0 )
        {
          t.vertexUV( ( x0_ ), ( y + h ), ( z + 0 ), ( u1 ), ( v0 ) );
          t.vertexUV( ( x0 ), ( y + 0 ), ( z + 0 ), ( u1 ), ( v1 ) );
          t.vertexUV( ( x0 ), ( y + 0 ), ( z + 1 ), ( u0 ), ( v1 ) );
          t.vertexUV( ( x0_ ), ( y + h ), ( z + 1 ), ( u0 ), ( v0 ) );
          u0 = (xt) / 256.0;
          u1 = (xt + 15.99) / 256.0;
          v0 = (yt) / 256.0;
          v1 = (yt + 15.99) / 256.0;
          t.vertexUV( ( x1_ ), ( y + h ), ( z + 1.0 ), ( u1 ), ( v0 ) );
          t.vertexUV( ( x1 ), ( y + 0.0 ), ( z + 1.0 ), ( u1 ), ( v1 ) );
          t.vertexUV( ( x1 ), ( y + 0.0 ), ( z + 0 ), ( u0 ), ( v1 ) );
          t.vertexUV( ( x1_ ), ( y + h ), ( z + 0 ), ( u0 ), ( v0 ) );
        }
        else
        {
          t.vertexUV( ( x + 0.0 ), ( y + h ), ( z1_ ), ( u1 ), ( v0 ) );
          t.vertexUV( ( x + 0.0 ), ( y + 0.0 ), ( z1 ), ( u1 ), ( v1 ) );
          t.vertexUV( ( x + 1.0 ), ( y + 0.0 ), ( z1 ), ( u0 ), ( v1 ) );
          t.vertexUV( ( x + 1.0 ), ( y + h ), ( z1_ ), ( u0 ), ( v0 ) );
          u0 = (xt) / 256.0;
          u1 = (xt + 15.99) / 256.0;
          v0 = (yt) / 256.0;
          v1 = (yt + 15.99) / 256.0;
          t.vertexUV( ( x + 1.0 ), ( y + h ), ( z0_ ), ( u1 ), ( v0 ) );
          t.vertexUV( ( x + 1.0 ), ( y + 0.0 ), ( z0 ), ( u1 ), ( v1 ) );
          t.vertexUV( ( x + 0.0 ), ( y + 0.0 ), ( z0 ), ( u0 ), ( v1 ) );
          t.vertexUV( ( x + 0.0 ), ( y + h ), ( z0_ ), ( u0 ), ( v0 ) );
        }
      }
    }
    return true;
  }


  tesselateTorchInWorld(tt: Tile, x: number, y: number, z: number): boolean {
    const level = this.level!;
    const dir = level.getData(x, y, z);
    const t = Tesselator.instance;
    let br = tt.getBrightness(level, x, y, z);
    if (Tile.lightEmission[tt.id]! > 0) br = 1.0;
    t.color(br, br, br);
    const r = 0.4;
    const r2 = 0.5 - r;
    const h = 0.2;
    if (dir === 1) {
      this.tesselateTorch(tt, x - r2, y + h, z, -r, 0);
    } else if (dir === 2) {
      this.tesselateTorch(tt, x + r2, y + h, z, +r, 0);
    } else if (dir === 3) {
      this.tesselateTorch(tt, x, y + h, z - r2, 0, -r);
    } else if (dir === 4) {
      this.tesselateTorch(tt, x, y + h, z + r2, 0, +r);
    } else {
      this.tesselateTorch(tt, x, y, z, 0, 0);
    }
    return true;
  }

  tesselateLadderInWorld(tt: Tile, x: number, y: number, z: number): boolean {
    const level = this.level!;
    const t = Tesselator.instance;
    let tex = tt.getTexture(0);
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const br = tt.getBrightness(level, x, y, z);
    t.color(br, br, br);
    const xt = (tex & 0xf) << 4;
    const yt = tex & 0xf0;
    const u0 = xt / 256.0;
    const u1 = (xt + 15.99) / 256.0;
    const v0 = yt / 256.0;
    const v1 = (yt + 15.99) / 256.0;
    const face = level.getData(x, y, z);
    const o = 0 / 16.0;
    const r = 0.05;
    if (face === 5) {
      t.vertexUV(x + r, y + 1 + o, z + 1 + o, u0, v0);
      t.vertexUV(x + r, y + 0 - o, z + 1 + o, u0, v1);
      t.vertexUV(x + r, y + 0 - o, z + 0 - o, u1, v1);
      t.vertexUV(x + r, y + 1 + o, z + 0 - o, u1, v0);
    }
    if (face === 4) {
      t.vertexUV(x + 1 - r, y + 0 - o, z + 1 + o, u1, v1);
      t.vertexUV(x + 1 - r, y + 1 + o, z + 1 + o, u1, v0);
      t.vertexUV(x + 1 - r, y + 1 + o, z + 0 - o, u0, v0);
      t.vertexUV(x + 1 - r, y + 0 - o, z + 0 - o, u0, v1);
    }
    if (face === 3) {
      t.vertexUV(x + 1 + o, y + 0 - o, z + r, u1, v1);
      t.vertexUV(x + 1 + o, y + 1 + o, z + r, u1, v0);
      t.vertexUV(x + 0 - o, y + 1 + o, z + r, u0, v0);
      t.vertexUV(x + 0 - o, y + 0 - o, z + r, u0, v1);
    }
    if (face === 2) {
      t.vertexUV(x + 1 + o, y + 1 + o, z + 1 - r, u0, v0);
      t.vertexUV(x + 1 + o, y + 0 - o, z + 1 - r, u0, v1);
      t.vertexUV(x + 0 - o, y + 0 - o, z + 1 - r, u1, v1);
      t.vertexUV(x + 0 - o, y + 1 + o, z + 1 - r, u1, v0);
    }
    return true;
  }

  tesselateCrossInWorld(tt: Tile, x: number, y: number, z: number): boolean {
    const level = this.level!;
    const t = Tesselator.instance;
    const br = tt.getBrightness(level, x, y, z);
    const col = tt.getColor(level, x, y, z);
    const r = ((col >> 16) & 0xff) / 255.0;
    const g = ((col >> 8) & 0xff) / 255.0;
    const b = (col & 0xff) / 255.0;
    t.color(br * r, br * g, br * b);
    let xt = x;
    let yt = y;
    let zt = z;
    if (tt === Tile.tallgrass) {
      // long seed = (x * 3129871) ^ (z * 116129781l) ^ (y);（x * 3129871 是 int 乘法，会溢出；其余按 64 位）
      let seed = BigInt(Math.imul(x, 3129871)) ^ (BigInt(z) * 116129781n) ^ BigInt(y);
      seed = BigInt.asIntN(64, seed * seed * 42317861n + seed * 11n);
      xt += ((Number((seed >> 16n) & 0xfn) / 15.0) - 0.5) * 0.5;
      yt += ((Number((seed >> 20n) & 0xfn) / 15.0) - 1.0) * 0.2;
      zt += ((Number((seed >> 24n) & 0xfn) / 15.0) - 0.5) * 0.5;
    }
    this.tesselateCrossTexture(tt, level.getData(x, y, z), xt, yt, zt);
    return true;
  }

  tesselateStemInWorld(_tt: Tile, x: number, y: number, z: number): boolean {
    const level = this.level!;
    const tt = _tt as StemTile;
    const t = Tesselator.instance;
    const br = tt.getBrightness(level, x, y, z);
    const col = tt.getColor(level, x, y, z);
    const r = ((col >> 16) & 0xff) / 255.0;
    const g = ((col >> 8) & 0xff) / 255.0;
    const b = (col & 0xff) / 255.0;
    t.color(br * r, br * g, br * b);
    tt.updateShape(level, x, y, z);
    const dir = tt.getConnectDir(level, x, y, z);
    if (dir < 0) {
      this.tesselateStemTexture(tt, level.getData(x, y, z), tt.yy1, x, y - 1 / 16.0, z);
    } else {
      this.tesselateStemTexture(tt, level.getData(x, y, z), 0.5, x, y - 1 / 16.0, z);
      this.tesselateStemDirTexture(tt, level.getData(x, y, z), dir, tt.yy1, x, y - 1 / 16.0, z);
    }
    return true;
  }

  tesselateTorch(tt: Tile, x: number, y: number, z: number, xxa: number, zza: number): void {
    const t = Tesselator.instance;
    let tex = tt.getTexture(0);
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const xt = (tex & 0xf) << 4;
    const yt = tex & 0xf0;
    const u0 = xt / 256.0;
    const u1 = (xt + 15.99) / 256.0;
    const v0 = yt / 256.0;
    const v1 = (yt + 15.99) / 256.0;
    const uc0 = u0 + 7 / 256.0;
    const vc0 = v0 + 6 / 256.0;
    const uc1 = u0 + 9 / 256.0;
    const vc1 = v0 + 8 / 256.0;
    x += 0.5;
    z += 0.5;
    const x0 = x - 0.5;
    const x1 = x + 0.5;
    const z0 = z - 0.5;
    const z1 = z + 0.5;
    const r = 1 / 16.0;
    const h = 10.0 / 16.0;
    t.vertexUV(x + xxa * (1 - h) - r, y + h, z + zza * (1 - h) - r, uc0, vc0);
    t.vertexUV(x + xxa * (1 - h) - r, y + h, z + zza * (1 - h) + r, uc0, vc1);
    t.vertexUV(x + xxa * (1 - h) + r, y + h, z + zza * (1 - h) + r, uc1, vc1);
    t.vertexUV(x + xxa * (1 - h) + r, y + h, z + zza * (1 - h) - r, uc1, vc0);
    t.vertexUV(x - r, y + 1, z0, u0, v0);
    t.vertexUV(x - r + xxa, y + 0, z0 + zza, u0, v1);
    t.vertexUV(x - r + xxa, y + 0, z1 + zza, u1, v1);
    t.vertexUV(x - r, y + 1, z1, u1, v0);
    t.vertexUV(x + r, y + 1, z1, u0, v0);
    t.vertexUV(x + xxa + r, y + 0, z1 + zza, u0, v1);
    t.vertexUV(x + xxa + r, y + 0, z0 + zza, u1, v1);
    t.vertexUV(x + r, y + 1, z0, u1, v0);
    t.vertexUV(x0, y + 1, z + r, u0, v0);
    t.vertexUV(x0 + xxa, y + 0, z + r + zza, u0, v1);
    t.vertexUV(x1 + xxa, y + 0, z + r + zza, u1, v1);
    t.vertexUV(x1, y + 1, z + r, u1, v0);
    t.vertexUV(x1, y + 1, z - r, u0, v0);
    t.vertexUV(x1 + xxa, y + 0, z - r + zza, u0, v1);
    t.vertexUV(x0 + xxa, y + 0, z - r + zza, u1, v1);
    t.vertexUV(x0, y + 1, z - r, u1, v0);
  }

  tesselateCrossTexture(tt: Tile, data: number, x: number, y: number, z: number): void {
    const t = Tesselator.instance;
    let tex = tt.getTexture(0, data);
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const xt = (tex & 0xf) << 4;
    const yt = tex & 0xf0;
    const u0 = xt / 256.0;
    const u1 = (xt + 15.99) / 256.0;
    const v0 = yt / 256.0;
    const v1 = (yt + 15.99) / 256.0;
    const x0 = x + 0.5 - 0.45;
    const x1 = x + 0.5 + 0.45;
    const z0 = z + 0.5 - 0.45;
    const z1 = z + 0.5 + 0.45;
    t.vertexUV(x0, y + 1, z0, u0, v0);
    t.vertexUV(x0, y + 0, z0, u0, v1);
    t.vertexUV(x1, y + 0, z1, u1, v1);
    t.vertexUV(x1, y + 1, z1, u1, v0);
    t.vertexUV(x1, y + 1, z1, u0, v0);
    t.vertexUV(x1, y + 0, z1, u0, v1);
    t.vertexUV(x0, y + 0, z0, u1, v1);
    t.vertexUV(x0, y + 1, z0, u1, v0);
    t.vertexUV(x0, y + 1, z1, u0, v0);
    t.vertexUV(x0, y + 0, z1, u0, v1);
    t.vertexUV(x1, y + 0, z0, u1, v1);
    t.vertexUV(x1, y + 1, z0, u1, v0);
    t.vertexUV(x1, y + 1, z0, u0, v0);
    t.vertexUV(x1, y + 0, z0, u0, v1);
    t.vertexUV(x0, y + 0, z1, u1, v1);
    t.vertexUV(x0, y + 1, z1, u1, v0);
  }

  tesselateStemTexture(tt: Tile, data: number, h: number, x: number, y: number, z: number): void {
    const t = Tesselator.instance;
    let tex = tt.getTexture(0, data);
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const xt = (tex & 0xf) << 4;
    const yt = tex & 0xf0;
    const u0 = xt / 256.0;
    const u1 = (xt + 15.99) / 256.0;
    const v0 = yt / 256.0;
    const v1 = (yt + 15.99 * h) / 256.0;
    const x0 = x + 0.5 - 0.45;
    const x1 = x + 0.5 + 0.45;
    const z0 = z + 0.5 - 0.45;
    const z1 = z + 0.5 + 0.45;
    t.vertexUV(x0, y + h, z0, u0, v0);
    t.vertexUV(x0, y + 0, z0, u0, v1);
    t.vertexUV(x1, y + 0, z1, u1, v1);
    t.vertexUV(x1, y + h, z1, u1, v0);
    t.vertexUV(x1, y + h, z1, u0, v0);
    t.vertexUV(x1, y + 0, z1, u0, v1);
    t.vertexUV(x0, y + 0, z0, u1, v1);
    t.vertexUV(x0, y + h, z0, u1, v0);
    t.vertexUV(x0, y + h, z1, u0, v0);
    t.vertexUV(x0, y + 0, z1, u0, v1);
    t.vertexUV(x1, y + 0, z0, u1, v1);
    t.vertexUV(x1, y + h, z0, u1, v0);
    t.vertexUV(x1, y + h, z0, u0, v0);
    t.vertexUV(x1, y + 0, z0, u0, v1);
    t.vertexUV(x0, y + 0, z1, u1, v1);
    t.vertexUV(x0, y + h, z1, u1, v0);
  }

  tesselateStemDirTexture(tt: Tile, data: number, dir: number, h: number, x: number, y: number, z: number): void {
    const t = Tesselator.instance;
    let tex = tt.getTexture(0, data) + 16;
    if (this.fixedTexture >= 0) tex = this.fixedTexture;
    const xt = (tex & 0xf) << 4;
    const yt = tex & 0xf0;
    let u0 = xt / 256.0;
    let u1 = (xt + 15.99) / 256.0;
    const v0 = yt / 256.0;
    const v1 = (yt + 15.99 * h) / 256.0;
    const x0 = x + 0.5 - 0.5;
    const x1 = x + 0.5 + 0.5;
    const z0 = z + 0.5 - 0.5;
    const z1 = z + 0.5 + 0.5;
    const xm = x + 0.5;
    const zm = z + 0.5;
    if (((((dir + 1) / 2) | 0) % 2) === 1) {
      const tmp = u1;
      u1 = u0;
      u0 = tmp;
    }
    if (dir < 2) {
      t.vertexUV(x0, y + h, zm, u0, v0);
      t.vertexUV(x0, y + 0, zm, u0, v1);
      t.vertexUV(x1, y + 0, zm, u1, v1);
      t.vertexUV(x1, y + h, zm, u1, v0);
      t.vertexUV(x1, y + h, zm, u1, v0);
      t.vertexUV(x1, y + 0, zm, u1, v1);
      t.vertexUV(x0, y + 0, zm, u0, v1);
      t.vertexUV(x0, y + h, zm, u0, v0);
    } else {
      t.vertexUV(xm, y + h, z1, u0, v0);
      t.vertexUV(xm, y + 0, z1, u0, v1);
      t.vertexUV(xm, y + 0, z0, u1, v1);
      t.vertexUV(xm, y + h, z0, u1, v0);
      t.vertexUV(xm, y + h, z0, u1, v0);
      t.vertexUV(xm, y + 0, z0, u1, v1);
      t.vertexUV(xm, y + 0, z1, u0, v1);
      t.vertexUV(xm, y + h, z1, u0, v0);
    }
  }

  tesselateWaterInWorld(tt: Tile, x: number, y: number, z: number): boolean {
    const level = this.level!;
    const t = Tesselator.instance;
    const up = tt.shouldRenderFace(level, x, y + 1, z, 1);
    const down = tt.shouldRenderFace(level, x, y - 1, z, 0);
    const dirs = [
      tt.shouldRenderFace(level, x, y, z - 1, 2),
      tt.shouldRenderFace(level, x, y, z + 1, 3),
      tt.shouldRenderFace(level, x - 1, y, z, 4),
      tt.shouldRenderFace(level, x + 1, y, z, 5),
    ];
    if (!up && !down && !dirs[0] && !dirs[1] && !dirs[2] && !dirs[3]) return false;
    let changed = false;
    const c10 = 0.5;
    const c11 = 1;
    const c2 = 0.8;
    const c3 = 0.6;
    const yo0 = 0;
    const yo1 = 1;
    const m = tt.material;
    const data = level.getData(x, y, z);
    const h0 = this.getWaterHeight(x, y, z, m);
    const h1 = this.getWaterHeight(x, y, z + 1, m);
    const h2 = this.getWaterHeight(x + 1, y, z + 1, m);
    const h3 = this.getWaterHeight(x + 1, y, z, m);
    if (this.noCulling || up) {
      changed = true;
      let tex = tt.getTexture(1, data);
      let angle = Math.fround(LiquidTile.getSlopeAngle(level, x, y, z, m));
      if (angle > -999) {
        tex = tt.getTexture(2, data);
      }
      const xt = (tex & 0xf) << 4;
      const yt = tex & 0xf0;
      let uc = (xt + 0.5 * 16) / 256.0;
      let vc = (yt + 0.5 * 16) / 256.0;
      if (angle < -999) {
        angle = 0;
      } else {
        uc = (xt + 1 * 16) / 256.0;
        vc = (yt + 1 * 16) / 256.0;
      }
      const s = (Mth.sin(angle) * 8) / 256.5; // @attn: to get rid of "jitter" (caused
      const c = (Mth.cos(angle) * 8) / 256.5; //  of fp rounding errors) in big oceans)
      const br = tt.getBrightness(level, x, y, z);
      t.color(c11 * br, c11 * br, c11 * br);
      t.vertexUV(x + 0, y + h0, z + 0, uc - c - s, vc - c + s);
      t.vertexUV(x + 0, y + h1, z + 1, uc - c + s, vc + c + s);
      t.vertexUV(x + 1, y + h2, z + 1, uc + c + s, vc + c - s);
      t.vertexUV(x + 1, y + h3, z + 0, uc + c - s, vc - c - s);
    }
    if (this.noCulling || down) {
      const br = tt.getBrightness(level, x, y - 1, z);
      t.color(c10 * br, c10 * br, c10 * br);
      this.renderFaceDown(tt, x, y, z, tt.getTexture(0));
      changed = true;
    }
    for (let face = 0; face < 4; face++) {
      let xt = x;
      const yt = y;
      let zt = z;
      if (face === 0) zt--;
      if (face === 1) zt++;
      if (face === 2) xt--;
      if (face === 3) xt++;
      const tex = tt.getTexture(face + 2, data);
      const xTex = (tex & 0xf) << 4;
      const yTex = tex & 0xf0;
      if (this.noCulling || dirs[face]) {
        let hh0: number, hh1: number, x0: number, z0: number, x1: number, z1: number;
        if (face === 0) {
          hh0 = h0; hh1 = h3; x0 = x; x1 = x + 1; z0 = z; z1 = z;
        } else if (face === 1) {
          hh0 = h2; hh1 = h1; x0 = x + 1; x1 = x; z0 = z + 1; z1 = z + 1;
        } else if (face === 2) {
          hh0 = h1; hh1 = h0; x0 = x; x1 = x; z0 = z + 1; z1 = z;
        } else {
          hh0 = h3; hh1 = h2; x0 = x + 1; x1 = x + 1; z0 = z; z1 = z + 1;
        }
        changed = true;
        const u0 = (xTex + 0 * 16) / 256.0;
        const u1 = (xTex + 1 * 16 - 0.01) / 256.0;
        const v01 = (yTex + (1 - hh0) * 16) / 256.0;
        const v02 = (yTex + (1 - hh1) * 16) / 256.0;
        const v1 = (yTex + 1 * 16 - 0.01) / 256.0;
        let br = tt.getBrightness(level, xt, yt, zt);
        if (face < 2) br *= c2;
        else br *= c3;
        const yf = y;
        t.color(c11 * br, c11 * br, c11 * br);
        t.vertexUV(x0, yf + hh0, z0, u0, v01);
        t.vertexUV(x1, yf + hh1, z1, u1, v02);
        t.vertexUV(x1, yf + 0, z1, u1, v1);
        t.vertexUV(x0, yf + 0, z0, u0, v1);
      }
    }
    tt.yy0 = yo0;
    tt.yy1 = yo1;
    return changed;
  }

  tesselateFenceInWorld(tt: FenceTile, x: number, y: number, z: number): boolean {
    const level = this.level!;
    const changed = true;
    let a = 6 / 16.0;
    let b = 10 / 16.0;
    tt.setShape(a, 0, a, b, 1, b);
    this.tesselateBlockInWorld(tt, x, y, z);
    let vertical = false;
    let horizontal = false;
    const l = tt.connectsTo(level, x - 1, y, z);
    const r = tt.connectsTo(level, x + 1, y, z);
    const u = tt.connectsTo(level, x, y, z - 1);
    const d = tt.connectsTo(level, x, y, z + 1);
    if (l || r) vertical = true;
    if (u || d) horizontal = true;
    if (!vertical && !horizontal) vertical = true;
    a = 7 / 16.0;
    b = 9 / 16.0;
    let h0 = 12 / 16.0;
    let h1 = 15 / 16.0;
    const x0 = l ? 0 : a;
    const x1 = r ? 1 : b;
    const z0 = u ? 0 : a;
    const z1 = d ? 1 : b;
    if (vertical) {
      tt.setShape(x0, h0, a, x1, h1, b);
      this.tesselateBlockInWorld(tt, x, y, z);
    }
    if (horizontal) {
      tt.setShape(a, h0, z0, b, h1, z1);
      this.tesselateBlockInWorld(tt, x, y, z);
    }
    h0 = 6 / 16.0;
    h1 = 9 / 16.0;
    if (vertical) {
      tt.setShape(x0, h0, a, x1, h1, b);
      this.tesselateBlockInWorld(tt, x, y, z);
    }
    if (horizontal) {
      tt.setShape(a, h0, z0, b, h1, z1);
      this.tesselateBlockInWorld(tt, x, y, z);
    }
    tt.setShape(0, 0, 0, 1, 1, 1);
    return changed;
  }


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
  // OMIT(TileShape): tesselateFenceGateInWorld(tt, x, y, z)  TileRenderer.cpp:1587
  tesselateBedInWorld(tt: Tile, x: number, y: number, z: number): boolean {
    const level = this.level!;
    const t = Tesselator.instance;
    const data = level.getData(x, y, z);
    const direction = BedTile.getDirection(data);
    const isHead = BedTile.isHeadPiece(data);
    const c10 = 0.5;
    const c11 = 1;
    const c2 = 0.8;
    const c3 = 0.6;
    const r11 = c11, g11 = c11, b11 = c11;
    const r10 = c10, r2 = c2, r3 = c3;
    const g10 = c10, g2 = c2, g3 = c3;
    const b10 = c10, b2 = c2, b3 = c3;
    const centerBrightness = tt.getBrightness(level, x, y, z);
    {
      t.color(r10 * centerBrightness, g10 * centerBrightness, b10 * centerBrightness);
      const tex = tt.getTexture(level, x, y, z, Facing.DOWN);
      const xt = (tex & 0xf) << 4;
      const yt = tex & 0xf0;
      const u0 = xt / 256.0;
      const u1 = (xt + 16 - 0.01) / 256.0;
      const v0 = yt / 256.0;
      const v1 = (yt + 16 - 0.01) / 256.0;
      const x0 = x + tt.xx0;
      const x1 = x + tt.xx1;
      const y0 = y + tt.yy0 + 3.0 / 16.0;
      const z0 = z + tt.zz0;
      const z1 = z + tt.zz1;
      t.vertexUV(x0, y0, z1, u0, v1);
      t.vertexUV(x0, y0, z0, u0, v0);
      t.vertexUV(x1, y0, z0, u1, v0);
      t.vertexUV(x1, y0, z1, u1, v1);
    }
    const brightness = tt.getBrightness(level, x, y + 1, z);
    t.color(r11 * brightness, g11 * brightness, b11 * brightness);
    const tex = tt.getTexture(level, x, y, z, Facing.UP);
    const xt = (tex & 0xf) << 4;
    const yt = tex & 0xf0;
    const u0 = xt / 256.0;
    const u1 = (xt + 16) / 256.0;
    const v0 = yt / 256.0;
    const v1 = (yt + 16) / 256.0;
    let topLeftU = u0;
    let topRightU = u1;
    let topLeftV = v0;
    let topRightV = v0;
    let bottomLeftU = u0;
    let bottomRightU = u1;
    let bottomLeftV = v1;
    let bottomRightV = v1;
    if (direction === Direction.SOUTH) {
      topRightU = u0;
      topLeftV = v1;
      bottomLeftU = u1;
      bottomRightV = v0;
    } else if (direction === Direction.NORTH) {
      topLeftU = u1;
      topRightV = v1;
      bottomRightU = u0;
      bottomLeftV = v0;
    } else if (direction === Direction.EAST) {
      topLeftU = u1;
      topRightV = v1;
      bottomRightU = u0;
      bottomLeftV = v0;
      topRightU = u0;
      topLeftV = v1;
      bottomLeftU = u1;
      bottomRightV = v0;
    }
    const x0 = x + tt.xx0;
    const x1 = x + tt.xx1;
    const y1 = y + tt.yy1;
    const z0 = z + tt.zz0;
    const z1 = z + tt.zz1;
    t.vertexUV(x1, y1, z1, bottomLeftU, bottomLeftV);
    t.vertexUV(x1, y1, z0, topLeftU, topLeftV);
    t.vertexUV(x0, y1, z0, topRightU, topRightV);
    t.vertexUV(x0, y1, z1, bottomRightU, bottomRightV);
    let skipEdge = Direction.DIRECTION_FACING[direction]!;
    if (isHead) {
      skipEdge = Direction.DIRECTION_FACING[Direction.DIRECTION_OPPOSITE[direction]!]!;
    }
    let flipEdge: number = Facing.WEST;
    switch (direction) {
      case Direction.NORTH:
        break;
      case Direction.SOUTH:
        flipEdge = Facing.EAST;
        break;
      case Direction.EAST:
        flipEdge = Facing.NORTH;
        break;
      case Direction.WEST:
        flipEdge = Facing.SOUTH;
        break;
    }
    if (skipEdge !== Facing.NORTH && (this.noCulling || tt.shouldRenderFace(level, x, y, z - 1, Facing.NORTH))) {
      let br = tt.getBrightness(level, x, y, z - 1);
      if (tt.zz0 > 0) br = centerBrightness;
      t.color(r2 * br, g2 * br, b2 * br);
      this.xFlipTexture = flipEdge === Facing.NORTH;
      this.renderNorth(tt, x, y, z, tt.getTexture(level, x, y, z, 2));
    }
    if (skipEdge !== Facing.SOUTH && (this.noCulling || tt.shouldRenderFace(level, x, y, z + 1, Facing.SOUTH))) {
      let br = tt.getBrightness(level, x, y, z + 1);
      if (tt.zz1 < 1) br = centerBrightness;
      t.color(r2 * br, g2 * br, b2 * br);
      this.xFlipTexture = flipEdge === Facing.SOUTH;
      this.renderSouth(tt, x, y, z, tt.getTexture(level, x, y, z, 3));
    }
    if (skipEdge !== Facing.WEST && (this.noCulling || tt.shouldRenderFace(level, x - 1, y, z, Facing.WEST))) {
      let br = tt.getBrightness(level, x - 1, y, z);
      if (tt.xx0 > 0) br = centerBrightness;
      t.color(r3 * br, g3 * br, b3 * br);
      this.xFlipTexture = flipEdge === Facing.WEST;
      this.renderWest(tt, x, y, z, tt.getTexture(level, x, y, z, 4));
    }
    if (skipEdge !== Facing.EAST && (this.noCulling || tt.shouldRenderFace(level, x + 1, y, z, Facing.EAST))) {
      let br = tt.getBrightness(level, x + 1, y, z);
      if (tt.xx1 < 1) br = centerBrightness;
      t.color(r3 * br, g3 * br, b3 * br);
      this.xFlipTexture = flipEdge === Facing.EAST;
      this.renderEast(tt, x, y, z, tt.getTexture(level, x, y, z, 5));
    }
    this.xFlipTexture = false;
    return true;
  }

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
  /** 照 C++ 逐句移植 */
  tesselateThinFenceInWorld(tt: ThinFenceTile, x: number, y: number, z: number): boolean {
    const level = this.level!;
    const depth = 128;
    const t = Tesselator.instance;
    const br = tt.getBrightness(level, x, y, z);
    const col = tt.getColor(level, x, y, z);
    const r = ((col >> 16) & 0xff) / 255.0;
    const g = ((col >> 8) & 0xff) / 255.0;
    const b = ((col) & 0xff) / 255.0;
    t.color(br * r, br * g, br * b);
    let tex: number;
    let edgeTex: number;
    if (this.fixedTexture >= 0) {
      tex = this.fixedTexture;
      edgeTex = this.fixedTexture;
    } else {
      const data = level.getData(x, y, z);
      tex = tt.getTexture(0, data);
      edgeTex = tt.getEdgeTexture();
    }
    const xt = (tex & 0xf) << 4;
    const yt = tex & 0xf0;
    const u0 = (xt) / 256.0;
    const u1 = (xt + 7.99) / 256.0;
    const u2 = (xt + 15.99) / 256.0;
    const v0 = (yt) / 256.0;
    const v2 = (yt + 15.99) / 256.0;
    const xet = (edgeTex & 0xf) << 4;
    const yet = edgeTex & 0xf0;
    const iu0 = (xet + 7) / 256.0;
    const iu1 = (xet + 8.99) / 256.0;
    const iv0 = (yet) / 256.0;
    const iv1 = (yet + 8) / 256.0;
    const iv2 = (yet + 15.99) / 256.0;
    const x0 = x;
    const x1 = x0 + .5;
    const x2 = x0 + 1;
    const y0 = y + 0.001;
    const y1 = y0 + 1 - 0.002;
    const z0 = z;
    const z1 = z0 + .5;
    const z2 = z0 + 1;
    const ix0 = x0 + .5 - 1.0 / 16.0;
    const ix1 = x0 + .5 + 1.0 / 16.0;
    const iz0 = z0 + .5 - 1.0 / 16.0;
    const iz1 = z0 + .5 + 1.0 / 16.0;
    const n = tt.attachsTo(level.getTile(x, y, z - 1));
    const s = tt.attachsTo(level.getTile(x, y, z + 1));
    const w = tt.attachsTo(level.getTile(x - 1, y, z));
    const e = tt.attachsTo(level.getTile(x + 1, y, z));
    const up = tt.shouldRenderFace(level, x, y + 1, z, Facing.UP);
    const down = tt.shouldRenderFace(level, x, y - 1, z, Facing.DOWN);
    const noZFightingOffset = 0.01;
    if ((w && e) || (!w && !e && !n && !s)) {
      t.vertexUV(x0, y1, z1, u0, v0);
      t.vertexUV(x0, y0, z1, u0, v2);
      t.vertexUV(x2, y0, z1, u2, v2);
      t.vertexUV(x2, y1, z1, u2, v0);
      t.vertexUV(x2, y1, z1, u0, v0);
      t.vertexUV(x2, y0, z1, u0, v2);
      t.vertexUV(x0, y0, z1, u2, v2);
      t.vertexUV(x0, y1, z1, u2, v0);
      if (up) {
        t.vertexUV(x0, y1 + noZFightingOffset, iz1, iu1, iv2);
        t.vertexUV(x2, y1 + noZFightingOffset, iz1, iu1, iv0);
        t.vertexUV(x2, y1 + noZFightingOffset, iz0, iu0, iv0);
        t.vertexUV(x0, y1 + noZFightingOffset, iz0, iu0, iv2);
        t.vertexUV(x2, y1 + noZFightingOffset, iz1, iu1, iv2);
        t.vertexUV(x0, y1 + noZFightingOffset, iz1, iu1, iv0);
        t.vertexUV(x0, y1 + noZFightingOffset, iz0, iu0, iv0);
        t.vertexUV(x2, y1 + noZFightingOffset, iz0, iu0, iv2);
      } else {
        if (y < (depth - 1) && level.isEmptyTile(x - 1, y + 1, z)) {
          t.vertexUV(x0, y1 + noZFightingOffset, iz1, iu1, iv1);
          t.vertexUV(x1, y1 + noZFightingOffset, iz1, iu1, iv2);
          t.vertexUV(x1, y1 + noZFightingOffset, iz0, iu0, iv2);
          t.vertexUV(x0, y1 + noZFightingOffset, iz0, iu0, iv1);
          t.vertexUV(x1, y1 + noZFightingOffset, iz1, iu1, iv1);
          t.vertexUV(x0, y1 + noZFightingOffset, iz1, iu1, iv2);
          t.vertexUV(x0, y1 + noZFightingOffset, iz0, iu0, iv2);
          t.vertexUV(x1, y1 + noZFightingOffset, iz0, iu0, iv1);
        }
        if (y < (depth - 1) && level.isEmptyTile(x + 1, y + 1, z)) {
          t.vertexUV(x1, y1 + noZFightingOffset, iz1, iu1, iv0);
          t.vertexUV(x2, y1 + noZFightingOffset, iz1, iu1, iv1);
          t.vertexUV(x2, y1 + noZFightingOffset, iz0, iu0, iv1);
          t.vertexUV(x1, y1 + noZFightingOffset, iz0, iu0, iv0);
          t.vertexUV(x2, y1 + noZFightingOffset, iz1, iu1, iv0);
          t.vertexUV(x1, y1 + noZFightingOffset, iz1, iu1, iv1);
          t.vertexUV(x1, y1 + noZFightingOffset, iz0, iu0, iv1);
          t.vertexUV(x2, y1 + noZFightingOffset, iz0, iu0, iv0);
        }
      }
      if (down) {
        t.vertexUV(x0, y0 - noZFightingOffset, iz1, iu1, iv2);
        t.vertexUV(x2, y0 - noZFightingOffset, iz1, iu1, iv0);
        t.vertexUV(x2, y0 - noZFightingOffset, iz0, iu0, iv0);
        t.vertexUV(x0, y0 - noZFightingOffset, iz0, iu0, iv2);
        t.vertexUV(x2, y0 - noZFightingOffset, iz1, iu1, iv2);
        t.vertexUV(x0, y0 - noZFightingOffset, iz1, iu1, iv0);
        t.vertexUV(x0, y0 - noZFightingOffset, iz0, iu0, iv0);
        t.vertexUV(x2, y0 - noZFightingOffset, iz0, iu0, iv2);
      } else {
        if (y > 1 && level.isEmptyTile(x - 1, y - 1, z)) {
          t.vertexUV(x0, y0 - noZFightingOffset, iz1, iu1, iv1);
          t.vertexUV(x1, y0 - noZFightingOffset, iz1, iu1, iv2);
          t.vertexUV(x1, y0 - noZFightingOffset, iz0, iu0, iv2);
          t.vertexUV(x0, y0 - noZFightingOffset, iz0, iu0, iv1);
          t.vertexUV(x1, y0 - noZFightingOffset, iz1, iu1, iv1);
          t.vertexUV(x0, y0 - noZFightingOffset, iz1, iu1, iv2);
          t.vertexUV(x0, y0 - noZFightingOffset, iz0, iu0, iv2);
          t.vertexUV(x1, y0 - noZFightingOffset, iz0, iu0, iv1);
        }
        if (y > 1 && level.isEmptyTile(x + 1, y - 1, z)) {
          t.vertexUV(x1, y0 - noZFightingOffset, iz1, iu1, iv0);
          t.vertexUV(x2, y0 - noZFightingOffset, iz1, iu1, iv1);
          t.vertexUV(x2, y0 - noZFightingOffset, iz0, iu0, iv1);
          t.vertexUV(x1, y0 - noZFightingOffset, iz0, iu0, iv0);
          t.vertexUV(x2, y0 - noZFightingOffset, iz1, iu1, iv0);
          t.vertexUV(x1, y0 - noZFightingOffset, iz1, iu1, iv1);
          t.vertexUV(x1, y0 - noZFightingOffset, iz0, iu0, iv1);
          t.vertexUV(x2, y0 - noZFightingOffset, iz0, iu0, iv0);
        }
      }
    } else if (w && !e) {
      t.vertexUV(x0, y1, z1, u0, v0);
      t.vertexUV(x0, y0, z1, u0, v2);
      t.vertexUV(x1, y0, z1, u1, v2);
      t.vertexUV(x1, y1, z1, u1, v0);
      t.vertexUV(x1, y1, z1, u0, v0);
      t.vertexUV(x1, y0, z1, u0, v2);
      t.vertexUV(x0, y0, z1, u1, v2);
      t.vertexUV(x0, y1, z1, u1, v0);
      if (!s && !n) {
        t.vertexUV(x1, y1, iz1, iu0, iv0);
        t.vertexUV(x1, y0, iz1, iu0, iv2);
        t.vertexUV(x1, y0, iz0, iu1, iv2);
        t.vertexUV(x1, y1, iz0, iu1, iv0);
        t.vertexUV(x1, y1, iz0, iu0, iv0);
        t.vertexUV(x1, y0, iz0, iu0, iv2);
        t.vertexUV(x1, y0, iz1, iu1, iv2);
        t.vertexUV(x1, y1, iz1, iu1, iv0);
      }
      if (up || (y < (depth - 1) && level.isEmptyTile(x - 1, y + 1, z))) {
        t.vertexUV(x0, y1 + noZFightingOffset, iz1, iu1, iv1);
        t.vertexUV(x1, y1 + noZFightingOffset, iz1, iu1, iv2);
        t.vertexUV(x1, y1 + noZFightingOffset, iz0, iu0, iv2);
        t.vertexUV(x0, y1 + noZFightingOffset, iz0, iu0, iv1);
        t.vertexUV(x1, y1 + noZFightingOffset, iz1, iu1, iv1);
        t.vertexUV(x0, y1 + noZFightingOffset, iz1, iu1, iv2);
        t.vertexUV(x0, y1 + noZFightingOffset, iz0, iu0, iv2);
        t.vertexUV(x1, y1 + noZFightingOffset, iz0, iu0, iv1);
      }
      if (down || (y > 1 && level.isEmptyTile(x - 1, y - 1, z))) {
        t.vertexUV(x0, y0 - noZFightingOffset, iz1, iu1, iv1);
        t.vertexUV(x1, y0 - noZFightingOffset, iz1, iu1, iv2);
        t.vertexUV(x1, y0 - noZFightingOffset, iz0, iu0, iv2);
        t.vertexUV(x0, y0 - noZFightingOffset, iz0, iu0, iv1);
        t.vertexUV(x1, y0 - noZFightingOffset, iz1, iu1, iv1);
        t.vertexUV(x0, y0 - noZFightingOffset, iz1, iu1, iv2);
        t.vertexUV(x0, y0 - noZFightingOffset, iz0, iu0, iv2);
        t.vertexUV(x1, y0 - noZFightingOffset, iz0, iu0, iv1);
      }
    } else if (!w && e) {
      t.vertexUV(x1, y1, z1, u1, v0);
      t.vertexUV(x1, y0, z1, u1, v2);
      t.vertexUV(x2, y0, z1, u2, v2);
      t.vertexUV(x2, y1, z1, u2, v0);
      t.vertexUV(x2, y1, z1, u1, v0);
      t.vertexUV(x2, y0, z1, u1, v2);
      t.vertexUV(x1, y0, z1, u2, v2);
      t.vertexUV(x1, y1, z1, u2, v0);
      if (!s && !n) {
        t.vertexUV(x1, y1, iz0, iu0, iv0);
        t.vertexUV(x1, y0, iz0, iu0, iv2);
        t.vertexUV(x1, y0, iz1, iu1, iv2);
        t.vertexUV(x1, y1, iz1, iu1, iv0);
        t.vertexUV(x1, y1, iz1, iu0, iv0);
        t.vertexUV(x1, y0, iz1, iu0, iv2);
        t.vertexUV(x1, y0, iz0, iu1, iv2);
        t.vertexUV(x1, y1, iz0, iu1, iv0);
      }
      if (up || (y < (depth - 1) && level.isEmptyTile(x + 1, y + 1, z))) {
        t.vertexUV(x1, y1 + noZFightingOffset, iz1, iu1, iv0);
        t.vertexUV(x2, y1 + noZFightingOffset, iz1, iu1, iv1);
        t.vertexUV(x2, y1 + noZFightingOffset, iz0, iu0, iv1);
        t.vertexUV(x1, y1 + noZFightingOffset, iz0, iu0, iv0);
        t.vertexUV(x2, y1 + noZFightingOffset, iz1, iu1, iv0);
        t.vertexUV(x1, y1 + noZFightingOffset, iz1, iu1, iv1);
        t.vertexUV(x1, y1 + noZFightingOffset, iz0, iu0, iv1);
        t.vertexUV(x2, y1 + noZFightingOffset, iz0, iu0, iv0);
      }
      if (down || (y > 1 && level.isEmptyTile(x + 1, y - 1, z))) {
        t.vertexUV(x1, y0 - noZFightingOffset, iz1, iu1, iv0);
        t.vertexUV(x2, y0 - noZFightingOffset, iz1, iu1, iv1);
        t.vertexUV(x2, y0 - noZFightingOffset, iz0, iu0, iv1);
        t.vertexUV(x1, y0 - noZFightingOffset, iz0, iu0, iv0);
        t.vertexUV(x2, y0 - noZFightingOffset, iz1, iu1, iv0);
        t.vertexUV(x1, y0 - noZFightingOffset, iz1, iu1, iv1);
        t.vertexUV(x1, y0 - noZFightingOffset, iz0, iu0, iv1);
        t.vertexUV(x2, y0 - noZFightingOffset, iz0, iu0, iv0);
      }
    }
    if ((n && s) || (!w && !e && !n && !s)) {
      t.vertexUV(x1, y1, z2, u0, v0);
      t.vertexUV(x1, y0, z2, u0, v2);
      t.vertexUV(x1, y0, z0, u2, v2);
      t.vertexUV(x1, y1, z0, u2, v0);
      t.vertexUV(x1, y1, z0, u0, v0);
      t.vertexUV(x1, y0, z0, u0, v2);
      t.vertexUV(x1, y0, z2, u2, v2);
      t.vertexUV(x1, y1, z2, u2, v0);
      if (up) {
        t.vertexUV(ix1, y1, z2, iu1, iv2);
        t.vertexUV(ix1, y1, z0, iu1, iv0);
        t.vertexUV(ix0, y1, z0, iu0, iv0);
        t.vertexUV(ix0, y1, z2, iu0, iv2);
        t.vertexUV(ix1, y1, z0, iu1, iv2);
        t.vertexUV(ix1, y1, z2, iu1, iv0);
        t.vertexUV(ix0, y1, z2, iu0, iv0);
        t.vertexUV(ix0, y1, z0, iu0, iv2);
      } else {
        if (y < (depth - 1) && level.isEmptyTile(x, y + 1, z - 1)) {
          t.vertexUV(ix0, y1, z0, iu1, iv0);
          t.vertexUV(ix0, y1, z1, iu1, iv1);
          t.vertexUV(ix1, y1, z1, iu0, iv1);
          t.vertexUV(ix1, y1, z0, iu0, iv0);
          t.vertexUV(ix0, y1, z1, iu1, iv0);
          t.vertexUV(ix0, y1, z0, iu1, iv1);
          t.vertexUV(ix1, y1, z0, iu0, iv1);
          t.vertexUV(ix1, y1, z1, iu0, iv0);
        }
        if (y < (depth - 1) && level.isEmptyTile(x, y + 1, z + 1)) {
          t.vertexUV(ix0, y1, z1, iu0, iv1);
          t.vertexUV(ix0, y1, z2, iu0, iv2);
          t.vertexUV(ix1, y1, z2, iu1, iv2);
          t.vertexUV(ix1, y1, z1, iu1, iv1);
          t.vertexUV(ix0, y1, z2, iu0, iv1);
          t.vertexUV(ix0, y1, z1, iu0, iv2);
          t.vertexUV(ix1, y1, z1, iu1, iv2);
          t.vertexUV(ix1, y1, z2, iu1, iv1);
        }
      }
      if (down) {
        t.vertexUV(ix1, y0, z2, iu1, iv2);
        t.vertexUV(ix1, y0, z0, iu1, iv0);
        t.vertexUV(ix0, y0, z0, iu0, iv0);
        t.vertexUV(ix0, y0, z2, iu0, iv2);
        t.vertexUV(ix1, y0, z0, iu1, iv2);
        t.vertexUV(ix1, y0, z2, iu1, iv0);
        t.vertexUV(ix0, y0, z2, iu0, iv0);
        t.vertexUV(ix0, y0, z0, iu0, iv2);
      } else {
        if (y > 1 && level.isEmptyTile(x, y - 1, z - 1)) {
          t.vertexUV(ix0, y0, z0, iu1, iv0);
          t.vertexUV(ix0, y0, z1, iu1, iv1);
          t.vertexUV(ix1, y0, z1, iu0, iv1);
          t.vertexUV(ix1, y0, z0, iu0, iv0);
          t.vertexUV(ix0, y0, z1, iu1, iv0);
          t.vertexUV(ix0, y0, z0, iu1, iv1);
          t.vertexUV(ix1, y0, z0, iu0, iv1);
          t.vertexUV(ix1, y0, z1, iu0, iv0);
        }
        if (y > 1 && level.isEmptyTile(x, y - 1, z + 1)) {
          t.vertexUV(ix0, y0, z1, iu0, iv1);
          t.vertexUV(ix0, y0, z2, iu0, iv2);
          t.vertexUV(ix1, y0, z2, iu1, iv2);
          t.vertexUV(ix1, y0, z1, iu1, iv1);
          t.vertexUV(ix0, y0, z2, iu0, iv1);
          t.vertexUV(ix0, y0, z1, iu0, iv2);
          t.vertexUV(ix1, y0, z1, iu1, iv2);
          t.vertexUV(ix1, y0, z2, iu1, iv1);
        }
      }
    } else if (n && !s) {
      t.vertexUV(x1, y1, z0, u0, v0);
      t.vertexUV(x1, y0, z0, u0, v2);
      t.vertexUV(x1, y0, z1, u1, v2);
      t.vertexUV(x1, y1, z1, u1, v0);
      t.vertexUV(x1, y1, z1, u0, v0);
      t.vertexUV(x1, y0, z1, u0, v2);
      t.vertexUV(x1, y0, z0, u1, v2);
      t.vertexUV(x1, y1, z0, u1, v0);
      if (!e && !w) {
        t.vertexUV(ix0, y1, z1, iu0, iv0);
        t.vertexUV(ix0, y0, z1, iu0, iv2);
        t.vertexUV(ix1, y0, z1, iu1, iv2);
        t.vertexUV(ix1, y1, z1, iu1, iv0);
        t.vertexUV(ix1, y1, z1, iu0, iv0);
        t.vertexUV(ix1, y0, z1, iu0, iv2);
        t.vertexUV(ix0, y0, z1, iu1, iv2);
        t.vertexUV(ix0, y1, z1, iu1, iv0);
      }
      if (up || (y < (depth - 1) && level.isEmptyTile(x, y + 1, z - 1))) {
        t.vertexUV(ix0, y1, z0, iu1, iv0);
        t.vertexUV(ix0, y1, z1, iu1, iv1);
        t.vertexUV(ix1, y1, z1, iu0, iv1);
        t.vertexUV(ix1, y1, z0, iu0, iv0);
        t.vertexUV(ix0, y1, z1, iu1, iv0);
        t.vertexUV(ix0, y1, z0, iu1, iv1);
        t.vertexUV(ix1, y1, z0, iu0, iv1);
        t.vertexUV(ix1, y1, z1, iu0, iv0);
      }
      if (down || (y > 1 && level.isEmptyTile(x, y - 1, z - 1))) {
        t.vertexUV(ix0, y0, z0, iu1, iv0);
        t.vertexUV(ix0, y0, z1, iu1, iv1);
        t.vertexUV(ix1, y0, z1, iu0, iv1);
        t.vertexUV(ix1, y0, z0, iu0, iv0);
        t.vertexUV(ix0, y0, z1, iu1, iv0);
        t.vertexUV(ix0, y0, z0, iu1, iv1);
        t.vertexUV(ix1, y0, z0, iu0, iv1);
        t.vertexUV(ix1, y0, z1, iu0, iv0);
      }
    } else if (!n && s) {
      t.vertexUV(x1, y1, z1, u1, v0);
      t.vertexUV(x1, y0, z1, u1, v2);
      t.vertexUV(x1, y0, z2, u2, v2);
      t.vertexUV(x1, y1, z2, u2, v0);
      t.vertexUV(x1, y1, z2, u1, v0);
      t.vertexUV(x1, y0, z2, u1, v2);
      t.vertexUV(x1, y0, z1, u2, v2);
      t.vertexUV(x1, y1, z1, u2, v0);
      if (!e && !w) {
        t.vertexUV(ix1, y1, z1, iu0, iv0);
        t.vertexUV(ix1, y0, z1, iu0, iv2);
        t.vertexUV(ix0, y0, z1, iu1, iv2);
        t.vertexUV(ix0, y1, z1, iu1, iv0);
        t.vertexUV(ix0, y1, z1, iu0, iv0);
        t.vertexUV(ix0, y0, z1, iu0, iv2);
        t.vertexUV(ix1, y0, z1, iu1, iv2);
        t.vertexUV(ix1, y1, z1, iu1, iv0);
      }
      if (up || (y < (depth - 1) && level.isEmptyTile(x, y + 1, z + 1))) {
        t.vertexUV(ix0, y1, z1, iu0, iv1);
        t.vertexUV(ix0, y1, z2, iu0, iv2);
        t.vertexUV(ix1, y1, z2, iu1, iv2);
        t.vertexUV(ix1, y1, z1, iu1, iv1);
        t.vertexUV(ix0, y1, z2, iu0, iv1);
        t.vertexUV(ix0, y1, z1, iu0, iv2);
        t.vertexUV(ix1, y1, z1, iu1, iv2);
        t.vertexUV(ix1, y1, z2, iu1, iv1);
      }
      if (down || (y > 1 && level.isEmptyTile(x, y - 1, z + 1))) {
        t.vertexUV(ix0, y0, z1, iu0, iv1);
        t.vertexUV(ix0, y0, z2, iu0, iv2);
        t.vertexUV(ix1, y0, z2, iu1, iv2);
        t.vertexUV(ix1, y0, z1, iu1, iv1);
        t.vertexUV(ix0, y0, z2, iu0, iv1);
        t.vertexUV(ix0, y0, z1, iu0, iv2);
        t.vertexUV(ix1, y0, z1, iu1, iv2);
        t.vertexUV(ix1, y0, z2, iu1, iv1);
      }
    }
    return true;
  }

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
