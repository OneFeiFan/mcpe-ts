/**
 * 1:1 移植自 src/world/level/levelgen/LargeFeature.h 与 .cpp。
 *
 * 一个大范围地物（洞穴、峡谷……）的基类：`apply` 负责在区块周围 `radius` 范围内逐个坐标
 * 撒种子、调用子类的 `addFeature`，具体挖什么由子类决定。
 *
 * 【这里全是 64 位整数，但 JS 恰好能对】`xScale`/`zScale` 来自 `nextLong()` —— 注意 C++ 的
 * `Random::nextLong()` 其实是 `(int)(genrand_int32() >> 1)`（32 位，头文件里那句
 * `/* long long *​/` 是作者留下的注释，不是真的 64 位），TS 的 `Random` 也是这么实现的。
 * 于是 `xScale` 最大 2³¹，`x * xScale + z * zScale` 在坐标 ±2²¹ 以内都不会超过 2⁵³，
 * double 能精确表示；而 `^ seed` 那一步 JS 会自动按 **32 位** 做异或 ——
 * 正好等于 C++ 64 位异或的低 32 位，而 `setSeed` 要的也就是低 32 位。所以这条链能对上。
 *
 * 【`/ 2 * 2 + 1` 必须显式截断】C++ 是 `int / int` 的整数除法；JS 直接写 `v / 2 * 2` 会还原成 v，
 * 整个"取偶数再 +1"的意思就没了。要 `Math.trunc(v / 2) * 2 + 1`。
 */
import { Random } from '@mcpe/util';
import type { ChunkSource } from '../chunk/ChunkSource';
import type { Level } from '../Level';

export abstract class LargeFeature {
  protected radius: number;
  protected readonly random: Random;

  constructor() {
    this.radius = 8;
    this.random = new Random();
  }

  // 析构函数不移植（R3）：C++ 的 ~LargeFeature 是空的。

  /**
   * C++ 的签名里有个 `ChunkSource* chunkSource`，但函数体从头到尾没碰过它 —— 原样收下不用。
   */
  apply(
    _chunkSource: ChunkSource,
    level: Level,
    xOffs: number,
    zOffs: number,
    blocks: Uint8Array,
    blocksSize: number,
  ): void {
    const r = this.radius;

    this.random.setSeed(level.getSeed());
    const xScale = Math.trunc(this.random.nextLong() / 2) * 2 + 1;
    const zScale = Math.trunc(this.random.nextLong() / 2) * 2 + 1;

    for (let x = xOffs - r; x <= xOffs + r; x++) {
      for (let z = zOffs - r; z <= zOffs + r; z++) {
        this.random.setSeed((x * xScale + z * zScale) ^ level.getSeed());
        this.addFeature(level, x, z, xOffs, zOffs, blocks, blocksSize);
      }
    }
  }

  protected abstract addFeature(
    level: Level,
    x: number,
    z: number,
    xOffs: number,
    zOffs: number,
    blocks: Uint8Array,
    blocksSize: number,
  ): void;
}
