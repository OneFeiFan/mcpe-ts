// 1:1 移植自 src/world/entity/EntityTypes.h（S2 前置）。被注释掉的 ClassTree 不移植。
export const BaseTypes = {
  Entity: 1,
  Item: 2,
} as const;

export const EntityTypes = {
  IdItemEntity: 64,
  IdPrimedTnt: 65,
  IdFallingTile: 66,
  IdArrow: 80,
  IdSnowball: 81,
  IdThrownEgg: 82,
  IdPainting: 83,
} as const;

export const MobTypes = {
  BaseEnemy: 1,
  BaseCreature: 2,
  BaseWaterCreature: 3,
  Chicken: 10,
  Cow: 11,
  Pig: 12,
  Sheep: 13,
  Zombie: 32,
  Creeper: 33,
  Skeleton: 34,
  Spider: 35,
  PigZombie: 36,
} as const;

/** C++ 的 enum ParticleType::Id。注意 PARTICLETYPE(x) 宏是逗号表达式，实际传给 addParticle 的是字符串 "x" */
export const ParticleType = {
  none: 0,
  bubble: 1,
  crit: 2,
  smoke: 3,
  explode: 4,
  flame: 5,
  lava: 6,
  largesmoke: 7,
  reddust: 8,
  iconcrack: 9,
  snowballpoof: 10,
  largeexplode: 11,
  hugeexplosion: 12,
} as const;
