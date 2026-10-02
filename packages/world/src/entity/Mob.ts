// FORWARD-DECL(Mob)：对应 src/world/entity/Mob.h。S12 由 Claude 部分移植后整体替换。
// 本轮只作为参数类型出现（Tile.setPlacedBy、Item.hurtEnemy 等）；只列出已移植代码读写的成员。
import type { Entity } from './Entity';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Mob extends Entity {}
