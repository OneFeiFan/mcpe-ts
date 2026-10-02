// 1:1 移植自 src/world/level/tile/LiquidTile.h（S3）。C++ 里标注为 /*abstract*/，构造函数是 protected。
import { Mth, type Random } from '@mcpe/util';
import type { AABB } from '../../phys/AABB';
import { Vec3 } from '../../phys/Vec3';
import type { Level } from '../Level';
import type { LevelSource } from '../LevelSource';
import { Material } from '../material/Material';
import type { Entity } from '../../entity/Entity';
import { Tile } from './Tile';

export class LiquidTile extends Tile {
  static getHeight(d: number): number {
    if (d >= 8) d = 0;
    const h = (d + 1) / 9.0;
    return h;
  }

  /** C++ getTexture(int face) */
  override getTextureForFace(face: number): number {
    if (face === 0 || face === 1) {
      return this.tex;
    } else {
      return this.tex + 1;
    }
  }

  override isCubeShaped(): boolean {
    return false;
  }

  override isSolidRender(): boolean {
    return false;
  }

  /** C++ mayPick(int data, bool liquid) */
  override mayPickWithData(data: number, liquid: boolean): boolean {
    return liquid && data === 0;
  }

  override shouldRenderFace(level: LevelSource, x: number, y: number, z: number, face: number): boolean {
    const m = level.getMaterial(x, y, z);
    if (m === this.material) return false;
    if (m === Material.ice) return false;
    if (face === 1) return true;
    return super.shouldRenderFace(level, x, y, z, face);
  }

  override getAABB(_level: Level, _x: number, _y: number, _z: number): AABB | null {
    return null;
  }

  override getRenderShape(): number {
    return Tile.SHAPE_WATER;
  }

  override getResource(_data: number, _random: Random): number {
    return 0;
  }

  override getResourceCount(_random: Random): number {
    return 0;
  }

  override getColor(_level: LevelSource, _x: number, _y: number, _z: number): number {
    return 0x999999ff | 0; // C++ 的 int：超过 INT_MAX，回绕成负数
  }

  override handleEntityInside(level: Level, x: number, y: number, z: number, _e: Entity, current: Vec3): void {
    const flow = this.getFlow(level, x, y, z);
    current.x += flow.x * 0.5;
    current.y += flow.y * 0.5;
    current.z += flow.z * 0.5;
  }

  override getTickDelay(): number {
    if (this.material === Material.water) return 5;
    if (this.material === Material.lava) return 30;
    return 0;
  }

  override getBrightness(level: LevelSource, x: number, y: number, z: number): number {
    const a = level.getBrightness(x, y, z);
    const b = level.getBrightness(x, y + 1, z);
    return a > b ? a : b;
  }

  override tick(level: Level, x: number, y: number, z: number, random: Random): void {
    super.tick(level, x, y, z, random);
  }

  override getRenderLayer(): number {
    return this.material === Material.water ? Tile.RENDERLAYER_BLEND : Tile.RENDERLAYER_OPAQUE;
  }

  override animateTick(level: Level, x: number, y: number, z: number, random: Random): void {
    if (this.material === Material.water && random.nextInt(64) === 0) {
      const d = level.getData(x, y, z);
      if (d > 0 && d < 8) {
        // C++ 这里是空的（原本播放水声）
      }
    }
    if (this.material === Material.lava) {
      if (level.getMaterial(x, y + 1, z) === Material.air && !level.isSolidRenderTile(x, y + 1, z)) {
        if (random.nextInt(100) === 0) {
          const xx = x + random.nextFloat();
          const yy = y + this.yy1;
          const zz = z + random.nextFloat();
          // PARTICLETYPE(lava) 是逗号表达式 (ParticleType::lava, "lava")，实际传的是字符串
          level.addParticle('lava', xx, yy, zz, 0, 0, 0);
        }
      }
    }
  }

  static getSlopeAngle(level: LevelSource, x: number, y: number, z: number, m: Material): number {
    let flow = new Vec3();
    if (m === Material.water) flow = (Tile.water as LiquidTile).getFlow(level, x, y, z);
    if (m === Material.lava) flow = (Tile.lava as LiquidTile).getFlow(level, x, y, z);
    if (flow.x === 0 && flow.z === 0) return -1000;
    return Math.atan2(flow.z, flow.x) - Mth.PI * 0.5; // C 库的 atan2，不是 Mth::atan2
  }

  override onPlace(level: Level, x: number, y: number, z: number): void {
    this.updateLiquid(level, x, y, z);
  }

  override neighborChanged(level: Level, x: number, y: number, z: number, _type: number): void {
    this.updateLiquid(level, x, y, z);
  }

  protected constructor(id: number, material: Material) {
    super(id, (material === Material.lava ? 14 : 12) * 16 + 13, material);
    const yo = 0;
    const e = 0;
    this.setShape(0 + e, 0 + yo, 0 + e, 1 + e, 1 + yo, 1 + e);
    this.setTicking(true);
  }

  protected fizz(level: Level, x: number, y: number, z: number): void {
    for (let i = 0; i < 8; i++) {
      level.addParticle('largesmoke', x + Mth.random(), y + 1.2, z + Mth.random(), 0, 0, 0);
    }
  }

  protected getDepth(level: Level, x: number, y: number, z: number): number {
    if (level.getMaterial(x, y, z) !== this.material) return -1;
    else return level.getData(x, y, z);
  }

  protected getRenderedDepth(level: LevelSource, x: number, y: number, z: number): number {
    if (level.getMaterial(x, y, z) !== this.material) return -1;
    let d = level.getData(x, y, z);
    if (d >= 8) d = 0;
    return d;
  }

  private updateLiquid(level: Level, x: number, y: number, z: number): void {
    if (level.getTile(x, y, z) !== this.id) return;
    if (this.material === Material.lava) {
      let water = false;
      if (water || level.getMaterial(x, y, z - 1) === Material.water) water = true;
      if (water || level.getMaterial(x, y, z + 1) === Material.water) water = true;
      if (water || level.getMaterial(x - 1, y, z) === Material.water) water = true;
      if (water || level.getMaterial(x + 1, y, z) === Material.water) water = true;
      if (water || level.getMaterial(x, y + 1, z) === Material.water) water = true;
      if (water) {
        const data = level.getData(x, y, z);
        if (data === 0) {
          level.setTile(x, y, z, Tile.obsidian.id); // 依赖未注册：obsidian（熔岩源遇水时）
        } else if (data <= 4) {
          level.setTile(x, y, z, Tile.stoneBrick.id);
        }
        this.fizz(level, x, y, z);
      }
    }
  }

  private getFlow(level: LevelSource, x: number, y: number, z: number): Vec3 {
    let flow = new Vec3(0, 0, 0);
    const mid = this.getRenderedDepth(level, x, y, z);
    for (let d = 0; d < 4; d++) {
      let xt = x;
      const yt = y;
      let zt = z;
      if (d === 0) xt--;
      if (d === 1) zt--;
      if (d === 2) xt++;
      if (d === 3) zt++;
      let t = this.getRenderedDepth(level, xt, yt, zt);
      if (t < 0) {
        if (!level.getMaterial(xt, yt, zt).blocksMotion()) {
          t = this.getRenderedDepth(level, xt, yt - 1, zt);
          if (t >= 0) {
            const dir = t - (mid - 8);
            flow = flow.add((xt - x) * dir, (yt - y) * dir, (zt - z) * dir);
          }
        }
      } else {
        if (t >= 0) {
          const dir = t - mid;
          flow = flow.add((xt - x) * dir, (yt - y) * dir, (zt - z) * dir);
        }
      }
    }
    if (level.getData(x, y, z) >= 8) {
      let ok = false;
      if (ok || this.shouldRenderFace(level, x, y, z - 1, 2)) ok = true;
      if (ok || this.shouldRenderFace(level, x, y, z + 1, 3)) ok = true;
      if (ok || this.shouldRenderFace(level, x - 1, y, z, 4)) ok = true;
      if (ok || this.shouldRenderFace(level, x + 1, y, z, 5)) ok = true;
      if (ok || this.shouldRenderFace(level, x, y + 1, z - 1, 2)) ok = true;
      if (ok || this.shouldRenderFace(level, x, y + 1, z + 1, 3)) ok = true;
      if (ok || this.shouldRenderFace(level, x - 1, y + 1, z, 4)) ok = true;
      if (ok || this.shouldRenderFace(level, x + 1, y + 1, z, 5)) ok = true;
      if (ok) flow = flow.normalized().add(0, -6, 0);
    }
    flow = flow.normalized();
    return flow;
  }
}
