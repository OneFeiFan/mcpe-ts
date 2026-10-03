/**
 * NEW（S9）：网页版的平台层，对照 AppPlatform_glfw.h / .cpp 写。
 *  - loadTexture：从预加载表同步返回 RGBA8888（D9）；表里没有的名字返回空的 TextureData（Textures 记为 InvalidId）。
 *  - readAssetFile（S13）：从预加载的文件表返回（语言文件）。
 *  - supportsTouchscreen＝false、isPowerVR＝false、isSuperFast＝true；屏幕尺寸取画布的像素尺寸；hideCursor 改画布的 cursor 样式。
 *  - 鼠标锁定由 DomInput 经 MouseHandler.platformHooks 处理（ADAPTED(Platform)，见 MouseHandler.ts）。
 */
import { AppPlatform, BinaryBlob, TextureData } from '@mcpe/client';
import { LOGI } from '@mcpe/platform';
import { IMAGE_NAMES } from './imageManifest';

export class AppPlatform_web extends AppPlatform {
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly images: Map<string, TextureData>,
    private readonly files: Map<string, Uint8Array> = new Map(),
  ) {
    super();
  }

  /** ADAPTED(Web)：C++ 从安装包读文件；网页版从启动时预加载的表（assets.ts 的 PRELOAD_FILES）同步返回 */
  override readAssetFile(filename: string): BinaryBlob {
    const data = this.files.get(filename);
    if (!data) {
      LOGI(`AppPlatform_web: 没有预加载 ${filename}——把它加进 assets.ts 的 PRELOAD_FILES`);
      return new BinaryBlob();
    }
    return new BinaryBlob(data, data.length);
  }

  override loadTexture(filename: string, _textureFolder: boolean): TextureData {
    const t = this.images.get(filename);
    if (!t) {
      if (IMAGE_NAMES.has(filename)) LOGI(`AppPlatform_web: ${filename} 在材质包里，但没有预加载——把它加进 assets.ts 的 PRELOAD`);
      else LOGI(`AppPlatform_web: 材质包里没有 ${filename}`);
      return new TextureData();
    }
    return t;
  }

  override supportsTouchscreen(): boolean {
    return false;
  }

  override isPowerVR(): boolean {
    return false;
  }

  isSuperFast(): boolean {
    return true;
  }

  override getScreenWidth(): number {
    return this.canvas.width;
  }

  override getScreenHeight(): number {
    return this.canvas.height;
  }

  override hideCursor(hide: boolean): void {
    this.canvas.style.cursor = hide ? 'none' : '';
  }

  override getPlatformStringVar(_stringId: number): string {
    return navigator.userAgent;
  }
}
