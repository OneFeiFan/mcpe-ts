// 1:1 移植自 src/client/IConfigListener.h 与 IConfigListener.cpp：屏幕尺寸与 GUI 缩放的配置，及其监听接口。
import { Gui } from './gui/Gui';
import type { Minecraft } from './Minecraft';
import type { Options } from './Options';
import { PixelCalc } from './PixelCalc';

export class Config {
  width = 0;
  height = 0;
  guiScale = 0;
  invGuiScale = 0;
  guiWidth = 0;
  guiHeight = 0;
  pixelCalc = new PixelCalc();
  pixelCalcUi = new PixelCalc();
  minecraft: Minecraft | null = null;
  options: Options | null = null;

  setScreenSize(width: number, height: number, scale: number): void {
    this.width = width;
    this.height = height;
    this.guiScale = scale;
    this.invGuiScale = 1.0 / scale;
    this.guiWidth = Math.trunc(width * this.invGuiScale) | 0;
    this.guiHeight = Math.trunc(height * this.invGuiScale) | 0;
  }
}

export function createConfig(mc: Minecraft): Config {
  const c = new Config();
  // #ifndef STANDALONE_SERVER
  c.setScreenSize(mc.width, mc.height, Gui.GuiScale);
  c.pixelCalc.assign(mc.pixelCalc);
  c.pixelCalcUi.assign(mc.pixelCalcUi);
  c.minecraft = mc;
  c.options = mc.options;
  return c;
}

export abstract class IConfigListener {
  abstract onConfigChanged(config: Config): void;
}
