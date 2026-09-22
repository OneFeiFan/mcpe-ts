export interface RandomSource {
  nextInt(maxExclusive: number): number;
  nextFloat(): number;
}

export class SeededRandom implements RandomSource {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive integer');
    }

    return Math.floor(this.nextFloat() * maxExclusive);
  }

  public nextFloat(): number {
    // 小型 deterministic PRNG，仅作为工程地基占位。
    // 最终 MCPE 行为对齐时必须替换为 Reference 所需的精确随机算法。
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;

    return this.state / 0x100000000;
  }
}
