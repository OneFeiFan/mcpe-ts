/**
 * 1:1 移植自 src/world/level/levelgen/feature/LakeFeature.h：16×8×16 网格里随机叠 4–7 个椭球，下半部分填液体、上半部分挖空；
 * 四周不封闭（上半碰到液体、下半碰到非实心）就放弃；岩浆湖四周的实心方块换成石头。
 * 浮点：xr、yr、zr、xp、yp、zp 与 xd、yd、zd 都是 float，逐步 Math.fround。
 */
import type { Random } from '@mcpe/util';
import type { Level } from '../../Level';
import { LightLayer } from '../../LightLayer';
import { Material } from '../../material/Material';
import { Tile } from '../../tile/Tile';
import { Feature } from './Feature';

const f = Math.fround;

export class LakeFeature extends Feature {
  private tile: number;

  constructor(tile: number) {
    super();
    this.tile = tile;
  }

  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    x -= 8;
    z -= 8;
    while (y > 0 && level.isEmptyTile(x, y, z)) y--;
    y -= 4;
    const size = 16 * 16 * 8;
    const grid = new Array<boolean>(size).fill(false);
    const at = (xx: number, zz: number, yy: number): boolean => grid[(xx * 16 + zz) * 8 + yy]!;
    const spots = random.nextInt(4) + 4;
    for (let i = 0; i < spots; i++) {
      const xr = f(f(random.nextFloat() * 6) + 3);
      const yr = f(f(random.nextFloat() * 4) + 2);
      const zr = f(f(random.nextFloat() * 6) + 3);
      const xp = f(f(f(random.nextFloat() * f(f(16 - xr) - 2)) + 1) + f(xr / 2));
      const yp = f(f(f(random.nextFloat() * f(f(8 - yr) - 4)) + 2) + f(yr / 2));
      const zp = f(f(f(random.nextFloat() * f(f(16 - zr) - 2)) + 1) + f(zr / 2));
      for (let xx = 1; xx < 15; xx++) {
        for (let zz = 1; zz < 15; zz++) {
          for (let yy = 1; yy < 7; yy++) {
            const xd = f(f(xx - xp) / f(xr / 2));
            const yd = f(f(yy - yp) / f(yr / 2));
            const zd = f(f(zz - zp) / f(zr / 2));
            const d = f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd));
            if (d < 1) grid[(xx * 16 + zz) * 8 + yy] = true;
          }
        }
      }
    }
    const isEdge = (xx: number, zz: number, yy: number): boolean =>
      !at(xx, zz, yy) &&
      ((xx < 15 && at(xx + 1, zz, yy)) ||
        (xx > 0 && at(xx - 1, zz, yy)) ||
        (zz < 15 && at(xx, zz + 1, yy)) ||
        (zz > 0 && at(xx, zz - 1, yy)) ||
        (yy < 7 && at(xx, zz, yy + 1)) ||
        (yy > 0 && at(xx, zz, yy - 1)));
    for (let xx = 0; xx < 16; xx++) {
      for (let zz = 0; zz < 16; zz++) {
        for (let yy = 0; yy < 8; yy++) {
          if (isEdge(xx, zz, yy)) {
            const m = level.getMaterial(x + xx, y + yy, z + zz);
            if (yy >= 4 && m.isLiquid()) return false;
            if (yy < 4 && !m.isSolid() && level.getTile(x + xx, y + yy, z + zz) !== this.tile)
              return false;
          }
        }
      }
    }
    for (let xx = 0; xx < 16; xx++) {
      for (let zz = 0; zz < 16; zz++) {
        for (let yy = 0; yy < 8; yy++) {
          if (at(xx, zz, yy)) {
            level.setTileNoUpdate(x + xx, y + yy, z + zz, yy >= 4 ? 0 : this.tile);
          }
        }
      }
    }
    for (let xx = 0; xx < 16; xx++) {
      for (let zz = 0; zz < 16; zz++) {
        for (let yy = 4; yy < 8; yy++) {
          if (at(xx, zz, yy)) {
            if (
              level.getTile(x + xx, y + yy - 1, z + zz) === Tile.dirt.id &&
              level.getBrightness(LightLayer.Sky, x + xx, y + yy, z + zz) > 0
            ) {
              level.setTileNoUpdate(x + xx, y + yy - 1, z + zz, Tile.grass.id);
            }
          }
        }
      }
    }
    if (Tile.tiles[this.tile]!.material === Material.lava) {
      for (let xx = 0; xx < 16; xx++) {
        for (let zz = 0; zz < 16; zz++) {
          for (let yy = 0; yy < 8; yy++) {
            if (isEdge(xx, zz, yy)) {
              if (
                (yy < 4 || random.nextInt(2) !== 0) &&
                level.getMaterial(x + xx, y + yy, z + zz).isSolid()
              ) {
                level.setTileNoUpdate(x + xx, y + yy, z + zz, Tile.rock.id);
              }
            }
          }
        }
      }
    }
    return true;
  }
}
