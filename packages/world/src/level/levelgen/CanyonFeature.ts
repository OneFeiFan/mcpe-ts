/**
 * 1:1 移植自 src/world/level/levelgen/CanyonFeature.h 与 .cpp。
 *
 * 挖峡谷。整个类跟 `LargeCaveFeature` **长得很像**（同一个基类的另一个实现），
 * 但逐行 diff 下来有七处实在的差别 —— 每一处都能让结果全错，所以列在这里：
 *
 *   1. `rad` 里的 `1.5` **没有 `f` 后缀**（洞穴那边是 `1.5f`）→ double 加法，最后才收口；
 *   2. `xRota *= 0.50f`、`yRota *= 0.50f`（洞穴是 `0.90f` / `0.75f`）；
 *   3. `xd`/`zd`/`yd` 里的 `0.5` **没有 `f` 后缀**（洞穴是 `0.5f`）→ 整段按 double 算，
 *      只在赋给 float 时收一次口；
 *   4. **没有** `if (xd * xd + zd * zd < 1)` 那层外层判断（洞穴有）；
 *   5. `int x0 = floor(...) - ...` 没有 `(int)` 显式转换（洞穴写了 `(int)floor(...)`）；
 *   6. `addFeature` 是 **`if (random.nextInt(15) != 0) return;`** —— 直接早退，
 *      而洞穴是先抽一串 `nextInt` 再决定。**随机流的消耗方式完全不同**；
 *   7. 厚度多 `+ 1`，且 `addTunnel` 的 `yScale` 传 **5.0**（洞穴是 1.0）—— 峡谷是又深又窄的。
 *
 * 【浮点字面量按 C++ 原句的后缀来】第 1、3 条正好说明这条规则：有没有 `f` 后缀决定包不包 `f()`。
 * 见 `.claude/skills/mcpe-porting/PITFALLS.md` 第 3 条。
 */
import { Random } from '@mcpe/util';
import { LevelConstants } from '../LevelConstants';
import type { Level } from '../Level';
import { Tile } from '../tile/Tile';
import { LargeFeature } from './LargeFeature';

const f = Math.fround;

/** C++ `Mth::PI`：`constexpr float PI = 3.1415926535897932384626433832795028841971f` */
const PI = f(3.1415926535897932384626433832795028841971);

/** C 库 `floor`（不是 `Mth::floor`） */
const cf = Math.floor;

export class CanyonFeature extends LargeFeature {
  private addTunnel(
    xOffs: number,
    zOffs: number,
    blocks: Uint8Array,
    xCaveIn: number,
    yCaveIn: number,
    zCaveIn: number,
    thickness: number,
    yRotIn: number,
    xRotIn: number,
    stepIn: number,
    distIn: number,
    yScale: number,
  ): void {
    const xMid = xOffs * 16 + 8;
    const zMid = zOffs * 16 + 8;

    let xCave = xCaveIn;
    let yCave = yCaveIn;
    let zCave = zCaveIn;
    let yRot = yRotIn;
    let xRot = xRotIn;
    let step = stepIn;

    let yRota = 0;
    let xRota = 0;
    // C++ 这里有两行注释掉的 dist 赋值（CAVE_RADIUS 那套），不是代码，不移植
    const random = new Random(this.random.nextLong());

    let dist = distIn;
    if (dist <= 0) {
      const max = this.radius * 16 - 16;
      dist = max - random.nextInt(Math.trunc(max / 4));
    }
    let singleStep = false;

    if (step === -1) {
      step = Math.trunc(dist / 2);
      singleStep = true;
    }

    const splitPoint = random.nextInt(Math.trunc(dist / 2)) + Math.trunc(dist / 4);
    const steep = random.nextInt(6) === 0;

    for (; step < dist; step++) {
      // ⚠ 这里的 1.5 **没有 f 后缀**（C++ 的 double 字面量）—— 所以这步加法按 double 做，
      // 只在赋给 `float rad` 时收一次口。跟洞穴那边的 `1.5f` 不一样。
      const rad = f(1.5 + f(f(f(Math.sin(f(f(step * PI) / dist))) * thickness) * 1));
      const yRad = f(rad * yScale);

      const xc = f(Math.cos(xRot));
      const xs = f(Math.sin(xRot));
      xCave = f(xCave + f(f(Math.cos(yRot)) * xc));
      yCave = f(yCave + xs);
      zCave = f(zCave + f(f(Math.sin(yRot)) * xc));

      if (steep) {
        xRot = f(xRot * f(0.92));
      } else {
        xRot = f(xRot * f(0.7));
      }
      xRot = f(xRot + f(xRota * f(0.1)));
      yRot = f(yRot + f(yRota * f(0.1)));

      // 洞穴是 0.90f / 0.75f，这里是 0.50f —— 峡谷更快"收敛"
      xRota = f(xRota * 0.5);
      yRota = f(yRota * 0.5);
      xRota = f(xRota + f(f(f(random.nextFloat() - random.nextFloat()) * random.nextFloat()) * 2));
      yRota = f(yRota + f(f(f(random.nextFloat() - random.nextFloat()) * random.nextFloat()) * 4));

      if (!singleStep && step === splitPoint && thickness > 1) {
        this.addTunnel(
          xOffs,
          zOffs,
          blocks,
          xCave,
          yCave,
          zCave,
          f(f(random.nextFloat() * 0.5) + 0.5),
          f(yRot - f(PI / 2)),
          f(xRot / 3),
          step,
          dist,
          1.0,
        );
        this.addTunnel(
          xOffs,
          zOffs,
          blocks,
          xCave,
          yCave,
          zCave,
          f(f(random.nextFloat() * 0.5) + 0.5),
          f(yRot + f(PI / 2)),
          f(xRot / 3),
          step,
          dist,
          1.0,
        );
        return;
      }
      if (!singleStep && random.nextInt(4) === 0) continue;

      {
        const xd = f(xCave - xMid);
        const zd = f(zCave - zMid);
        const remaining = dist - step;
        const rr = f(f(thickness + 2) + 16);
        if (f(f(f(xd * xd) + f(zd * zd)) - f(remaining * remaining)) > f(rr * rr)) {
          return;
        }
      }

      if (
        xCave < f(f(xMid - 16) - f(rad * 2)) ||
        zCave < f(f(zMid - 16) - f(rad * 2)) ||
        xCave > f(f(xMid + 16) + f(rad * 2)) ||
        zCave > f(f(zMid + 16) + f(rad * 2))
      ) {
        continue;
      }

      // 洞穴那边写的是 `(int)floor(...)`，这里没有那个显式转换 —— 直接由 int 接住 float。
      // 值上没差别（floor 出来本来就是整数），照原样写。
      let x0 = cf(f(xCave - rad)) - xOffs * 16 - 1;
      let x1 = cf(f(xCave + rad)) - xOffs * 16 + 1;

      let y0 = cf(f(yCave - yRad)) - 1;
      let y1 = cf(f(yCave + yRad)) + 1;

      let z0 = cf(f(zCave - rad)) - zOffs * 16 - 1;
      let z1 = cf(f(zCave + rad)) - zOffs * 16 + 1;

      if (x0 < 0) x0 = 0;
      if (x1 > 16) x1 = 16;

      if (y0 < 1) y0 = 1;
      if (y1 > 120) y1 = 120;

      if (z0 < 0) z0 = 0;
      if (z1 > 16) z1 = 16;

      let detectedWater = false;
      for (let xx = x0; !detectedWater && xx < x1; xx++) {
        for (let zz = z0; !detectedWater && zz < z1; zz++) {
          for (let yy = y1 + 1; !detectedWater && yy >= y0 - 1; yy--) {
            const p = (xx * 16 + zz) * 128 + yy;
            if (yy < 0 || yy >= LevelConstants.LEVEL_HEIGHT) continue;
            if (blocks[p] === Tile.water.id || blocks[p] === Tile.calmWater.id) {
              detectedWater = true;
            }
            if (yy !== y0 - 1 && xx !== x0 && xx !== x1 - 1 && zz !== z0 && zz !== z1 - 1) {
              yy = y0;
            }
          }
        }
      }
      if (detectedWater) continue;

      for (let xx = x0; xx < x1; xx++) {
        // ⚠ 这里的 0.5 **没有 f 后缀** —— 整个式子按 double 算，只在赋给 `float xd` 时收口。
        // 洞穴那边是 `0.5f`，中间每步都收。这两行不能照抄。
        const xd = f((xx + xOffs * 16 + 0.5 - xCave) / rad);
        for (let zz = z0; zz < z1; zz++) {
          const zd = f((zz + zOffs * 16 + 0.5 - zCave) / rad);
          let p = (xx * 16 + zz) * 128 + y1;
          let hasGrass = false;
          // ⚠ 洞穴那边这里还套着 `if (xd * xd + zd * zd < 1)`，**峡谷没有**。
          for (let yy = y1 - 1; yy >= y0; yy--) {
            const yd = f((yy + 0.5 - yCave) / yRad);
            if (yd > -0.7 && f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd)) < 1) {
              const block = blocks[p]!;
              if (block === Tile.grass.id) hasGrass = true;
              if (block === Tile.rock.id || block === Tile.dirt.id || block === Tile.grass.id) {
                if (yy < 10) {
                  blocks[p] = Tile.lava.id & 0xff;
                } else {
                  blocks[p] = 0;
                  if (hasGrass && blocks[p - 1] === Tile.dirt.id) {
                    blocks[p - 1] = Tile.grass.id & 0xff;
                  }
                }
              }
            }
            p--;
          }
        }
      }
      if (singleStep) break;
    }
  }

  protected override addFeature(
    _level: Level,
    x: number,
    z: number,
    xOffs: number,
    zOffs: number,
    blocks: Uint8Array,
    _blocksSize: number,
  ): void {
    // ⚠ 洞穴是"先抽一串 nextInt 再决定挖几条"，峡谷是**直接早退** —— 随机流消耗完全不同。
    // 15 分之 14 的坐标到这儿就返回了，一个随机数都不多抽。
    if (this.random.nextInt(15) !== 0) return;

    const xCave = x * 16 + this.random.nextInt(16);
    const yCave = this.random.nextInt(this.random.nextInt(120) + 8);
    const zCave = z * 16 + this.random.nextInt(16);
    const yRot = f(f(this.random.nextFloat() * PI) * 2);
    const xRot = f(f(f(this.random.nextFloat() - 0.5) * 2) / 8);
    // 比洞穴多一个 + 1 —— 峡谷更粗
    const thickness = f(f(f(this.random.nextFloat() * 2) + this.random.nextFloat()) + 1);

    this.addTunnel(xOffs, zOffs, blocks, xCave, yCave, zCave, thickness, yRot, xRot, 0, 0, 5.0);
  }
}
