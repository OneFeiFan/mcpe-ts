// 1:1 移植自 src/world/level/tile/HeavyTile.h 与 HeavyTile.cpp（S11 阶段 A；D2 接线完成）。
// D2：checkSlide 里生成下落方块实体（FallingTile）的三句接上了，全类已无 DEFERRED。
// C++ 的 getTickDelay(Level*) 是新增的重载，遮蔽了 Tile::getTickDelay()（与 BedTile::setShape 同一情况）：写成一个方法，按参数分派。
//
// 【为什么值导入 FallingTile 不会造成 ES 模块环】`Tile.ts` 对 HeavyTile 是 `import type`（运行时抹掉），
// 而 FallingTile → Entity → Tile 这条链上，Tile 里对 Entity 只有 `createItemEntity` 一个值导入 ——
// 那个环是**本来就有的**，靠 registerItemEntityClass 注入绕开（见 Entity.ts:22 的说明）。
import type { Random } from '@mcpe/util';
import { FallingTile } from '../../entity/item/FallingTile';
import type { Level } from '../Level';
import { Material } from '../material/Material';
import { Tile } from './Tile';

const f = Math.fround;

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

  /** C++ `virtual void HeavyTile::falling(FallingTile* entity)` —— 空函数，照抄 */
  falling(_entity: FallingTile): void {}

  /**
   * C++ `virtual void HeavyTile::onLand(Level*, int xt, int yt, int zt, int data)` —— 空函数。
   *
   * ⚠ **全 C++ 代码库里零调用方**：`rg onLand src/` 只命中 HeavyTile.h 的声明和 HeavyTile.cpp
   * 的定义本身。`FallingTile::tick` 落地那两个分支被原作者掏空之后，就再也没人调它了 ——
   * 这个虚函数是**死的**。照抄保留（子类将来可能覆盖它），但别以为它在跑。
   */
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
        // ⚠ 这里的 `id` 是 C++ 的裸名字（类作用域里等价于 this->id）；`x + 0.5f` 是 int 提升成
        // float 之后做的 float 加法，所以外面那层 f() 也要包上。
        const e = new FallingTile(
          level,
          f(x + f(0.5)),
          f(y + f(0.5)),
          f(z + f(0.5)),
          this.id,
          level.getData(x, y, z),
        );
        this.falling(e);
        level.addEntity(e);
      }
    }
  }
}
