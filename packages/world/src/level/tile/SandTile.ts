// 1:1 移植自 src/world/level/tile/SandTile.h 与 SandTile.cpp（S11 阶段 A；D2 接线完成）。
//
// 【⚠⚠ 这个类是**死代码** —— 游戏里的沙子不是它】D2 实测出来的，别被类名骗了：
//   - `Tile.cpp:173` 是 `sand = (new HeavyTile(12, 18))->init()...` —— **id 12 的沙子是 HeavyTile**。
//   - 全参考源码里 `class SandTile: public Tile` 这个类**一处都没被实例化**
//     （`rg SandTile src/` 只命中 SandTile.h/.cpp 自己，还有 Tile.cpp 里一行注释掉的 `hellSand`）。
//   - 真正 `public HeavyTile` 的子类只有 `GravelTile`。
//   所以：**沙子会自己掉**（放下去 / 邻居变了就排一刻，见 HeavyTile），不是"只在随机刻检查"。
//   这个类照原样移植、照原样接线（1:1 的规矩），但**别指望它在世界里跑起来** ——
//   它连不进 `Tile::initTiles`。当初写这段时以为"沙子只在随机刻下落"，是**错的**，
//   是浏览器场景里"放一格沙子居然排了一刻"这个实测把它揪出来的。
//
// 【它是独立的拷贝，不是 HeavyTile 的子类】`class SandTile: public Tile`；
// checkSlide 那段在 C++ 里就是抄了两遍的（SandTile.cpp 里类名被混淆成了 `n`）。
// 所以这边接线的两句也和 HeavyTile 不同：
//   HeavyTile： new FallingTile(…, id, level->getData(x, y, z)); falling(e); addEntity(e);
//   SandTile：  new FallingTile(…, id);                          addEntity(e);
// 即：**不传 data**（走默认值 0）、**不调 falling(e)**、**没有 `else if (!isClientSide)` 守卫**。
// 照抄，别"统一"成 HeavyTile 的写法。
import type { Random } from '@mcpe/util';
import { FallingTile } from '../../entity/item/FallingTile';
import type { Level } from '../Level';
import { Material } from '../material/Material';
import { Tile } from './Tile';

const f = Math.fround;

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
        // ⚠ 与 HeavyTile 的三句不同：不传 data（默认 0）、不调 falling()、外面没有 isClientSide 守卫。
        // 见文件头，这是两处独立拷贝的原样差异，不是漏抄。
        const e = new FallingTile(level, f(x + f(0.5)), f(y + f(0.5)), f(z + f(0.5)), this.id);
        level.addEntity(e);
      }
    }
  }
}
