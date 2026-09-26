// FORWARD-DECL(Player)：对应 src/world/entity/player/Player.h。
// 本轮只作为存储接口（LevelStorage、LevelData）的参数类型出现，没有访问任何成员。移植 Player 时整体替换。
import type { Entity } from '../Entity';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Player extends Entity {}
