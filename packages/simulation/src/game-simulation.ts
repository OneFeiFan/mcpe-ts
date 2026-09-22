import { FixedGameClock, type RandomSource, SeededRandom } from '@mcpe/core';

export interface SimulationConfig {
  readonly seed: number;
  readonly tickRate?: number;
}

export class GameSimulation {
  public readonly clock: FixedGameClock;
  public readonly random: RandomSource;

  public constructor(config: SimulationConfig) {
    this.clock = new FixedGameClock(config.tickRate ?? 20);
    this.random = new SeededRandom(config.seed);
  }

  public start(): void {
    // 当前仅初始化状态。
    // 后续这里会接入 WorldSimulation。
  }

  public tick(): void {
    this.clock.advance();
  }

  public runTicks(count: number): void {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('count must be a non-negative integer');
    }

    for (let i = 0; i < count; i += 1) {
      this.tick();
    }
  }
}
