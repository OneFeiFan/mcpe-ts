import { describe, expect, it, vi } from 'vitest';
import { SharedConstants } from '@mcpe/core';
import {
  FlatDimension,
  GameType,
  Level,
  LevelEvent,
  LevelSettings,
  MemoryLevelStorage,
  Player,
  ServerLevel,
} from '@mcpe/world';
import { initHeadless } from '../../helpers/headlessLevel';

// ServerLevel（B7）：比 Level 多做一件"管睡觉"的事 —— 判断是不是所有人都睡了，
// 是的话跳过夜晚、把大家叫醒并把血补满。
//
// 网络那两行（SetHealthPacket / SetTimePacket）是 DEFERRED(Network)，所以这里测的是
// 除发包之外的全部逻辑。

function makeServerLevel(): ServerLevel {
  // 方块、生物群系那些注册表得先建起来 —— 与 createFlatLevel 用的是同一套无头启动顺序。
  // 少了它，awakenAllPlayers 走到 Player.stopSleepInBed 里读 Tile.bed.id 时会抛"尚未注册"。
  initHeadless();
  return new ServerLevel(
    new MemoryLevelStorage(),
    'demo',
    new LevelSettings(0, GameType.Creative),
    SharedConstants.GeneratorVersion,
    new FlatDimension(),
  );
}

/**
 * `playerIsSleeping` / `sleepCounter` 都是 private，这里直接改 —— TS 的 private 只是编译期的。
 * 走正常路径的话要先把玩家挪到床边再调 tick，跟这两个函数要测的东西没关系。
 */
function setSleepState(p: Player, sleeping: boolean, counter = 0): void {
  const raw = p as unknown as { playerIsSleeping: boolean; sleepCounter: number };
  raw.playerIsSleeping = sleeping;
  raw.sleepCounter = counter;
}

/**
 * 读保护字段 `allPlayersAreSleeping`。C++ 里它是 protected，测试里犯不着为它改可见性 ——
 * TS 的 protected 也只是编译期的。
 */
function isAllSleeping(l: ServerLevel): boolean {
  return (l as unknown as { allPlayersAreSleeping: boolean }).allPlayersAreSleeping;
}

/** Player 在 TS 里显式声明成 abstract；那几个抽象成员其实已经实现了，给个空子类就能实例化 */
class TestPlayer extends Player {}

function makePlayer(level: Level): Player {
  return new TestPlayer(level, false);
}

/** 造一个 level + 若干玩家，玩家已挂到 level.players 上 */
function withPlayers(count: number): { level: ServerLevel; players: Player[] } {
  const level = makeServerLevel();
  const players: Player[] = [];
  for (let i = 0; i < count; i++) {
    const p = makePlayer(level);
    players.push(p);
    level.players.push(p);
  }
  return { level, players };
}

describe('world/ServerLevel', () => {
  it('构造出来时"所有人都睡着了"是 false', () => {
    expect(isAllSleeping(makeServerLevel())).toBe(false);
  });

  describe('updateSleepingPlayerList', () => {
    /**
     * 【`!players.empty()` 那一句的后果】C++ 先把 `allPlayersAreSleeping` 设成"玩家列表非空"，
     * 再逐个往下翻。所以**一个玩家都没有时循环压根不进**，结果停在 false —— 空世界不算"都睡了"。
     */
    it('没有任何玩家时不成立', () => {
      const { level } = withPlayers(0);
      level.updateSleepingPlayerList();
      expect(isAllSleeping(level)).toBe(false);
    });

    it('有一个人醒着就不成立', () => {
      const { level, players } = withPlayers(2);
      setSleepState(players[0]!, true);
      setSleepState(players[1]!, false);
      level.updateSleepingPlayerList();
      expect(isAllSleeping(level)).toBe(false);
    });

    it('全睡着了就成立，并且发一次 ALL_PLAYERS_SLEEPING 外加给每个人 setAllPlayersSleeping', () => {
      const { level, players } = withPlayers(2);
      setSleepState(players[0]!, true);
      setSleepState(players[1]!, true);
      const event = vi.spyOn(level, 'levelEvent');
      const perPlayer = players.map((p) => vi.spyOn(p, 'setAllPlayersSleeping'));

      level.updateSleepingPlayerList();

      expect(isAllSleeping(level)).toBe(true);
      expect(event).toHaveBeenCalledWith(null, LevelEvent.ALL_PLAYERS_SLEEPING, 0, 0, 0, 0);
      for (const s of perPlayer) expect(s).toHaveBeenCalled();
    });

    /**
     * 【条件是"从没睡够翻成睡够了"那一刻】`if (!allPlayersWasSleeping && allPlayersAreSleeping)`
     * —— 已经全睡了再调一次，不会再发。
     */
    it('已经全睡时再调一次不再发通知', () => {
      const { level, players } = withPlayers(1);
      setSleepState(players[0]!, true);
      level.updateSleepingPlayerList();

      const event = vi.spyOn(level, 'levelEvent');
      level.updateSleepingPlayerList();
      expect(event).not.toHaveBeenCalled();
    });
  });

  describe('allPlayersSleeping', () => {
    it('要上一次算出来的结果成立、且不是客户端', () => {
      const { level, players } = withPlayers(1);
      setSleepState(players[0]!, true, Player.SLEEP_DURATION);
      expect(level.allPlayersSleeping(), '还没更新过列表，allPlayersAreSleeping 是 false').toBe(
        false,
      );

      level.updateSleepingPlayerList();
      setSleepState(players[0]!, true, Player.SLEEP_DURATION); // 见下面那条：这一刻计数被清零了
      expect(level.allPlayersSleeping()).toBe(true);

      level.isClientSide = true;
      expect(level.allPlayersSleeping(), '客户端不算').toBe(false);
    });

    /**
     * 【刚全睡的那一瞬间还跳不了夜】`updateSleepingPlayerList` 一旦判定"全睡了"，就会给每个人调
     * `setAllPlayersSleeping()` —— 而 C++ 的 `Player::setAllPlayersSleeping` 头一句就是
     * **`sleepCounter = 0`**。于是所有人的"睡够时长"进度当场归零，`allPlayersSleeping()` 得等他们
     * 再睡满一整轮（`SLEEP_DURATION` 拍）才成立。
     * 这不是 bug，是 C++ 就有的行为；一条用例把它钉住，免得以后有人"顺手删掉"那句清零。
     */
    it('全睡的那一刻会把每个人的睡眠计时清零，所以要再睡满一轮才算数', () => {
      const { level, players } = withPlayers(1);
      setSleepState(players[0]!, true, Player.SLEEP_DURATION);

      level.updateSleepingPlayerList();
      expect(isAllSleeping(level)).toBe(true);
      expect(level.allPlayersSleeping(), '计数被 setAllPlayersSleeping 清零了').toBe(false);

      setSleepState(players[0]!, true, Player.SLEEP_DURATION);
      expect(level.allPlayersSleeping()).toBe(true);
    });

    it('睡够时长才算，刚躺下不算', () => {
      const { level, players } = withPlayers(1);
      setSleepState(players[0]!, true, Player.SLEEP_DURATION - 1);
      level.updateSleepingPlayerList();
      expect(level.allPlayersSleeping()).toBe(false);

      setSleepState(players[0]!, true, Player.SLEEP_DURATION);
      expect(level.allPlayersSleeping()).toBe(true);
    });
  });

  describe('awakenAllPlayers', () => {
    it('只把睡着的人叫醒并补满血，醒着的不动', () => {
      const { level, players } = withPlayers(2);
      setSleepState(players[0]!, true);
      setSleepState(players[1]!, false);
      players[1]!.health = 3;

      level.awakenAllPlayers();

      expect(isAllSleeping(level)).toBe(false);
      expect(players[0]!.health).toBe(Player.MAX_HEALTH);
      expect(players[1]!.health, '没睡的没被碰').toBe(3);
    });
  });

  describe('tick', () => {
    it('所有人都睡够时：时间跳到当天的整数边界，并把大家叫醒', () => {
      const { level, players } = withPlayers(1);
      // 把时间推到"差一点满一天"，跳完应该正好落在边界上
      level.getLevelData().setTime(Level.TICKS_PER_DAY - 5);
      setSleepState(players[0]!, true, Player.SLEEP_DURATION);
      level.updateSleepingPlayerList();
      setSleepState(players[0]!, true, Player.SLEEP_DURATION); // 计数刚被清零，补回来
      expect(level.allPlayersSleeping(), '前置条件').toBe(true);

      level.tick();

      expect(level.getLevelData().getTime() % Level.TICKS_PER_DAY).toBe(0);
      expect(players[0]!.health).toBe(Player.MAX_HEALTH);
      expect(isAllSleeping(level), 'awakenAllPlayers 会把它清掉').toBe(false);
    });

    it('没人睡时时间照常走，不变天', () => {
      const { level } = withPlayers(1);
      level.getLevelData().setTime(5000);
      level.tick();
      // Level::tick 本身每拍就把时间 +1，所以这里只断言"没有整段跳一天"
      expect(level.getLevelData().getTime()).toBe(5001);
    });
  });
});
