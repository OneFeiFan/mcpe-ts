/**
 * NEW（S9，决策 D9）：在启动前把图片全部解码成 RGBA8888，AppPlatform_web.loadTexture 再按 C++ 的同步语义返回。
 * 对应 AppPlatform_glfw 从 data/images 读 PNG。解码用 premultiplyAlpha:"none"、colorSpaceConversion:"none"，
 * 再经 2D canvas 取像素（terrain.png 的 alpha 只有 0 与 255，经过 canvas 不会有精度损失）。
 */
import { TextureData } from '@mcpe/client';

/**
 * 启动时预加载的图片：键是 C++ 里传给 Textures::loadTexture 的名字，文件在 public/images/ 的同名路径下。
 * 材质包（imageManifest.ts）里有全部 54 张；这里只列 demo 实际用到的。移植 Gui、云、粒子、生物时按需加上：
 *   Gui / Font：gui/gui.png、gui/icons.png、gui/items.png、font/default8.png
 *   云、Beta 天空：environment/clouds.png、terrain/sun.png、terrain/moon.png
 *   粒子：particles.png；生物：mob/*.png；水下与阴影：misc/water.png、misc/vignette.png、misc/shadow.png
 */
export const PRELOAD: readonly string[] = [
  'terrain.png', 'misc/grasscolor.png', 'misc/foliagecolor.png',
  // S13：Gui 与 Font
  'gui/gui.png', 'gui/icons.png', 'gui/items.png', 'gui/gui_blocks.png', 'font/default8.png',
  // S13：界面类（物品选择界面）
  'gui/spritesheet.png', 'gui/itemframe.png', 'gui/touchgui.png', 'gui/background.png',
  // S13：掉落物的阴影、水下覆盖层
  'misc/shadow.png', 'misc/water.png',
  // Gui::renderVignette（漂亮画质 + 暗角选项默认打开）：没有预加载时会沿用上一次绑定的 gui/icons.png，整张画到屏幕上，左上角就出现生命、护甲、气泡图标的残影
  'misc/vignette.png',
];

/** 启动时预加载的其他资源文件（AppPlatform::readAssetFile 读取，ADAPTED(Web)）：文件在 public/ 的同名路径下 */
export const PRELOAD_FILES: readonly string[] = ['lang/en_US.lang'];

export async function preloadFiles(base = '/'): Promise<Map<string, Uint8Array>> {
  const entries = await Promise.all(
    PRELOAD_FILES.map(async (name) => {
      const res = await fetch(base + name);
      if (!res.ok) throw new Error(`加载 ${base + name} 失败：HTTP ${res.status}`);
      return [name, new Uint8Array(await res.arrayBuffer())] as const;
    }),
  );
  return new Map(entries);
}

export async function decodeImage(url: string): Promise<TextureData> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载 ${url} 失败：HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bitmap, 0, 0);
  const t = new TextureData();
  t.w = bitmap.width;
  t.h = bitmap.height;
  t.data = new Uint8Array(g.getImageData(0, 0, bitmap.width, bitmap.height).data.buffer);
  t.numBytes = t.data.length;
  t.transparent = true;
  bitmap.close();
  return t;
}

export async function preloadAssets(base = '/images/'): Promise<Map<string, TextureData>> {
  const entries = await Promise.all(PRELOAD.map(async (name) => [name, await decodeImage(base + name)] as const));
  return new Map(entries);
}
