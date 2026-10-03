export class LevelEvent {
  static readonly SOUND_CLICK = 1000;
  static readonly SOUND_CLICK_FAIL = 1001;
  static readonly SOUND_LAUNCH = 1002;
  static readonly SOUND_OPEN_DOOR = 1003;
  static readonly SOUND_FIZZ = 1004;
  static readonly SOUND_PLAY_RECORDING = 1005;

  static readonly SOUND_GHAST_WARNING = 1007;
  static readonly SOUND_GHAST_FIREBALL = 1008; // 原文件此处为 "1008;a"，按笔误处理
  static readonly SOUND_BLAZE_FIREBALL = 1009;

  static readonly PARTICLES_SHOOT = 2000;
  static readonly PARTICLES_DESTROY_BLOCK = 2001;
  static readonly PARTICLES_POTION_SPLASH = 2002;
  static readonly PARTICLES_EYE_OF_ENDER_DEATH = 2003;
  static readonly PARTICLES_MOBTILE_SPAWN = 2004;

  static readonly ALL_PLAYERS_SLEEPING = 9800;
}
