import { describe, expect, it } from 'vitest';
import { CompoundTag } from '@mcpe/nbt';
import { BitStream } from '@mcpe/util';
import { GameType, LevelData, LevelSettings } from '@mcpe/world';

/** 造一个字段都不是默认值的 LevelData，好让往返测试有意义 */
function sample(): LevelData {
  const d = new LevelData(new LevelSettings(123456789, GameType.Creative), '我的世界', 7);
  d.setSpawn(11, 22, 33);
  d.setTime(987654321);
  d.setSizeOnDisk(4096);
  d.setStorageVersion(1);
  d.setAllowCheats(true);
  return d;
}

describe('world/leveldata（B4b：NBT 读写）', () => {
  describe('createTag / getTagData', () => {
    it('createTag 写出的键与字段一一对应（含 Platform=2 这个写死的魔数）', () => {
      const tag = sample().createTag();
      expect(tag.getLong('RandomSeed')).toBe(123456789n);
      expect(tag.getInt('GameType')).toBe(GameType.Creative);
      expect(tag.getBoolean('AllowCommands')).toBe(true);
      expect(tag.getInt('SpawnX')).toBe(11);
      expect(tag.getInt('SpawnY')).toBe(22);
      expect(tag.getInt('SpawnZ')).toBe(33);
      expect(tag.getLong('Time')).toBe(987654321n);
      expect(tag.getLong('SizeOnDisk')).toBe(4096n);
      expect(tag.getString('LevelName')).toBe('我的世界');
      expect(tag.getInt('StorageVersion')).toBe(1);
      expect(tag.getInt('Platform')).toBe(2); // C++ 里是写死的常数
      // LastPlayed 写的是当前时间戳，这里只确认它被写了
      expect(tag.contains('LastPlayed')).toBe(true);
    });

    it('createTag → getTagData 往返，字段一致', () => {
      const src = sample();
      const back = new LevelData(src.createTag());
      expect(back.getSeed()).toBe(src.getSeed());
      expect(back.getXSpawn()).toBe(11);
      expect(back.getYSpawn()).toBe(22);
      expect(back.getZSpawn()).toBe(33);
      expect(back.getTime()).toBe(987654321);
      expect(back.getSizeOnDisk()).toBe(4096);
      expect(back.getLevelName()).toBe('我的世界');
      expect(back.getStorageVersion()).toBe(1);
      expect(back.getGameType()).toBe(GameType.Creative);
      expect(back.getAllowCheats()).toBe(true);
    });

    it('getTagData 会按 gameType 重算 spawnMobs', () => {
      const tag = new CompoundTag();
      tag.putInt('GameType', GameType.Survival);
      const d = new LevelData();
      d.setSpawnMobs(false);
      d.getTagData(tag);
      expect(d.getSpawnMobs()).toBe(true);
    });

    it('【原样保留】(int) 强转：SizeOnDisk / LastPlayed 从 64 位截到 32 位', () => {
      // C++ 写的是 sizeOnDisk = (int)tag->getLong("SizeOnDisk")
      const tag = new CompoundTag();
      tag.putLong('SizeOnDisk', 0x100000001n); // 低 32 位是 1
      tag.putLong('LastPlayed', 0x100000005n); // 低 32 位是 5
      tag.putLong('Time', 0x100000007n); // Time 没有强转，应当原样保留
      const d = new LevelData();
      d.getTagData(tag);
      expect(d.getSizeOnDisk()).toBe(1);
      expect(d.getLastPlayed()).toBe(5);
      expect(d.getTime()).toBe(0x100000007);
    });

    it('tag 为 null 时两个函数都不做事（C++ 的 if (!tag) return）', () => {
      const d = sample();
      d.getTagData(null);
      expect(d.getLevelName()).toBe('我的世界'); // 没被清掉
      expect(() => d.setTagData(null, null)).not.toThrow();
    });
  });

  describe('玩家标签的拷贝语义', () => {
    it('setPlayerTag 是**拷贝**一份：之后改源标签不影响已存的', () => {
      const src = new CompoundTag();
      src.putInt('Health', 20);
      const d = new LevelData();
      d.setPlayerTag(src);
      src.putInt('Health', 1); // 改源
      expect(d.getLoadedPlayerTag()!.getInt('Health')).toBe(20);
    });

    it('setLoadedPlayerTag 是**接管**：存的就是传进来那个对象', () => {
      const tag = new CompoundTag();
      const d = new LevelData();
      d.setLoadedPlayerTag(tag);
      expect(d.getLoadedPlayerTag()).toBe(tag);
      d.setLoadedPlayerTag(null);
      expect(d.getLoadedPlayerTag()).toBeNull();
    });

    it('loadLevelData 里含 Player 标签时会一并读进来', () => {
      const player = new CompoundTag();
      player.putInt('Health', 7);
      const tag = sample().createTag();
      tag.putCompound('Player', player);
      const d = new LevelData(tag);
      expect(d.getLoadedPlayerTag()).not.toBeNull();
      expect(d.getLoadedPlayerTag()!.getInt('Health')).toBe(7);
    });

    it('拷贝构造会把玩家标签一起拷过来（且是副本，不是同一个对象）', () => {
      const src = sample();
      const player = new CompoundTag();
      player.putInt('Health', 9);
      src.setPlayerTag(player);
      const copy = new LevelData(src);
      expect(copy.getLoadedPlayerTag()!.getInt('Health')).toBe(9);
      expect(copy.getLoadedPlayerTag()).not.toBe(src.getLoadedPlayerTag());
    });
  });

  describe('v1 字节流', () => {
    it('v1Write → v1Read 往返，字段一致', () => {
      const src = sample();
      const bs = new BitStream();
      src.v1Write(bs);
      bs.resetReadPointer();

      const back = new LevelData();
      back.v1Read(bs, 1);
      expect(back.getSeed()).toBe(123456789);
      expect(back.getXSpawn()).toBe(11);
      expect(back.getYSpawn()).toBe(22);
      expect(back.getZSpawn()).toBe(33);
      expect(back.getTime()).toBe(987654321);
      expect(back.getSizeOnDisk()).toBe(4096);
      expect(back.getLevelName()).toBe('我的世界');
      expect(back.getStorageVersion()).toBe(1);
    });

    it('v1Write 的字节布局：7 个整数之后跟 RakString', () => {
      // C++ 里 getEpochTimeS() 返回 int，所以最后那个整数是 4 字节，不是 8
      const d = new LevelData();
      const bs = new BitStream();
      d.v1Write(bs);
      // seed(8) + xSpawn(4) + ySpawn(4) + zSpawn(4) + time(8) + sizeOnDisk(8) + epochTime(4)
      // 之后是 levelName：2 字节长度 + 内容
      const levelNameBytes = 2 + new TextEncoder().encode(d.getLevelName()).length;
      expect(bs.getNumberOfBytesUsed()).toBe(8 + 4 + 4 + 4 + 8 + 8 + 4 + levelNameBytes);
    });
  });
});
