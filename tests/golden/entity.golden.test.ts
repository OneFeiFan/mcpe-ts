import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CompoundTag, NbtIo } from '@mcpe/nbt';
import { MemoryDataOutput } from '@mcpe/util';
import {
  initItems,
  initMaterials,
  initTiles,
  ItemEntity,
  ItemInstance,
  type Level,
} from '@mcpe/world';

/**
 * 黄金样本 G12-1（tools/golden/harness_entity.cpp）：实体的存档格式。ItemEntity 经 Entity::save → saveWithoutId → addAdditonalSaveData，
 * 覆盖 Entity 的 Pos、Motion、Rotation、FallDistance、Fire、Air、OnGround 与 ItemEntity 的 Health、Age、Item。
 * 与 C++ 一样传空 level（构造函数与 save 都不访问它），构造后把随机量覆盖成固定值。
 */
type Case = {
  id: number;
  count: number;
  aux: number;
  x: number;
  y: number;
  z: number;
  xd: number;
  yd: number;
  zd: number;
  yRot: number;
  xRot: number;
  fall: number;
  age: number;
  health: number;
  onGround: number;
  hex: string;
};
const G = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/entity.json', import.meta.url), 'utf8'),
) as { items: Case[] };
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initMaterials();
  initTiles();
  initItems();
});

describe('G12-1 实体存档格式', () => {
  it('ItemEntity.save 的字节与 C++ 相同', () => {
    for (const c of G.items) {
      const e = new ItemEntity(
        null as unknown as Level,
        c.x,
        c.y,
        c.z,
        new ItemInstance(c.id, c.count, c.aux),
      );
      Object.assign(e, {
        xd: c.xd,
        yd: c.yd,
        zd: c.zd,
        yRot: c.yRot,
        xRot: c.xRot,
        fallDistance: c.fall,
        age: c.age,
        health: c.health,
        onGround: c.onGround === 1,
      });
      const tag = new CompoundTag();
      e.save(tag);
      const out = new MemoryDataOutput();
      NbtIo.write(tag, out);
      expect(hex(out.toUint8Array()), `物品 ${c.id}`).toBe(c.hex);
    }
  });
});
