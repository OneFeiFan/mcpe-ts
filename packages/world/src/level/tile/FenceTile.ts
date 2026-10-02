import { idOf } from '../../Unregistered';
import { Tile } from "./Tile";
import { Material } from "../material/Material";
import { AABB } from "../../phys/AABB";
import { Level } from "../Level";
import type { LevelSource } from "../LevelSource";

export class FenceTile extends Tile {

  /** C++ FenceTile::FenceTile(int id, int tex) */
  constructor(id: number, tex: number);
  /** C++ FenceTile::FenceTile(int id, int tex, const Material* material) */
  constructor(id: number, tex: number, material: Material);
  constructor(id: number, tex: number, material: Material = Material.wood) {
    super(id, tex, material);
  }

  /** C++ FenceTile::mayPlace(Level*, int, int, int) */
  override mayPlace(level: Level, x: number, y: number, z: number): boolean {
    return super.mayPlace(level, x, y, z);
  }

  /** C++ FenceTile::getAABB(Level*, int, int, int) */
  override getAABB(level: Level, x: number, y: number, z: number): AABB {
    const n = this.connectsTo(level, x, y, z - 1);
    const s = this.connectsTo(level, x, y, z + 1);
    const w = this.connectsTo(level, x - 1, y, z);
    const e = this.connectsTo(level, x + 1, y, z);

    let west = 6.0 / 16.0;
    let east = 10.0 / 16.0;
    let north = 6.0 / 16.0;
    let south = 10.0 / 16.0;

    if (n) north = 0;
    if (s) south = 1;
    if (w) west = 0;
    if (e) east = 1;

    // 复刻 C++ 的共享 tmpBB 语义：每次覆盖同一个对象并返回它
    this.tmpBB.set(
      x + west, y, z + north,
      x + east, y + 1.5, z + south,
    );
    return this.tmpBB;
  }

  /** C++ FenceTile::updateShape(LevelSource*, int, int, int) */
  override updateShape(level: LevelSource, x: number, y: number, z: number): void {
    const n = this.connectsTo(level, x, y, z - 1);
    const s = this.connectsTo(level, x, y, z + 1);
    const w = this.connectsTo(level, x - 1, y, z);
    const e = this.connectsTo(level, x + 1, y, z);

    let west = 6.0 / 16.0;
    let east = 10.0 / 16.0;
    let north = 6.0 / 16.0;
    let south = 10.0 / 16.0;

    if (n) north = 0;
    if (s) south = 1;
    if (w) west = 0;
    if (e) east = 1;

    this.setShape(west, 0, north, east, 1.0, south);
  }

  /** C++ FenceTile::blocksLight() */
  blocksLight(): boolean {
    return false;
  }

  /** C++ FenceTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ FenceTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ FenceTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_FENCE;
  }

  /** C++ FenceTile::connectsTo(LevelSource*, int, int, int) */
  connectsTo(level: LevelSource, x: number, y: number, z: number): boolean {
    const tile = level.getTile(x, y, z);
    if (tile === this.id || tile === idOf(Tile.fenceGate)) { // fenceGate 在 S12 注册（idOf 见 Unregistered.ts）
      return true;
    }
    const tileInstance = Tile.tiles[tile] ?? null;
    if (tileInstance !== null) {
      if (tileInstance.material.isSolidBlocking() && tileInstance.isCubeShaped()) {
        return tileInstance.material !== Material.vegetable;
      }
    }
    return false;
  }
}