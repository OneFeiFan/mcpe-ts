import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Animal, Chicken, type Level } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 全量审核 W27：Animal.ts（8 个函数逐行对照）。
// 唯一的问题是可见性：C++ `bool Animal::removeWhenFarAway()` 在 Animal.h 的 public 段，
// 而基类 Mob.h 的同名 virtual 在 protected 段；TS 原先写成了 protected。
// 可见性只存在于编译期（运行时的 JS 没有 protected），所以这条测试从**类外**用
// Animal 类型调用该方法：改回 protected 时 `pnpm typecheck`（tests/tsconfig.json）
// 会在这里报 TS2445，vitest 运行时本身看不到区别。
const X = 130;
const Y = 64;
const Z = 130;

let level: Level;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
});

describe('Animal 审核（W27）', () => {
  it('W27：removeWhenFarAway 在 C++ 是 public 段，类外可调用，恒 false', () => {
    const animal: Animal = new Chicken(level);
    animal.setPos(X + 0.5, Y, Z + 0.5);
    expect(animal.removeWhenFarAway()).toBe(false);
  });
});
