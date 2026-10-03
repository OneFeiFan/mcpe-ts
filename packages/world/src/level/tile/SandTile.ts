// 1:1 移植自 src/world/level/tile/SandTile.h 与 SandTile.cpp（S11 阶段 A，部分移植）。
// 注意 C++ 的原样行为：onPlace、neighborChanged 是空函数，沙子只在随机刻（tick）时检查是否下落。
// 部分：生成下落方块实体（FallingTile，计划外）的两句 DEFERRED(Entity)。
import type { Random } from '@mcpe/util';
import type { Level } from '../Level';
import { Material } from '../material/Material';
import { Tile } from './Tile';

export class SandTile extends Tile {
  static instaFall = false;

  constructor(type: number, tex: number) {
    super(type, tex, Material.sand);
  }

  getEntityTypeId(): number {
    return 0; // @todo
  }

  override onPlace(_level: Level, _x: number, _y: number, _z: number): void {}

  override neighborChanged(
    _level: Level,
    _x: number,
    _y: number,
    _z: number,
    _type: number,
  ): void {}

  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    this.checkSlide(level, x, y, z);
  }

  override getTickDelay(): number {
    return 3;
  }

  static isFree(level: Level, x: number, y: number, z: number): boolean {
    const t = level.getTile(x, y, z);
    if (t === 0) return true;
    if (t === Tile.fire.id) return true;
    const material = Tile.tiles[t]!.material;
    if (material === Material.water) return true;
    if (material === Material.lava) return true;
    return false;
  }

  /*private*/
  private checkSlide(level: Level, x: number, y: number, z: number): void {
    const x2 = x;
    const y2 = y;
    const z2 = z;
    if (SandTile.isFree(level, x2, y2 - 1, z2) && y2 >= 0) {
      const r = 32;
      if (SandTile.instaFall || !level.hasChunksAt(x - r, y - r, z - r, x + r, y + r, z + r)) {
        level.setTile(x, y, z, 0);
        while (SandTile.isFree(level, x, y - 1, z) && y > 0) y--;
        if (y > 0) {
          level.setTile(x, y, z, this.id);
        }
      } else {
        // DEFERRED(Entity): FallingTile* e = new FallingTile(level, x + 0.5f, y + 0.5f, z + 0.5f, id);
        // DEFERRED(Entity): level->addEntity(e);
      }
    }
  }
}
