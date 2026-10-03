import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import {
  AABB,
  ChestTileEntity,
  ContainerType,
  type Entity,
  FillingContainer,
  FurnaceTileEntity,
  initItems,
  initTileEntities,
  Item,
  ItemInstance,
  type Level,
  LevelListener,
  Tile,
  TileEntity,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// S12 阶段 A：Level 与 LevelChunk 的实体函数、FurnaceTileEntity。Entity 还是前向声明，这里用最小的替身对象。
let nextId = 1;
function fakeEntity(x: number, y: number, z: number, isPlayer = false): Entity & { ticks: number } {
  const e = {
    entityId: nextId++,
    x,
    y,
    z,
    xOld: x,
    yOld: y,
    zOld: z,
    xd: 0,
    yd: 0,
    zd: 0,
    xRot: 0,
    yRot: 0,
    xRotO: 0,
    yRotO: 0,
    bb: new AABB(x - 0.3, y, z - 0.3, x + 0.3, y + 1.8, z + 0.3),
    heightOffset: 1.62,
    removed: false,
    reallyRemoveIfPlayer: false,
    blocksBuilding: true,
    inChunk: false,
    xChunk: 0,
    yChunk: 0,
    zChunk: 0,
    ticks: 0,
    isPlayer: () => isPlayer,
    isAlive: () => !e.removed,
    remove: () => {
      e.removed = true;
    },
    tick: () => {
      e.ticks++;
    },
    getEntityTypeId: () => 64,
    getCreatureBaseType: () => 0,
    distanceToSqr: (px: number, py: number, pz: number) =>
      (e.x - px) ** 2 + (e.y - py) ** 2 + (e.z - pz) ** 2,
    hurt: () => false,
    makeStuckInWeb() {},
    push() {},
  };
  return e as unknown as Entity & { ticks: number };
}

let level: Level;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  prepareLevel(level);
  initItems();
  initTileEntities();
});

describe('Level 的实体函数', () => {
  it('addEntity 放进区块与查找表并通知监听器；tickEntities 调用 tick；removeEntity 后下一次 tickEntities 移除', () => {
    const added: Entity[] = [],
      removed: Entity[] = [];
    const l = new (class extends LevelListener {
      override entityAdded(e: Entity) {
        added.push(e);
      }
      override entityRemoved(e: Entity) {
        removed.push(e);
      }
    })();
    level.addListener(l);
    const e = fakeEntity(136.5, 64, 120.5);
    expect(level.addEntity(e)).toBe(true);
    expect([e.inChunk, e.xChunk, e.yChunk, e.zChunk]).toEqual([true, 8, 4, 7]);
    expect(level.getEntity(e.entityId)).toBe(e);
    expect(added).toEqual([e]);
    level.tickEntities();
    expect(e.ticks).toBe(1);
    expect(level.getEntities(null, new AABB(136, 64, 120, 137, 65, 121))).toEqual([e]);
    expect(level.isUnobstructed(new AABB(136, 64, 120, 137, 65, 121))).toBe(false);
    level.removeEntity(e);
    level.tickEntities();
    expect(level.getEntity(e.entityId)).toBeNull();
    expect(level.getAllEntities()).not.toContain(e);
    expect(removed).toEqual([e]);
    level.removeListener(l);
  });

  it('实体跨区块移动后 tickEntity 把它挪到新区块', () => {
    const e = fakeEntity(136.5, 64, 120.5);
    level.addEntity(e);
    e.x = 152.5; // 下一个区块（真正的 Entity 在 setPos、move 里同步 bb；替身手动更新）
    e.bb = new AABB(152.2, 64, 120.2, 152.8, 65.8, 120.8);
    level.tickEntity(e);
    expect([e.xChunk, e.zChunk]).toEqual([9, 7]);
    expect(level.getEntities(null, new AABB(152, 64, 120, 153, 65, 121))).toContain(e);
    level.removeEntity(e);
    level.tickEntities();
  });

  it('getNearestPlayer 只看玩家；getCubes 收集方块的碰撞盒', () => {
    const p = fakeEntity(140, 64, 120, true);
    level.addEntity(p);
    expect(level.getNearestPlayer(136, 64, 120, 10)).toBe(p);
    expect(level.getNearestPlayer(136, 64, 120, 2)).toBeNull();
    const boxes = level.getCubes(null, new AABB(130, 62.5, 120, 131, 63.5, 121));
    expect(boxes.length).toBeGreaterThan(0); // 草地顶面
    p.reallyRemoveIfPlayer = true;
    level.removeEntity(p);
    level.tickEntities();
  });

  it('checkAndHandleWater：在水里时把水流推给实体', () => {
    level.setTileAndData(130, 64, 130, Tile.calmWater.id, 0);
    const e = fakeEntity(130.5, 64.1, 130.5);
    expect(
      level.checkAndHandleWater(
        new AABB(130.2, 64.1, 130.2, 130.8, 64.9, 130.8),
        Tile.calmWater.material,
        e,
      ),
    ).toBe(true);
    level.setTile(130, 64, 130, 0);
  });
});

describe('FurnaceTileEntity', () => {
  it('保存与读取：燃烧时间、烹饪时间、物品槽', () => {
    const f = new FurnaceTileEntity();
    f.setItem(FurnaceTileEntity.SLOT_FUEL, new ItemInstance(Item.coal, 5, 0));
    f.setItem(FurnaceTileEntity.SLOT_INGREDIENT, new ItemInstance(Tile.ironOre, 2, 0));
    f.litTime = 77;
    const tag = new CompoundTag();
    expect(f.save(tag)).toBe(true);
    const back = TileEntity.loadStatic(tag) as FurnaceTileEntity;
    expect(back).toBeInstanceOf(FurnaceTileEntity);
    expect([
      back.litTime,
      back.items[1]!.id,
      back.items[1]!.count,
      back.items[0]!.count,
      back.items[2]!.isNull(),
    ]).toEqual([77, Item.coal.id, 5, 2, true]);
    expect(back.litDuration).toBe(200 * 8); // 煤
    expect(FurnaceTileEntity.isFuel(new ItemInstance(Tile.wood, 1, 0))).toBe(true);
    expect(f.getSlotCopies().length).toBe(3);
  });
});

describe('FillingContainer 与 ChestTileEntity（mixin）', () => {
  it('FillingContainer：add 合并堆叠、超出时开新格；链接槽指向物品栏；removeResource 三个重载', () => {
    const inv = new FillingContainer(9 + 27, 9, ContainerType.INVENTORY, false);
    expect(inv.add(new ItemInstance(Tile.rock, 40, 0))).toBe(true);
    expect(inv.add(new ItemInstance(Tile.rock, 40, 0))).toBe(true); // 64 + 16
    expect(inv.getItem(9)!.count).toBe(64);
    expect(inv.getItem(10)!.count).toBe(16);
    expect(inv.getLinked(0)).toBe(inv.getItem(9)); // 第一个链接槽自动指向第一个有东西的格
    expect(inv.hasResource(Tile.rock.id)).toBe(true);
    expect(inv.removeResource(Tile.rock.id)).toBe(true); // int 版本：减一个
    expect(inv.getItem(9)!.count).toBe(63);
    expect(inv.removeResource(new ItemInstance(Tile.rock, 70, 0), true)).toBe(0); // 精确 aux 版本：返回剩余未移除的数量
    expect(inv.getItem(9)?.count ?? 0).toBe(0);
    expect(inv.getItem(10)!.count).toBe(9); // 63 + 16 = 79，移走 70，剩 9
    expect(inv.getNumEmptySlots()).toBe(26); // 27 格里只有第 10 格不空
  });

  it('ChestTileEntity 同时是 TileEntity 与容器：保存与读取 27 格', () => {
    const c = new ChestTileEntity();
    expect(c).toBeInstanceOf(TileEntity);
    expect(c.getContainerSize()).toBe(27);
    c.setItem(0, new ItemInstance(Item.coal, 12, 0));
    c.setItem(26, new ItemInstance(Tile.wood, 64, 0));
    expect(c.shouldSave()).toBe(true);
    const tag = new CompoundTag();
    expect(c.save(tag)).toBe(true);
    const back = TileEntity.loadStatic(tag) as ChestTileEntity;
    expect(back).toBeInstanceOf(ChestTileEntity);
    expect([
      back.getItem(0)!.id,
      back.getItem(0)!.count,
      back.getItem(26)!.count,
      back.getItem(1),
    ]).toEqual([Item.coal.id, 12, 64, null]);
    expect(back.getName()).toBe('container.chest');
  });
});
