/**
 * 1:1 移植自 src/client/renderer/tileentity/TileEntityRenderDispatcher.h 与 .cpp。
 * R10：render(e, a) / render(e, x, y, z, a) → 分派入口 render + renderAt；getRenderer(TileEntity*) / getRenderer(id) → getRenderer + getRendererById。
 * std::map 按键有序：TR_CHEST_RENDERER(1) 在 TR_SIGN_RENDERER(2) 前，遍历顺序与 C++ 一致（Map 按插入顺序，插入顺序就是键序）。
 */
import type { Font } from '../../gui/Font';
import type { Level, Mob, TileEntity } from '@mcpe/world';
import { TileEntityRendererId } from '@mcpe/world';
import { glColor4f } from '../gles';
import type { Textures } from '../Textures';
import { ChestRenderer } from './ChestRenderer';
import { SignRenderer } from './SignRenderer';
import type { TileEntityRenderer } from './TileEntityRenderer';

export class TileEntityRenderDispatcher {
  static xOff = 0;
  static yOff = 0;
  static zOff = 0;
  private static instance: TileEntityRenderDispatcher | null = null;

  textures: Textures | null = null;
  level: Level | null = null;
  cameraEntity: Mob | null = null;
  playerRotY = 0;
  playerRotX = 0;
  xPlayer = 0;
  yPlayer = 0;
  zPlayer = 0;
  private _font: Font | null = null;
  private _renderers = new Map<number, TileEntityRenderer>();

  private constructor() {
    this._renderers.set(TileEntityRendererId.TR_CHEST_RENDERER, new ChestRenderer());
    this._renderers.set(TileEntityRendererId.TR_SIGN_RENDERER, new SignRenderer());
    for (const r of this._renderers.values()) r.init(this);
  }

  static getInstance(): TileEntityRenderDispatcher {
    if (!TileEntityRenderDispatcher.instance)
      TileEntityRenderDispatcher.instance = new TileEntityRenderDispatcher();
    return TileEntityRenderDispatcher.instance;
  }

  static destroy(): void {
    TileEntityRenderDispatcher.instance = null;
  }

  setLevel(level: Level | null): void {
    this.level = level;
    for (const r of this._renderers.values()) if (r !== null) r.onNewLevel(level);
  }

  prepare(
    level: Level,
    textures: Textures | null,
    font: Font | null,
    player: Mob,
    a: number,
  ): void {
    if (this.level !== level) this.setLevel(level);
    this.textures = textures;
    this.cameraEntity = player;
    this._font = font;
    this.playerRotY = player.yRotO + (player.yRot - player.yRotO) * a;
    this.playerRotX = player.xRotO + (player.xRot - player.xRotO) * a;
    this.xPlayer = player.xOld + (player.x - player.xOld) * a;
    this.yPlayer = player.yOld + (player.y - player.yOld) * a;
    this.zPlayer = player.zOld + (player.z - player.zOld) * a;
  }

  render(e: TileEntity, a: number): void {
    if (e.distanceToSqr(this.xPlayer, this.yPlayer, this.zPlayer) < 64 * 64) {
      const br = this.level!.getBrightness(e.x, e.y, e.z);
      glColor4f(br, br, br, 1);
      this.renderAt(
        e,
        e.x - TileEntityRenderDispatcher.xOff,
        e.y - TileEntityRenderDispatcher.yOff,
        e.z - TileEntityRenderDispatcher.zOff,
        a,
      );
    }
  }

  renderAt(entity: TileEntity, x: number, y: number, z: number, a: number): void {
    const renderer = this.getRenderer(entity);
    if (renderer !== null) {
      renderer.render(entity, x, y, z, a);
    }
  }

  distanceToSqr(x: number, y: number, z: number): number {
    const xd = x - this.xPlayer;
    const yd = y - this.yPlayer;
    const zd = z - this.zPlayer;
    return xd * xd + yd * yd + zd * zd;
  }

  getFont(): Font | null {
    return this._font;
  }

  getRenderer(entity: TileEntity): TileEntityRenderer | null {
    return this.getRendererById(entity.rendererId);
  }

  getRendererById(rendererId: number): TileEntityRenderer | null {
    return this._renderers.get(rendererId) ?? null;
  }

  onGraphicsReset(): void {
    for (const r of this._renderers.values()) r.onGraphicsReset();
  }
}
