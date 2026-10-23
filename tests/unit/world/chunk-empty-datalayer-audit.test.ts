import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DataLayer, EmptyLevelChunk, LevelChunk, LightLayer } from '@mcpe/world';
import type { AABB, Entity } from '@mcpe/world';
import { FakeLevel } from '../../helpers/fakeLevel';
import { initTestTiles } from '../../helpers/initTestTiles';

/** C++ Tile::invisible_bedrock->id */
const invisibleBedrockId = 95;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  initTestTiles();
  LevelChunk.ChunkBlockCount = 32768;
});

describe('EmptyLevelChunk 审核（工作表 30 行，W56 仅注释修正）', () => {
  it('两个 C++ 构造函数：都走基类构造并把 dontSave 置 true', () => {
    const level = new FakeLevel();
    const a = new EmptyLevelChunk(level, 3, -4);
    const b = new EmptyLevelChunk(level, null, 3, -4);
    for (const c of [a, b]) {
      expect([c.dontSave, c.isEmpty(), c.shouldSave(true)]).toEqual([true, true, false]);
      expect([c.x, c.z, c.xt, c.zt]).toEqual([3, -4, 48, -64]);
      expect(c.level).toBe(level);
      expect(c.getBlockData()).toBeNull();
    }
    expect([a.isAt(3, -4), a.isAt(4, -4), a.isAt(3, -3)]).toEqual([true, false, false]);
  });

  it('读接口恒值：invisible_bedrock(95)、0、7、false', () => {
    const c = new EmptyLevelChunk(new FakeLevel(), null, 0, 0);
    expect(c.getHeightmap(1, 2)).toBe(0);
    expect(c.getTile(1, 64, 2)).toBe(invisibleBedrockId);
    expect(c.getData(1, 64, 2)).toBe(0);
    expect(c.getBrightness(LightLayer.Sky, 1, 64, 2)).toBe(7);
    expect(c.getBrightness(LightLayer.Block, 1, 64, 2)).toBe(7);
    expect(c.getRawBrightness(1, 64, 2, 0)).toBe(7);
    expect(c.getRawBrightness(1, 64, 2, 15)).toBe(7);
    expect(c.isSkyLit(1, 64, 2)).toBe(false);
    expect(c.isEmpty()).toBe(true);
  });

  it('写接口与生命周期接口全部为空实现，不改变读到的内容', () => {
    const level = new FakeLevel();
    const c = new EmptyLevelChunk(level, null, 0, 0);
    expect(c.setTile(1, 64, 2, 1)).toBe(true);
    expect(c.setTileAndData(1, 64, 2, 1, 2)).toBe(true);
    c.setData(1, 64, 2, 3);
    c.setBrightness(LightLayer.Block, 1, 64, 2, 15);
    c.setBlocks(new Uint8Array(4), 0);
    const e = {} as Entity;
    c.addEntity(e);
    c.removeEntity(e);
    c.removeEntity(e, 3);
    c.skyBrightnessChanged();
    c.recalcBlockLights();
    c.recalcHeightmapOnly();
    c.recalcHeightmap();
    c.lightLava();
    c.load();
    c.unload();
    c.markUnsaved();
    const list: Entity[] = [];
    c.getEntities(null, {} as AABB, list);
    expect(list).toEqual([]);
    expect([c.getTile(1, 64, 2), c.getData(1, 64, 2), c.getHeightmap(1, 2)]).toEqual([95, 0, 0]);
    expect([c.dontSave, c.isEmpty()]).toEqual([true, true]);
    expect(level.light.size).toBe(0);
  });

  it('getBlocksAndData 从 p 起填 len 字节 95，返回 len（不是 p + len）', () => {
    const c = new EmptyLevelChunk(new FakeLevel(), null, 0, 0);
    const buf = new Uint8Array(40).fill(7);
    const n = c.getBlocksAndData(buf, 0, 0, 0, 2, 2, 2, 10); // s = 8，len = 8 + 4 * 3 = 20
    expect(n).toBe(20);
    expect(buf[9]).toBe(7);
    expect(Array.from(buf.subarray(10, 30))).toEqual(new Array(20).fill(invisibleBedrockId));
    expect(buf[30]).toBe(7);

    const odd = new Uint8Array(16); // s = 3（奇数），len = 3 + 1 * 3 = 6
    expect(c.getBlocksAndData(odd, 0, 0, 0, 3, 1, 1, 4)).toBe(6);
    expect(Array.from(odd)).toEqual([0, 0, 0, 0, 95, 95, 95, 95, 95, 95, 0, 0, 0, 0, 0, 0]);
  });

  it('setBlocksAndData 什么都不写，返回同一个长度', () => {
    const c = new EmptyLevelChunk(new FakeLevel(), null, 0, 0);
    const data = new Uint8Array(40).fill(7);
    expect(c.setBlocksAndData(data, 0, 0, 0, 2, 2, 2, 10)).toBe(20);
    expect(Array.from(data)).toEqual(new Array(40).fill(7));
    expect(c.setBlocksAndData(new Uint8Array(0), 0, 0, 0, 3, 1, 1, 4)).toBe(6);
  });

  it('getRandom 与 LevelChunk 里原样重复的实现逐位一致', () => {
    const level = new FakeLevel();
    level.seed = 123456789;
    for (const [x, z, l] of [
      [5, -7, 99],
      [0, 0, 0],
      [-3, 11, 0x7fffffff],
    ] as const) {
      const a = new EmptyLevelChunk(level, null, x, z).getRandom(l);
      const b = new LevelChunk(level, x, z).getRandom(l);
      expect(a.getSeed()).toBe(b.getSeed());
      expect([a.nextInt(), a.nextInt(), a.nextInt()]).toEqual([
        b.nextInt(),
        b.nextInt(),
        b.nextInt(),
      ]);
    }
  });
});

describe('DataLayer 审核（工作表 9 行，W57 补 OMIT 登记）', () => {
  it('三个构造函数：长度按 length >> 1，外部缓冲直接别名，slotMax 按规范取 0', () => {
    const empty = new DataLayer();
    expect([empty.data, empty.length, empty.slotMax, empty.isValid()]).toEqual([null, 0, 0, false]);

    const d = new DataLayer(64);
    expect([d.length, d.data!.length, d.slotMax, d.isValid()]).toEqual([32, 32, 32, true]);
    expect(Array.from(d.data!)).toEqual(new Array(32).fill(0));
    expect(new DataLayer(65).length).toBe(32); // C++ int >> 1

    const buf = new Uint8Array(8).fill(0xab);
    const alias = new DataLayer(buf, 8);
    expect(alias.data).toBe(buf); // C++ 保存指针，不复制
    expect(alias.length).toBe(4);
    expect(alias.slotMax).toBe(0); // C++ 该构造不初始化 slotMax
    expect(alias.isValid()).toBe(true);
  });

  it('4 位打包：偶数 pos 低半字节、奇数 pos 高半字节，set 保留另一半', () => {
    const d = new DataLayer(128);
    d.set(1, 0xa);
    expect(d.data![0]).toBe(0xa0);
    d.set(0, 0x5);
    expect(d.data![0]).toBe(0xa5);
    expect([d.get(0), d.get(1)]).toEqual([5, 0xa]);
    d.set(1, 0x3);
    expect(d.data![0]).toBe(0x35);
    expect(d.get(0)).toBe(5);
  });

  it('坐标重载按 x << 11 | z << 7 | y 打包，值只取低 4 位', () => {
    const d = new DataLayer(32768); // 16384 字节，覆盖 32768 个半字节
    d.set(15, 127, 15, 0xf); // pos 32767 → slot 16383，part 1
    expect(d.get(15, 127, 15)).toBe(15);
    expect(d.data![16383]).toBe(0xf0);

    d.set(1, 2, 3, 9);
    const pos = (1 << 11) | (3 << 7) | 2;
    expect(d.get(1, 2, 3)).toBe(9);
    expect(d.get(pos)).toBe(9);

    d.set(0, 0, 0, 0x1f);
    expect(d.get(0, 0, 0)).toBe(15);
    d.set(0, 0, 0, -1);
    expect(d.get(0, 0, 0)).toBe(15);
  });

  it('setAll 保留 C++ 的 br & (br << 4) 怪癖，而且只填 length 字节', () => {
    const d = new DataLayer(16); // 8 字节
    d.setAll(15); // 15 & 240 = 0
    expect(Array.from(d.data!)).toEqual(new Array(8).fill(0));
    d.setAll(255); // 255 & 4080 = 240
    expect(Array.from(d.data!)).toEqual(new Array(8).fill(240));
    d.setAll(1); // 1 & 16 = 0
    expect(Array.from(d.data!)).toEqual(new Array(8).fill(0));

    const buf = new Uint8Array(8).fill(0x11);
    const alias = new DataLayer(buf, 8); // length = 4
    alias.setAll(255);
    expect(Array.from(buf)).toEqual([240, 240, 240, 240, 0x11, 0x11, 0x11, 0x11]);
  });
});
