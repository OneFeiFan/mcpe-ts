import { describe, expect, it } from 'vitest';
import { GameSimulation } from '@mcpe/simulation';

describe('GameSimulation', () => {
  it('可以无头运行固定数量的 tick', () => {
    const simulation = new GameSimulation({ seed: 12345 });

    simulation.runTicks(100);

    expect(simulation.clock.tick).toBe(100);
  });

  it('相同 seed 的初始随机序列一致', () => {
    const a = new GameSimulation({ seed: 42 });
    const b = new GameSimulation({ seed: 42 });

    expect(a.random.nextInt(1000)).toBe(b.random.nextInt(1000));
    expect(a.random.nextInt(1000)).toBe(b.random.nextInt(1000));
  });
});
