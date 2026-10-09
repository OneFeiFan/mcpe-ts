/**
 * 1:1 移植自 src/world/level/levelgen/feature/ClayFeature.h：只在水里开始，把沿途椭球内的沙子换成黏土。
 * ⚠ 与 OreFeature 不同：这里用的是 C 库的 `sin` / `cos`（double），不是 Mth 的查表版；
 *   `x + 8 + sin(dir) * count / 8` 整个在 double 里算完再转 float。`r * 0.5f` 与 `r / 2` 在这里结果相同，照抄写法。
 */
import { Mth, type Random } from '@mcpe/util';
import type { Level } from '../../Level';
import { Material } from '../../material/Material';
import { Tile } from '../../tile/Tile';
import { Feature } from './Feature';

const f = Math.fround;

export class ClayFeature extends Feature {
  private tile: number;
  private count: number;

  constructor(count: number) {
    super();
    this.tile = Tile.clay.id;
    this.count = count;
  }

  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    if (level.getMaterial(x, y, z) !== Material.water) return false;
    const count = this.count;
    const dir = f(random.nextFloat() * Mth.PI);
    const x0 = f(x + 8 + (Math.sin(dir) * count) / 8);
    const x1 = f(x + 8 - (Math.sin(dir) * count) / 8);
    const z0 = f(z + 8 + (Math.cos(dir) * count) / 8);
    const z1 = f(z + 8 - (Math.cos(dir) * count) / 8);
    const y0 = f(y + random.nextInt(3) + 2);
    const y1 = f(y + random.nextInt(3) + 2);
    for (let d = 0; d <= count; d++) {
      const xx = f(x0 + f(f(f(x1 - x0) * d) / count));
      const yy = f(y0 + f(f(f(y1 - y0) * d) / count));
      const zz = f(z0 + f(f(f(z1 - z0) * d) / count));
      const ss = f(random.nextFloat() * f(count >> 4));
      const r = f((Math.sin(f(f(d * Mth.PI) / count)) + 1) * ss + 1);
      const hr = f((Math.sin(f(f(d * Mth.PI) / count)) + 1) * ss + 1);
      for (let x2 = Math.trunc(f(xx - f(r / 2))); x2 <= Math.trunc(f(xx + f(r * f(0.5)))); x2++)
        for (let y2 = Math.trunc(f(yy - f(hr / 2))); y2 <= Math.trunc(f(yy + f(hr * f(0.5)))); y2++)
          for (let z2 = Math.trunc(f(zz - f(r / 2))); z2 <= Math.trunc(f(zz + f(r * f(0.5)))); z2++) {
            const xd = f(f(f(x2 + f(0.5)) - xx) / f(r * f(0.5)));
            const yd = f(f(f(y2 + f(0.5)) - yy) / f(hr * f(0.5)));
            const zd = f(f(f(z2 + f(0.5)) - zz) / f(r * f(0.5)));
            if (f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd)) < 1) {
              const t = level.getTile(x2, y2, z2);
              if (t === Tile.sand.id) level.setTileNoUpdate(x2, y2, z2, this.tile);
            }
          }
    }
    return true;
  }
}
