// 1:1 移植自 src/world/level/tile/TntTile.h（S11 阶段 A；D4 接线完成）。
// D4：`wasExploded` / `destroy` 里生成 `PrimedTnt` 的语句接上了，全类已无 DEFERRED。
//
// 【wasExploded 那条随机数调用必须一起还原】`primed->life = level->random.nextInt(primed->life/4) + primed->life/8`
// 会消耗 `level->random` 一次 —— 少调一次，后面所有用到这个随机流的东西都会错位。
// 两个除法都是 **int / int**（C++ 向零截断），所以写 `Math.trunc`。
// 初值 80 → `nextInt(20) + 10`，也就是引信在 10..29 刻之间，不是固定的 80。
import type { Random } from '@mcpe/util';
import type { Player } from '../../entity/player/Player';
import { PrimedTnt } from '../../entity/item/PrimedTnt';
import { Item } from '../../item/Item';
import type { Level } from '../Level';
import { Material } from '../material/Material';
import { Tile } from './Tile';

const f = Math.fround;

export class TntTile extends Tile {
  private static readonly EXPLODE_BIT = 1;

  constructor(id: number, tex: number) {
    super(id, tex, Material.explosive);
  }

  /** C++ getTexture(int face) */
  override getTextureForFace(face: number): number {
    if (face === 0) return this.tex + 2;
    if (face === 1) return this.tex + 1;
    return this.tex;
  }

  override neighborChanged(level: Level, x: number, y: number, z: number, type: number): void {
    if (type > 0 && Tile.tiles[type]!.isSignalSource()) {
      if (level.hasNeighborSignal(x, y, z)) {
        this.destroy(level, x, y, z, TntTile.EXPLODE_BIT);
        level.setTile(x, y, z, 0);
      }
    }
  }

  override getResourceCount(_random: Random): number {
    return 1;
  }

  override wasExploded(level: Level, x: number, y: number, z: number): void {
    const primed = new PrimedTnt(level, f(x + f(0.5)), f(y + f(0.5)), f(z + f(0.5)));
    // ⚠ 两个除法都是 int/int（向零截断）；这次 nextInt 会消耗 level->random，必须照调
    primed.life = level.random.nextInt(Math.trunc(primed.life / 4)) + Math.trunc(primed.life / 8);
    level.addEntity(primed);
  }

  override destroy(level: Level, x: number, y: number, z: number, data: number): void {
    if (level.isClientSide) return;
    if ((data & TntTile.EXPLODE_BIT) === 1) {
      const tnt = new PrimedTnt(level, f(x + f(0.5)), f(y + f(0.5)), f(z + f(0.5)));
      level.addEntity(tnt);
      level.playSound(tnt, 'random.fuse', 1, f(1.0));
    }
  }

  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    const carried = player.getSelectedItem();
    if (carried && carried.id === Item.flintAndSteel.id) {
      carried.hurt(1);
      this.destroy(level, x, y, z, TntTile.EXPLODE_BIT);
      level.setTile(x, y, z, 0);
      return true;
    }
    return super.use(level, x, y, z, player);
  }
}
