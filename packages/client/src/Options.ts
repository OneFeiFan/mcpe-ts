/**
 * 1:1 移植自 src/client/Options.h 与 Options.cpp（S6）。
 *  - 各个 Option 对象在 C++ 里是文件级全局变量（所有 Options 实例共用），这里同样放在模块顶层。
 *  - 构建开关：网页版定义了 PLATFORM_WEB，没有 PLATFORM_DESKTOP 或 RPI，所以 initTable 里把灵敏度乘 0.4 的一段不执行（默认 0.5）。
 *  - 读写选项文件经 OptionsFile 访问磁盘，本轮 DEFERRED(Storage)，demo 用默认值。
 *  - ADAPTED(Cpp)：C++ 的 set(key, int)、set(key, float)、set(key, string) 靠实参的静态类型选重载（类型不匹配时 dynamic_cast 失败、什么都不做）；
 *    JS 分不出 int 与 float，这里写成一个 set(key, value)：字符串只设 OptionString；数字按选项本身的类型设 OptionInt 或 OptionFloat。
 *  - OptionId 是 C++ 的 enum，写成常量对象；没有登记进表的 id（例如 OPTIONS_COMPLETE_LIGHTING）取值时返回默认的 0、false、空串。
 */
import { Keyboard } from '@mcpe/platform';
import { Difficulty } from '@mcpe/world';
import type { Minecraft } from './Minecraft';
import { Option, OptionBool, OptionFloat, OptionInt, OptionString } from './Option';

export const SOUND_MIN_VALUE = 0.0;
export const SOUND_MAX_VALUE = 1.0;
export const MUSIC_MIN_VALUE = 0.0;
export const MUSIC_MAX_VALUE = 1.0;
export const SENSITIVITY_MIN_VALUE = 0.0;
export const SENSITIVITY_MAX_VALUE = 1.0;
export const PIXELS_PER_MILLIMETER_MIN_VALUE = 3.0;
export const PIXELS_PER_MILLIMETER_MAX_VALUE = 4.0;

export const OptionId = {
  OPTIONS_DIFFICULTY: 0,
  OPTIONS_HIDEGUI: 1,
  OPTIONS_THIRD_PERSON_VIEW: 2,
  OPTIONS_GUI_SCALE: 3,
  OPTIONS_DESTROY_VIBRATION: 4,
  OPTIONS_MUSIC_VOLUME: 5,
  OPTIONS_SOUND_VOLUME: 6,
  OPTIONS_SKIN: 7,
  OPTIONS_USERNAME: 8,
  OPTIONS_SERVER_VISIBLE: 9,
  OPTIONS_BAR_ON_TOP: 10,
  OPTIONS_ALLOW_SPRINT: 11,
  OPTIONS_AUTOJUMP: 12,
  OPTIONS_WINDOW_SCALE: 13,
  OPTIONS_RENDER_DEBUG: 14,
  OPTIONS_SMOOTH_CAMERA: 15,
  OPTIONS_FIXED_CAMERA: 16,
  OPTIONS_VIEW_DISTANCE: 17,
  OPTIONS_VIEW_BOBBING: 18,
  OPTIONS_AMBIENT_OCCLUSION: 19,
  OPTIONS_ANAGLYPH_3D: 20,
  OPTIONS_LIMIT_FRAMERATE: 21,
  OPTIONS_VSYNC: 22,
  OPTIONS_FANCY_GRAPHICS: 23,
  OPTIONS_NORMAL_LIGHTING: 24,
  OPTIONS_FLY_SPEED: 25,
  OPTIONS_CAMERA_SPEED: 26,
  OPTIONS_IS_FLYING: 27,
  OPTIONS_BLOCK_OUTLINE: 28,
  OPTIONS_USE_MOUSE_FOR_DIGGING: 29,
  OPTIONS_IS_LEFT_HANDED: 30,
  OPTIONS_IS_JOY_TOUCH_AREA: 31,
  OPTIONS_SENSITIVITY: 32,
  OPTIONS_INVERT_Y_MOUSE: 33,
  OPTIONS_USE_TOUCHSCREEN: 34,
  OPTIONS_KEY_FORWARD: 35,
  OPTIONS_KEY_LEFT: 36,
  OPTIONS_KEY_BACK: 37,
  OPTIONS_KEY_RIGHT: 38,
  OPTIONS_KEY_JUMP: 39,
  OPTIONS_KEY_INVENTORY: 40,
  OPTIONS_KEY_SNEAK: 41,
  OPTIONS_KEY_DROP: 42,
  OPTIONS_KEY_CHAT: 43,
  OPTIONS_KEY_FOG: 44,
  OPTIONS_KEY_USE: 45,
  OPTIONS_KEY_MENU_NEXT: 46,
  OPTIONS_KEY_MENU_PREV: 47,
  OPTIONS_KEY_MENU_OK: 48,
  OPTIONS_KEY_MENU_CANCEL: 49,
  OPTIONS_FIRST_LAUNCH: 50,
  OPTIONS_LAST_IP: 51,
  OPTIONS_RPI_CURSOR: 52,
  OPTIONS_FOLIAGE_TINT: 53,
  OPTIONS_FOG_TYPE: 54,
  OPTIONS_JAVA_HUD: 55,
  OPTIONS_RESTORED_ANIMS: 56,
  OPTIONS_TINTED_SIDE: 57,
  OPTIONS_BETA_SKY: 58,
  OPTIONS_BEAUTIFUL_SKY: 59,
  OPTIONS_VIGNETTE: 60,
  OPTIONS_DEBUG_STYLE: 61,
  OPTIONS_COMPLETE_LIGHTING: 62,
  OPTIONS_MENU_STYLE: 63,
  OPTIONS_COUNT: 64,
} as const;
export type OptionId = (typeof OptionId)[keyof typeof OptionId];

// ---- Options.cpp 的全局 Option 对象（默认值照抄）
const difficulty = new OptionInt('difficulty', Difficulty.NORMAL, 0, Difficulty.COUNT);
const hidegui = new OptionBool('hidegui', false);
const thirdPersonView = new OptionBool('thirdperson', false);
const renderDebug = new OptionBool('renderDebug', false);
const smoothCamera = new OptionBool('smoothCamera', false);
const fixedCamera = new OptionBool('fixedCamera', false);
const isFlying = new OptionBool('isflying', false);
const barOnTop = new OptionBool('barOnTop', false);
const allowSprint = new OptionBool('allowSprint', true);
const rpiCursor = new OptionBool('rpiCursor', false);
const autoJump = new OptionBool('autoJump', true);
const flySpeed = new OptionFloat('flySpeed', 1);
const cameraSpeed = new OptionFloat('cameraSpeed', 1);
const guiScale = new OptionInt('guiScale', 0, 0, 5);
const skin = new OptionString('skin', 'Default');
const username = new OptionString('username', 'Steve');
const destroyVibration = new OptionBool('destroyVibration', true);
const isLeftHanded = new OptionBool('isLeftHanded', false);
const isJoyTouchArea = new OptionBool('isJoyTouchArea', false);
const musicVolume = new OptionFloat('music', 1, MUSIC_MIN_VALUE, MUSIC_MAX_VALUE);
const soundVolume = new OptionFloat('sound', 1, SOUND_MIN_VALUE, SOUND_MAX_VALUE);
const sensitivityOpt = new OptionFloat('sensitivity', 0.5, SENSITIVITY_MIN_VALUE, SENSITIVITY_MAX_VALUE);
const invertYMouse = new OptionBool('invertMouse', false);
const viewDistance = new OptionInt('renderDistance', 2, 0, 4);
const anaglyph3d = new OptionBool('anaglyph3d', false);
const limitFramerate = new OptionBool('limitFramerate', false);
const vsync = new OptionBool('vsync', true);
const fancyGraphics = new OptionBool('fancyGraphics', true);
const viewBobbing = new OptionBool('viewBobbing', true);
const ambientOcclusion = new OptionBool('ao', true);
const useNormalLighting = new OptionBool('normalLighting', true);
const beautifulSky = new OptionBool('beautifulSky', true);
const useVignette = new OptionBool('useVignette', true);
const useTouchscreen = new OptionBool('useTouchscreen', true);
const serverVisible = new OptionBool('servervisible', true);
const foliageTint = new OptionBool('foliagetint', false);
const fogType = new OptionInt('fogType', 0, 0, 2);
const javaHud = new OptionBool('javaHud', false);
const betaSky = new OptionBool('betaSky', false);
const tintedSide = new OptionBool('tintedSide', false);
const blockOutline = new OptionBool('blockOutline', false);
const restoredAnims = new OptionBool('restoredAnims', true);
const debugStyle = new OptionInt('debugStyle', 0, 0, 1);
const menuStyle = new OptionInt('menuStyle',0, 0, 2);
const windowScale = new OptionBool('windowScale', false);
const keyForward = new OptionInt('key.forward', Keyboard.KEY_W);
const keyLeft = new OptionInt('key.left', Keyboard.KEY_A);
const keyBack = new OptionInt('key.back', Keyboard.KEY_S);
const keyRight = new OptionInt('key.right', Keyboard.KEY_D);
const keyJump = new OptionInt('key.jump', Keyboard.KEY_SPACE);
const keyInventory = new OptionInt('key.inventory', Keyboard.KEY_E);
const keySneak = new OptionInt('key.sneak', Keyboard.KEY_LSHIFT);
const keyDrop = new OptionInt('key.drop', Keyboard.KEY_Q);
const keyChat = new OptionInt('key.chat', Keyboard.KEY_T);
const keyFog = new OptionInt('key.fog', Keyboard.KEY_F);
const keyUse = new OptionInt('key.use', Keyboard.KEY_U);
const keyMenuNext = new OptionInt('key.menu.next', 40);
const keyMenuPrev = new OptionInt('key.menu.previous', 38);
const keyMenuOk = new OptionInt('key.menu.ok', 13);
const keyMenuCancel = new OptionInt('key.menu.cancel', 8);
const firstLaunch = new OptionBool('firstLaunch', true);
const lastIp = new OptionString('lastip');

export class Options {
  sound = 1.0;
  music = 1.0;
  static debugGl = false;

  private readonly m_options: (Option | null)[] = new Array<Option | null>(OptionId.OPTIONS_COUNT).fill(null);
  // DEFERRED(Storage): OptionsFile optionsFile;
  private readonly minecraft: Minecraft | null;

  constructor(minecraft: Minecraft | null, _workingDirectory = '') {
    this.minecraft = minecraft;
    this.initTable();
  }

  initTable(): void {
    const m = this.m_options;
    m[OptionId.OPTIONS_DIFFICULTY] = difficulty;
    m[OptionId.OPTIONS_HIDEGUI] = hidegui;
    m[OptionId.OPTIONS_THIRD_PERSON_VIEW] = thirdPersonView;
    m[OptionId.OPTIONS_RENDER_DEBUG] = renderDebug;
    m[OptionId.OPTIONS_SMOOTH_CAMERA] = smoothCamera;
    m[OptionId.OPTIONS_FIXED_CAMERA] = fixedCamera;
    m[OptionId.OPTIONS_IS_FLYING] = isFlying;
    m[OptionId.OPTIONS_FLY_SPEED] = flySpeed;
    m[OptionId.OPTIONS_CAMERA_SPEED] = cameraSpeed;
    m[OptionId.OPTIONS_GUI_SCALE] = guiScale;
    m[OptionId.OPTIONS_DESTROY_VIBRATION] = destroyVibration;
    m[OptionId.OPTIONS_IS_LEFT_HANDED] = isLeftHanded;
    m[OptionId.OPTIONS_IS_JOY_TOUCH_AREA] = isJoyTouchArea;
    m[OptionId.OPTIONS_MUSIC_VOLUME] = musicVolume;
    m[OptionId.OPTIONS_SOUND_VOLUME] = soundVolume;
    // #if defined(PLATFORM_DESKTOP) || defined(RPI)：网页版不执行 —— sensitivityOpt.set(sensitivityOpt.get() * 0.4f);
    m[OptionId.OPTIONS_GUI_SCALE] = guiScale;
    m[OptionId.OPTIONS_WINDOW_SCALE] = windowScale;
    m[OptionId.OPTIONS_SKIN] = skin;
    m[OptionId.OPTIONS_USERNAME] = username;
    m[OptionId.OPTIONS_DESTROY_VIBRATION] = destroyVibration;
    m[OptionId.OPTIONS_IS_LEFT_HANDED] = isLeftHanded;
    m[OptionId.OPTIONS_MUSIC_VOLUME] = musicVolume;
    m[OptionId.OPTIONS_SOUND_VOLUME] = soundVolume;
    m[OptionId.OPTIONS_SENSITIVITY] = sensitivityOpt;
    m[OptionId.OPTIONS_INVERT_Y_MOUSE] = invertYMouse;
    m[OptionId.OPTIONS_VIEW_DISTANCE] = viewDistance;
    m[OptionId.OPTIONS_ANAGLYPH_3D] = anaglyph3d;
    m[OptionId.OPTIONS_LIMIT_FRAMERATE] = limitFramerate;
    m[OptionId.OPTIONS_VSYNC] = vsync;
    m[OptionId.OPTIONS_FANCY_GRAPHICS] = fancyGraphics;
    m[OptionId.OPTIONS_VIEW_BOBBING] = viewBobbing;
    m[OptionId.OPTIONS_AMBIENT_OCCLUSION] = ambientOcclusion;
    m[OptionId.OPTIONS_USE_TOUCHSCREEN] = useTouchscreen;
    m[OptionId.OPTIONS_BLOCK_OUTLINE] = blockOutline;
    m[OptionId.OPTIONS_VIGNETTE] = useVignette;
    m[OptionId.OPTIONS_BEAUTIFUL_SKY] = beautifulSky;
    m[OptionId.OPTIONS_NORMAL_LIGHTING] = useNormalLighting;
    m[OptionId.OPTIONS_RESTORED_ANIMS] = restoredAnims;
    m[OptionId.OPTIONS_SERVER_VISIBLE] = serverVisible;
    m[OptionId.OPTIONS_MENU_STYLE] = menuStyle;
    m[OptionId.OPTIONS_KEY_FORWARD] = keyForward;
    m[OptionId.OPTIONS_KEY_LEFT] = keyLeft;
    m[OptionId.OPTIONS_KEY_BACK] = keyBack;
    m[OptionId.OPTIONS_KEY_RIGHT] = keyRight;
    m[OptionId.OPTIONS_KEY_JUMP] = keyJump;
    m[OptionId.OPTIONS_KEY_INVENTORY] = keyInventory;
    m[OptionId.OPTIONS_KEY_SNEAK] = keySneak;
    m[OptionId.OPTIONS_KEY_DROP] = keyDrop;
    m[OptionId.OPTIONS_KEY_CHAT] = keyChat;
    m[OptionId.OPTIONS_KEY_FOG] = keyFog;
    m[OptionId.OPTIONS_KEY_USE] = keyUse;
    m[OptionId.OPTIONS_KEY_MENU_NEXT] = keyMenuNext;
    m[OptionId.OPTIONS_KEY_MENU_PREV] = keyMenuPrev;
    m[OptionId.OPTIONS_KEY_MENU_OK] = keyMenuOk;
    m[OptionId.OPTIONS_KEY_MENU_CANCEL] = keyMenuCancel;
    m[OptionId.OPTIONS_FIRST_LAUNCH] = firstLaunch;
    m[OptionId.OPTIONS_BAR_ON_TOP] = barOnTop;
    m[OptionId.OPTIONS_ALLOW_SPRINT] = allowSprint;
    m[OptionId.OPTIONS_RPI_CURSOR] = rpiCursor;
    m[OptionId.OPTIONS_FOLIAGE_TINT] = foliageTint;
    m[OptionId.OPTIONS_FOG_TYPE] = fogType;
    m[OptionId.OPTIONS_DEBUG_STYLE] = debugStyle;
    m[OptionId.OPTIONS_BETA_SKY] = betaSky;
    m[OptionId.OPTIONS_TINTED_SIDE] = tintedSide;
    m[OptionId.OPTIONS_JAVA_HUD] = javaHud;
    m[OptionId.OPTIONS_AUTOJUMP] = autoJump;
    m[OptionId.OPTIONS_LAST_IP] = lastIp;
  }

  private opt<T extends Option>(key: OptionId, type: abstract new (...args: never[]) => T): T | null {
    const o = this.m_options[key];
    return o instanceof type ? o : null; // dynamic_cast<T*>
  }

  getIntValue(key: OptionId): number {
    const option = this.opt(key, OptionInt);
    return option ? option.get() : 0;
  }

  getStringValue(key: OptionId): string {
    const option = this.opt(key, OptionString);
    return option ? option.get() : '';
  }

  getProgressValue(key: OptionId): number {
    const option = this.opt(key, OptionFloat);
    return option ? option.get() : 0.0;
  }

  getBooleanValue(key: OptionId): boolean {
    const option = this.opt(key, OptionBool);
    return option ? option.get() : false;
  }

  getProgrssMin(key: OptionId): number {
    const option = this.opt(key, OptionFloat);
    return option ? option.getMin() : 0.0;
  }

  getProgrssMax(key: OptionId): number {
    const option = this.opt(key, OptionFloat);
    return option ? option.getMax() : 0.0;
  }

  getOpt(id: OptionId): Option | null {
    return this.m_options[id]!;
  }

  load(): void {
    // DEFERRED(Storage): StringVector optionStrings = optionsFile.getOptionStrings();
    const optionStrings: string[] = [];
    for (let i = 0; i < optionStrings.length; i += 2) {
      const key = optionStrings[i]!;
      const value = optionStrings[i + 1]!;
      const opt = this.m_options.find((it) => it != null && it.getStringId() === key);
      if (opt === undefined) continue;
      opt!.parse(value);
    }
  }

  save(): void {
    const stringVec: string[] = [];
    for (const it of this.m_options) {
      if (it) stringVec.push(it.serialize());
    }
    void stringVec;
    // DEFERRED(Storage): optionsFile.save(stringVec);
  }

  // ADAPTED(Cpp): 三个按实参类型区分的 set 重载合成一个，见文件头
  set(key: OptionId, value: number | string): void {
    if (typeof value === 'string') {
      const option = this.opt(key, OptionString);
      if (option) {
        option.set(value);
        this.notifyOptionUpdate(key, value);
      }
      return;
    }
    const f = this.opt(key, OptionFloat);
    if (f) {
      f.set(value);
      this.notifyOptionUpdate(key, value);
      return;
    }
    const n = this.opt(key, OptionInt);
    if (n) {
      n.set(value | 0);
      this.notifyOptionUpdate(key, value | 0);
    }
  }

  setOptionsFilePath(_path: string): void {
    // DEFERRED(Storage): optionsFile.setOptionsPath(path + "/options.txt");
  }

  toggle(key: OptionId): void {
    const option = this.opt(key, OptionBool);
    if (option) {
      option.toggle();
      this.notifyOptionUpdate(key, option.get());
    }
  }

  /** C++ 的四个重载：bool、float、int 转给 Minecraft::optionUpdated；std::string 版是空函数 */
  notifyOptionUpdate(key: OptionId, value: boolean | number | string): void {
    if (typeof value === 'string') return;
    this.minecraft!.optionUpdated(key, value);
  }
}
