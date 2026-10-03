/**
 * 1:1 移植自 src/NinecraftApp.h 与 NinecraftApp.cpp（S9）：应用入口，按原顺序初始化静态表、GL 状态与 Minecraft。
 * 【DEFERRED】
 *   raknet 重启（Network）、updateStats（Stats）、用户名界面（Gui）、`LOGI("This: %p\n", this)`。
 * 【ADAPTED(Demo)】`startDemoWorld()` 建/进 demo 世界。**B8g 起启动入口已经换回 C++ 原样的
 *   `screenChooser.setScreen(SCREEN_STARTMENU)`**，它现在只剩场景/测试在用（原因见该函数的注释）。
 * 【OMIT】teardown（只被析构函数调用）、restartServer、handleBack、updateStats、testCreationAndDestruction、testJoiningAndDestruction。
 * 构建开关：_EMSCRIPTEN_（单下划线）没有定义，所以 initGLStates 里的 glHint 照常调用（WebGL 下是空操作）。
 */
import { I18n } from '@mcpe/locale';
import { SharedConstants } from '@mcpe/core';
import { Mouse, Multitouch } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import {
  ExternalFileLevelStorageSource,
  FlatDimension,
  GameType,
  initBiomes,
  initItems,
  initMaterials,
  initTileEntities,
  initTiles,
  LevelSettings,
  MobCategory,
  ServerLevel,
} from '@mcpe/world';
import { Minecraft } from './Minecraft';
import { OptionId } from './Options';
import { ScreenId } from './gui/screens/ScreenChooser';
import {
  GL_ALPHA_TEST,
  GL_BACK,
  GL_CULL_FACE,
  GL_DEPTH_TEST,
  GL_FASTEST,
  GL_GREATER,
  GL_LEQUAL,
  GL_PERSPECTIVE_CORRECTION_HINT,
  GL_TEXTURE_2D,
  glAlphaFunc,
  glCullFace,
  glDepthFunc,
  glDepthRangef,
  glEnable,
  glEnable2,
  glHint,
} from './renderer/gles';
import { Tesselator } from './renderer/Tesselator';

export class NinecraftApp extends Minecraft {
  private static _hasInitedStatics = false;

  private _verbose = true;
  private _frames = 0;
  private _lastTickMs = 0;

  constructor() {
    super();
  }

  // 析构函数不移植（R3）；OMIT(Teardown): teardown()  NinecraftApp.cpp:127

  override initApp(): void {
    Mth.initMth();
    // #ifdef ANDROID 的 _hasInitedStatics 守卫：网页版不执行
    initMaterials(); // Material::initMaterials()
    MobCategory.initMobCategories();
    initTiles(); // Tile::initTiles()
    initItems(); // Item::initItems()（子类经 ItemInclude 注入，ADAPTED(ESM)）
    initBiomes(); // Biome::initBiomes()
    initTileEntities(); // TileEntity::initTileEntities()（子类经 TileEntityInclude 注入，ADAPTED(ESM)）
    this.initGLStates();
    Tesselator.instance.init();
    I18n.loadLanguage(this.platform()!, 'en_US');
    if (this.externalStoragePath !== '') {
      this.options.setOptionsFilePath(this.externalStoragePath);
    }
    super.initApp(); // Minecraft::init();
    // 照 C++ 的 `#if !defined(DEMO_MODE) && !defined(APPLE_DEMO_PROMOTION) && !defined(NO_STORAGE)`
    // 那一支（网页版三个开关都没定义）。网页版把根目录固定成空串，于是
    // basePath = "/games/com.mojang/minecraftWorlds"（照 externalPath 的结构，ADAPTED(Web)）。
    this.storageSource = new ExternalFileLevelStorageSource(
      this.externalStoragePath,
      this.externalCacheStoragePath,
    );
    this._running = false;
    // C++ 是 `LOGI("This: %p\n", this);`（打指针，网页版没有意义，不移植）。
    this.screenChooser.setScreen(ScreenId.SCREEN_STARTMENU);
    // setScreen 里的 releaseMouse() 顺带把 mouseGrabbed 置回 false —— C++ 就靠这一下，
    // 否则初值 true 会让玩家还没进世界就锁住光标（详见 Screen.setScreen 的实现）。
    if (this.options.getBooleanValue(OptionId.OPTIONS_FIRST_LAUNCH)) {
      this.options.toggle(OptionId.OPTIONS_FIRST_LAUNCH);
      // DEFERRED(Gui): setScreen(new UsernameScreen());
    }
  }

  /** ADAPTED(Demo)：demo 世界的目录名。C++ 的名字由用户在"新建世界"界面里输入（B8） */
  static readonly DEMO_LEVEL_ID = 'demo';

  /**
   * ADAPTED(Demo)：建/进 demo 世界（一个平坦世界，**并且它真的会存下去**）。
   *
   * 【B8g 起它不是"入口"了】启动入口已经换回 C++ 原样的 `screenChooser.setScreen(SCREEN_STARTMENU)`。
   * 现在只剩**场景/测试**会调它 —— 而且从菜单进世界那条路 C-6b 起已经通了
   * （`Minecraft.selectLevel`），所以它现在纯粹是个"一键建个平坦世界"的测试后门。
   *
   * 【为什么仍然不走 Minecraft.selectLevel】它是「指定平坦维度」的入口；而 `selectLevel`
   * 不传维度、走 `DimensionFactory` 的默认维度（也就是普通地形）。两个世界长得完全不一样，
   * 场景要用哪个就调哪个。这边除了多传一个 `FlatDimension`，其余与 `selectLevel` 逐行相同。
   */
  startDemoWorld(): void {
    this.startLevel(NinecraftApp.DEMO_LEVEL_ID, 'demo');
  }

  /**
   * `Minecraft.selectLevel` 去掉"从 DimensionFactory 取维度"那一步的版本（见 startDemoWorld）。
   * 存档目录来自真的 `ExternalFileLevelStorageSource`，所以世界会落盘、刷新后还在。
   */
  private startLevel(levelId: string, levelName: string): void {
    const level = new ServerLevel(
      this.storageSource!.selectLevel(levelId, false),
      levelName,
      new LevelSettings(0, GameType.Creative),
      SharedConstants.GeneratorVersion,
      new FlatDimension(),
    );
    this.setIsCreativeMode(level.getLevelData().getGameType() === GameType.Creative); // 与 Minecraft::selectLevel 相同
    this.setLevel(level, 'Generating level');
    this._running = true;
  }

  override update(): void {
    ++this._frames;
    Multitouch.commit();
    super.update(); // Minecraft::update();
    this.swapBuffers();
    Mouse.reset2();
    // DEFERRED(Network): if (level && raknetInstance->isProbablyBroken() && raknetInstance->isServer()) restartServer();
    // DEFERRED(Stats): updateStats();（#ifndef WIN32）
  }

  // OMIT(Stats): updateStats()  NinecraftApp.cpp:176

  private initGLStates(): void {
    glEnable2(GL_DEPTH_TEST);
    glDepthFunc(GL_LEQUAL);
    glDepthRangef(0, 1);
    glEnable2(GL_ALPHA_TEST);
    glAlphaFunc(GL_GREATER, 0.1);
    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    glEnable2(GL_TEXTURE_2D);
    glHint(GL_PERSPECTIVE_CORRECTION_HINT, GL_FASTEST); // #ifndef _EMSCRIPTEN_（单下划线，没有定义）
    this._powerVr = this.platform()!.isPowerVR();
  }

  // OMIT(Network): restartServer()  NinecraftApp.cpp:263
  // OMIT(Gui): handleBack(isDown)  NinecraftApp.cpp:280

  protected override onAppGraphicsReset(): void {
    this.initGLStates();
    Tesselator.instance.init();
    super.onAppGraphicsReset(); // Minecraft::onGraphicsReset();
  }

  // OMIT(Test): testCreationAndDestruction()  NinecraftApp.cpp:327
  // OMIT(Test): testJoiningAndDestruction()  NinecraftApp.cpp:362
}
