/**
 * 测试用：把 `Mth.random()` / `Mth.random(n)` 定死成一个值（任务单 H1 之前，测试是对 Math.random 打桩）。
 * Mth.random 现在走 `_mthRand`（与 C++ 的 static Random _rand 同构），所以改为对它的 nextFloat / nextInt 打桩。
 * random(n) 保持以前的语义 `(v * n) | 0`，原有断言不变。vi.restoreAllMocks() 会一并还原。
 */
import { vi } from 'vitest';
import { _mthRand } from '@mcpe/util';

export function mockMthRandom(v: number): void {
  vi.spyOn(_mthRand, 'nextFloat').mockReturnValue(v);
  vi.spyOn(_mthRand, 'nextInt').mockImplementation(((n?: number) => (n === undefined ? 0 : (v * n) | 0)) as typeof _mthRand.nextInt);
}
