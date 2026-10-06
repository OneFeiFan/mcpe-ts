/**
 * 1:1 移植自 src/world/entity/EntityFactory.cpp/.h（57 行）。
 *
 * 两个静态函数：`CreateEntity(typeId, level)` 按 id 造一个新的空实体，`loadEntity(tag, level)`
 * 按标签里的 `id` 造实体再把标签读进去。**只有 `loadEntity` 有人调用**（存档的 loadEntities）；
 * `CreateEntity` 的另一个调用方是网络包处理（`ClientSideNetworkHandler.cpp:235`），没移植。
 *
 * 【本轮的移植范围】`CreateEntity` 那张 switch 里七种实体，TS 里
 * **七种实体全都是真的了**（ItemEntity / FallingTile / PrimedTnt / Painting / Snowball /
 * ThrownEgg / Arrow）—— D11b 把最后一个 Arrow 也接上了，这张 switch 里再没有 DEFERRED。
 * `id < 64` 那条（生物）走 MobFactory（任务单 H4 起）。
 *
 * 【任务单 D 已经全补上了】D1～D11 把七种实体一个个写成真类并接到这张 switch 上
 * （`FallingTile` / `PrimedTnt` / `Painting` / `Snowball` / `ThrownEgg` / `Arrow`）。
 * `TripodCamera` 是真类（D5），但它本来就不在这张表里，只由 `CameraItem` 生成。
 *
 * 【行号说明】下面 DEFERRED 里的 `EntityFactory.cpp:N` 是**原始文件的行号**（D2 用
 * `rg -n` 实测的）。之前写的那批（9..14 / 36）对不上任何一个版本 —— 实测 `IdFallingTile`
 * 在 16、`IdPainting` 在 21、`MobFactory::CreateMob` 在 37。已按实测值改齐。
 *
 * 【为什么 id < 64 是生物】`EntityTypes::IdItemEntity` 等非生物实体的 id 都从 64 起，
 * 而 `MobTypes` 全在 1..36 —— 于是 `id < 64` 就等价于"这是只生物"。这个分界线是 C++ 用
 * 数值硬划的，不是枚举，照抄。
 */
import { LOGE } from '@mcpe/platform';
import type { CompoundTag } from '@mcpe/nbt';
import type { Level } from '../level/Level';
import type { Entity } from './Entity';
import { EntityTypes } from './EntityTypes';
import { ItemEntity } from './item/ItemEntity';
import { FallingTile } from './item/FallingTile';
import { PrimedTnt } from './item/PrimedTnt';
import { Painting } from './Painting';
import { Snowball } from './projectile/Snowball';
import { ThrownEgg } from './projectile/ThrownEgg';
import { Arrow } from './projectile/Arrow';
import { Item } from '../item/Item';
import { MobFactory } from './MobFactory';

export class EntityFactory {
  /**
   * C++ 的 `static Entity* CreateEntity(int typeId, Level* level)`。
   * 认不出的 id 返回 NULL —— 这里就是那个 `return NULL;`，不在 switch 里。
   *
   * 【大小写照抄】C++ 这个方法名首字母是大写的（同文件的 `loadEntity` 却是小写），照着写。
   */
  static CreateEntity(typeId: number, level: Level): Entity | null {
    switch (typeId) {
      case EntityTypes.IdItemEntity:
        return new ItemEntity(level);
      case EntityTypes.IdFallingTile:
        return new FallingTile(level);
      case EntityTypes.IdPrimedTnt:
        return new PrimedTnt(level);
      case EntityTypes.IdArrow:
        return new Arrow(level);
      case EntityTypes.IdThrownEgg:
        return new ThrownEgg(level);
      case EntityTypes.IdSnowball:
        return new Snowball(level);
      case EntityTypes.IdPainting:
        return new Painting(level);
      default:
        break;
    }
    return null;
  }

  /**
   * C++ 的 `static Entity* loadEntity(CompoundTag* tag, Level* level)`。
   *
   * 最后那道"物品合法性"检查只对掉落物生效：`isItemEntity()` 为真的实体（只有 ItemEntity
   * 覆盖成 true）才查 item —— 空物品、负数 id、超上限、或者注册表里没有这个 id，就把刚造出来的
   * 实体扔掉返回 NULL。**这一条挡的是坏存档**：id 对不上注册表的掉落物宁可不要，也不能让它
   * 进到世界里去（拿 item 的地方会直接索引 `Item::items[id]`）。
   */
  static loadEntity(tag: CompoundTag | null, level: Level): Entity | null {
    if (!tag) return null;
    if (!tag.contains('id')) return null;
    const id = tag.getInt('id');
    let e: Entity | null = null;

    if (id < 0) {
      // C++ 这里打的是 "at MobFactory::loadEntity"（不是 EntityFactory），原文如此
      LOGE(`Negative ItemId: ${id} at MobFactory::loadEntity\n`);
    } else if (id < 64) {
      e = MobFactory.CreateMob(id, level);
    } else {
      e = EntityFactory.CreateEntity(id, level);
    }

    if (e) {
      e.load(tag);
      if (e.isItemEntity()) {
        const item = (e as ItemEntity).item;
        if (item.isNull() || item.id < 0 || item.id >= Item.MAX_ITEMS || !Item.items[item.id]) {
          // C++: delete e; e = NULL;
          e = null;
        }
      }
    }
    return e;
  }
}
