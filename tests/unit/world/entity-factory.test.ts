import { describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import {
  EntityFactory,
  EntityTypes,
  FallingTile,
  Item,
  ItemEntity,
  ItemInstance,
  type Level,
} from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

// EntityFactory（B5c-2）。它有两个消费者：存档的 loadEntities，和网络包（没移植）。
// 黄金样本 G14-6 已经端到端盖过"读回来"那条路，这里只补黄金样本看不见的分支判断。

/**
 * 造一个掉落物标签（拿真实体的 save 产物，不手搓字段）。
 *
 * 【为什么"非法的物品"也要从构造函数给】试过先 save 再把 `Item` 子标签换掉 —— 换不动：
 * `CompoundTag.put` **不覆盖已有的键**（`insertNew` 开头 `if (this.tags.has(name)) return;`，
 * 复刻的是 C++ `std::map::insert` 的语义）。换不掉就还是原来那个合法物品，于是"非法物品"
 * 那几条用例全测不出东西（第一版就是这么假绿的）。所以改成一开始就把想要的值交给构造函数。
 */
function itemTag(id: number, count: number, damage = 0): CompoundTag {
  const e = new ItemEntity(createFlatLevel(), 8.5, 64, 8.5, new ItemInstance(id, count, damage));
  e.age = 7;
  const tag = new CompoundTag();
  expect(e.save(tag), '前置条件：实体能存出标签').toBe(true);
  return tag;
}

let level: Level | null = null;
function lv(): Level {
  // EntityFactory 只是把 level 透传给实体的构造函数，不读它 —— 但还是给个真的
  level ??= createFlatLevel();
  return level;
}

describe('world/EntityFactory', () => {
  describe('CreateEntity', () => {
    it('IdItemEntity → ItemEntity', () => {
      expect(EntityFactory.CreateEntity(EntityTypes.IdItemEntity, lv())).toBeInstanceOf(ItemEntity);
    });

    // 【这条同时就是"接线完成"的检查点】任务单 D 每接完一个实体，就把对应的 id 从下面
    // 那张"还没移植"的表里挪上来，改成 toBeInstanceOf。D2 挪的是 IdFallingTile。
    it('IdFallingTile → FallingTile（D2 接的线）', () => {
      expect(EntityFactory.CreateEntity(EntityTypes.IdFallingTile, lv())).toBeInstanceOf(FallingTile);
    });

    it('还没移植的那几种返回 null（原地留着 DEFERRED(Entity)）', () => {
      // PrimedTnt / Arrow / ThrownEgg / Snowball / Painting
      for (const id of [
        EntityTypes.IdPrimedTnt,
        EntityTypes.IdArrow,
        EntityTypes.IdThrownEgg,
        EntityTypes.IdSnowball,
        EntityTypes.IdPainting,
      ]) {
        expect(EntityFactory.CreateEntity(id, lv()), `id=${id} 应该还没移植`).toBeNull();
      }
    });

    it('认不出的 id 返回 null（C++ 那个 switch 落空后的 return NULL）', () => {
      expect(EntityFactory.CreateEntity(9999, lv())).toBeNull();
      expect(EntityFactory.CreateEntity(0, lv())).toBeNull();
    });
  });

  describe('loadEntity 的拒绝路径', () => {
    it('tag 为 null → null', () => {
      expect(EntityFactory.loadEntity(null, lv())).toBeNull();
    });

    it('标签里没有 id → null', () => {
      const tag = new CompoundTag();
      tag.putInt('Age', 1);
      expect(EntityFactory.loadEntity(tag, lv())).toBeNull();
    });

    it('负数 id → 只打日志，返回 null', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const tag = new CompoundTag();
      tag.putInt('id', -5);
      expect(EntityFactory.loadEntity(tag, lv())).toBeNull();
      expect(spy, 'C++ 那句 LOGE("Negative ItemId: …")').toHaveBeenCalled();
      spy.mockRestore();
    });

    it('id < 64（生物那条）→ null，因为 MobFactory 整个没移植', () => {
      const tag = new CompoundTag();
      tag.putInt('id', 12); // MobTypes::Pig
      expect(EntityFactory.loadEntity(tag, lv())).toBeNull();
    });
  });

  describe('loadEntity 认掉落物', () => {
    it('正常一条：实体造出来、字段读进去', () => {
      const e = EntityFactory.loadEntity(itemTag(1, 3), lv());
      expect(e).toBeInstanceOf(ItemEntity);
      const ie = e as ItemEntity;
      expect(ie.item.id).toBe(1);
      expect(ie.item.count).toBe(3);
      expect(ie.age).toBe(7);
      // Entity::load 把位置也读进来了
      expect([ie.x, ie.y, ie.z]).toEqual([8.5, 64, 8.5]);
    });

    /**
     * 【这一条挡的是坏存档】`isItemEntity()` 为真的实体要过四道检查：空物品、负数 id、
     * 超过 MAX_ITEMS、注册表里没这个 id —— 任何一条不满足就把刚造好的实体扔掉返回 null。
     * 不挡的话，后面拿 `Item.items[item.id]` 的地方会直接索引到表外。
     */
    it('物品不合法就把实体丢掉（空 / 负 id / 超上限 / 未注册）', () => {
      expect(EntityFactory.loadEntity(itemTag(0, 0, 0), lv()), '空物品').toBeNull();
      expect(EntityFactory.loadEntity(itemTag(-1, 1), lv()), '负数 id').toBeNull();
      expect(
        EntityFactory.loadEntity(itemTag(Item.MAX_ITEMS, 1), lv()),
        'id == MAX_ITEMS 就越界了（判断是 >=）',
      ).toBeNull();
      expect(
        EntityFactory.loadEntity(itemTag(Item.MAX_ITEMS - 1, 1), lv()),
        '在上限内、但注册表里没这个 id',
      ).toBeNull();
    });

    it('合法物品不能误伤（对照：id=1 是注册过的）', () => {
      expect(EntityFactory.loadEntity(itemTag(1, 1), lv())).toBeInstanceOf(ItemEntity);
    });
  });
});
