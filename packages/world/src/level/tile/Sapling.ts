/**
 * 1:1 移植自 src/world/level/tile/Sapling.h（S11 阶段 C，部分移植）。
 * growTree 用树木地物（SpruceFeature、BirchFeature、TreeFeature，doUpdate = true）——“地物生成”这一步起恢复。
 * C++ 的原样缺陷：random->nextInt(10) == 0 时 f 保持 NULL（原来的 BasicTree 被注释掉），随后 f->place 是空指针调用（崩溃）。
 *   这里不复刻崩溃，按“放置失败”处理（树苗原样放回），在注释里写明（ADAPTED(Cpp)，未定义行为不复刻）。
 */
import type { Random } from '@mcpe/util';
import type { Feature } from '../levelgen/feature/Feature';
import { BirchFeature } from '../levelgen/feature/BirchFeature';
import { SpruceFeature } from '../levelgen/feature/SpruceFeature';
import { TreeFeature } from '../levelgen/feature/TreeFeature';
import { Level } from '../Level';
import { Bush } from './Bush';
import { LeafTile } from './LeafTile';

export class Sapling extends Bush {
  private static readonly TYPE_MASK = 3;
  private static readonly AGE_BIT = 8;

  constructor(id: number, tex: number) {
    super(id, tex);
    const ss = 0.4;
    this.setShape(0.5 - ss, 0, 0.5 - ss, 0.5 + ss, ss * 2, 0.5 + ss);
  }

  override tick(level: Level, x: number, y: number, z: number, random: Random): void {
    if (level.isClientSide) return;
    super.tick(level, x, y, z, random);
    if (level.getRawBrightness(x, y + 1, z) >= Level.MAX_BRIGHTNESS - 6) {
      if (random.nextInt(7) === 0) {
        const data = level.getData(x, y, z);
        if ((data & Sapling.AGE_BIT) === 0) {
          level.setDataNoUpdate(x, y, z, data | Sapling.AGE_BIT);
        } else {
          this.growTree(level, x, y, z, random);
        }
      }
    }
  }

  /** C++ getTexture(int face, int data) */
  override getTextureForData(face: number, data: number): number {
    data = data & LeafTile.LEAF_TYPE_MASK;
    if (data === LeafTile.EVERGREEN_LEAF) {
      return 15 + 16 * 3;
    } else if (data === LeafTile.BIRCH_LEAF) {
      return 15 + 16 * 4;
    } else {
      return super.getTextureForData(face, data);
    }
  }

  growTree(level: Level, x: number, y: number, z: number, random: Random): void {
    const data = level.getData(x, y, z) & Sapling.TYPE_MASK;
    let feature: Feature | null = null; // Feature* f = NULL;
    let placed = false;
    const ox = 0;
    const oz = 0;
    const multiblock = false;
    if (data === LeafTile.EVERGREEN_LEAF) {
      feature = new SpruceFeature(true);
    } else if (data === LeafTile.BIRCH_LEAF) {
      feature = new BirchFeature(true);
    } else {
      if (random.nextInt(10) === 0) {
        // C++ 此处 f 保持 NULL（后面会空指针调用）
      } else {
        feature = new TreeFeature(true);
      }
    }
    if (multiblock) {
      level.setTileNoUpdate(x + ox, y, z + oz, 0);
      level.setTileNoUpdate(x + ox + 1, y, z + oz, 0);
      level.setTileNoUpdate(x + ox, y, z + oz + 1, 0);
      level.setTileNoUpdate(x + ox + 1, y, z + oz + 1, 0);
    } else {
      level.setTileNoUpdate(x, y, z, 0);
    }
    if (feature) placed = feature.place(level, random, x + ox, y, z + oz); // f 为 NULL 时 C++ 崩溃，这里当作放置失败
    if (!placed) {
      if (multiblock) {
        level.setTileAndDataNoUpdate(x + ox, y, z + oz, this.id, data);
        level.setTileAndDataNoUpdate(x + ox + 1, y, z + oz, this.id, data);
        level.setTileAndDataNoUpdate(x + ox, y, z + oz + 1, this.id, data);
        level.setTileAndDataNoUpdate(x + ox + 1, y, z + oz + 1, this.id, data);
      } else {
        level.setTileAndDataNoUpdate(x, y, z, this.id, data);
      }
    }
    placed = false;
  }

  isSapling(level: Level, x: number, y: number, z: number, type: number): boolean {
    return (
      level.getTile(x, y, z) === this.id && (level.getData(x, y, z) & Sapling.TYPE_MASK) === type
    );
  }

  protected override getSpawnResourcesAuxValue(data: number): number {
    return data & Sapling.TYPE_MASK;
  }
}
