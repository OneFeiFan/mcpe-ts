// 1:1 移植自 src/world/level/tile/ThinFenceTile.h
import { Tile } from './Tile';
import { Material } from '../material/Material';
import { AABB } from '../../phys/AABB';
import { Level } from '../Level';
import type { Random } from '@mcpe/util';
import type { LevelSource } from '../LevelSource';

export class ThinFenceTile extends Tile {
  private readonly edgeTexture: number;
  private readonly dropsResources: boolean;

  /** C++ ThinFenceTile::ThinFenceTile(int id, int tex, int edgeTex, const Material* material, bool dropsResources) */
  constructor(
    id: number,
    tex: number,
    edgeTex: number,
    material: Material,
    dropsResources: boolean,
  ) {
    super(id, tex, material);
    this.edgeTexture = edgeTex;
    this.dropsResources = dropsResources;
  }

  /** C++ ThinFenceTile::getResource(int data, Random* random) */
  override getResource(data: number, random: Random): number {
    if (!this.dropsResources) return 0;
    return super.getResource(data, random);
  }

  /** C++ ThinFenceTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ ThinFenceTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ ThinFenceTile::getRenderLayer() */
  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }

  /** C++ ThinFenceTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_IRON_FENCE;
  }

  /** C++ ThinFenceTile::shouldRenderFace(LevelSource*, int, int, int, int) */
  override shouldRenderFace(
    level: LevelSource,
    x: number,
    y: number,
    z: number,
    face: number,
  ): boolean {
    const id = level.getTile(x, y, z);
    if (id === this.id) return false;
    return super.shouldRenderFace(level, x, y, z, face);
  }

  /** C++ ThinFenceTile::addAABBs(Level*, int, int, int, const AABB*, std::vector<AABB>&) */
  override addAABBs(level: Level, x: number, y: number, z: number, box: AABB, boxes: AABB[]): void {
    const n = this.attachsTo(level.getTile(x, y, z - 1));
    const s = this.attachsTo(level.getTile(x, y, z + 1));
    const w = this.attachsTo(level.getTile(x - 1, y, z));
    const e = this.attachsTo(level.getTile(x + 1, y, z));

    // 第一组：东西方向（X 轴）
    if ((w && e) || (!w && !e && !n && !s)) {
      this.setShape(0, 0, 7 / 16, 1, 1, 9 / 16);
      super.addAABBs(level, x, y, z, box, boxes);
    } else if (w && !e) {
      this.setShape(0, 0, 7 / 16, 0.5, 1, 9 / 16);
      super.addAABBs(level, x, y, z, box, boxes);
    } else if (!w && e) {
      this.setShape(0.5, 0, 7 / 16, 1, 1, 9 / 16);
      super.addAABBs(level, x, y, z, box, boxes);
    }

    // 第二组：南北方向（Z 轴）
    if ((n && s) || (!w && !e && !n && !s)) {
      this.setShape(7 / 16, 0, 0, 9 / 16, 1, 1);
      super.addAABBs(level, x, y, z, box, boxes);
    } else if (n && !s) {
      this.setShape(7 / 16, 0, 0, 9 / 16, 1, 0.5);
      super.addAABBs(level, x, y, z, box, boxes);
    } else if (!n && s) {
      this.setShape(7 / 16, 0, 0.5, 9 / 16, 1, 1);
      super.addAABBs(level, x, y, z, box, boxes);
    }
  }

  /** C++ ThinFenceTile::updateDefaultShape() */
  override updateDefaultShape(): void {
    this.setShape(0, 0, 0, 1, 1, 1);
  }

  /** C++ ThinFenceTile::updateShape(LevelSource*, int, int, int) */
  override updateShape(level: LevelSource, x: number, y: number, z: number): void {
    let minX = 7 / 16;
    let maxX = 9 / 16;
    let minZ = 7 / 16;
    let maxZ = 9 / 16;

    const n = this.attachsTo(level.getTile(x, y, z - 1));
    const s = this.attachsTo(level.getTile(x, y, z + 1));
    const w = this.attachsTo(level.getTile(x - 1, y, z));
    const e = this.attachsTo(level.getTile(x + 1, y, z));

    if ((w && e) || (!w && !e && !n && !s)) {
      minX = 0;
      maxX = 1;
    } else if (w && !e) {
      minX = 0;
    } else if (!w && e) {
      maxX = 1;
    }

    if ((n && s) || (!w && !e && !n && !s)) {
      minZ = 0;
      maxZ = 1;
    } else if (n && !s) {
      minZ = 0;
    } else if (!n && s) {
      maxZ = 1;
    }

    this.setShape(minX, 0, minZ, maxX, 1, maxZ);
  }

  /** C++ ThinFenceTile::getEdgeTexture() */
  getEdgeTexture(): number {
    return this.edgeTexture;
  }

  /** C++ ThinFenceTile::attachsTo(int tile) */
  attachsTo(tile: number): boolean {
    return Tile.solid[tile] === true || tile === this.id || tile === Tile.glass.id;
  }
}
