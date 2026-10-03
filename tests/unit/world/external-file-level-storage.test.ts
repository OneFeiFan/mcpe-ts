import { afterEach, describe, expect, it } from 'vitest';
import { SharedConstants } from '@mcpe/core';
import { VirtualFS, setVfs } from '@mcpe/platform';
import { ExternalFileLevelStorage, GameType, LevelData, Player, type Level } from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

// ExternalFileLevelStorage 的构造函数与玩家读写（B5a-2）。
// saveLevelData 那套"写临时文件→挪旧的→改名"的流程由黄金样本 G14-4 逐字节盖住，
// 这里只测黄金样本看不到的：目录创建、读回、以及玩家文件的往返。

const DIR = '/w';
const PLAYERS = DIR + '/players';

function freshVfs(): VirtualFS {
  const vfs = new VirtualFS();
  setVfs(vfs);
  return vfs;
}

/**
 * 造一份写进 level.dat 用的 LevelData（字段取几个好认的值）。
 *
 * 【storageVersion 必须显式设】LevelData 的默认值是 0，而 readLevelData 只认
 * `version === 1`（v1 裸字节）与 `version >= 2`（NBT）两条路 —— 版本 0 **两条都不走，
 * 于是静默什么都不读**（`loadedLevelData` 停在全默认值）。真实路径不会有这个值：
 * saveLevelData 在写之前会强制 setStorageVersion(SharedConstants.StorageVersion)。
 */
function sample(): LevelData {
  const d = new LevelData();
  d.setSeed(4242);
  d.setSpawn(7, 8, 9);
  d.setTime(555);
  d.setGameType(GameType.Survival);
  d.setLevelName('ReadBack');
  d.setAllowCheats(false);
  d.setStorageVersion(SharedConstants.StorageVersion);
  return d;
}

afterEach(() => {
  setVfs(null); // 模块级状态，用例之间必须清掉
});

describe('world/ExternalFileLevelStorage 的构造与玩家读写', () => {
  describe('构造函数', () => {
    it('把世界目录和 players 子目录都建出来', () => {
      const vfs = freshVfs();
      new ExternalFileLevelStorage('w1', DIR);
      expect(vfs.isDirectory(DIR)).toBe(true);
      expect(vfs.isDirectory(PLAYERS)).toBe(true);
    });

    it('读得到已有的 level.dat，prepareLevel 把它交出来', () => {
      const vfs = freshVfs();
      vfs.mkdir(DIR);
      expect(ExternalFileLevelStorage.writeLevelData(DIR + '/level.dat', sample(), null)).toBe(
        true,
      );

      const ext = new ExternalFileLevelStorage('w1', DIR);
      const ld = ext.prepareLevel(levelStub());
      expect(ld).not.toBeNull();
      expect(ld!.getSeed()).toBe(4242);
      expect(ld!.getLevelName()).toBe('ReadBack');
      expect(ld!.getStorageVersion()).toBe(sample().getStorageVersion());
    });

    it('两个文件都没有时 prepareLevel 返回 null（C++ 的 delete loadedLevelData）', () => {
      freshVfs();
      const ext = new ExternalFileLevelStorage('w1', DIR);
      expect(ext.prepareLevel(levelStub())).toBeNull();
    });

    it('level.dat 打不开时回退读 level.dat_old', () => {
      const vfs = freshVfs();
      vfs.mkdir(DIR);
      expect(ExternalFileLevelStorage.writeLevelData(DIR + '/level.dat_old', sample(), null)).toBe(
        true,
      );

      const ext = new ExternalFileLevelStorage('w1', DIR);
      expect(ext.prepareLevel(levelStub())!.getLevelName()).toBe('ReadBack');
    });
  });

  describe('savePlayer / loadPlayer', () => {
    it('存下去再读回来，位置一致', () => {
      // 【位置要取在合法范围内】Entity.load 会把 x/z **夹进世界边界**
      // （padding = bbWidth*0.5 + 0.001，玩家是 0.301），y 不夹。
      // 这里 z 取正数、x 也别贴着 0，免得测出来的差异其实来自那个 clamp 而不是存档往返。
      const vfs = freshVfs();
      vfs.mkdir(DIR);
      vfs.mkdir(PLAYERS);
      const player = makePlayer();
      player.setPos(1.5, 70.25, 12.5);

      ExternalFileLevelStorage.savePlayerTo(player, DIR);
      expect(vfs.exists(PLAYERS + '/Steve.dat')).toBe(true);

      player.setPos(0, 0, 0);
      expect(ExternalFileLevelStorage.loadPlayerFrom(player, DIR)).toBe(true);
      expect([player.x, player.y, player.z]).toEqual([1.5, 70.25, 12.5]);
    });

    it('文件不存在时返回 false（照 C++ 的 is_open 判断）', () => {
      freshVfs();
      expect(ExternalFileLevelStorage.loadPlayerFrom(makePlayer(), DIR)).toBe(false);
    });

    it('players 目录不存在时什么都不写，也不报错（对应 ofstream 打不开就静默失败）', () => {
      const vfs = freshVfs();
      vfs.mkdir(DIR); // 故意不建 players 子目录
      ExternalFileLevelStorage.savePlayerTo(makePlayer(), DIR);
      expect(vfs.exists(PLAYERS)).toBe(false);
      expect(vfs.listDir(DIR)).toEqual([]);
    });

    it('路径里会有双斜杠（worldDir 末尾带 / 时），normalize 会合并掉', () => {
      const vfs = freshVfs();
      vfs.mkdir(DIR);
      vfs.mkdir(PLAYERS);
      // saveLevelData 传给 savePlayer 的就是这种末尾带 / 的目录
      ExternalFileLevelStorage.savePlayerTo(makePlayer(), DIR + '/');
      expect(vfs.exists(PLAYERS + '/Steve.dat')).toBe(true);
    });
  });
});

/**
 * prepareLevel 只是把参数存下来再返回 loadedLevelData，参数本身没被读到 ——
 * 这里给个空替身，免得为了测它去建整个 Level。
 */
function levelStub(): Level {
  return null as unknown as Level;
}

function makePlayer(): Player {
  const p = new Player(createFlatLevel(), false);
  p.name = 'Steve';
  return p;
}
