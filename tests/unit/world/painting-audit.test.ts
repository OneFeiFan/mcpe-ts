import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import { Painting } from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

// 全量审核 W16：C++ 的 `const Motive* motive;` 在单参构造里**没有初始化**（未定义值）。
// 按 R3 不复刻 UB，TS 取 null —— 这样 addAdditonalSaveData 里照抄的 `motive != NULL`
// 守卫才有意义：还没读档/没选画时，存档里不写 Motive 键。
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Painting 审核（W16）', () => {
  it('单参构造的 motive 取 null（C++ 未初始化，R3）', () => {
    const p = new Painting(createFlatLevel());
    expect(p.motive).toBeNull();
  });

  it('motive 未设置时 save 走 `motive != NULL` 守卫：不写 Motive 键，也不抛错', () => {
    const p = new Painting(createFlatLevel());
    const tag = new CompoundTag();
    expect(() => p.save(tag)).not.toThrow();
    expect(tag.contains('Motive')).toBe(false);
    expect(tag.getInt('id')).toBe(83);
  });
});
