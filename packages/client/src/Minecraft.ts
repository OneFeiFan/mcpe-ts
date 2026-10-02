/**
 * 1:1 移植自 src/client/Minecraft.h 与 Minecraft.cpp（S9）。替换原来的 FORWARD-DECL(Minecraft)（类 + 同名接口）。
 *
 * 【构建开关】PLATFORM_WEB：setLevel 走非线程分支，直接 generateLevel；不是 STANDALONE_SERVER；没有 RPI、__APPLE__、WIN32、CHEATS。
 * 【DEFERRED】见各处标记：网络（raknetInstance）、声音、Gui（gui、font、screenChooser、_perfRenderer）、粒子、GameMode、
 *   动态纹理、玩家与实体、存储（options.load/save 在 Options 内部 DEFERRED）。
 * 【ADAPTED(DebugCamera)】demo 用 DebugFreeCamera 代替 LocalPlayer，6 处接缝（手册附录 C）：A1 _levelGenerated、A2 tick、
 *   A3 tickInput、A6 releaseMouse 在本文件；A4、A5 在 GameRenderer。移植 LocalPlayer 时逐条删除。
 * 【OMIT】多人游戏、存档选择、暂停、重生、音频开关、截图、统计、创造模式切换等（见文件末尾的标记）。
 * cameraTargetPlayer 在 C++ 里是 Mob*；这里的类型是 CameraTarget（成员名与 Mob 一致，附录 A）。
 */
import { getTimeMs, Keyboard, KeyboardAction, LOGI, Mouse, MouseAction, Multitouch, Stopwatch } from '@mcpe/platform';
import { PerfTimer, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH } from '@mcpe/util';
import { Difficulty, FoliageColor, GrassColor, HitResult, type Level, LevelChunk, LevelConstants } from '@mcpe/world';
import { App } from './App';
import { PlatformStringVars } from './AppPlatform';
import type { CameraTarget } from './camera/CameraTarget';
import type { DebugFreeCamera } from './camera/DebugFreeCamera';
import type { GameMode } from './gamemode/GameMode';
import { Gui } from './gui/Gui';
import type { Screen } from './gui/Screen';
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
import { LevelRenderer } from './renderer/LevelRenderer';
import { Textures } from './renderer/Textures';
import { TileRenderer } from './renderer/TileRenderer';
import { Timer } from './Timer';

/** Minecraft.cpp 的 checkGlError：只在定义了 GLDEBUG 时有内容 */
function checkGlError(_tag: string): void {}

/** Minecraft::tickInput 里的 static bool prevMouseDownLeft、static int buildHoldTicks（只被 DEFERRED 的建造代码使用） */

export class Minecraft extends App {
  static useAmbientOcclusion = false;
  static customDebugId = 0; // = Minecraft::CDI_NONE
  static readonly CDI_NONE = 0;
  static readonly CDI_GRAPHICS = 1;
  private static readonly progressMessages: readonly string[] = ['Locating server', 'Building terrain', 'Preparing', 'Saving chunks'];

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
  /** FORWARD-DECL(ParticleEngine)：DEFERRED(Particle)，始终为 null */
  particleEngine: unknown = null;
  /** FORWARD-DECL(SoundEngine)：DEFERRED(Sound)，始终为 null */
  soundEngine: unknown = null;
  gameMode: GameMode | null = null;
  textures: Textures | null = null;
  // DEFERRED(Gui): ScreenChooser screenChooser;
  /** FORWARD-DECL(Font)：DEFERRED(Gui)，始终为 null */
  font: unknown = null;
  /** FORWARD-DECL(IRakNetInstance)：DEFERRED(Network)，始终为 null */
  raknetInstance: unknown = null;
  netCallback: unknown = null;
  lastTime = 0;
  lastTickTime = -1;
  ticksSinceLastUpdate = 0;
  level: Level | null = null;
  player: LocalPlayer | null = null;
  inputHolder: IInputHolder | null = null;
  cameraTargetPlayer: CameraTarget | null = null;
  // DEFERRED(Gui): Gui gui;
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
  /** ADAPTED(DebugCamera)：demo 的自由相机（NinecraftApp.startDemoWorld 创建） */
  debugCamera: DebugFreeCamera | null = null;

  // ---------------------------------------------------------------- protected
  protected timer = new Timer(20);
  protected isGeneratingLevel = false;
  protected _hasSignaledGeneratingLevelFinished = true;
  /** FORWARD-DECL(LevelStorageSource)：DEFERRED(Storage) */
  protected storageSource: unknown = null;
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
    // DEFERRED(Network): raknetInstance = new RakNetInstance();
    // DEFERRED(Sound): soundEngine = new SoundEngine(20.0f); soundEngine->init(this, &options);
  }

  // 析构函数不移植（R3）

  /** C++ 的 void init()（覆盖 App 的 protected virtual init()） */
  override init$0(): void {
    LevelChunk.ChunkBlockCount = LevelConstants.CHUNK_BLOCK_COUNT;
    checkGlError('Init enter');
    this._supportsNonTouchscreen = !this.platform()!.supportsTouchscreen();
    LOGI(`IS TOUCHSCREEN? ${this.options.getBooleanValue(OptionId.OPTIONS_USE_TOUCHSCREEN) ? 1 : 0}`);
    this.textures = new Textures(this.options, this.platform()!);
    // DEFERRED(DynamicTexture): textures->addDynamicTexture(new WaterTexture());
    // DEFERRED(DynamicTexture): textures->addDynamicTexture(new WaterSideTexture());
    // DEFERRED(DynamicTexture): textures->addDynamicTexture(new LavaTexture());
    // DEFERRED(DynamicTexture): textures->addDynamicTexture(new LavaSideTexture());
    // DEFERRED(DynamicTexture): textures->addDynamicTexture(new FireTexture(0));
    // DEFERRED(DynamicTexture): textures->addDynamicTexture(new FireTexture(1));
    // DEFERRED(Gui): gui.texturesLoaded(textures);
    this.levelRenderer = new LevelRenderer(this);
    this.gameRenderer = new GameRenderer(this);
    // DEFERRED(Particle): particleEngine = new ParticleEngine(level, textures);
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
    // DEFERRED(Gui): font = new Font(&options, "font/default8.png", textures);
    // DEFERRED(Gui): _perfRenderer = new PerfRenderer(this, font);
    checkGlError('Init complete');
    this.options.load();
    // DEFERRED(GameMode): setIsCreativeMode(false); // false means it's Survival Mode
    this.reloadOptions();
  }

  override setSize(w: number, h: number): void {
    this.transformResolution({ w, h });
    this.width = w;
    this.height = h;
    if (this.options.getBooleanValue(OptionId.OPTIONS_WINDOW_SCALE)) { // scales with resolution using a formula instead of having hardcoded if checks
      let guiScale = this.options.getIntValue(OptionId.OPTIONS_GUI_SCALE);
      if (guiScale === 0) {
        guiScale = 1000;
      }
      Gui.GuiScale = Math.min(guiScale, Math.max(1, Math.min((this.width / 320) | 0, (this.height / 240) | 0)));
    } else {
      const guiScale = this.options.getIntValue(OptionId.OPTIONS_GUI_SCALE);
      if (guiScale !== 0) {
        switch (guiScale) {
          case 1: Gui.GuiScale = 2.0; break;
          case 2: Gui.GuiScale = 3.0; break;
          case 3: Gui.GuiScale = 4.0; break;
          case 4: Gui.GuiScale = 5.0; break;
          case 5: Gui.GuiScale = 6.0; break;
          default: Gui.GuiScale = 1.0; break; // auto
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
    // DEFERRED(Gui): gui.onConfigChanged(config);
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
      throw new Error('触屏输入（TouchInputHolder）尚未移植；网页版 supportsTouchscreen() 为 false，不应走到这里');
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
    } else if (this.inputHolder) {
      // ADAPTED(DebugCamera): A6 —— 等价于 LocalPlayer::releaseAllKeys → input->releaseAllKeys()
      this.inputHolder.getMoveInput().releaseAllKeys();
    }
    this.mouseGrabbed = false;
    this.mouseHandler.release();
  }

  useTouchscreen(): boolean {
    return this.options.getBooleanValue(OptionId.OPTIONS_USE_TOUCHSCREEN) && !this._supportsNonTouchscreen;
  }

  supportNonTouchScreen(): boolean {
    return this._supportsNonTouchscreen;
  }

  // OMIT(Storage): selectLevel(levelId, levelName, settings)  Minecraft.cpp:249

  setLevel(level: Level | null, message = '', forceInsertPlayer: LocalPlayer | null = null): void {
    void message;
    this.cameraTargetPlayer = null;
    if (level !== null) {
      LOGI(`Seed is ${level.getSeed()}`);
      level.raknetInstance = this.raknetInstance;
      // DEFERRED(GameMode): gameMode->initLevel(level);
      if (!this.player && forceInsertPlayer) {
        this.player = forceInsertPlayer;
        this.player.resetPos(false);
      } else if (this.player !== null) {
        this.player.resetPos(false);
        // DEFERRED(Entity): if (level != NULL) level->addEntity(player);
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

  // OMIT(Storage): leaveGame(renameLevel)  Minecraft.cpp:319

  prepareLevel(_title: string): void {
    const level = this.level!;
    LOGI('status: 1');
    this.progressStageStatusId = 1;
    const A = new Stopwatch(), B = new Stopwatch(), C = new Stopwatch(), D = new Stopwatch();
    A.start();
    const L = new Stopwatch();
    if (!level.isNew()) level.setUpdateLights(false);
    const Max = LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_CACHE_WIDTH;
    let pp = 0;
    for (let x = 8; x < LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_WIDTH; x += LevelConstants.CHUNK_WIDTH) {
      for (let z = 8; z < LevelConstants.CHUNK_CACHE_WIDTH * LevelConstants.CHUNK_WIDTH; z += LevelConstants.CHUNK_WIDTH) {
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
    // DEFERRED(Sound): soundEngine->update(player, timer.a);
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
      // DEFERRED(Gui): _perfRenderer->renderFpsMeter(1);
      checkGlError('render debug');
    } else {
      PerfTimer.enabled = false;
    }
  }

  tick(nTick: number, maxTick: number): void {
    if (this.missTime > 0) this.missTime--;
    if (!this.screen && this.player) {
      if (this.player.hasDied()) {
        // DEFERRED(Gui): setScreen(new DeathScreen());
      }
    }
    TIMER_PUSH('gameMode');
    if (this.level && !this.pause) {
      // DEFERRED(GameMode): gameMode->tick();
    }
    TIMER_POP_PUSH('commandServer');
    // DEFERRED(Network): if (level && _commandServer) _commandServer->tick();
    TIMER_POP_PUSH('input');
    this.tickInput();
    TIMER_POP_PUSH('gui');
    // DEFERRED(Gui): gui.tick();
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
        // DEFERRED(Entity): level->tickEntities();
        // ADAPTED(DebugCamera): A2 —— 自由相机在 tickEntities 的位置更新
        if (this.debugCamera && !this.player) this.debugCamera.tick(this.inputHolder!.getMoveInput());
        this.level.tick();
        TIMER_POP_PUSH('animateTick');
        if (this.player) {
          this.level.animateTick(Math.floor(this.player.x), Math.floor(this.player.y), Math.floor(this.player.z));
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
      // DEFERRED(Particle): particleEngine->tick();
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
          // DEFERRED(Gui): setScreen(scheduledScreen);
          this.scheduledScreen = null;
          this.hasScheduledScreen = false;
        }
        return;
      }
      // ADAPTED(DebugCamera): A3 —— C++ 是 if (!player) return;
      if (!this.player && !this.debugCamera) {
        return;
      }
      // DEFERRED(Gui): bool mouseDiggable = !gui.isInside(Mouse::getX(), Mouse::getY()); bool allowGuiClicks = true;
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
        // DEFERRED(Gui): if (allowGuiClicks && e.action == ACTION_LEFT && e.data == DATA_DOWN) gui.handleClick(...);
        // DEFERRED(Gui): ACTION_WHEEL —— 聊天滚动或切换物品栏格子
      }
      TIMER_POP_PUSH('keyboard');
      while (Keyboard.next()) {
        const key = Keyboard.getEventKey();
        const isPressed = Keyboard.getEventKeyState() === KeyboardAction.KEYDOWN;
        if (this.player) {
          this.player.setKey(key, isPressed);
        } else {
          // ADAPTED(DebugCamera): A3 —— 等价于 LocalPlayer::setKey → input->setKey
          this.inputHolder!.getMoveInput().setKey(key, isPressed);
        }
        if (isPressed) {
          // DEFERRED(Gui): gui.handleKeyPressed(key); 数字键选物品栏格子
          if (key === Keyboard.KEY_LEFT_CTRL) {
            // DEFERRED(Player): player->setSprinting(true);
          }
          // DEFERRED(Gui): KEY_E 物品选择界面；KEY_T 控制台界面
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
          // DEFERRED(Gui): if (options.getBooleanValue(OPTIONS_RENDER_DEBUG) && '0'..'9') _perfRenderer->debugFpsMeterKeyPress(key - '0');
          if (key === Keyboard.KEY_ESCAPE) {
            // DEFERRED(Gui): pauseGame(false);
          }
        }
      }
      TIMER_POP_PUSH('handlemouse');
      // DEFERRED(GameMode): 鼠标左右键的破坏、放置与 releaseUsingItem（gameMode、handleBuildAction 未移植）
      this.lastTickTime = getTimeMs();
      TIMER_POP();
    } finally {
      Mouse.reset();
      Keyboard.reset();
    }
  }

  // OMIT(GameMode): handleBuildAction(action)  Minecraft.cpp:960
  // OMIT(Network): isOnlineClient()  Minecraft.cpp:1048
  // OMIT(Network): isOnline()  Minecraft.cpp:1053
  // OMIT(Gui): pauseGame(isBackPaused)  Minecraft.cpp:1058
  // OMIT(Gui): gameLostFocus()  Minecraft.cpp:1075
  // OMIT(Gui): setScreen(screen)  Minecraft.cpp:1084
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
      // DEFERRED(GameMode): player = (LocalPlayer*) gameMode->createPlayer(level); gameMode->initPlayer(player);
    }
    if (this.player) {
      this.player.input = this.inputHolder!.getMoveInput();
    }
    if (this.levelRenderer !== null) this.levelRenderer.setLevel(level);
    // DEFERRED(Particle): if (particleEngine != NULL) particleEngine->setLevel(level);
    // DEFERRED(GameMode): gameMode->adjustPlayer(player);
    // DEFERRED(Gui): gui.onLevelGenerated();
    level.validateSpawn();
    // DEFERRED(Player): level->loadPlayer(player, true);
    if (this.player && !level.isClientSide) {
      this.player.resetPos(false);
    }
    if (level && level.dimension) {
      level.dimension.FogType = this.options.getIntValue(OptionId.OPTIONS_FOG_TYPE);
    }
    // ADAPTED(DebugCamera): A1 —— C++ 是 cameraTargetPlayer = player;
    this.cameraTargetPlayer = this.player ?? this.debugCamera;
    // DEFERRED(Network): raknetInstance->announceServer(serverName); netCallback->levelGenerated(level);
    this._hasSignaledGeneratingLevelFinished = true;
  }

  // OMIT(Debug): gatherStats1() .. gatherStats4()  Minecraft.cpp:1510
  // OMIT(Player): respawnPlayer(playerId)  Minecraft.cpp:1538
  // OMIT(Player): resetPlayer(player)  Minecraft.cpp:1548
  // OMIT(Player): respawnPlayer()  Minecraft.cpp:1566

  /** C++ 的 void onGraphicsReset()（覆盖 App 的 protected 纯虚函数） */
  protected onGraphicsReset$0(): void {
    this.textures!.clear();
    // DEFERRED(Gui): font->onGraphicsReset(); gui.onGraphicsReset();
    if (this.levelRenderer) this.levelRenderer.onGraphicsReset();
    if (this.gameRenderer) this.gameRenderer.onGraphicsReset();
    // DEFERRED(EntityRender): EntityRenderDispatcher / TileEntityRenderDispatcher ->onGraphicsReset();
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

  // OMIT(Storage): getLevelSource()  Minecraft.cpp:1611
  // OMIT(Sound): audioEngineOn()  Minecraft.cpp:1622
  // OMIT(Sound): audioEngineOff()  Minecraft.cpp:1627
  // OMIT(GameMode): setIsCreativeMode(isCreative)  Minecraft.cpp:1633
  // OMIT(GameMode): isCreativeMode()  Minecraft.cpp:1652

  isPowerVR(): boolean {
    return this._powerVr;
  }

  isKindleFire(kindleVersion: number): boolean {
    if (kindleVersion !== 1) return false;
    const modelLower = this.platform()!.getPlatformStringVar(PlatformStringVars.DEVICE_BUILD_MODEL).toLowerCase();
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

  // OMIT(Gui): addMessage(msg)  Minecraft.cpp:1715

  getTicks(): number {
    return this.ticks;
  }

  /** ADAPTED(Test)：只给测试读计时器 */
  _timerForTest(): Timer {
    return this.timer;
  }
}
