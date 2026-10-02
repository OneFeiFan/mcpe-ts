// 1:1 移植自 src/world/level/tile/LeafTile.h（S3）
import type { Random } from '@mcpe/util';
import { idOf } from '../../Unregistered';
import { FoliageColor } from '../FoliageColor';
import type { Level } from '../Level';
import type { LevelSource } from '../LevelSource';
import { Material } from '../material/Material';
import type { Player } from '../../entity/player/Player';
import { Item } from '../../item/Item';
import { ItemInstance } from '../../item/ItemInstance';
import { Tile } from './Tile';
import { TransparentTile } from './TransparentTile';

export class LeafTile extends TransparentTile {
  static readonly LEAF_TYPE_MASK = 3;
  static readonly REQUIRED_WOOD_RANGE = 4;
  static readonly PERSISTENT_LEAF_BIT = 8; // player-placed
  static readonly UPDATE_LEAF_BIT = 4;
  static readonly NORMAL_LEAF = 0;
  static readonly EVERGREEN_LEAF = 1;
  static readonly BIRCH_LEAF = 2;

  checkBuffer: Int32Array | null = null; //@todo Rewrite this?
  private oTex: number;

  constructor(id: number, tex: number) {
    super(id, tex, Material.leaves, false);
    this.oTex = tex;
    this.setTicking(true);
  }

  override getRenderLayer(): number {
    return this.isSolidRender() ? Tile.RENDERLAYER_OPAQUE : Tile.RENDERLAYER_ALPHATEST;
  }

  override getColor(level: LevelSource, x: number, y: number, z: number): number {
    const data = level.getData(x, y, z) & LeafTile.LEAF_TYPE_MASK;
    if (data === LeafTile.EVERGREEN_LEAF) {
      return FoliageColor.getEvergreenColor();
    }
    if (data === LeafTile.BIRCH_LEAF) {
      return FoliageColor.getBirchColor();
    }
    if (!FoliageColor.useTint) {
      return FoliageColor.getDefaultColor();
    }
    level.getBiomeSource().getBiomeBlock(x, z, 1, 1);
    const temperature = level.getBiomeSource().temperatures![0]!;
    const rainfall = level.getBiomeSource().downfalls![0]!;
    return FoliageColor.get(temperature, rainfall);
  }

  override onRemove(level: Level, x: number, y: number, z: number): void {
    const r = 1;
    const r2 = r + 1;
    if (level.hasChunksAt(x - r2, y - r2, z - r2, x + r2, y + r2, z + r2)) {
      for (let xo = -r; xo <= r; xo++)
        for (let yo = -r; yo <= r; yo++)
          for (let zo = -r; zo <= r; zo++) {
            const t = level.getTile(x + xo, y + yo, z + zo);
            if (t === Tile.leaves.id) {
              const currentData = level.getData(x + xo, y + yo, z + zo);
              level.setDataNoUpdate(x + xo, y + yo, z + zo, currentData | LeafTile.UPDATE_LEAF_BIT);
            }
          }
    }
  }

  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (level.isClientSide) return;
    const currentData = level.getData(x, y, z);
    if ((currentData & LeafTile.UPDATE_LEAF_BIT) !== 0 && (currentData & LeafTile.PERSISTENT_LEAF_BIT) === 0) {
      const r = LeafTile.REQUIRED_WOOD_RANGE;
      const r2 = r + 1;
      const W = 32;
      const WW = W * W;
      const WO = W / 2;
      if (!this.checkBuffer) {
        this.checkBuffer = new Int32Array(W * W * W);
      }
      const b = this.checkBuffer;
      if (level.hasChunksAt(x - r2, y - r2, z - r2, x + r2, y + r2, z + r2)) {
        const trunk = idOf(Tile.treeTrunk); // ADAPTED(DeferredTile): Tile::treeTrunk->id —— 未注册时没有原木，树叶都会腐烂
        for (let xo = -r; xo <= r; xo++)
          for (let yo = -r; yo <= r; yo++)
            for (let zo = -r; zo <= r; zo++) {
              const t = level.getTile(x + xo, y + yo, z + zo);
              if (t === trunk) {
                b[(xo + WO) * WW + (yo + WO) * W + (zo + WO)] = 0;
              } else if (t === Tile.leaves.id) {
                b[(xo + WO) * WW + (yo + WO) * W + (zo + WO)] = -2;
              } else {
                b[(xo + WO) * WW + (yo + WO) * W + (zo + WO)] = -1;
              }
            }
        for (let i = 1; i <= LeafTile.REQUIRED_WOOD_RANGE; i++) {
          for (let xo = -r; xo <= r; xo++)
            for (let yo = -r; yo <= r; yo++)
              for (let zo = -r; zo <= r; zo++) {
                if (b[(xo + WO) * WW + (yo + WO) * W + (zo + WO)] === i - 1) {
                  if (b[(xo + WO - 1) * WW + (yo + WO) * W + (zo + WO)] === -2) {
                    b[(xo + WO - 1) * WW + (yo + WO) * W + (zo + WO)] = i;
                  }
                  if (b[(xo + WO + 1) * WW + (yo + WO) * W + (zo + WO)] === -2) {
                    b[(xo + WO + 1) * WW + (yo + WO) * W + (zo + WO)] = i;
                  }
                  if (b[(xo + WO) * WW + (yo + WO - 1) * W + (zo + WO)] === -2) {
                    b[(xo + WO) * WW + (yo + WO - 1) * W + (zo + WO)] = i;
                  }
                  if (b[(xo + WO) * WW + (yo + WO + 1) * W + (zo + WO)] === -2) {
                    b[(xo + WO) * WW + (yo + WO + 1) * W + (zo + WO)] = i;
                  }
                  if (b[(xo + WO) * WW + (yo + WO) * W + (zo + WO - 1)] === -2) {
                    b[(xo + WO) * WW + (yo + WO) * W + (zo + WO - 1)] = i;
                  }
                  if (b[(xo + WO) * WW + (yo + WO) * W + (zo + WO + 1)] === -2) {
                    b[(xo + WO) * WW + (yo + WO) * W + (zo + WO + 1)] = i;
                  }
                }
              }
        }
      }
      const mid = b[WO * WW + WO * W + WO]!;
      if (mid >= 0) {
        level.setDataNoUpdate(x, y, z, currentData & ~LeafTile.UPDATE_LEAF_BIT);
      } else {
        this.die(level, x, y, z);
      }
    }
  }

  override playerDestroy(level: Level, player: Player, x: number, y: number, z: number, data: number): void {
    if (!level.isClientSide) {
      const item = player.inventory.getSelected();
      if (item && item.id === Item.shears.id) {
        this.popResource(level, x, y, z, new ItemInstance(Tile.leaves.id, 1, data & LeafTile.LEAF_TYPE_MASK));
        return;
      }
    }
    super.playerDestroy(level, player, x, y, z, data);
  }

  override getResourceCount(random: Random): number {
    return random.nextInt(20) === 0 ? 1 : 0;
  }

  override getResource(_data: number, _random: Random): number {
    return Tile.sapling.id; // 依赖未注册：sapling（S11 阶段 C 注册）
  }

  /** C++ 只重写带 odds 的 spawnResources（随机数调用与 C++ 相同） */
  override spawnResources(level: Level, x: number, y: number, z: number, data: number, _odds = 1): void {
    if (!level.isClientSide) {
      const chance = 20;
      if (level.random.nextInt(chance) === 0) {
        const type = this.getResource(data, level.random);
        this.popResource(level, x, y, z, new ItemInstance(type, 1, this.getSpawnResourcesAuxValue(data)));
      }
      if ((data & LeafTile.LEAF_TYPE_MASK) === LeafTile.NORMAL_LEAF && level.random.nextInt(200) === 0) {
        this.popResource(level, x, y, z, new ItemInstance(Item.apple, 1, 0));
      }
    }
  }

  override isSolidRender(): boolean {
    return !this.allowSame;
  }

  /** C++ getTexture(int face, int data) */
  override getTextureForData(_face: number, data: number): number {
    if ((data & LeafTile.LEAF_TYPE_MASK) === LeafTile.EVERGREEN_LEAF) {
      return this === Tile.leaves ? this.tex + 5 * 16 : this.tex - 16;
    }
    return this.tex;
  }

  setFancy(fancyGraphics: boolean): void {
    this.allowSame = fancyGraphics;
    this.tex = this.oTex + (fancyGraphics ? 0 : 1);
  }

  protected override getSpawnResourcesAuxValue(data: number): number {
    return data & LeafTile.LEAF_TYPE_MASK;
  }

  private die(level: Level, x: number, y: number, z: number): void {
    this.spawnResources(level, x, y, z, level.getData(x, y, z) & LeafTile.LEAF_TYPE_MASK, 0);
    level.setTile(x, y, z, 0);
  }
}
