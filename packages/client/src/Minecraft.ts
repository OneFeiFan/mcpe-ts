/**
 * 1:1 移植自 src/client/Minecraft.h 与 Minecraft.cpp（S9）。替换原来的 FORWARD-DECL(Minecraft)（类 + 同名接口）。
 *
 * 【构建开关】PLATFORM_WEB：setLevel 走非线程分支，直接 generateLevel；不是 STANDALONE_SERVER；没有 RPI、__APPLE__、WIN32、CHEATS。
 * 【DEFERRED】见各处标记：网络（raknetInstance）、声音、Gui（gui、font、screenChooser、_perfRenderer）、粒子、GameMode、
 *   玩家与实体、存储（options.load/save 在 Options 内部 DEFERRED）。
 * 【OMIT】多人游戏、存档选择、暂停、重生、音频开关、截图、统计、创造模式切换等（见文件末尾的标记）。
 */
import { CommandManager } from './commands/CommandManager';
import { ChatScreen } from './gui/screens/ChatScreen';
import { ConsoleScreen } from './gui/screens/ConsoleScreen';
import { PerfRenderer } from './util/PerfRenderer';
import type { Player, Pos } from '@mcpe/world';
import { DeathScreen } from './gui/screens/DeathScreen';
import {
  getTimeMs,
  Keyboard,
  KeyboardAction,
  LOGI,
  Mouse,
  MouseAction,
  Multitouch,
  Stopwatch,
} from '@mcpe/platform';
import { SharedConstants } from '@mcpe/core';
import { PerfTimer, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH } from '@mcpe/util';
import {
  Difficulty,
  FoliageColor,
  GameType,
  GrassColor,
  HitResult,
  HitResultType,
  type Level,
  LevelChunk,
  LevelConstants,
  LevelSettings,
  type LevelStorageSource,
  type Mob,
  ServerLevel,
  Tile,
} from '@mcpe/world';
import { App } from './App';
import { PlatformStringVars } from './AppPlatform';
import { CreativeMode } from './gamemode/CreativeMode';
import type { GameMode } from './gamemode/GameMode';
import { Font } from './gui/Font';
import { EntityRenderDispatcher } from './renderer/entity/EntityRenderDispatcher';
import { TileEntityRenderDispatcher } from './renderer/tileentity/TileEntityRenderDispatcher';
import { SurvivalMode } from './gamemode/SurvivalMode';
import { BuildActionIntention } from './player/input/IBuildInput';
import { Gui } from './gui/Gui';
import type { Screen } from './gui/Screen';
import { ScreenChooser, ScreenId } from './gui/screens/ScreenChooser';
import { createConfig } from './IConfigListener';
import { MouseHandler } from './MouseHandler';
import { OptionFloat } from './Option';
import { OptionId, Options } from './Options';
import { PixelCalc } from './PixelCalc';
import { CustomInputHolder, type IInputHolder } from './player/input/IInputHolder';
import { KeyboardInput } from './player/input/KeyboardInput';
import { MouseBuildInput } from './player/input/MouseBuildInput';
import { MouseTurnInput } from './player/input/MouseTurnInput';
import type { LocalPlayer } from './player/LocalPlayer';
import { GameRenderer } from './renderer/GameRenderer';
import { ParticleEngine } from './particle/ParticleEngine';
import { SoundEngine } from './sound/SoundEngine';
import { soundBankOrNull, soundSystemOrDefault } from './sound/SoundBackend';
import { LevelRenderer } from './renderer/LevelRenderer';
import {
  FireTexture,
  LavaSideTexture,
  LavaTexture,
  WaterSideTexture,
  WaterTexture,
} from './renderer/ptexture/DynamicTexture';
import { Textures } from './renderer/Textures';
import { TileRenderer } from './renderer/TileRenderer';
import { Timer } from './Timer';

/** Minecraft.cpp 的 checkGlError：只在定义了 GLDEBUG 时有内容 */
function checkGlError(_tag: string): void {}

/** C++ Minecraft::tickInput 里的两个 static 局部变量 */
const tickInputStatics = { prevMouseDownLeft: false, buildHoldTicks: 0 };

/** Player::resetPos 是公开的，而 Entity::resetPos 是 protected；LocalPlayer 正身（S12 阶段 C）就位前经这里调用 */
function resetPlayerPos(player: LocalPlayer, clearMore: boolean): void {
  player.resetPos(clearMore);
}

/** Minecraft::tickInput 里的 static bool prevMouseDownLeft、static int buildHoldTicks（只被 DEFERRED 的建造代码使用） */

export class Minecraft extends App {
  /** C++ CommandManager m_commandManager（按值成员） */
  private m_commandManager = new CommandManager();

  /** C++ `CommandManager& commandManager()` */
  commandManager(): CommandManager {
    return this.m_commandManager;
  }
  /** C++ PerfRenderer* _perfRenderer（init 里创建） */
  private _perfRenderer: PerfRenderer | null = null;
  static useAmbientOcclusion = false;
  static customDebugId = 0; // = Minecraft::CDI_NONE
  static readonly CDI_NONE = 0;
  static readonly CDI_GRAPHICS = 1;
  private static readonly progressMessages: readonly string[] = [
    'Locating server',
    'Building terrain',
    'Preparing',
    'Saving chunks',
  ];

  // ---------------------------------------------------------------- public
  isLookingForMultiplayer = false;
  width = 1;
  height = 1;
  commandPort = 4711;
  reserved_d1 = 0;
  reserved_d2 = 0;
  reserved_f1 = 0;
  reserved_f2 = 0;
  options: Options;
  pause = false;
  levelRenderer: LevelRenderer | null = null;
  gameRenderer: GameRenderer | null = null;
  particleEngine: ParticleEngine | null = null;
  /** C++ `SoundEngine* soundEngine;` —— 构造函数里建，见 F6 的接线 */
  soundEngine: SoundEngine | null = null;
  gameMode: GameMode | null = null;
  textures: Textures | null = null;
  /** C++ 的成员 ScreenChooser screenChooser（构造函数初始化列表 screenChooser(this)） */
  screenChooser: ScreenChooser = new ScreenChooser(this);
  font: Font | null = null;
  /** C++ 的成员 Gui gui（构造函数初始化列表 gui(this)）：C++ 按成员声明顺序在 options 之后构造，这里在构造函数里 options 赋值之后创建 */
  gui!: Gui;
  /** FORWARD-DECL(IRakNetInstance)：DEFERRED(Network)，始终为 null */
  raknetInstance: unknown = null;
  netCallback: unknown = null;
  lastTime = 0;
  lastTickTime = -1;
  ticksSinceLastUpdate = 0;
  level: Level | null = null;
  player: LocalPlayer | null = null;
  inputHolder: IInputHolder | null = null;
  cameraTargetPlayer: Mob | null = null;
  generateLevelThread: unknown = null;
  screen: Screen | null = null;
  mouseHandler = new MouseHandler();
  mouseGrabbed = true;
  pixelCalc = new PixelCalc();
  pixelCalcUi = new PixelCalc();
  hitResult = new HitResult();
  progressStagePercentage = 0;
  externalStoragePath = '';
  externalCacheStoragePath = '';

  // ---------------------------------------------------------------- protected
  protected timer = new Timer(20);
  protected isGeneratingLevel = false;
  protected _hasSignaledGeneratingLevelFinished = true;
  /** B7 起是真类型了（原来是 FORWARD-DECL(LevelStorageSource)）；由 NinecraftApp 在 initApp 里装上 */
  protected storageSource: LevelStorageSource | null = null;
  protected _running = false;
  protected _powerVr = false;

  // ---------------------------------------------------------------- private
  private progressStageStatusId = 0;
  private missTime = 0;
  private ticks = 0;
  private screenMutex = false;
  private hasScheduledScreen = false;
  private scheduledScreen: Screen | null = null;
  private _supportsNonTouchscreen = false;
  private _isCreativeMode = false;

  protected constructor() {
    super();
    this.options = new Options(this);
    this.gui = new Gui(this);
    // DEFERRED(Network): raknetInstance = new RakNetInstance();
    // C++：soundEngine = new SoundEngine(20.0f); soundEngine->init(this, &options);
    //   maxDistance 就是 20.0f（Minecraft.cpp:199）。
    //   ⚠ 后端和音源包是运行时注入的（见 sound/SoundBackend.ts）：没装的时候拿到的是
    //     空实现基类 + 空包 = **原版网页版的行为**（一点声音都没有）。
    this.soundEngine = new SoundEngine(20.0, soundSystemOrDefault());
    this.soundEngine.init(this, this.options, soundBankOrNull());
  }

  // 析构函数不移植（R3）

  /** C++ 的 void init()（覆盖 App 的 protected virtual init()） */
  override initApp(): void {
    LevelChunk.ChunkBlockCount = LevelConstants.CHUNK_BLOCK_COUNT;
    checkGlError('Init enter');
    this._supportsNonTouchscreen = !this.platform()!.supportsTouchscreen();
    LOGI(
      `IS TOUCHSCREEN? ${this.options.getBooleanValue(OptionId.OPTIONS_USE_TOUCHSCREEN) ? 1 : 0}`,
    );
    this.textures = new Textures(this.options, this.platform()!);
    this.textures.addDynamicTexture(new WaterTexture());
    this.textures.addDynamicTexture(new WaterSideTexture());
    this.textures.addDynamicTexture(new LavaTexture());
    this.textures.addDynamicTexture(new LavaSideTexture());
    this.textures.addDynamicTexture(new FireTexture(0));
    this.textures.addDynamicTexture(new FireTexture(1));
    this.gui.texturesLoaded(this.textures!);
    this.levelRenderer = new LevelRenderer(this);
    this.gameRenderer = new GameRenderer(this);
    // C++ 传的 `level` 是成员变量，此刻还是 NULL —— ParticleEngine 收下、等 setLevel 再换。
    this.particleEngine = new ParticleEngine(this.level, this.textures!);
    const foliageId = this.textures.loadTexture('misc/foliagecolor.png'); // loading the uh png for foliage color
    const foliagePixels = this.textures.loadTexturePixels(foliageId, 'misc/foliagecolor.png');
    FoliageColor.init(foliagePixels);
    const grassId = this.textures.loadTexture('misc/grasscolor.png');
    const grassPixels = this.textures.loadTexturePixels(grassId, 'misc/grasscolor.png');
    GrassColor.init(grassPixels);
    const tint = this.options.getBooleanValue(OptionId.OPTIONS_FOLIAGE_TINT); // finally, toggleable foliage color
    FoliageColor.setUseTint(tint);
    GrassColor.setUseTint(tint);
    const sideTint = this.options.getBooleanValue(OptionId.OPTIONS_TINTED_SIDE);
    TileRenderer.setUseTint(sideTint);
    this.font = new Font(this.options, 'font/default8.png', this.textures!);
    this._perfRenderer = new PerfRenderer(this, this.font);
    checkGlError('Init complete');
    this.options.load();
    this.setIsCreativeMode(false); // false means it's Survival Mode
    this.reloadOptions();
  }

  override setSize(w: number, h: number): void {
    this.transformResolution({ w, h });
    this.width = w;
    this.height = h;
    if (this.options.getBooleanValue(OptionId.OPTIONS_WINDOW_SCALE)) {
      // scales with resolution using a formula instead of having hardcoded if checks
      let guiScale = this.options.getIntValue(OptionId.OPTIONS_GUI_SCALE);
      if (guiScale === 0) {
        guiScale = 1000;
      }
      Gui.GuiScale = Math.min(
        guiScale,
        Math.max(1, Math.min((this.width / 320) | 0, (this.height / 240) | 0)),
      );
    } else {
      const guiScale = this.options.getIntValue(OptionId.OPTIONS_GUI_SCALE);
      if (guiScale !== 0) {
        switch (guiScale) {
          case 1:
            Gui.GuiScale = 2.0;
            break;
          case 2:
            Gui.GuiScale = 3.0;
            break;
          case 3:
            Gui.GuiScale = 4.0;
            break;
          case 4:
            Gui.GuiScale = 5.0;
            break;
          case 5:
            Gui.GuiScale = 6.0;
            break;
          default:
            Gui.GuiScale = 1.0;
            break; // auto
        }
      } else {
        if (this.width >= 1000) Gui.GuiScale = 4.0;
        else if (this.width >= 800) Gui.GuiScale = 3.0;
        else if (this.width >= 400) Gui.GuiScale = 2.0;
        else Gui.GuiScale = 1.0;
      }
    }
    Gui.InvGuiScale = Math.fround(1.0 / Gui.GuiScale);
    const screenWidth = Math.trunc(this.width * Gui.InvGuiScale);
    const screenHeight = Math.trunc(this.height * Gui.InvGuiScale);
    const config = createConfig(this);
    this.gui.onConfigChanged(config);
    if (this.screen) this.screen.setSize(screenWidth, screenHeight);
    if (this.inputHolder) this.inputHolder.onConfigChanged(config);
  }

  reloadOptions(): void {
    this.options.save();
    const wasTouchscreen = this.options.getBooleanValue(OptionId.OPTIONS_USE_TOUCHSCREEN);
    // C++ 的 set(OptionId, bool) 走 int 重载；该选项是 OptionBool，dynamic_cast<OptionInt*> 失败，什么都不做
    this.options.set(OptionId.OPTIONS_USE_TOUCHSCREEN, this.useTouchscreen() ? 1 : 0);
    this.options.save();
    if (wasTouchscreen !== this.useTouchscreen() || this.inputHolder === null) this._reloadInput();
    LOGI('Reloading-options');
    this.setSize(this.width, this.height);
  }

  private _reloadInput(): void {
    const useTouchHolder = this.useTouchscreen();
    if (useTouchHolder) {
      // DEFERRED(Touch): inputHolder = new TouchInputHolder(this, &options);
      throw new Error(
        '触屏输入（TouchInputHolder）尚未移植；网页版 supportsTouchscreen() 为 false，不应走到这里',
      );
    } else {
      this.inputHolder = new CustomInputHolder(
        new KeyboardInput(this.options),
        new MouseTurnInput(MouseTurnInput.MODE_DELTA, (this.width / 2) | 0, (this.height / 2) | 0),
        new MouseBuildInput(),
      );
    }
    this.mouseHandler.setTurnInput(this.inputHolder.getTurnInput());
    if (this.level && this.player) {
      this.player.input = this.inputHolder.getMoveInput();
    }
  }

  grabMouse(): void {
    if (this.mouseGrabbed) return;
    this.mouseGrabbed = true;
    this.mouseHandler.grab();
  }

  releaseMouse(): void {
    if (!this.mouseGrabbed) {
      return;
    }
    if (this.player) {
      this.player.releaseAllKeys();
    }
    this.mouseGrabbed = false;
    this.mouseHandler.release();
  }

  useTouchscreen(): boolean {
    return (
      this.options.getBooleanValue(OptionId.OPTIONS_USE_TOUCHSCREEN) &&
      !this._supportsNonTouchscreen
    );
  }

  supportNonTouchScreen(): boolean {
    return this._supportsNonTouchscreen;
  }

  /**
   * C++ 的 `Minecraft::selectLevel(levelId, levelName, settings)`（Minecraft.cpp:249，B7 移植）。
   *
   * 走 `storageSource->selectLevel(levelId, false)` 拿到一个存档目录，再套成 `ServerLevel`。
   * （C++ 前面还有一段 `#if defined(CREATORMODE) ... #else`，网页版构建走 `#else` 的 ServerLevel。）
   *
   * 【`settings` 到这里就没用了】C++ 那行注释写得很清楚：它要么被拷进新建的 LevelData，
   * 要么被从文件读出来的 LevelData 盖掉。所以世界已经存在时传什么都不影响结果。
   *
   * 【C-6b 起它能用了】这里不传维度（C++ 也没传），于是 `Level._init` 走
   * `DimensionFactory.createDefaultDimension` 拿到普通维度，再由
   * `Dimension.createRandomLevelSource()` 建出真的 `RandomLevelSource`。
   * 在 C-6a 之前那句是个 `DEFERRED(Levelgen)` 的 throw，所以"从菜单进世界"整条路走不通 ——
   * `NinecraftApp.startDemoWorld` 当时就是为绕开它才直接构造 `ServerLevel` 的。
   * 现在两条路都通，`startmenu.mjs` 场景把两个入口各钉了一条。
   */
  selectLevel(levelId: string, levelName: string, settings: LevelSettings): void {
    this.level = new ServerLevel(
      this.storageSource!.selectLevel(levelId, false),
      levelName,
      settings,
      SharedConstants.GeneratorVersion,
    );
    this.setLevel(this.level, 'Generating level');
    this.setIsCreativeMode(this.level.getLevelData().getGameType() === GameType.Creative);
    this._running = true;
  }

  setLevel(level: Level | null, message = '', forceInsertPlayer: LocalPlayer | null = null): void {
    void message;
    this.cameraTargetPlayer = null;
    if (level !== null) {
      LOGI(`Seed is ${level.getSeed()}`);
      level.raknetInstance = this.raknetInstance;
      this.gameMode!.initLevel(level);
      if (!this.player && forceInsertPlayer) {
        this.player = forceInsertPlayer;
        resetPlayerPos(this.player, false);
      } else if (this.player !== null) {
        resetPlayerPos(this.player, false);
        if (level !== null) level.addEntity(this.player);
      }
      this.level = level;
      const op = this.options.getStringValue(OptionId.OPTIONS_USERNAME).toLowerCase();
      level.ops.add(op);
      this._hasSignaledGeneratingLevelFinished = false;
      const threadedLevelCreation = false; // defined(STANDALONE_SERVER) || defined(PLATFORM_WEB)
      if (threadedLevelCreation) {
        this.isGeneratingLevel = true;
        // （线程分支：PLATFORM_WEB 下不走）
      } else {
        this.generateLevel('Currently not used', level);
      }
    } else {
      this.player = null;
    }
    this.lastTickTime = 0;
    this._running = true;
  }

  /**
   * C++ 的 `Minecraft::leaveGame(bool renameLevel = false)`（Minecraft.cpp:319，B8f）。
   *
   * 把当前世界整个扔掉、退回起始菜单。顺序很要紧：**先 `saveAll(true)` 落盘，再拆引用**，
   * 反过来就丢档了。
   *
   * 两处 `delete` 用不着写：
   * - `delete level->getLevelStorage()`：它的析构只 `delete regionFile / loadedLevelData`
   *   （ExternalFileLevelStorage.cpp:66），**不负责落盘** —— 落盘是上面那句 saveAll。
   *   TS 有 GC，这里就没有对应的语句。
   * - `delete netCallback`：单机版它恒为 null（见字段声明）。
   *
   * 网页版没有 STANDALONE_SERVER，所以 C++ 里两个 `#ifndef STANDALONE_SERVER` 块照常走。
   */
  leaveGame(renameLevel = false): void {
    if (this.isGeneratingLevel || !this._hasSignaledGeneratingLevelFinished) return;
    this.isGeneratingLevel = false;
    const saveLevel = this.level !== null && (!this.level.isClientSide || renameLevel);
    // DEFERRED(Network): raknetInstance->disconnect();（网页单机版 raknetInstance 恒为 null）
    if (saveLevel) {
      this.level!.getChunkSource().saveAll(true);
    }
    LOGI('Clearing levels');
    this.cameraTargetPlayer = null;
    if (this.levelRenderer !== null) this.levelRenderer.setLevel(null);
    if (this.particleEngine !== null) this.particleEngine.setLevel(null);
    LOGI('Erasing callback');
    this.netCallback = null;
    LOGI('Erasing level');
    if (this.level !== null) {
      // 析构不移植（R3）：delete level->getLevelStorage(); delete level;
      this.level = null;
    }
    this.player = null;
    this.cameraTargetPlayer = null;
    this._running = false;
    this.gui.clearMessages();
    if (renameLevel) {
      // DEFERRED(Gui): setScreen(new RenameMPLevelScreen(LevelStorageSource::TempLevelId));（联机专用界面未移植）
    } else {
      this.screenChooser.setScreen(ScreenId.SCREEN_STARTMENU);
    }
  }

  prepareLevel(_title: string): void {
    const level = this.level!;
    LOGI('status: 1');
    this.progressStageStatusId = 1;
    const A = new Stopwatch(),
      B = new Stopwatch(),
      C = new Stopwatch(),
      D = new Stopwatch();
    A.start();
    const L = new Stopwatch();
    if (!level.isNew()) level.setUpdateLights(false);
    const Max = LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_CACHE_WIDTH;
    let pp = 0;
    for (
      let x = 8;
      x < LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_WIDTH;
      x += LevelConstants.CHUNK_WIDTH
    ) {
      for (
        let z = 8;
        z < LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_WIDTH;
        z += LevelConstants.CHUNK_WIDTH
      ) {
        this.progressStagePercentage = ((100 * pp++) / Max) | 0;
        B.start();
        level.getTile(x, 64, z);
        B.stop();
        L.start();
        if (level.isNew()) while (level.updateLights());
        L.stop();
      }
    }
    A.stop();
    level.setUpdateLights(true);
    C.start();
    for (let x = 0; x < LevelConstants.CHUNK_CACHE_WIDTH; x++) {
      for (let z = 0; z < LevelConstants.CHUNK_CACHE_WIDTH; z++) {
        const chunk = level.getChunk(x, z);
        if (chunk && !chunk.createdFromSave) {
          chunk.unsaved = false;
          chunk.clearUpdateMap();
        }
      }
    }
    C.stop();
    LOGI('status: 3');
    this.progressStageStatusId = 3;
    if (level.isNew()) {
      level.setInitialSpawn(); // @note: should obviously be called from Level itself
      level.saveLevelData();
      level.getChunkSource().saveAll(false);
      level.saveGame();
    } else {
      level.saveLevelData();
      level.loadEntities();
    }
    this.progressStagePercentage = -1;
    this.progressStageStatusId = 2;
    LOGI('status: 2');
    D.start();
    level.prepare();
    D.stop();
    A.print('Generate level: ');
    L.print(' - light: ');
    B.print(' - getTl: ');
    C.print(' - clear: ');
    D.print(' - prepr: ');
    this.progressStageStatusId = 0;
  }

  override update(): void {
    if (Options.debugGl) LOGI('>>>>>>>>>>');
    TIMER_PUSH('root');
    const freezeGame = this.pause;
    if (!freezeGame) {
      this.timer.advanceTime();
    }
    if (this.raknetInstance && !freezeGame) {
      // DEFERRED(Network): raknetInstance->runEvents(netCallback);
    }
    TIMER_PUSH('tick');
    const toTick = freezeGame ? 1 : this.timer.ticks;
    if (!freezeGame) this.timer.ticks = 0;
    for (let i = 0; i < toTick; ++i, ++this.ticks) this.tick(i, toTick - 1);
    TIMER_POP_PUSH('updatelights');
    if (this.level && !this.isGeneratingLevel) {
      this.level.updateLights();
    }
    TIMER_POP();
    if (this.gameMode !== null) this.gameMode.render(this.timer.a);
    TIMER_PUSH('sound');
    // C++ 这里传的是 Minecraft::update 的形参 player；TS 里对应 this.player
    this.soundEngine!.update(this.player, this.timer.a);
    TIMER_POP_PUSH('render');
    this.gameRenderer!.render(this.timer.a);
    TIMER_POP();
    Multitouch.resetThisUpdate();
    TIMER_POP();
    checkGlError('Update finished');
    if (this.options.getBooleanValue(OptionId.OPTIONS_RENDER_DEBUG)) {
      if (!PerfTimer.enabled) {
        PerfTimer.reset();
        PerfTimer.enabled = true;
      }
      this._perfRenderer!.renderFpsMeter(1);
      checkGlError('render debug');
    } else {
      PerfTimer.enabled = false;
    }
  }

  tick(nTick: number, maxTick: number): void {
    if (this.missTime > 0) this.missTime--;
    if (!this.screen && this.player) {
      if (this.player.hasDied()) {
        this.setScreen(new DeathScreen());
      }
    }
    TIMER_PUSH('gameMode');
    if (this.level && !this.pause) {
      this.gameMode!.tick();
    }
    TIMER_POP_PUSH('commandServer');
    // DEFERRED(Network): if (level && _commandServer) _commandServer->tick();
    TIMER_POP_PUSH('input');
    this.tickInput();
    TIMER_POP_PUSH('gui');
    this.gui.tick();
    if (this.isGeneratingLevel) {
      return;
    } else if (!this._hasSignaledGeneratingLevelFinished) {
      this.generateLevelThread = null;
      this._levelGenerated();
    }
    if (this.level !== null) {
      if (!this.pause) {
        TIMER_POP_PUSH('gameRenderer');
        this.gameRenderer!.tick(nTick, maxTick);
        TIMER_POP_PUSH('levelRenderer');
        this.levelRenderer!.tick();
        this.level.difficulty = this.options.getIntValue(OptionId.OPTIONS_DIFFICULTY);
        if (this.level.isClientSide) this.level.difficulty = Difficulty.EASY;
        TIMER_POP_PUSH('level');
        this.level.tickEntities();
        this.level.tick();
        TIMER_POP_PUSH('animateTick');
        if (this.player) {
          this.level.animateTick(
            Math.floor(this.player.x),
            Math.floor(this.player.y),
            Math.floor(this.player.z),
          );
        }
      }
    }
    this.textures!.loadAndBindTexture('terrain.png');
    if (!this.pause && !(this.screen && !this.screen.renderGameBehind())) {
      if (nTick === maxTick) {
        TIMER_POP_PUSH('textures');
        this.textures!.tick(true);
      }
    }
    TIMER_POP_PUSH('particles');
    if (!this.pause) {
      if (this.particleEngine !== null) this.particleEngine.tick();
    }
    if (this.screen) {
      this.screenMutex = true;
      this.screen.tick();
      this.screenMutex = false;
    }
    Multitouch.reset();
    TIMER_POP();
  }

  tickInput(): void {
    try {
      // InputRAII raiiInput; —— 析构时 Mouse::reset()、Keyboard::reset()，这里用 finally
      if (this.screen && !this.screen.passEvents) {
        this.screenMutex = true;
        this.screen.updateEvents();
        this.screenMutex = false;
        if (this.hasScheduledScreen) {
          this.setScreen(this.scheduledScreen);
          this.scheduledScreen = null;
          this.hasScheduledScreen = false;
        }
        return;
      }
      if (!this.player) {
        return;
      }
      const mouseDiggable = !this.gui.isInside(Mouse.getX(), Mouse.getY()); // #ifndef RPI
      void mouseDiggable;
      const allowGuiClicks = true;
      TIMER_PUSH('mouse');
      while (Mouse.next()) {
        const passedTime = getTimeMs() - this.lastTickTime;
        if (passedTime > 200) continue; // @note: As long Mouse::clear CLEARS the whole buffer, it's safe to break here
        const e = Mouse.getEvent();
        if (!this.useTouchscreen() && !this.mouseGrabbed) {
          if (!this.screen && e.data === MouseAction.DATA_DOWN) {
            this.grabMouse();
          }
        }
        if (
          allowGuiClicks &&
          e.action === MouseAction.ACTION_LEFT &&
          e.data === MouseAction.DATA_DOWN
        ) {
          this.gui.handleClick(MouseAction.ACTION_LEFT, Mouse.getX(), Mouse.getY());
        }
        if (e.action === MouseAction.ACTION_WHEEL) {
          // 聊天或控制台开着时，滚轮翻聊天记录；否则切换物品栏格子
          if (this.screen && (this.screen instanceof ChatScreen || this.screen instanceof ConsoleScreen)) {
            this.gui.scrollChat(e.dy);
          } else {
            const v = this.player.inventory;
            let numSlots = this.gui.getNumSlots();
            if (!this.useTouchscreen()) numSlots--;
            const slot = (v.selected - e.dy + numSlots) % numSlots;
            v.selectSlot(slot);
          }
        }
      }
      TIMER_POP_PUSH('keyboard');
      while (Keyboard.next()) {
        const key = Keyboard.getEventKey();
        const isPressed = Keyboard.getEventKeyState() === KeyboardAction.KEYDOWN;
        this.player.setKey(key, isPressed);
        if (isPressed) {
          this.gui.handleKeyPressed(key);
          if (key >= 0x30 && key <= 0x39) {
            const digit = key - 0x30;
            const slot = digit - 1;
            if (slot >= 0 && slot < this.gui.getNumSlots()) this.player.inventory.selectSlot(slot);
          }
          if (key === Keyboard.KEY_LEFT_CTRL) {
            this.player.setSprinting(true);
          }
          if (key === Keyboard.KEY_E) {
            this.screenChooser.setScreen(ScreenId.SCREEN_BLOCKSELECTION);
          }
          if (!this.screen && key === Keyboard.KEY_T && this.level) {
            this.setScreen(new ConsoleScreen());
          }
          if (key === Keyboard.KEY_F3) {
            this.options.toggle(OptionId.OPTIONS_RENDER_DEBUG);
          }
          if (key === Keyboard.KEY_F5) {
            this.options.toggle(OptionId.OPTIONS_THIRD_PERSON_VIEW);
          }
          if ((!this.screen && key === Keyboard.KEY_O) || key === 250) {
            this.releaseMouse();
          }
          if (key === Keyboard.KEY_F) {
            const dst = this.options.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE);
            this.options.set(OptionId.OPTIONS_VIEW_DISTANCE, (dst + 1) % 4);
          }
          if (this.options.getBooleanValue(OptionId.OPTIONS_RENDER_DEBUG)) {
            if (key >= 0x30 && key <= 0x39) {
              this._perfRenderer!.debugFpsMeterKeyPress(key - 0x30); // key - '0'
            }
          }
          if (key === Keyboard.KEY_ESCAPE) {
            this.pauseGame(false);
          }
        }
      }
      TIMER_POP_PUSH('handlemouse');
      const gameMode = this.gameMode!;
      if (!this.useTouchscreen()) {
        if (Mouse.getButtonState(MouseAction.ACTION_LEFT) === 0) {
          gameMode.stopDestroyBlock();
        }
        if (!Mouse.isButtonDown(MouseAction.ACTION_RIGHT)) {
          gameMode.releaseUsingItem(this.player);
        }
      }
      if (this.useTouchscreen()) {
        // Touch: gesture recognizer classifies the action type (turn/destroy/build)
        const bai = new BuildActionIntention();
        if (this.inputHolder && this.inputHolder.getBuildInput().tickBuild(this.player, bai)) {
          this.handleBuildAction(bai);
        } else {
          gameMode.stopDestroyBlock();
          if (this.player && this.player.isUsingItem()) {
            gameMode.releaseUsingItem(this.player);
          }
        }
      } else {
        // Desktop: left mouse = destroy/attack
        if (Mouse.isButtonDown(MouseAction.ACTION_LEFT)) {
          let baiFlags = BuildActionIntention.BAI_REMOVE | BuildActionIntention.BAI_ATTACK;
          if (!tickInputStatics.prevMouseDownLeft) baiFlags |= BuildActionIntention.BAI_FIRSTREMOVE;
          this.handleBuildAction(new BuildActionIntention(baiFlags));
        }
        tickInputStatics.prevMouseDownLeft = Mouse.isButtonDown(MouseAction.ACTION_LEFT);
        // Build and use/interact is on same button
        if (Mouse.isButtonDown(MouseAction.ACTION_RIGHT)) {
          if (tickInputStatics.buildHoldTicks >= 5) tickInputStatics.buildHoldTicks = 0;
          if (++tickInputStatics.buildHoldTicks === 1) {
            this.handleBuildAction(
              new BuildActionIntention(
                BuildActionIntention.BAI_BUILD | BuildActionIntention.BAI_INTERACT,
              ),
            );
          }
        } else {
          tickInputStatics.buildHoldTicks = 0;
          gameMode.releaseUsingItem(this.player);
        }
      }
      this.lastTickTime = getTimeMs();
      TIMER_POP();
    } finally {
      Mouse.reset();
      Keyboard.reset();
    }
  }

  handleBuildAction(action: BuildActionIntention): void {
    const player = this.player!;
    const gameMode = this.gameMode!;
    const level = this.level!;
    if (action.isRemove()) {
      if (this.missTime > 0) return;
      player.swing();
    }
    if (player.isUsingItem()) return;
    let mayUse = true;
    if (!this.hitResult.isHit()) {
      if (action.isRemove() && !gameMode.isCreativeType()) {
        this.missTime = 10;
      }
    } else if (this.hitResult.type === HitResultType.ENTITY) {
      const entity = this.hitResult.entity!;
      if (action.isAttack()) {
        player.swing();
        // DEFERRED(Network): InteractPacket packet(InteractPacket::Attack, player->entityId, hitResult.entity->entityId); raknetInstance->send(packet);
        gameMode.attack(player, entity);
      } else if (action.isInteract()) {
        if (entity.interactPreventDefault()) mayUse = false;
        // DEFERRED(Network): InteractPacket packet(InteractPacket::Interact, …); raknetInstance->send(packet);
        gameMode.interact(player, entity);
      }
    } else if (this.hitResult.type === HitResultType.TILE) {
      const x = this.hitResult.x;
      const y = this.hitResult.y;
      const z = this.hitResult.z;
      const face = this.hitResult.f;
      const oldTileId = level.getTile(x, y, z);
      const oldTile = Tile.tiles[oldTileId] ?? null;
      if (action.isRemove()) {
        if (!oldTile) return;
        level.extinguishFire(x, y, z, this.hitResult.f);
        if (action.isFirstRemove()) {
          gameMode.startDestroyBlock(x, y, z, this.hitResult.f);
        } else {
          gameMode.continueDestroyBlock(x, y, z, this.hitResult.f);
        }
        this.particleEngine!.crack(x, y, z, this.hitResult.f);
        player.swing();
      } else {
        const item = player.inventory.getSelected();
        if (gameMode.useItemOn(player, level, item, x, y, z, face, this.hitResult.pos)) {
          mayUse = false;
          player.swing();
        }
        if (item && item.count <= 0) {
          player.inventory.clearSlot(player.inventory.selected);
        }
      }
    }
    if (mayUse && action.isInteract()) {
      const item = player.inventory.getSelected();
      if (item && !player.isUsingItem()) {
        if (gameMode.useItem(player, level, item)) {
          this.gameRenderer!.itemInHandRenderer.itemUsed();
        }
        if (item && item.count <= 0) {
          player.inventory.clearSlot(player.inventory.selected);
        }
      }
    }
  }
  // OMIT(Network): isOnlineClient()  Minecraft.cpp:1048
  // OMIT(Network): isOnline()  Minecraft.cpp:1053
  pauseGame(isBackPaused: boolean): void {
    const canFreeze = false; // DEFERRED(Network)：服务器且不接受连接时才可冻结（单机为 false）
    this.pause = canFreeze;
    if (this.screen !== null) return;
    this.screenChooser.setScreen(isBackPaused ? ScreenId.SCREEN_PAUSEPREV : ScreenId.SCREEN_PAUSE);
  }

  gameLostFocus(): void {
    if (this.screen !== null) {
      this.screen.lostFocus();
    }
  }

  setScreen(screen: Screen | null): void {
    Mouse.reset();
    Multitouch.reset();
    Multitouch.resetThisUpdate();
    if (this.screenMutex) {
      this.hasScheduledScreen = true;
      this.scheduledScreen = screen;
      return;
    }
    if (screen !== null && screen.isErrorScreen()) return;
    if (screen === null && this.level === null)
      screen = this.screenChooser.createScreen(ScreenId.SCREEN_STARTMENU);
    if (this.screen !== null) {
      this.screen.removed();
    }
    this.screen = screen;
    if (screen !== null) {
      this.releaseMouse();
      const screenWidth = Math.trunc(this.width * Gui.InvGuiScale);
      const screenHeight = Math.trunc(this.height * Gui.InvGuiScale);
      screen.init(this, screenWidth, screenHeight);
      if (screen.isInGameScreen() && this.level) {
        this.level.saveLevelData();
        this.level.saveGame();
      }
    } else {
      this.pause = false;
      this.grabMouse();
    }
  }
  // OMIT(Network): locateMultiplayer()  Minecraft.cpp:1366
  // OMIT(Network): cancelLocateMultiplayer()  Minecraft.cpp:1373
  // OMIT(Network): joinMultiplayer(server)  Minecraft.cpp:1382
  // OMIT(Network): joinMultiplayerFromString(server)  Minecraft.cpp:1391
  // OMIT(Network): hostMultiplayer(port)  Minecraft.cpp:1413
  // OMIT(Thread): prepareLevel_tspawn(p_param)  Minecraft.cpp:1434（PLATFORM_WEB 不用线程）

  generateLevel(_message: string, _level: Level): void {
    const s = new Stopwatch();
    s.start();
    this.prepareLevel(_message);
    s.stop();
    s.print('Level generated: ');
    this.isGeneratingLevel = false;
  }

  protected _levelGenerated(): void {
    const level = this.level!;
    if (this.player === null) {
      this.player = this.gameMode!.createPlayer(level) as LocalPlayer;
      this.gameMode!.initPlayer(this.player);
    }
    if (this.player) {
      this.player.input = this.inputHolder!.getMoveInput();
    }
    if (this.levelRenderer !== null) this.levelRenderer.setLevel(level);
    if (this.particleEngine !== null) this.particleEngine.setLevel(level);
    this.gameMode!.adjustPlayer(this.player!);
    this.gui.onLevelGenerated();
    level.validateSpawn();
    level.loadPlayer(this.player, true);
    if (this.player && !level.isClientSide) {
      resetPlayerPos(this.player, false);
    }
    if (level && level.dimension) {
      level.dimension.FogType = this.options.getIntValue(OptionId.OPTIONS_FOG_TYPE);
    }
    this.cameraTargetPlayer = this.player;
    // DEFERRED(Network): raknetInstance->announceServer(serverName); netCallback->levelGenerated(level);
    this._hasSignaledGeneratingLevelFinished = true;
  }

  gatherStats1(): string {
    return this.levelRenderer!.gatherStats1();
  }

  gatherStats2(): string {
    return this.levelRenderer!.gatherStats2();
  }

  gatherStats3(): string {
    return 'P: ' + this.particleEngine!.countParticles() + '. T: ' + this.level!.gatherStats();
  }

  gatherStats4(): string {
    return this.level!.gatherChunkSourceStats();
  }
  /** C++ `void toggleDimension(){}`（头文件里的空内联函数） */
  toggleDimension(): void {}

  // 审核补登记：Minecraft.h 里只有声明、没有定义也没有调用者的两个函数
  // OMIT(Player): void doActuallyRespawnPlayer()  Minecraft.h:87（没有定义）
  // OMIT(Input): void handleMouseDown(int button, bool down)  Minecraft.h:121（没有定义）

  /** C++ `Player* Minecraft::respawnPlayer(int playerId)`（R10：与无参版同名 → respawnPlayerById） */
  respawnPlayerById(playerId: number): Player | null {
    const level = this.level!;
    for (const p of level.players) {
      if (p.entityId === playerId) {
        this.resetPlayer(p);
        return p;
      }
    }
    return null;
  }

  /** C++ `void Minecraft::respawnPlayer()` */
  respawnPlayer(): void {
    this.resetPlayer(this.player!);
    // DEFERRED(Network): RespawnPacket packet(player); raknetInstance->send(packet);
  }

  /** C++ `void Minecraft::resetPlayer(Player* player)`：回到床边的重生点（没有就回世界出生点），恢复满血、清掉死亡状态 */
  resetPlayer(player: Player): void {
    const level = this.level!;
    level.validateSpawn();
    player.reset();
    let p: Pos;
    if (player.hasRespawnPosition()) {
      p = player.getRespawnPosition();
    } else {
      p = level.getSharedSpawnPos();
    }
    player.setPos(Math.fround(p.x + 0.5), Math.fround(p.y + 1.0), Math.fround(p.z + 0.5));
    player.resetPos(true);
    if (this.isCreativeMode()) player.inventory.clearInventoryWithDefault();
  }

  /** C++ 的 void onGraphicsReset()（覆盖 App 的 protected 纯虚函数） */
  protected onAppGraphicsReset(): void {
    this.textures!.clear();
    this.font!.onGraphicsReset();
    this.gui.onGraphicsReset();
    if (this.levelRenderer) this.levelRenderer.onGraphicsReset();
    if (this.gameRenderer) this.gameRenderer.onGraphicsReset();
    EntityRenderDispatcher.getInstance().onGraphicsReset();
    TileEntityRenderDispatcher.getInstance().onGraphicsReset();
  }

  getProgressStatusId(): number {
    return this.progressStageStatusId;
  }

  getProgressMessage(): string {
    return Minecraft.progressMessages[this.progressStageStatusId]!;
  }

  isLevelGenerated(): boolean {
    return this.level !== null && !this.isGeneratingLevel;
  }

  /** C++ 的 `Minecraft::getLevelSource()`（Minecraft.cpp:1611）—— 就一句 return */
  getLevelSource(): LevelStorageSource | null {
    return this.storageSource;
  }
  /** C++ `Minecraft::audioEngineOn()`（Minecraft.cpp:1622）—— 暂停菜单里进游戏时调 */
  override audioEngineOn(): void {
    // C++：if (soundEngine) soundEngine->enable(true);
    if (this.soundEngine !== null) this.soundEngine.enable(true);
  }

  /** C++ `Minecraft::audioEngineOff()`（Minecraft.cpp:1627） */
  override audioEngineOff(): void {
    // C++：if (soundEngine) soundEngine->enable(false);
    if (this.soundEngine !== null) this.soundEngine.enable(false);
  }
  setIsCreativeMode(isCreative: boolean): void {
    // CREATORMODE 未定义（网页版构建），走 #else 分支
    if (!this.gameMode || isCreative !== this._isCreativeMode) {
      if (isCreative) this.gameMode = new CreativeMode(this);
      else this.gameMode = new SurvivalMode(this);
      this._isCreativeMode = isCreative;
    }
    if (this.player) this.gameMode.initAbilities(this.player.abilities);
  }

  isCreativeMode(): boolean {
    return this._isCreativeMode;
  }

  isPowerVR(): boolean {
    return this._powerVr;
  }

  isKindleFire(kindleVersion: number): boolean {
    if (kindleVersion !== 1) return false;
    const modelLower = this.platform()!
      .getPlatformStringVar(PlatformStringVars.DEVICE_BUILD_MODEL)
      .toLowerCase();
    return modelLower.includes('kindle') && modelLower.includes('fire');
  }

  /** C++ 的 bool transformResolution(int* w, int* h)：指针参数写成一个可改写的对象 */
  transformResolution(wh: { w: number; h: number }): boolean {
    let changed = false;
    if (this.isKindleFire(1) && wh.h >= 560 && wh.h <= 620) {
      wh.h = 580;
      changed = true;
    }
    return changed;
  }

  // OMIT(Gui): getCreator()  Minecraft.cpp:1681

  /**
   * C++ 的三个重载 optionUpdated(OptionId, bool / float / int)。
   * ADAPTED(Cpp)：JS 分不出 int 与 float，数字按选项本身的类型分派（OptionFloat 走 float 版，其余走 int 版）。
   */
  optionUpdated(option: OptionId, value: boolean | number): void {
    if (typeof value === 'boolean') {
      if (this.netCallback !== null && option === OptionId.OPTIONS_SERVER_VISIBLE) {
        // DEFERRED(Network): ((ServerSideNetworkHandler*) netCallback)->allowIncomingConnections(value);
      } else if (option === OptionId.OPTIONS_USE_TOUCHSCREEN) {
        this._reloadInput();
      }
      return;
    }
    if (this.options.getOpt(option) instanceof OptionFloat) {
      return; // float 版的函数体是空的（内容都被注释掉了）
    }
    if (option === OptionId.OPTIONS_GUI_SCALE) {
      this.setSize(this.width, this.height);
    }
  }

  addMessage(msg: string): void {
    this.gui.addMessage(msg);
  }

  getTicks(): number {
    return this.ticks;
  }

  /** ADAPTED(Test)：只给测试读计时器 */
  _timerForTest(): Timer {
    return this.timer;
  }
}
