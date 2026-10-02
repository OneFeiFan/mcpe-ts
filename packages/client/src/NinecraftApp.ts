/**
 * 1:1 移植自 src/NinecraftApp.h 与 NinecraftApp.cpp（S9）：应用入口，按原顺序初始化静态表、GL 状态与 Minecraft。
 * 【DEFERRED】Item.initItems（Item）、I18n.loadLanguage（Locale）、
 *   storageSource 与起始界面（Storage、Gui）、raknet 重启（Network）、updateStats（Stats）。
 * 【ADAPTED(Demo)】在原本设置起始界面的位置调用 startDemoWorld()：demo 唯一的专用入口。
 * 【OMIT】teardown（只被析构函数调用）、restartServer、handleBack、updateStats、testCreationAndDestruction、testJoiningAndDestruction。
 * 构建开关：_EMSCRIPTEN_（单下划线）没有定义，所以 initGLStates 里的 glHint 照常调用（WebGL 下是空操作）。
 */
import { SharedConstants } from '@mcpe/core';
import { Mouse, Multitouch } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import { FlatDimension, GameType, initBiomes, initMaterials, initTileEntities, initTiles, Level, LevelSettings, MemoryLevelStorage, MobCategory } from '@mcpe/world';
import { DebugFreeCamera } from './camera/DebugFreeCamera';
import { Minecraft } from './Minecraft';
import { OptionId } from './Options';
import {
  GL_ALPHA_TEST, GL_BACK, GL_CULL_FACE, GL_DEPTH_TEST, GL_FASTEST, GL_GREATER, GL_LEQUAL, GL_PERSPECTIVE_CORRECTION_HINT, GL_TEXTURE_2D,
  glAlphaFunc, glCullFace, glDepthFunc, glDepthRangef, glEnable, glEnable2, glHint,
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

  override init$0(): void {
    Mth.initMth();
    // #ifdef ANDROID 的 _hasInitedStatics 守卫：网页版不执行
    initMaterials(); // Material::initMaterials()
    MobCategory.initMobCategories();
    initTiles(); // Tile::initTiles()
    // DEFERRED(Item): Item::initItems();
    initBiomes(); // Biome::initBiomes()
    initTileEntities(); // TileEntity::initTileEntities()（子类经 TileEntityInclude 注入，ADAPTED(ESM)）
    this.initGLStates();
    Tesselator.instance.init();
    // DEFERRED(Locale): I18n::loadLanguage(platform(), "en_US");
    if (this.externalStoragePath !== '') {
      this.options.setOptionsFilePath(this.externalStoragePath);
    }
    super.init$0(); // Minecraft::init();
    // DEFERRED(Storage): storageSource = new MemoryLevelStorageSource();（DEMO_MODE 分支）
    this._running = false;
    // DEFERRED(Gui): screenChooser.setScreen(SCREEN_STARTMENU);
    // ADAPTED(Demo): 没有起始界面，在这里直接进入 demo 世界。setScreen(起始界面) 的副作用 releaseMouse() 照样执行：
    //   mouseGrabbed 的初值是 true，C++ 靠起始界面把它置回 false，进游戏时 setScreen(NULL) → grabMouse() 才真正锁定光标。
    //   这里没有界面，第一次点击画面时由 tickInput 的“点击即 grabMouse”完成锁定；否则光标没锁定时移动鼠标也会转动视角。
    this.releaseMouse();
    this.startDemoWorld();
    if (this.options.getBooleanValue(OptionId.OPTIONS_FIRST_LAUNCH)) {
      this.options.toggle(OptionId.OPTIONS_FIRST_LAUNCH);
      // DEFERRED(Gui): setScreen(new UsernameScreen());
    }
  }

  /** ADAPTED(Demo)：新建平坦世界并放好自由相机（手册 S9 的 startDemoWorld 规格） */
  startDemoWorld(): void {
    const level = new Level(new MemoryLevelStorage(), 'demo', new LevelSettings(0, GameType.Creative), SharedConstants.GeneratorVersion, new FlatDimension());
    this.setLevel(level, 'Generating level');
    const camera = new DebugFreeCamera(level, 136, 72, 104);
    camera.yRot = camera.yRotO = 0;
    camera.xRot = camera.xRotO = 30;
    this.debugCamera = camera;
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

  protected override onGraphicsReset$0(): void {
    this.initGLStates();
    Tesselator.instance.init();
    super.onGraphicsReset$0(); // Minecraft::onGraphicsReset();
  }

  // OMIT(Test): testCreationAndDestruction()  NinecraftApp.cpp:327
  // OMIT(Test): testJoiningAndDestruction()  NinecraftApp.cpp:362
}
