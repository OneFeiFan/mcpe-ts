import { Bush } from './Bush';
import { Tile } from './Tile';
import { Level } from '../Level';
import { Item } from '../../item/Item';
import { ItemInstance } from '../../item/ItemInstance';
import { ItemEntity } from '../../entity/item/ItemEntity';
import type { Random } from '@mcpe/util';

export interface LevelSource {
  getData(x: number, y: number, z: number): number;
}

const MAX_BRIGHTNESS = 15;

export class CropTile extends Bush {
  /** C++ CropTile::CropTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex);
    this.tex = tex;
    this.setTicking(true);
    const ss = 0.5;
    this.setShape(0.5 - ss, 0, 0.5 - ss, 0.5 + ss, 0.25, 0.5 + ss);
  }

  /** C++ CropTile::tick(Level*, int, int, int, Random*) */
  override tick(level: Level, x: number, y: number, z: number, random: Random): void {
    super.tick(level, x, y, z, random);

    if (level.getRawBrightness(x, y, z) >= MAX_BRIGHTNESS - 6) {
      let age = level.getData(x, y, z);
      if (age < 7) {
        const growthSpeed = this.getGrowthSpeed(level, x, y, z);
        // C++: int(25 / growthSpeed) — 向零截断
        const bound = Math.trunc(25 / growthSpeed);
        if (random.nextInt(bound) === 0) {
          age++;
          level.setData(x, y, z, age);
        }
      }
    }
  }

  /** C++ CropTile::growCropsToMax(Level*, int, int, int) */
  growCropsToMax(level: Level, x: number, y: number, z: number): void {
    level.setData(x, y, z, 7);
  }

  /** C++ CropTile::getGrowthSpeed(Level*, int, int, int) — private */
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

  /** C++ CropTile::getTexture(LevelSource*, int, int, int, int) */
  override getTextureAt(
    level: LevelSource,
    x: number,
    y: number,
    z: number,
    _face: number,
  ): number {
    let data = level.getData(x, y, z);
    if (data < 0) data = 7;
    return this.tex + data;
  }

  /** C++ CropTile::getTexture(int face, int data) */
  override getTextureForData(_face: number, data: number): number {
    if (data < 0) data = 7;
    return this.tex + data;
  }

  /** C++ CropTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_ROWS;
  }

  /** C++ CropTile::spawnResources(Level*, int, int, int, int, float) */
  override spawnResources(
    level: Level,
    x: number,
    y: number,
    z: number,
    data: number,
    odds: number,
  ): void {
    super.spawnResources(level, x, y, z, data, odds);

    if (level.isClientSide) return;

    const count = 3;
    for (let i = 0; i < count; i++) {
      // 无论是否 continue，nextInt(15) 都恰好调用一次
      const r = level.random.nextInt(5 * 3);
      if (r > data) continue;

      const s = 0.7;
      const xo = level.random.nextFloat() * s + (1 - s) * 0.5;
      const yo = level.random.nextFloat() * s + (1 - s) * 0.5;
      const zo = level.random.nextFloat() * s + (1 - s) * 0.5;

      const item = new ItemEntity(
        level,
        x + xo,
        y + yo,
        z + zo,
        new ItemInstance(Item.seeds_wheat),
      );
      item.throwTime = 10;
      level.addEntity(item);
    }
  }

  /** C++ CropTile::getResource(int data, Random*) */
  override getResource(data: number, _random: Random): number {
    if (data === 7) return Item.wheat.id;
    return -1;
  }

  /** C++ CropTile::getResourceCount(Random*) */
  override getResourceCount(_random: Random): number {
    return 1;
  }

  /** C++ CropTile::mayPlaceOn(int tile) */
  override mayPlaceOn(tile: number): boolean {
    return tile === Tile.farmland.id;
  }
}
