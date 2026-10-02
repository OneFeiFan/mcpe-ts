import { Bush } from "./Bush";
import { Tile } from "./Tile";
import { Level } from "../Level";
import { Item } from "../../item/Item";
import { ItemInstance } from "../../item/ItemInstance";
import type { Random } from "@mcpe/util";
import type { LevelSource } from "../LevelSource";

export class StemTile extends Bush {
  private readonly fruit: Tile;

  /** C++ StemTile::StemTile(int id, Tile* fruit) */
  constructor(id: number, fruit: Tile) {
    super(id, 15 + 6 * 16);
    this.fruit = fruit;
    this.setTicking(true);
    const ss = 0.125;
    this.setShape(0.5 - ss, 0, 0.5 - ss, 0.5 + ss, 0.25, 0.5 + ss);
  }

  /** C++ StemTile::mayPlaceOn(int tile) */
  override mayPlaceOn(tile: number): boolean {
    return tile === Tile.farmland.id;
  }

  /** C++ StemTile::tick(Level*, int, int, int, Random*) */
  override tick(level: Level, x: number, y: number, z: number, random: Random): void {
    super.tick(level, x, y, z, random);

    if (level.getRawBrightness(x, y + 1, z) >= Level.MAX_BRIGHTNESS - 6) {
      const growthSpeed = this.getGrowthSpeed(level, x, y, z);
      // C++: (int)(25 / growthSpeed) + 1 —— 注意 +1 在截断之后
      const bound = Math.trunc(25 / growthSpeed) + 1;

      if (random.nextInt(bound) === 0) {
        let age = level.getData(x, y, z);
        if (age < 7) {
          age++;
          level.setData(x, y, z, age);
        } else {
          // 相邻已有果实则直接返回，不再消耗 RNG
          if (level.getTile(x - 1, y, z) === this.fruit.id) return;
          if (level.getTile(x + 1, y, z) === this.fruit.id) return;
          if (level.getTile(x, y, z - 1) === this.fruit.id) return;
          if (level.getTile(x, y, z + 1) === this.fruit.id) return;

          for (let a = 0; a < 4; ++a) {
            const dir = a;   // C++ 里 random->nextInt(4) 被注释掉了
            let xx = x;
            let zz = z;
            if (dir === 0) xx--;
            if (dir === 1) xx++;
            if (dir === 2) zz--;
            if (dir === 3) zz++;

            const below = level.getTile(xx, y - 1, zz);
            if (
              level.getTile(xx, y, zz) === 0 &&
              (below === Tile.farmland.id ||
               below === Tile.dirt.id ||
               below === Tile.grass.id)
            ) {
              level.setTile(xx, y, zz, this.fruit.id);
              break;
            }
          }
        }
      }
    }
  }

  /** C++ StemTile::growCropsToMax(Level*, int, int, int) */
  growCropsToMax(level: Level, x: number, y: number, z: number): void {
    level.setData(x, y, z, 7);
  }

  /** C++ StemTile::getGrowthSpeed(Level*, int, int, int) */
  private getGrowthSpeed(level: Level, x: number, y: number, z: number): number {
    let speed = 1;

    const n = level.getTile(x, y, z - 1);
    const s = level.getTile(x, y, z + 1);
    const w = level.getTile(x - 1, y, z);
    const e = level.getTile(x + 1, y, z);

    const d0 = level.getTile(x - 1, y, z - 1);
    const d1 = level.getTile(x + 1, y, z - 1);
    const d2 = level.getTile(x + 1, y, z + 1);
    const d3 = level.getTile(x - 1, y, z + 1);

    const horizontal = w === this.id || e === this.id;
    const vertical = n === this.id || s === this.id;
    const diagonal = d0 === this.id || d1 === this.id || d2 === this.id || d3 === this.id;

    for (let xx = x - 1; xx <= x + 1; xx++) {
      for (let zz = z - 1; zz <= z + 1; zz++) {
        const t = level.getTile(xx, y - 1, zz);

        let tileSpeed = 0;
        if (t === Tile.farmland.id) {
          tileSpeed = 1;
          if (level.getData(xx, y - 1, zz) > 0) tileSpeed = 3;
        }

        if (xx !== x || zz !== z) tileSpeed /= 4;

        speed += tileSpeed;
      }
    }

    if (diagonal || (horizontal && vertical)) speed /= 2;

    return speed;
  }

  /** C++ StemTile::getColor(int data) */
  getColorByData(data: number): number {
    const r = data * 32;
    const g = 255 - data * 8;
    const b = data * 4;
    return (r << 16) | (g << 8) | b;
  }

  /** C++ StemTile::getColor(LevelSource*, int, int, int) */
  getColorByLevel(level: LevelSource, x: number, y: number, z: number): number {
    return this.getColorByData(level.getData(x, y, z));
  }

  /** C++ StemTile::getTexture(int face, int data) */
  override getTextureForData(_face: number, _data: number): number {
    return this.tex;
  }

  /** C++ StemTile::updateDefaultShape() */
  override updateDefaultShape(): void {
    const ss = 0.125;
    this.setShape(0.5 - ss, 0, 0.5 - ss, 0.5 + ss, 0.25, 0.5 + ss);
  }

  /** C++ StemTile::updateShape(LevelSource*, int, int, int) */
  override updateShape(level: LevelSource, x: number, y: number, z: number): void {
    // yy1 是父类 Tile 的成员字段，表示 shape 的 y 上界
    this.yy1 = (level.getData(x, y, z) * 2 + 2) / 16.0;
    const ss = 0.125;
    this.setShape(0.5 - ss, 0, 0.5 - ss, 0.5 + ss, this.yy1, 0.5 + ss);
  }

  /** C++ StemTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_STEM;
  }

  /** C++ StemTile::getConnectDir(LevelSource*, int, int, int) */
  getConnectDir(level: LevelSource, x: number, y: number, z: number): number {
    const d = level.getData(x, y, z);
    if (d < 7) return -1;
    if (level.getTile(x - 1, y, z) === this.fruit.id) return 0;
    if (level.getTile(x + 1, y, z) === this.fruit.id) return 1;
    if (level.getTile(x, y, z - 1) === this.fruit.id) return 2;
    if (level.getTile(x, y, z + 1) === this.fruit.id) return 3;
    return -1;
  }

  /** C++ StemTile::spawnResources(Level*, int, int, int, int, float) */
  override spawnResources(
    level: Level,
    x: number, y: number, z: number,
    data: number, odds: number,
  ): void {
    super.spawnResources(level, x, y, z, data, odds);

    if (level.isClientSide) return;

    // C++ 里 pumpkin 分支被注释掉了，只有 melon 会赋值 seed。
    // 如果 fruit 既不是 pumpkin 也不是 melon，seed 为 null，
    // new ItemInstance(null) 会抛 TypeError（C++ 是解引用 NULL 崩溃）。
    let seed: Item | null = null;
    // if (this.fruit === Tile.pumpkin) seed = Item.seeds_pumpkin;
    if (this.fruit === Tile.melon) seed = Item.seeds_melon;

    for (let i = 0; i < 3; i++) {
      // 无论是否 continue，nextInt(15) 都恰好调用一次
      if (level.random.nextInt(5 * 3) > data) continue;
      this.popResource(level, x, y, z, new ItemInstance(seed!));
    }
  }

  /** C++ StemTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return -1;
  }

  /** C++ StemTile::getResourceCount(Random* random) */
  override getResourceCount(_random: Random): number {
    return 1;
  }
}