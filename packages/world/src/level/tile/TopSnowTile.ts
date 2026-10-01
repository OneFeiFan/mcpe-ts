// 1:1 移植自 src/world/level/tile/TopSnowTile.h（S3）。
// 必须注册：Tile.shouldRenderFace 会读 Tile.topSnow.id（方块上面还有方块时，渲染它的顶面就会走到）。
// 生成掉落物的 playerDestroy 本轮 OMIT；tick 与 checkCanSurvive 里调用 spawnResources 的两句 DEFERRED(Entity)。
import type { Random } from '@mcpe/util';
import { Item } from '../../item/Item';
import type { AABB } from '../../phys/AABB';
import type { Level } from '../Level';
import type { LevelSource } from '../LevelSource';
import { LightLayer } from '../LightLayer';
import { Material } from '../material/Material';
import { Tile } from './Tile';

export class TopSnowTile extends Tile {
  constructor(id: number, tex: number) {
    super(id, tex, Material.topSnow);
    this.setShape(0, 0, 0, 1, 1 / 8.0, 1);
    this.setTicking(true);
  }

  override getAABB(_level: Level, _x: number, _y: number, _z: number): AABB | null {
    return null;
  }

  /** C++ 在这里新增的非 virtual 方法 */
  blocksLight(): boolean {
    return false;
  }

  override isSolidRender(): boolean {
    return false;
  }

  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ mayPlace(Level* level, int x, int y, int z) */
  override mayPlace$4(level: Level, x: number, y: number, z: number): boolean {
    const t = level.getTile(x, y - 1, z);
    if (t === 0 || !Tile.tiles[t]!.isSolidRender()) return false;
    return level.getMaterial(x, y - 1, z).blocksMotion();
  }

  override neighborChanged(level: Level, x: number, y: number, z: number, _type: number): void {
    this.checkCanSurvive(level, x, y, z);
  }

  // OMIT(Player): playerDestroy(level, player, x, y, z, data)  TopSnowTile.h:49

  override getResource(_data: number, _random: Random): number {
    return Item.snowBall.id; // 依赖未注册：Item.snowBall（只被已 OMIT 的 spawnResources 调用）
  }

  override getResourceCount(_random: Random): number {
    return 0;
  }

  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (level.getBrightness(LightLayer.Block, x, y, z) > 11) {
      // DEFERRED(Entity): this->spawnResources(level, x, y, z, level->getData(x, y, z));
      level.setTile(x, y, z, 0);
    }
  }

  override shouldRenderFace(level: LevelSource, x: number, y: number, z: number, face: number): boolean {
    const m = level.getMaterial(x, y, z);
    if (face === 1) return true;
    if (m === this.material) return false;
    return super.shouldRenderFace(level, x, y, z, face);
  }

  private checkCanSurvive(level: Level, x: number, y: number, z: number): boolean {
    if (!this.mayPlace(level, x, y, z)) {
      // DEFERRED(Entity): this->spawnResources(level, x, y, z, level->getData(x, y, z));
      level.setTile(x, y, z, 0);
      return false;
    }
    return true;
  }
}
