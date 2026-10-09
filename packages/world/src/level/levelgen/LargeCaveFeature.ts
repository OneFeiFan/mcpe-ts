/**
 * 1:1 移植自 src/world/level/levelgen/LargeCaveFeature.h（180 行，整个类都写在头文件里；
 * 同名的 .cpp 是空文件）。
 *
 * 挖洞穴：`addFeature` 决定这一格要挖几条，`addTunnel` 是递归的"挖一条隧道"，
 * 隧道走得够远时会分叉成两条。
 *
 * 【三角函数的来源】这里用的是 **C 库的** `sin` / `cos` / `floor`（头文件里是不带前缀的调用，
 * 全库没有 `using namespace std`），**不是 `Mth::sin` 那个 65536 项查表**。
 * 所以 TS 写 `Math.sin` / `Math.cos`，再按 float 收口 —— 见 Mth.ts 顶部那条提醒。
 *
 * 【随机流是这一步最大的风险】三类消耗，顺序错一点整片洞穴就错位：
 *   1. `apply`（基类）每个坐标 `setSeed` 一次，然后调 `addFeature`；
 *   2. `addTunnel` 一进来就 `new Random(this.random.nextLong())` —— 用的是**成员**随机流的
 *      下一个 nextLong，之后这个局部 `random` 就完全接管了；
 *   3. 局部随机流的消耗顺序（下面每处都按 C++ 的书写顺序来）。
 *
 * 【`a - b` 里两个 `nextFloat()` 的求值顺序】C++ 没规定 `-` 两侧的求值顺序，理论上左先右先都合法。
 * 这里按**从左到右**写；要是黄金样本对不上，第一个该试的就是把它翻过来。
 */
import { Random } from '@mcpe/util';
import { LevelConstants } from '../LevelConstants';
import type { Level } from '../Level';
import { Tile } from '../tile/Tile';
import { LargeFeature } from './LargeFeature';

const f = Math.fround;

/** C++ `Mth::PI`：`constexpr float PI = 3.1415926535897932384626433832795028841971f` */
const PI = f(3.1415926535897932384626433832795028841971);

/** C 库 `floor`（不是 `Mth::floor`）：返回整数，`(int)` 那层截断对整数是恒等 */
const cf = Math.floor;

export class LargeCaveFeature extends LargeFeature {
  private addRoom(
    xOffs: number,
    zOffs: number,
    blocks: Uint8Array,
    xRoom: number,
    yRoom: number,
    zRoom: number,
  ): void {
    this.addTunnel(
      xOffs,
      zOffs,
      blocks,
      xRoom,
      yRoom,
      zRoom,
      f(1 + f(this.random.nextFloat() * 6)),
      0,
      0,
      -1,
      -1,
      0.5,
    );
  }

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
    // C++ 是 `Random random(this->random.nextLong());` —— 局部变量把成员遮住了
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

      xRota = f(xRota * f(0.9));
      yRota = f(yRota * 0.75);
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
        if (f(f(f(xd * xd) + f(zd * zd)) - f(remaining * remaining)) > f(rr * rr)) return;
      }

      if (
        xCave < f(f(xMid - 16) - f(rad * 2)) ||
        zCave < f(f(zMid - 16) - f(rad * 2)) ||
        xCave > f(f(xMid + 16) + f(rad * 2)) ||
        zCave > f(f(zMid + 16) + f(rad * 2))
      ) {
        continue;
      }

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
        const xd = f(f(xx + xOffs * 16 + 0.5 - xCave) / rad);
        for (let zz = z0; zz < z1; zz++) {
          const zd = f(f(zz + zOffs * 16 + 0.5 - zCave) / rad);
          let p = (xx * 16 + zz) * 128 + y1;
          let hasGrass = false;
          if (f(f(xd * xd) + f(zd * zd)) < 1) {
            for (let yy = y1 - 1; yy >= y0; yy--) {
              const yd = f(f(yy + 0.5 - yCave) / yRad);
              // ⚠ 这个 -0.7 在 C++ 里**没有 f 后缀**，是 double 字面量，比较按 double 做 ——
              // 所以这里不能包 f()。跟 0.2f/0.7f 那类恰好相反：一切看 C++ 原句有没有后缀。
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
    let caves = this.random.nextInt(this.random.nextInt(this.random.nextInt(40) + 1) + 1);
    if (this.random.nextInt(15) !== 0) caves = 0;

    for (let cave = 0; cave < caves; cave++) {
      const xCave = x * 16 + this.random.nextInt(16);
      const yCave = this.random.nextInt(this.random.nextInt(120) + 8);
      const zCave = z * 16 + this.random.nextInt(16);

      let tunnels = 1;
      if (this.random.nextInt(4) === 0) {
        this.addRoom(xOffs, zOffs, blocks, xCave, yCave, zCave);
        tunnels += this.random.nextInt(4);
      }

      for (let i = 0; i < tunnels; i++) {
        const yRot = f(f(this.random.nextFloat() * PI) * 2);
        const xRot = f(f(f(this.random.nextFloat() - 0.5) * 2) / 8);
        const thickness = f(f(this.random.nextFloat() * 2) + this.random.nextFloat());

        this.addTunnel(xOffs, zOffs, blocks, xCave, yCave, zCave, thickness, yRot, xRot, 0, 0, 1.0);
      }
    }
  }
}
