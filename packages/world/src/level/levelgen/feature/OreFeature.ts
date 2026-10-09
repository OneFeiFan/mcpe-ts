/**
 * 1:1 移植自 src/world/level/levelgen/feature/OreFeature.h：沿一条随机方向的线段放一串椭球，只替换石头。
 * 用的是 Mth::sin / Mth::cos（查表的 float 版本）。`Mth::sin(dir) * count / 8` 是 float × int / int（float 运算）。
 */
import { Mth, type Random } from '@mcpe/util';
import type { Level } from '../../Level';
import { Tile } from '../../tile/Tile';
import { Feature } from './Feature';

const f = Math.fround;

export class OreFeature extends Feature {
  private tile: number;
  private count: number;

  constructor(tile: number, count: number) {
    super();
    this.tile = tile;
    this.count = count;
  }

  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    const count = this.count;
    const dir = f(random.nextFloat() * Mth.PI);
    const x0 = f(f(x + 8) + f(f(Mth.sin(dir) * count) / 8));
    const x1 = f(f(x + 8) - f(f(Mth.sin(dir) * count) / 8));
    const z0 = f(f(z + 8) + f(f(Mth.cos(dir) * count) / 8));
    const z1 = f(f(z + 8) - f(f(Mth.cos(dir) * count) / 8));
    const y0 = f(y + random.nextInt(3) + 2);
    const y1 = f(y + random.nextInt(3) + 2);
    for (let D = 0; D <= count; D++) {
      const d = f(D);
      const xx = f(x0 + f(f(f(x1 - x0) * d) / count));
      const yy = f(y0 + f(f(f(y1 - y0) * d) / count));
      const zz = f(z0 + f(f(f(z1 - z0) * d) / count));
      const ss = f(f(random.nextFloat() * count) / 16);
      const r = f(f(f(Mth.sin(f(f(d * Mth.PI) / count)) + 1) * ss) + 1);
      const hr = f(f(f(Mth.sin(f(f(d * Mth.PI) / count)) + 1) * ss) + 1);
      const xt0 = Math.trunc(f(xx - f(r / 2)));
      const yt0 = Math.trunc(f(yy - f(hr / 2)));
      const zt0 = Math.trunc(f(zz - f(r / 2)));
      const xt1 = Math.trunc(f(xx + f(r / 2)));
      const yt1 = Math.trunc(f(yy + f(hr / 2)));
      const zt1 = Math.trunc(f(zz + f(r / 2)));
      for (let x2 = xt0; x2 <= xt1; x2++) {
        const xd = f(f(f(x2 + f(0.5)) - xx) / f(r / 2));
        if (f(xd * xd) < 1) {
          for (let y2 = yt0; y2 <= yt1; y2++) {
            const yd = f(f(f(y2 + f(0.5)) - yy) / f(hr / 2));
            if (f(f(xd * xd) + f(yd * yd)) < 1) {
              for (let z2 = zt0; z2 <= zt1; z2++) {
                const zd = f(f(f(z2 + f(0.5)) - zz) / f(r / 2));
                if (f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd)) < 1) {
                  if (level.getTile(x2, y2, z2) === Tile.rock.id)
                    level.setTileNoUpdate(x2, y2, z2, this.tile);
                }
              }
            }
          }
        }
      }
    }
    return true;
  }
}
