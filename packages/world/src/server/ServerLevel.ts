/**
 * 1:1 移植自 src/server/ServerLevel.h/.cpp（97 行）。
 *
 * 比 Level 多做一件事：**管睡觉**。玩家躺下之后由它判断"是不是所有人都睡了"，
 * 是的话跳过夜晚、把大家叫醒并把血补满。
 *
 * 【为什么客户端要这个类】C++ 是客户端/服务端一体的：`Minecraft::selectLevel` 造的就是
 * `ServerLevel`（多人时这个对象在服务端跑，单人时就在本进程里）。网页版没有服务端，
 * 但这个类在单人下照样有意义 —— 单人世界里睡觉跳过夜晚就是它干的。
 *
 * 【网络那两处】`awakenAllPlayers` 和 `tick` 各自要发一个包（SetHealthPacket / SetTimePacket）。
 * TS 的 `Level.raknetInstance` 是个 `unknown`（网络未移植），所以那两行原地标 DEFERRED(Network)。
 * 除了发包，这两个函数的逻辑是完整的。
 */
import type { Dimension } from '../level/dimension/Dimension';
import { Level } from '../level/Level';
import { LevelEvent } from '../level/tile/LevelEvent';
import type { LevelSettings } from '../level/LevelSettings';
import type { LevelStorage } from '../level/storage/LevelStorage';
import { Player } from '../entity/player/Player';

export class ServerLevel extends Level {
  // 【不重复声明 allPlayersAreSleeping】C++ 里它是 ServerLevel 的 protected 字段，
  // 但 TS 这边 Level 已经先声明了一个同名的（Level.ts 里 updateSleepingPlayerList 的虚实现要用到），
  // 再声明一次就是"重定义基类字段"。构造函数里的赋值照旧保留。
  constructor(
    levelStorage: LevelStorage | null,
    levelName: string,
    settings: LevelSettings,
    generatorVersion: number,
    fixedDimension: Dimension | null = null,
  ) {
    super(levelStorage, levelName, settings, generatorVersion, fixedDimension);
    this.allPlayersAreSleeping = false;
  }

  /**
   * 重算"是不是所有人都睡着了"，并且**只在"从没睡够"翻成"睡够了"的那一瞬间**通知。
   *
   * 【注意 `!players.empty()` 那一句】它不是"有没有人"，而是把 `allPlayersAreSleeping`
   * 先设成"玩家列表非空"，再逐个玩家往下翻成 false。所以**空世界**（没有玩家）时循环不进，
   * 结果就停在 false —— 与"C++ 想表达什么"无关，照着写。
   */
  override updateSleepingPlayerList(): void {
    const allPlayersWasSleeping = this.allPlayersAreSleeping;
    this.allPlayersAreSleeping = this.players.length !== 0;
    for (let i = 0; i < this.players.length; ++i) {
      const player = this.players[i]!;
      if (!player.isSleeping()) {
        this.allPlayersAreSleeping = false;
        break;
      }
    }
    if (!allPlayersWasSleeping && this.allPlayersAreSleeping) {
      this.levelEvent(null, LevelEvent.ALL_PLAYERS_SLEEPING, 0, 0, 0, 0);
      for (let i = 0; i < this.players.length; ++i) {
        this.players[i]!.setAllPlayersSleeping();
      }
    }
  }

  /** 把正在睡的人叫醒，血补满。**睡着的才动** —— 醒着的玩家不碰 */
  awakenAllPlayers(): void {
    this.allPlayersAreSleeping = false;
    for (let i = 0; i < this.players.length; ++i) {
      const player = this.players[i]!;
      if (player.isSleeping()) {
        player.stopSleepInBed(false, false, true);
        player.health = Player.MAX_HEALTH;
        player.lastHealth = Player.MAX_HEALTH;
      }
    }
    // DEFERRED(Network): SetHealthPacket packet(Player::MAX_HEALTH); raknetInstance->send(packet);
    //   这个包是把"血补满了"同步给客户端；单机下没有对面要同步。
  }

  /**
   * 【两道门】先看 `allPlayersAreSleeping`（上一次算出来的结果，不是现算的），
   * 再过 `!isClientSide`。然后**每个人都得 `isSleepingLongEnough()`** 才算数 ——
   * 这条是防"刚躺下就跳过夜晚"。
   */
  allPlayersSleeping(): boolean {
    if (this.allPlayersAreSleeping && !this.isClientSide) {
      for (let i = 0; i < this.players.length; ++i) {
        if (!this.players[i]!.isSleepingLongEnough()) return false;
      }
      return true;
    }
    return false;
  }

  override tick(): void {
    super.tick();
    if (this.allPlayersSleeping()) {
      const newTime = this.levelData.getTime() + Level.TICKS_PER_DAY;
      this.levelData.setTime(newTime - (newTime % Level.TICKS_PER_DAY));
      // DEFERRED(Network): SetTimePacket packet(levelData.getTime()); raknetInstance->send(packet);
      //   同 awakenAllPlayers —— 同步时间给客户端，单机没人收。
      this.awakenAllPlayers();
    }
  }
}
