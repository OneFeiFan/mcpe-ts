// 1:1 移植自 src/world/entity/EntityEvent.h
export class EntityEvent {
  static readonly JUMP = 1;
  static readonly HURT = 2;
  static readonly DEATH = 3;
  static readonly START_ATTACKING = 4;
  static readonly STOP_ATTACKING = 5;

  static readonly TAMING_FAILED = 6;
  static readonly TAMING_SUCCEEDED = 7;
  static readonly SHAKE_WETNESS = 8;

  static readonly USE_ITEM_COMPLETE = 9;

  static readonly EAT_GRASS = 10;
}
