// 1:1 移植自 src/client/renderer/tileentity/TileEntityRenderer.h 与 TileEntityRenderer.cpp
import type { Level, TileEntity } from '@mcpe/world';
import type { Font } from '../../gui/Font';
import type { TileEntityRenderDispatcher } from './TileEntityRenderDispatcher';

export abstract class TileEntityRenderer {
  protected tileEntityRenderDispatcher: TileEntityRenderDispatcher | null = null;

  init(tileEntityRenderDispatcher: TileEntityRenderDispatcher): void {
    this.tileEntityRenderDispatcher = tileEntityRenderDispatcher;
  }

  abstract render(entity: TileEntity, x: number, y: number, z: number, a: number): void;

  bindTexture(resourceName: string): void {
    const t = this.tileEntityRenderDispatcher!.textures;
    if (t !== null) t.loadAndBindTexture(resourceName);
  }

  getLevel(): Level | null {
    return this.tileEntityRenderDispatcher!.level;
  }

  getFont(): Font | null {
    return this.tileEntityRenderDispatcher!.getFont();
  }

  onGraphicsReset(): void {}

  onNewLevel(_level: Level | null): void {}
}
