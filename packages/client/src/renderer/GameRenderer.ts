/**
 * 1:1 移植自 src/client/renderer/GameRenderer.h 与 GameRenderer.cpp（S9）：每帧的相机、雾、清屏与各渲染层的编排。
 *
 * 【OMIT】updateFreeformPickDirection、pick、renderItemInHand（拾取、手持物品）。prepareAndRenderClouds 在“画面”这一步补上。
 * 【DEFERRED】见各处标记：构造里的 ItemInHandRenderer 与 EntityRenderDispatcher；render 里的 gui.render；renderLevel 里的
 *   pick、粒子、实体、选中框、云、Beta 天空、手持物品；tick 末尾的 itemInHandRenderer->tick()。
 *   （否则 _rotXlast 与 fogBr 永不更新，清屏色与雾一直是黑的）。
 * 【未使用的成员】smoothTurnX、smoothTurnY（SmoothFloat）只被已 OMIT 的拾取代码使用，不移植。
 * 渲染数学属于三档规则的“自由处理”，按 JS 数值计算。
 */
import { Mouse, Multitouch } from '@mcpe/platform';
import { Mth, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH } from '@mcpe/util';
import type { LevelRenderer } from './LevelRenderer';
import {
  type Entity,
  HitResult,
  HitResultType,
  Material,
  type Mob,
  type Player,
  Tile,
  Vec3,
} from '@mcpe/world';
import { IntRectangle } from '../gui/components/ImageButton';
import { Gui } from '../gui/Gui';
import { EntityRenderDispatcher } from './entity/EntityRenderDispatcher';
import { ItemInHandRenderer } from './ItemInHandRenderer';
import type { Minecraft } from '../Minecraft';
import { OptionId } from '../Options';
import type { LocalPlayer } from '../player/LocalPlayer';
import { FrustumCuller } from './culling/FrustumCuller';
import {
  GL_ALPHA_TEST,
  GL_BLEND,
  GL_COLOR_BUFFER_BIT,
  GL_COLOR_MATERIAL,
  GL_CULL_FACE,
  GL_DEPTH_BUFFER_BIT,
  GL_DEPTH_TEST,
  GL_EXP,
  GL_FALSE,
  GL_FLAT,
  GL_FOG,
  GL_FOG_COLOR,
  GL_FOG_DENSITY,
  GL_FOG_END,
  GL_FOG_MODE,
  GL_FOG_START,
  GL_LINEAR,
  GL_MODELVIEW,
  GL_MODELVIEW_MATRIX,
  GL_ONE_MINUS_SRC_ALPHA,
  GL_PROJECTION,
  GL_PROJECTION_MATRIX,
  GL_SCISSOR_TEST,
  GL_SMOOTH,
  GL_SRC_ALPHA,
  GL_TRUE,
  glBlendFunc2,
  glClear,
  glClearColor,
  glColor4f2,
  glColorMask,
  glDepthMask,
  glDisable,
  glDisable2,
  glEnable,
  glEnable2,
  glFogf,
  glFogfv,
  glFogx,
  glGetFloatv,
  glLoadIdentity2,
  glMatrixMode,
  glOrthof,
  glRotatef,
  glRotatef2,
  glScalef2,
  glScissor,
  glShadeModel2,
  glTranslatef,
  glTranslatef2,
  gluPerspective,
  glViewport,
  glLoadIdentity,
  glPopMatrix2,
  glPushMatrix2,
} from './gles';
import { _t_keepPic } from './LevelRenderer';
import { Lighting } from './Lighting';
import { Tesselator } from './Tesselator';


const f = Math.fround;
/** GameRenderer.cpp 的文件内静态变量 static int _shTicks = -1; */
let _shTicks = -1;

/** GameRenderer.cpp 里的自由函数 renderCursor（只在有界面且开了 RPI 光标选项时调用） */
export function renderCursor(x: number, y: number, minecraft: Minecraft): void {
  const t = Tesselator.instance;
  minecraft.textures!.loadAndBindTexture('gui/cursor.png');
  glEnable(GL_BLEND);
  const width = 16;
  const height = 16;
  t.begin();
  t.color(0xffffffff | 0);
  t.vertexUV(x, y + height, 0, 0, 1);
  t.vertexUV(x + width, y + height, 0, 1, 1);
  t.vertexUV(x + width, y, 0, 1, 0);
  t.vertexUV(x, y, 0, 0, 0);
  t.draw();
  glDisable(GL_BLEND);
}

export class GameRenderer {
  itemInHandRenderer: ItemInHandRenderer;

  private mc: Minecraft;
  private renderDistance = 0;
  private _tick = 0;
  private pickDirection = new Vec3(1, 0, 0);
  private thirdDistance = 4;
  private thirdDistanceO = 4;
  private thirdRotation = 0;
  private thirdRotationO = 0;
  private thirdTilt = 0;
  private thirdTiltO = 0;
  private zoom = 1;
  private zoom_x = 0;
  private zoom_y = 0;
  private fov = 1;
  private oFov = 1;
  private fovOffset = 0;
  private fovOffsetO = 0;
  private _setupCameraFov = 0;
  private cameraRoll = 0;
  private cameraRollO = 0;
  private fr = 0;
  private fg = 0;
  private fb = 0;
  private fogBrO = 0;
  private fogBr = 0;
  private _rotX = 0;
  private _rotY = 0;
  private _rotXlast = 0;
  private _rotYlast = 0;
  private _lastTickT = 0;
  private readonly lastProjMatrix = new Float32Array(16);
  private readonly lastModelMatrix = new Float32Array(16);
  private useScreenScissor = false;
  private screenScissorArea = new IntRectangle();

  constructor(mc: Minecraft) {
    this.mc = mc;
    this.saveMatrices();
    this.itemInHandRenderer = new ItemInHandRenderer(mc);
    const e = EntityRenderDispatcher.getInstance();
    e.itemInHandRenderer = this.itemInHandRenderer;
    e.textures = mc.textures;
  }

  /*private*/
  setupCamera(a: number, eye: number): void {
    const mc = this.mc;
    this.renderDistance = (16 * 16) >> mc.options.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE);
    // #if defined(ANDROID)：PowerVR 降低视距，网页版不执行
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity2();
    const stereoScale = 0.07;
    if (mc.options.getBooleanValue(OptionId.OPTIONS_ANAGLYPH_3D))
      glTranslatef2(-(eye * 2 - 1) * stereoScale, 0, 0);
    const far = mc.options.getBooleanValue(OptionId.OPTIONS_BETA_SKY)
      ? this.renderDistance * 2.0
      : this.renderDistance;
    if (this.zoom !== 1) {
      glTranslatef2(this.zoom_x, -this.zoom_y, 0);
      glScalef2(this.zoom, this.zoom, 1);
    }
    gluPerspective((this._setupCameraFov = this.getFov(a, true)), mc.width / mc.height, 0.05, far);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity2();
    if (mc.options.getBooleanValue(OptionId.OPTIONS_ANAGLYPH_3D))
      glTranslatef2((eye * 2 - 1) * 0.1, 0, 0);
    this.bobHurt(a);
    if (mc.options.getBooleanValue(OptionId.OPTIONS_VIEW_BOBBING)) this.bobView(a);
    this.moveCameraToPlayer(a);
  }

  /*public*/
  render(a: number): void {
    const mc = this.mc;
    TIMER_PUSH('mouse');
    const turnTarget = mc.player;
    if (turnTarget && mc.mouseGrabbed) {
      mc.mouseHandler.poll();
      const ss = mc.options.getProgressValue(OptionId.OPTIONS_SENSITIVITY) * 0.6 + 0.2;
      const sens = ss * ss * ss * 8;
      const xo = mc.mouseHandler.xd * sens * 4.0;
      const yo = mc.mouseHandler.yd * sens * 4.0;
      const now = this._tick + a;
      let deltaT = now - this._lastTickT;
      if (deltaT > 3.0) deltaT = 3.0;
      this._lastTickT = now;
      this._rotX += xo;
      this._rotY += yo;
      let yAxis = -1;
      if (mc.options.getBooleanValue(OptionId.OPTIONS_INVERT_Y_MOUSE)) yAxis = 1;
      const screenCovering = mc.screen !== null && !mc.screen.passEvents;
      if (!screenCovering) {
        turnTarget.turn(deltaT * this._rotXlast, deltaT * this._rotYlast * yAxis);
      }
    }
    let xMouse = Math.trunc(Mouse.getX() * Gui.InvGuiScale);
    let yMouse = Math.trunc(Mouse.getY() * Gui.InvGuiScale);
    if (mc.useTouchscreen()) {
      const pid = Multitouch.getFirstActivePointerIdExThisUpdate();
      if (pid >= 0) {
        xMouse = Math.trunc(Multitouch.getX(pid) * Gui.InvGuiScale);
        yMouse = Math.trunc(Multitouch.getY(pid) * Gui.InvGuiScale);
      } else {
        xMouse = -9999;
        yMouse = -9999;
      }
    }
    TIMER_POP();

    let hasClearedColorBuffer = false;
    let hasSetupGuiScreen = false;
    this.useScreenScissor = false;
    if (mc.isLevelGenerated()) {
      TIMER_PUSH('level');
      if (_t_keepPic.value < 0) {
        if (!(mc.screen && !mc.screen.renderGameBehind())) {
          if (mc.screen && mc.screen.hasClippingArea(this.screenScissorArea))
            this.useScreenScissor = true;
          this.renderLevel(a);
          hasClearedColorBuffer = true;
          if (!mc.options.getBooleanValue(OptionId.OPTIONS_HIDEGUI)) {
            TIMER_POP_PUSH('gui');
            this.setupGuiScreen(false);
            hasSetupGuiScreen = true;
            mc.gui.render(a, mc.screen !== null, xMouse, yMouse);
          }
        }
      }
      TIMER_POP();
    } else {
      glViewport(0, 0, mc.width, mc.height);
      glMatrixMode(GL_PROJECTION);
      glLoadIdentity2();
      glMatrixMode(GL_MODELVIEW);
      glLoadIdentity2();
      this.setupGuiScreen(true);
      hasSetupGuiScreen = true;
      hasClearedColorBuffer = true;
    }
    if (!hasSetupGuiScreen) this.setupGuiScreen(!hasClearedColorBuffer);

    if (mc.player && mc.screen === null) {
      if (mc.inputHolder) mc.inputHolder.render(a);
      if (mc.player.input) mc.player.input.render(a);
    }
    if (mc.screen !== null) {
      if (this.useScreenScissor) glDisable2(GL_SCISSOR_TEST);
      mc.screen.render(xMouse, yMouse, a);
      mc.platform()!.hideCursor(!mc.options.getBooleanValue(OptionId.OPTIONS_RPI_CURSOR));
      if (mc.options.getBooleanValue(OptionId.OPTIONS_RPI_CURSOR)) renderCursor(xMouse, yMouse, mc);
      // ADAPTED(Web): if (mc->screen && !mc->screen->isInGameScreen()) sleepMs(15); —— 浏览器主线程不能阻塞
    }
  }

  /*public*/
  renderLevel(a: number): void {
    const mc = this.mc;
    if (mc.cameraTargetPlayer === null) {
      if (mc.player) {
        mc.cameraTargetPlayer = mc.player;
      } else {
        return;
      }
    }
    TIMER_PUSH('pick');
    this.pick(a);
    const cameraEntity = mc.cameraTargetPlayer;
    const levelRenderer = mc.levelRenderer!;
    const particleEngine = mc.particleEngine;
    const xOff = cameraEntity.xOld + (cameraEntity.x - cameraEntity.xOld) * a;
    const yOff = cameraEntity.yOld + (cameraEntity.y - cameraEntity.yOld) * a;
    const zOff = cameraEntity.zOld + (cameraEntity.z - cameraEntity.zOld) * a;

    for (let i = 0; i < 2; i++) {
      if (mc.options.getBooleanValue(OptionId.OPTIONS_ANAGLYPH_3D)) {
        if (i === 0) glColorMask(false, true, true, false);
        else glColorMask(true, false, false, false);
      }
      TIMER_POP_PUSH('clear');
      glViewport(0, 0, mc.width, mc.height);
      this.setupClearColor(a);
      glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
      glEnable2(GL_CULL_FACE);

      TIMER_POP_PUSH('camera');
      this.setupCamera(a, i);
      this.saveMatrices();
      if (this.useScreenScissor) {
        glEnable2(GL_SCISSOR_TEST);
        glScissor(
          this.screenScissorArea.x,
          this.screenScissorArea.y,
          this.screenScissorArea.w,
          this.screenScissorArea.h,
        );
      }
      if (mc.options.getBooleanValue(OptionId.OPTIONS_AMBIENT_OCCLUSION)) {
        glShadeModel2(GL_SMOOTH);
      }

      TIMER_POP_PUSH('frustrum');
      const frustum = new FrustumCuller();
      frustum.prepare(xOff, yOff, zOff);

      TIMER_POP_PUSH('culling');
      levelRenderer.cull(frustum, a);
      levelRenderer.updateDirtyChunks(cameraEntity, false);

      this.setupFog(-1);
      TIMER_POP_PUSH('sky');
      if (
        mc.options.getBooleanValue(OptionId.OPTIONS_BETA_SKY) &&
        mc.options.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE) < 2
      ) {
        levelRenderer.renderSky(a);
      } else if (!mc.options.getBooleanValue(OptionId.OPTIONS_BETA_SKY)) {
        glFogf(GL_FOG_START, this.renderDistance * 0.2);
        glFogf(GL_FOG_END, this.renderDistance * 0.75);
        glFogf(GL_FOG_START, this.renderDistance * 0.6);
        glFogf(GL_FOG_END, this.renderDistance);
      }
      glEnable2(GL_FOG);
      this.setupFog(1);
      if (!mc.options.getBooleanValue(OptionId.OPTIONS_BETA_SKY)) {
        if (mc.options.getBooleanValue(OptionId.OPTIONS_FANCY_GRAPHICS)) {
          this.prepareAndRenderClouds(levelRenderer, a);
        }
      }
      this.setupFog(0);
      glEnable2(GL_FOG);
      mc.textures!.loadAndBindTexture('terrain.png');
      Lighting.turnOff();
      glEnable2(GL_ALPHA_TEST);
      glDisable2(GL_BLEND);
      glEnable2(GL_CULL_FACE);
      TIMER_POP_PUSH('terrain-0');
      levelRenderer.render(cameraEntity, 0, a);
      TIMER_POP_PUSH('terrain-1');
      glEnable2(GL_ALPHA_TEST);
      levelRenderer.render(cameraEntity, 1, a);
      glShadeModel2(GL_FLAT);
      Lighting.turnOn(mc);
      TIMER_POP_PUSH('entities');
      levelRenderer.renderEntities(cameraEntity.getPos(a), frustum, a);
      TIMER_POP_PUSH('particles');
      // ⚠ 位置要紧：C++ 就是紧跟 renderEntities 之后、Lighting.turnOff() 之前 ——
      //   ParticleEngine.render 自己**不设任何 GL 状态**，吃的是上一步残留的状态。
      particleEngine!.render(cameraEntity, a);
      Lighting.turnOff();
      glDisable2(GL_BLEND);
      glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
      Lighting.turnOff();
      this.setupFog(0);
      glEnable2(GL_BLEND);
      glDisable2(GL_CULL_FACE);
      glDepthMask(GL_FALSE);
      glDisable2(GL_ALPHA_TEST);
      mc.textures!.loadAndBindTexture('terrain.png');
      {
        TIMER_POP_PUSH('terrain-water');
        glEnable2(GL_DEPTH_TEST);
        levelRenderer.render(cameraEntity, 2, a);
      }
      glDepthMask(GL_TRUE);
      glEnable2(GL_CULL_FACE);
      glDisable2(GL_BLEND);
      glEnable2(GL_ALPHA_TEST);

      if (this.zoom === 1 && cameraEntity.isPlayer()) {
        if (mc.hitResult.isHit() && !cameraEntity.isUnderLiquid(Material.water)) {
          TIMER_POP_PUSH('select');
          const player = cameraEntity as Player;
          if (mc.options.getBooleanValue(OptionId.OPTIONS_BLOCK_OUTLINE)) {
            levelRenderer.renderHitOutline(player, mc.hitResult, 0, null, a); // java block outline one
          } else {
            levelRenderer.renderHitSelect(player, mc.hitResult, 0, null, a); // normal pe one - shredder
          }
          levelRenderer.renderHit(player, mc.hitResult, 0, null, a);
        }
      }
      glDisable2(GL_FOG);
      if (mc.options.getBooleanValue(OptionId.OPTIONS_BETA_SKY)) {
        this.setupFog(0);
        glEnable2(GL_FOG);
        levelRenderer.renderClouds(a);
        glDisable2(GL_FOG);
      }
      this.setupFog(1);
      if (this.zoom === 1 && !mc.options.getBooleanValue(OptionId.OPTIONS_HIDEGUI)) {
        TIMER_POP_PUSH('hand');
        glClear(GL_DEPTH_BUFFER_BIT);
        this.renderItemInHand(a, i);
      }
      if (!mc.options.getBooleanValue(OptionId.OPTIONS_ANAGLYPH_3D)) {
        TIMER_POP();
        return;
      }
    }
    glColorMask(true, true, true, false);
    TIMER_POP();
  }

  pick(a: number): void {
    const mc = this.mc;
    if (mc.level === null) return;
    const target = mc.cameraTargetPlayer;
    if (target === null) return;
    if (!target.isAlive()) return;
    let range = mc.gameMode!.getPickRange();
    let isPicking = true;
    const freeform =
      mc.useTouchscreen() && !mc.options.getBooleanValue(OptionId.OPTIONS_IS_JOY_TOUCH_AREA);
    if (freeform) {
      isPicking = this.updateFreeformPickDirection(a, this.pickDirection);
    } else {
      mc.hitResult = target.pick(range, a);
      this.pickDirection = target.getViewVector(a);
    }
    const from = target.getPos(a);
    let dist = range;
    if (mc.hitResult.isHit()) {
      dist = mc.hitResult.pos.distanceTo(from.x, from.y, from.z);
    }
    if (mc.gameMode!.isCreativeType()) {
      /*dist =*/ range = 12;
    } else {
      if (dist > 3) dist = 3;
      range = dist;
    }
    const pv = this.pickDirection.multiply(range); // pickDirection * range
    const to = from.add(pv.x, pv.y, pv.z); // from + pv
    target.aimDirection = this.pickDirection;
    let hovered: Entity | null = null;
    const g = 1;
    const aabb = target.bb.expand(pv.x, pv.y, pv.z).grow(g, g, g);
    const objects = mc.level.getEntities(target, aabb);
    let nearest = 0;
    for (let i = 0; i < objects.length; i++) {
      const e = objects[i]!;
      if (!e.isPickable()) continue;
      const rr = e.getPickRadius();
      const bb = e.bb.grow(rr, rr, rr);
      const p = bb.clip(from, to);
      if (bb.contains(from.x, from.y, from.z)) {
        if (nearest >= 0) {
          hovered = e;
          nearest = 0;
        }
      } else if (p.isHit()) {
        const dd = from.distanceTo(p.pos.x, p.pos.y, p.pos.z);
        if (dd < nearest || nearest === 0) {
          hovered = e;
          nearest = dd;
        }
      }
    }
    if (hovered !== null) {
      if (nearest < dist) {
        mc.hitResult = new HitResult(hovered);
      }
    } else if (isPicking && !mc.hitResult.isHit()) {
      if (this.pickDirection.y < -0.7) {
        const to2 = from.add(0, -2.0, 0);
        const downHitResult = mc.level.clip(from, to2);
        if (downHitResult.isHit()) {
          mc.hitResult = downHitResult;
          mc.hitResult.indirectHit = true;
          if (Math.abs(this.pickDirection.x) > Math.abs(this.pickDirection.z)) {
            mc.hitResult.f = this.pickDirection.x < 0 ? 4 : 5;
          } else {
            mc.hitResult.f = this.pickDirection.z < 0 ? 2 : 3;
          }
        }
      }
    }
  }

  /** 触屏的自由拾取（反投影触点）：桌面输入不经过这里 */
  private updateFreeformPickDirection(_a: number, _outDir: Vec3): boolean {
    // DEFERRED(Touch): glhUnProjectf 反投影 mc->inputHolder->mousex/mousey，clip 后写回 outDir（GameRenderer.cpp:638）
    _shTicks = 1;
    return false;
  }
  renderItemInHand(a: number, eye: number): void {
    const mc = this.mc;
    glLoadIdentity2();
    if (mc.options.getBooleanValue(OptionId.OPTIONS_ANAGLYPH_3D))
      glTranslatef2((eye * 2 - 1) * 0.1, 0, 0);
    glPushMatrix2();
    this.bobHurt(a);
    if (mc.options.getBooleanValue(OptionId.OPTIONS_VIEW_BOBBING)) this.bobView(a);
    const target = mc.cameraTargetPlayer!;
    if (
      !mc.options.getBooleanValue(OptionId.OPTIONS_THIRD_PERSON_VIEW) &&
      target.isPlayer() &&
      !(target as Player).isSleeping()
    ) {
      if (!mc.options.getBooleanValue(OptionId.OPTIONS_HIDEGUI)) {
        const fov = this.getFov(a, false);
        if (fov !== this._setupCameraFov) {
          glMatrixMode(GL_PROJECTION);
          glLoadIdentity();
          gluPerspective(fov, mc.width / mc.height, 0.05, this.renderDistance);
          glMatrixMode(GL_MODELVIEW);
        }
        this.itemInHandRenderer.render(a);
      }
    }
    glPopMatrix2();
    if (
      !mc.options.getBooleanValue(OptionId.OPTIONS_THIRD_PERSON_VIEW) &&
      target.isPlayer() &&
      !(target as Player).isSleeping()
    ) {
      this.itemInHandRenderer.renderScreenEffect(a);
      this.bobHurt(a);
    }
    if (mc.options.getBooleanValue(OptionId.OPTIONS_VIEW_BOBBING)) this.bobView(a);
  }
  /**
   * C++ `void GameRenderer::prepareAndRenderClouds(LevelRenderer*, float a)`（GameRenderer.cpp:961）：
   * 换一个远裁剪面放大到 renderDistance × 512 的投影，关深度写入，按两段雾距先画天空、再画云，然后恢复。
   */
  prepareAndRenderClouds(levelRenderer: LevelRenderer, a: number): void {
    const mc = this.mc;
    TIMER_PUSH('clouds');
    glMatrixMode(GL_PROJECTION);
    glPushMatrix2();
    glLoadIdentity2();
    gluPerspective((this._setupCameraFov = this.getFov(a, true)), f(mc.width / mc.height), 2, this.renderDistance * 512);
    glMatrixMode(GL_MODELVIEW);
    glPushMatrix2();
    this.setupFog(0);
    glDepthMask(false);
    glEnable2(GL_FOG);
    glFogf(GL_FOG_START, f(this.renderDistance * f(0.2)));
    glFogf(GL_FOG_END, f(this.renderDistance * f(0.75)));
    levelRenderer.renderSky(a);
    glFogf(GL_FOG_START, f(f(this.renderDistance * f(4.2)) * f(0.6)));
    glFogf(GL_FOG_END, f(this.renderDistance * f(4.2)));
    levelRenderer.renderClouds(a);
    glFogf(GL_FOG_START, f(this.renderDistance * f(0.6)));
    glFogf(GL_FOG_END, this.renderDistance);
    glDisable2(GL_FOG);
    glDepthMask(true);
    this.setupFog(1);
    glPopMatrix2();
    glMatrixMode(GL_PROJECTION);
    glPopMatrix2();
    glMatrixMode(GL_MODELVIEW);
    TIMER_POP();
  }

  private tickFov(): void {
    const mc = this.mc;
    if (mc.cameraTargetPlayer !== mc.player) return;
    this.oFov = this.fov;
    this.fov += (mc.player!.getFieldOfViewModifier() - this.fov) * 0.5;
  }

  /*private*/
  getFov(a: number, applyEffects: boolean): number {
    const player = this.mc.cameraTargetPlayer!;
    let fov = 70;
    if (applyEffects) fov *= this.oFov + (this.fov - this.oFov) * a;
    if (player.isUnderLiquid(Material.water)) fov = 60;
    if (player.hasDied()) {
      const duration = player.deathTime + a;
      fov /= (1 - 500 / (duration + 500)) * 2.0 + 1;
    }
    return fov + this.fovOffsetO + (this.fovOffset - this.fovOffsetO) * a;
  }

  /*private*/
  moveCameraToPlayer(a: number): void {
    const mc = this.mc;
    const player = mc.cameraTargetPlayer!;
    let heightOffset = player.heightOffset - 1.62;
    const x = player.xo + (player.x - player.xo) * a;
    const y = player.yo + (player.y - player.yo) * a - heightOffset;
    const z = player.zo + (player.z - player.zo) * a;
    glRotatef2(this.cameraRollO + (this.cameraRoll - this.cameraRollO) * a, 0, 0, 1);
    if (player.isPlayer() && (player as LocalPlayer).isSleeping()) {
      heightOffset += 1.0;
      glTranslatef(0.0, 0.3, 0);
      if (!mc.options.getBooleanValue(OptionId.OPTIONS_FIXED_CAMERA)) {
        const level = mc.level!;
        const t = level.getTile(Mth.floor(player.x), Mth.floor(player.y), Mth.floor(player.z));
        if (t === Tile.bed.id) {
          const data = level.getData(Mth.floor(player.x), Mth.floor(player.y), Mth.floor(player.z));
          const direction = data & 3;
          glRotatef(direction * 90, 0, 1, 0);
        }
        glRotatef(player.yRotO + (player.yRot - player.yRotO) * a + 180, 0, -1, 0);
        glRotatef(player.xRotO + (player.xRot - player.xRotO) * a, -1, 0, 0);
      }
    } else if (mc.options.getBooleanValue(OptionId.OPTIONS_THIRD_PERSON_VIEW)) {
      let cameraDist = this.thirdDistanceO + (this.thirdDistance - this.thirdDistanceO) * a;
      if (mc.options.getBooleanValue(OptionId.OPTIONS_FIXED_CAMERA)) {
        const rotationY = this.thirdRotationO + (this.thirdRotation - this.thirdRotationO) * a;
        const xRot = this.thirdTiltO + (this.thirdTilt - this.thirdTiltO) * a;
        glTranslatef2(0, 0, -cameraDist);
        glRotatef2(xRot, 1, 0, 0);
        glRotatef2(rotationY, 0, 1, 0);
      } else {
        const yRot = player.yRot;
        const xRot = player.xRot;
        const xd = -Mth.sin((yRot / 180) * Mth.PI) * Mth.cos((xRot / 180) * Mth.PI) * cameraDist;
        const zd = Mth.cos((yRot / 180) * Mth.PI) * Mth.cos((xRot / 180) * Mth.PI) * cameraDist;
        const yd = -Mth.sin((xRot / 180) * Mth.PI) * cameraDist;
        for (let i = 0; i < 8; i++) {
          let xo = (i & 1) * 2 - 1;
          let yo = ((i >> 1) & 1) * 2 - 1;
          let zo = ((i >> 2) & 1) * 2 - 1;
          xo *= 0.1;
          yo *= 0.1;
          zo *= 0.1;
          const hr = mc.level!.clip(
            new Vec3(x + xo, y + yo, z + zo),
            new Vec3(x - xd + xo + zo, y - yd + yo, z - zd + zo),
          );
          if (hr.type !== HitResultType.NO_HIT) {
            const dist = hr.pos.distanceTo(x, y, z);
            if (dist < cameraDist) cameraDist = dist;
          }
        }
        glRotatef2(player.xRot - xRot, 1, 0, 0);
        glRotatef2(player.yRot - yRot, 0, 1, 0);
        glTranslatef2(0, 0, -cameraDist);
        glRotatef2(yRot - player.yRot, 0, 1, 0);
        glRotatef2(xRot - player.xRot, 1, 0, 0);
      }
    } else {
      glTranslatef2(0, 0, -0.1);
    }
    if (!mc.options.getBooleanValue(OptionId.OPTIONS_FIXED_CAMERA)) {
      glRotatef2(player.xRotO + (player.xRot - player.xRotO) * a, 1.0, 0.0, 0.0);
      glRotatef2(player.yRotO + (player.yRot - player.yRotO) * a + 180, 0, 1, 0);
    }
    glTranslatef2(0, heightOffset, 0);
  }

  /*private*/
  private bobHurt(a: number): void {
    const player = this.mc.cameraTargetPlayer!;
    let hurt = player.hurtTime - a;
    if (player.hasDied()) {
      const duration = player.deathTime + a;
      glRotatef2(40 - (40 * 200) / (duration + 200), 0, 0, 1);
    }
    if (player.hurtTime <= 0) return;
    hurt /= player.hurtDuration;
    hurt = Mth.sin(hurt * hurt * hurt * hurt * Mth.PI);
    const rr = player.hurtDir;
    glRotatef2(-rr, 0, 1, 0);
    glRotatef2(-hurt * 14, 0, 0, 1);
    glRotatef2(+rr, 0, 1, 0);
  }

  /*private*/
  private bobView(a: number): void {
    if (!this.mc.cameraTargetPlayer!.isPlayer()) {
      return;
    }
    const player = this.mc.cameraTargetPlayer as LocalPlayer;
    const wda = player.walkDist - player.walkDistO;
    const b = -(player.walkDist + wda * a);
    const bob = player.oBob + (player.bob - player.oBob) * a;
    const tilt = player.oTilt + (player.tilt - player.oTilt) * a;
    glTranslatef2(Mth.sin(b * Mth.PI) * bob * 0.5, -Math.abs(Mth.cos(b * Mth.PI) * bob), 0);
    glRotatef2(Mth.sin(b * Mth.PI) * bob * 3, 0, 0, 1);
    glRotatef2(Math.abs(Mth.cos(b * Mth.PI - 0.2) * bob) * 5, 1, 0, 0);
    glRotatef2(tilt, 1, 0, 0);
  }

  /*private*/
  private setupFog(i: number): void {
    const player = this.mc.cameraTargetPlayer!;
    const fogBuffer = [this.fr, this.fg, this.fb, 1];
    glFogfv(GL_FOG_COLOR, fogBuffer);
    glColor4f2(1, 1, 1, 1);
    if (player.isUnderLiquid(Material.water)) {
      glFogx(GL_FOG_MODE, GL_EXP);
      glFogf(GL_FOG_DENSITY, 0.1); // was 0.06
    } else if (player.isUnderLiquid(Material.lava)) {
      glFogx(GL_FOG_MODE, GL_EXP);
      glFogf(GL_FOG_DENSITY, 2.0); // was 0.06
    } else {
      glFogx(GL_FOG_MODE, GL_LINEAR);
      glFogf(GL_FOG_START, this.renderDistance * 0.6);
      glFogf(GL_FOG_END, this.renderDistance);
      if (i < 0) {
        glFogf(GL_FOG_START, 0);
        glFogf(GL_FOG_END, this.renderDistance * 1.0);
      }
      if (this.mc.level!.dimension.foggy) {
        glFogf(GL_FOG_START, 0);
      }
    }
    glEnable2(GL_COLOR_MATERIAL);
  }

  updateAllChunks(): void {
    this.mc.levelRenderer!.updateDirtyChunks(this.mc.cameraTargetPlayer!, true);
  }

  /*public*/
  tick(nTick: number, maxTick: number): void {
    const mc = this.mc;
    --_t_keepPic.value;
    if (!mc.player) {
      return;
    }
    if (--_shTicks === 0) mc.hitResult.type = HitResultType.NO_HIT;
    if (nTick === maxTick) {
      const tickMult = 1.0 / (1 + maxTick);
      this._rotXlast = 0.4 * Math.pow(Math.abs(this._rotX), 1.2) * tickMult;
      if (this._rotX < 0) this._rotXlast = -this._rotXlast;
      this._rotYlast = 0.4 * Math.pow(Math.abs(this._rotY), 1.2) * tickMult;
      if (this._rotY < 0) this._rotYlast = -this._rotYlast;
      this._rotX = 0;
      this._rotY = 0;
    }
    this.fogBrO = this.fogBr;
    this.thirdDistanceO = this.thirdDistance;
    this.thirdRotationO = this.thirdRotation;
    this.thirdTiltO = this.thirdTilt;
    this.fovOffsetO = this.fovOffset;
    this.cameraRollO = this.cameraRoll;
    if (mc.cameraTargetPlayer === null) {
      mc.cameraTargetPlayer = mc.player;
    }
    this.tickFov();
    const target = mc.cameraTargetPlayer!;
    const brr = mc.level!.getBrightness(
      Mth.floor(target.x),
      Mth.floor(target.y),
      Mth.floor(target.z),
    );
    const whiteness = (3 - mc.options.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE)) / 3.0;
    const fogBrT = brr * (1 - whiteness) + whiteness;
    this.fogBr += (fogBrT - this.fogBr) * 0.1;
    this._tick++;
    this.itemInHandRenderer.tick();
  }

  /*private*/
  setupClearColor(a: number): void {
    const mc = this.mc;
    const level = mc.level!;
    const player = mc.cameraTargetPlayer!;
    let whiteness = 1.0 / (4 - mc.options.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE));
    whiteness = 1 - Math.pow(whiteness, 0.25);
    const skyColor = level.getSkyColor(player, a);
    const sr = skyColor.x;
    const sg = skyColor.y;
    const sb = skyColor.z;
    const fogColor = level.getFogColor(a);
    this.fr = fogColor.x;
    this.fg = fogColor.y;
    this.fb = fogColor.z;
    this.fr += (sr - this.fr) * whiteness;
    this.fg += (sg - this.fg) * whiteness;
    this.fb += (sb - this.fb) * whiteness;
    if (player.isUnderLiquid(Material.water)) {
      this.fr = 0.02;
      this.fg = 0.02;
      this.fb = 0.2;
    } else if (player.isUnderLiquid(Material.lava)) {
      this.fr = 0.6;
      this.fg = 0.1;
      this.fb = 0.0;
    }
    const brr = this.fogBrO + (this.fogBr - this.fogBrO) * a;
    this.fr *= brr;
    this.fg *= brr;
    this.fb *= brr;
    if (mc.options.getBooleanValue(OptionId.OPTIONS_ANAGLYPH_3D)) {
      const frr = (this.fr * 30 + this.fg * 59 + this.fb * 11) / 100;
      const fgg = (this.fr * 30 + this.fg * 70) / 100;
      const fbb = (this.fr * 30 + this.fb * 70) / 100;
      this.fr = frr;
      this.fg = fgg;
      this.fb = fbb;
    }
    glClearColor(this.fr, this.fg, this.fb, 1.0);
  }

  zoomRegion(zoom: number, xa: number, ya: number): void {
    this.zoom = zoom;
    this.zoom_x = xa;
    this.zoom_y = ya;
  }

  unZoomRegion(): void {
    this.zoom = 1;
  }

  setupGuiScreen(clearColorBuffer: boolean): void {
    const screenWidth = Math.trunc(this.mc.width * Gui.InvGuiScale);
    const screenHeight = Math.trunc(this.mc.height * Gui.InvGuiScale);
    const clearBits = clearColorBuffer
      ? GL_DEPTH_BUFFER_BIT | GL_COLOR_BUFFER_BIT
      : GL_DEPTH_BUFFER_BIT;
    glClear(clearBits);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity2();
    glOrthof(0, screenWidth, screenHeight, 0, 2000, 3000);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity2();
    glTranslatef2(0, 0, -2000);
  }

  onGraphicsReset(): void {
    if (this.itemInHandRenderer) this.itemInHandRenderer.onGraphicsReset();
  }

  private saveMatrices(): void {
    // C++ 的 static bool saved 只赋值不读取
    glGetFloatv(GL_PROJECTION_MATRIX, this.lastProjMatrix);
    glGetFloatv(GL_MODELVIEW_MATRIX, this.lastModelMatrix);
  }
}
