// 1:1 移植自 src/world/level/tile/HeavyTile.h 与 HeavyTile.cpp（S11 阶段 A，部分移植）。
// 部分：checkSlide 里生成下落方块实体（FallingTile，计划外）的三句 DEFERRED(Entity)。instaFall 为真或周围区块不全时直接落到底，照常移植。
// C++ 的 getTickDelay(Level*) 是新增的重载，遮蔽了 Tile::getTickDelay()（与 BedTile::setShape 同一情况）：写成一个方法，按参数分派。
import type { Random } from '@mcpe/util';
import type { FallingTile } from '../../entity/item/FallingTile';
import type { Level } from '../Level';
import { Material } from '../material/Material';
import { Tile } from './Tile';

export class HeavyTile extends Tile {
  static instaFall = false;

  constructor(id: number, tex: number, material: Material = Material.sand) {
    super(id, tex, material);
  }

  override onPlace(level: Level, x: number, y: number, z: number): void {
    level.addToTickNextTick(x, y, z, this.id, this.getTickDelay(level));
  }

  override neighborChanged(level: Level, x: number, y: number, z: number, _type: number): void {
    level.addToTickNextTick(x, y, z, this.id, this.getTickDelay(level));
  }

  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (!level.isClientSide) {
      this.checkSlide(level, x, y, z);
    }
  }

  /** getTickDelay()（Tile 的版本）与 getTickDelay(Level*)（HeavyTile 新增，返回 2） */
  override getTickDelay(level?: Level): number {
    if (level === undefined) return super.getTickDelay();
    return 2;
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

  falling(_entity: FallingTile): void {}

  onLand(_level: Level, _xt: number, _yt: number, _zt: number, _data: number): void {}

  private checkSlide(level: Level, x: number, y: number, z: number): void {
    const x2 = x;
    const y2 = y;
    const z2 = z;
    if (HeavyTile.isFree(level, x2, y2 - 1, z2) && y2 >= 0) {
      const r = 32;
      if (HeavyTile.instaFall || !level.hasChunksAt(x - r, y - r, z - r, x + r, y + r, z + r)) {
        level.setTile(x, y, z, 0);
        while (HeavyTile.isFree(level, x, y - 1, z) && y > 0) y--;
        if (y > 0) {
          level.setTile(x, y, z, this.id);
        }
      } else if (!level.isClientSide) {
        // DEFERRED(Entity): FallingTile* e = new FallingTile(level, x + 0.5f, y + 0.5f, z + 0.5f, id, level->getData(x, y, z));
        // DEFERRED(Entity): falling(e);
        // DEFERRED(Entity): level->addEntity(e);
      }
    }
  }
}
