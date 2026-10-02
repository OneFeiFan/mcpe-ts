import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Random } from '@mcpe/util';
import {
  DyePowderItem, Facing, FoodItem, HeavyTile, initTileEntities, Item, type CompoundTag, type ItemInstance, type Level, LevelListener,
  partitionTileEntities, type Player, SignTileEntity, Tile, TileEntity, TileEntityFactory, TileEntityType, TileItem,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// S11 阶段 A：签名补全与先行的部分移植。ItemInstance、CompoundTag、Player 还是前向声明，这里用最小的替身对象。
class FakeTag implements CompoundTag {
  m = new Map<string, number | string>();
  getInt(n: string) { return (this.m.get(n) as number) ?? 0; }
  putInt(n: string, v: number) { this.m.set(n, v); }
  getShort(n: string) { return (this.m.get(n) as number) ?? 0; }
  putShort(n: string, v: number) { this.m.set(n, v); }
  getByte(n: string) { return (this.m.get(n) as number) ?? 0; }
  putByte(n: string, v: number) { this.m.set(n, v); }
  getString(n: string) { return (this.m.get(n) as string) ?? ''; }
  putString(n: string, v: string) { this.m.set(n, v); }
  contains(n: string) { return this.m.has(n); }
}
const inst = (id: number, count: number, aux = 0) =>
  ({ id, count, getAuxValue: () => aux, setAuxValue() {}, hurt() {}, getItem: () => null, isNull: () => count <= 0 }) as ItemInstance;
class TestTE extends TileEntity {
  constructor() { super(TileEntityType.Undefined); }
  shouldSave() { return true; }
}

let level: Level;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  level = createFlatLevel();
  prepareLevel(level);
  initTileEntities();
});

describe('TileEntity 与 SignTileEntity', () => {
  it('save/load：id 与坐标、四行文字（超长截到 15 个字符）；loadStatic 按 id 创建', () => {
    const s = new SignTileEntity();
    s.x = 1; s.y = 2; s.z = 3;
    s.messages = ['hello', '', 'x'.repeat(20), 'end'];
    const tag = new FakeTag();
    expect(s.save(tag)).toBe(true);
    expect([tag.getString('id'), tag.getInt('x'), tag.getInt('y'), tag.getInt('z'), tag.getString('Text1')]).toEqual(['Sign', 1, 2, 3, 'hello']);
    const back = TileEntity.loadStatic(tag) as SignTileEntity;
    expect(back).toBeInstanceOf(SignTileEntity);
    expect(back.messages[2]).toBe('x'.repeat(15));
    expect(back.isEditable()).toBe(false);
    expect([TileEntity.isType(back, TileEntityType.Sign), back.isType(TileEntityType.Furnace), TileEntity.isType(null, TileEntityType.Sign)]).toEqual([true, false, false]);
  });

  it('工厂：还没移植的子类报出写明原因的错误；未知类型返回 null', () => {
    expect(() => TileEntityFactory.createTileEntity(TileEntityType.Furnace)).toThrow(/FurnaceTileEntity 尚未移植/);
    expect(TileEntityFactory.createTileEntity(99)).toBeNull();
  });

  it('partitionTileEntities：同一位置只留第一个，shouldSave 为假的分到另一边', () => {
    const a = new TestTE(), b = new TestTE(), c = new TestTE();
    b.x = 0; c.x = 5;
    const keep: TileEntity[] = [], drop: TileEntity[] = [];
    expect(partitionTileEntities([a, b, c], keep, drop)).toBe(2);
    expect(keep).toEqual([a, c]);
    expect(drop).toEqual([b]);
  });

  it('Level 的方块实体函数：set、get、changed（通知监听器）、remove', () => {
    const was = Tile.isEntityTile[7]!;
    Tile.isEntityTile[7] = true; // 借用基岩当方块实体格（真正的方块实体方块在阶段 C 注册）
    try {
      const heard: number[][] = [];
      const l = new (class extends LevelListener { override tileEntityChanged(x: number, y: number, z: number) { heard.push([x, y, z]); } })();
      level.addListener(l);
      const te = new TestTE();
      level.setTileEntity(136, 0, 136, te);
      expect(level.getTileEntity(136, 0, 136)).toBe(te);
      expect([te.x, te.y, te.z, te.level === level]).toEqual([136, 0, 136, true]);
      expect(level.getChunkAt(136, 136).hasTileEntityAt(8, 0, 8)).toBe(true);
      te.setChanged();
      expect(heard).toEqual([[136, 0, 136]]);
      level.removeTileEntity(136, 0, 136);
      expect(te.isRemoved()).toBe(true);
      expect(level.getChunkAt(136, 136).hasTileEntityAt(8, 0, 8)).toBe(false);
      Tile.isEntityTile[7] = was; // 借来的基岩不是 EntityTile：再取会走“自动创建”分支（C++ 里同样会把基岩强转成 EntityTile）
      expect(level.getTileEntity(136, 0, 136)).toBeNull();
      level.removeListener(l);
    } finally {
      Tile.isEntityTile[7] = was;
    }
  });
});

describe('Tile 与 Item 的签名补全', () => {
  it('spawnResources 的随机数调用次数与 C++ 相同（生成实体的一句 S12 恢复）', () => {
    const r = new Random(42), ref = new Random(42);
    const lv = { isClientSide: false, random: r } as unknown as Level;
    Tile.rock.spawnResources(lv, 0, 0, 0, 0); // 数量 1：odds 判定 1 次 + 偏移 3 次
    for (let i = 0; i < 4; i++) ref.nextFloat();
    expect(r.nextInt(1 << 30)).toBe(ref.nextInt(1 << 30));
    expect(Tile.rock.getExplosionResistance(null)).toBeCloseTo(Tile.rock.explosionResistance / 5);
  });

  it('TileItem.useOn$10：在草地上放一块泥土，数量减一', () => {
    const item = new TileItem(3 - 256); // 泥土（物品注册在阶段 C）
    const it = inst(3, 1);
    const player = { x: 130, y: 65, z: 130 } as unknown as Player;
    expect(item.useOn(it, player, level, 130, 63, 130, Facing.UP, 0.5, 1, 0.5)).toBe(true);
    expect(level.getTile(130, 64, 130)).toBe(3);
    expect(it.count).toBe(0);
    expect(item.useOn(it, player, level, 130, 64, 130, Facing.UP, 0.5, 1, 0.5)).toBe(false); // 数量为 0
    level.setTile(130, 64, 130, 0);
  });

  it('Item 的重载分派：getDescriptionId() 与 getDescriptionId(instance)、useOn 的 6 参与 10 参版本', () => {
    const dye = new DyePowderItem(95);
    dye.setDescriptionId('dyePowder');
    expect(dye.getDescriptionId()).toBe('item.dyePowder');
    expect(dye.getDescriptionId(inst(351, 1, DyePowderItem.BLUE))).toBe('item.dyePowder.blue');
    expect(dye.getIcon(9)).toBe(dye.icon + 1 * Item.ICON_COLUMNS + 1);
    expect(new Item(3000 - 256).useOn(inst(1, 1), level, 0, 0, 0, 1)).toBe(false);
  });

  it('FoodItem：受伤且不是无敌时开始进食；吃完数量减一，播放声音时消耗一次随机数', () => {
    const food = new FoodItem(4, 4, false);
    const calls: number[] = [];
    const player = { x: 0, y: 0, z: 0, heightOffset: 1.62, abilities: { invulnerable: false }, isHurt: () => true, startUsingItem: (_i: ItemInstance, d: number) => calls.push(d) } as unknown as Player;
    const it = inst(260, 2);
    food.use(it, level, player);
    expect(calls).toEqual([32]);
    expect(food.useTimeDepleted(it, level, player).count).toBe(1);
  });

  it('HeavyTile：instaFall 时直接落到底；平时生成下落实体的语句 DEFERRED，方块原地不动', () => {
    const heavy = new HeavyTile(200, 0);
    Tile.tiles[200] = heavy; // 注册发生在 initTiles 调用的 init() 里；这里直接放进表
    level.setTileNoUpdate(140, 70, 140, 200);
    heavy.tick(level, 140, 70, 140, level.random);
    expect(level.getTile(140, 70, 140)).toBe(200); // FallingTile 未移植
    HeavyTile.instaFall = true;
    heavy.tick(level, 140, 70, 140, level.random);
    expect([level.getTile(140, 70, 140), level.getTile(140, 64, 140)]).toEqual([0, 200]);
    HeavyTile.instaFall = false;
    level.setTileNoUpdate(140, 64, 140, 0);
    Tile.tiles[200] = null;
    expect(heavy.getTickDelay(level)).toBe(2);
    expect(heavy.getTickDelay()).toBe(Tile.rock.getTickDelay());
  });
});
