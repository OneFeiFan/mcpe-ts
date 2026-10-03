/**
 * NEW（S9）：网页版的平台层，对照 AppPlatform_glfw.h / .cpp 写。
 *  - loadTexture：从预加载表同步返回 RGBA8888（D9）；表里没有的名字返回空的 TextureData（Textures 记为 InvalidId）。
 *  - readAssetFile（S13）：从预加载的文件表返回（语言文件）。
 *  - supportsTouchscreen＝false、isPowerVR＝false、isSuperFast＝true；屏幕尺寸取画布的像素尺寸；hideCursor 改画布的 cursor 样式。
 *  - 鼠标锁定由 DomInput 经 MouseHandler.platformHooks 处理（ADAPTED(Platform)，见 MouseHandler.ts）。
 *  - showKeyboard / hideKeyboard（B8b-2）：挂一个离屏的隐藏 <input> 来叫出手机软键盘，见下面。
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
      if (IMAGE_NAMES.has(filename))
        LOGI(
          `AppPlatform_web: ${filename} 在材质包里，但没有预加载——把它加进 assets.ts 的 PRELOAD`,
        );
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

  /**
   * ADAPTED(Web)：对照 AppPlatform_glfw.h 里那段的 `__EMSCRIPTEN__` 分支
   * —— `emscripten_run_script("window.open('" + url + "', '_blank')")`。这里就是同一件事。
   */
  override openURL(url: string): void {
    window.open(url, '_blank');
  }

  override getPlatformStringVar(_stringId: number): string {
    return navigator.userAgent;
  }

  /**
   * ADAPTED(Web)：C++ 的 showKeyboard/hideKeyboard 是调系统软键盘（AppPlatform_android 那边
   * 直接操作 IME）。网页版没有对应的 API，能叫出手机软键盘的只有"聚焦一个输入框"这一条路，
   * 所以这里挂一个**离屏的隐藏 `<input>`**：showKeyboard 就 focus 它。
   *
   * 【为什么是离屏而不是 display:none】多数手机浏览器不会给 `display:none` / `visibility:hidden`
   * 的元素弹软键盘，所以只能挪到屏幕外。也**不能设 readonly** —— iOS 对 readonly 的输入框同样不弹。
   *
   * 【为什么要把 value 清掉】它只是个"键盘吸铁石"：按下的键由 DomInput 在 `window` 上收
   * （事件从聚焦的 input 冒泡上去，所以一点不耽误），而 input 自己会顺手把字符攒进 value。
   * 留着没用，还会越积越多，所以一有输入就清空。
   *
   * 桌面浏览器上这个 input 基本是空转 —— 那边本来就能直接打字（DomInput 对任何可打印按键
   * 都会喂文本，不看焦点在谁身上）。
   */
  private ensureKeyboardInput(): HTMLInputElement | null {
    if (this.keyboardInput) return this.keyboardInput;
    if (typeof document === 'undefined') return null;
    const el = document.createElement('input');
    el.type = 'text';
    el.autocomplete = 'off';
    el.autocapitalize = 'off';
    el.spellcheck = false;
    el.setAttribute('autocorrect', 'off');
    el.style.cssText =
      'position:fixed;left:-1000px;top:0;width:1px;height:1px;opacity:0;border:none;padding:0;margin:0;';
    el.addEventListener('input', () => {
      el.value = '';
    });
    el.addEventListener('blur', () => {
      el.value = '';
    });
    document.body.appendChild(el);
    this.keyboardInput = el;
    return el;
  }

  override showKeyboard(): void {
    super.showKeyboard();
    this.ensureKeyboardInput()?.focus();
  }

  override hideKeyboard(): void {
    super.hideKeyboard();
    this.keyboardInput?.blur();
  }

  private keyboardInput: HTMLInputElement | null = null;
}
