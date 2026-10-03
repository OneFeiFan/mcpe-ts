import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as FontModule from '../../packages/client/src/gui/Font';

/**
 * 黄金样本 G13-1（tools/golden/harness_font.cpp）：字体字宽。参考源码的 Font::init 从 default8.png 逐列扫描得到 charWidths，
 * 再用 Font::width 量几串文字。
 * 注意 C++ 的一个怪癖：扫描时读的是 rawPixels[(x + y*w) << 2]，即每个像素的**红色**分量（不是 alpha）；黑色描边的像素不计入字宽。
 * Font 由你在 S13 阶段 B 移植；在那之前 Font.ts 只是前向声明（运行时没有 Font 类），本测试跳过。
 * 这里用最小的替身 Textures：loadTexture 返回 1，getTemporaryTextureData 返回解码好的字体图片（与 harness 用同一份数据）。
 */
const G = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/font.json', import.meta.url), 'utf8'),
) as { charWidths: number[]; widths: [string, number][] };
const raw = readFileSync(new URL('../../tools/golden/inputs/default8.rgba', import.meta.url));
const tex = {
  w: (raw[0]! << 8) | raw[1]!,
  h: (raw[2]! << 8) | raw[3]!,
  data: new Uint8Array(raw.subarray(4)),
  numBytes: raw.length - 4,
  transparent: true,
};
const fakeTextures = { loadTexture: () => 1, getTemporaryTextureData: () => tex };
const FontClass = (FontModule as unknown as Record<string, unknown>).Font as
  | (new (options: unknown, name: string, textures: unknown) => { width(s: string): number })
  | undefined;

describe('G13-1 字体字宽', () => {
  it.skipIf(typeof FontClass !== 'function')('256 个字宽与 Font.width 与 C++ 相同', () => {
    const font = new FontClass!(null, 'font/default8.png', fakeTextures);
    expect((font as unknown as { charWidths: number[] }).charWidths.slice(0, 256)).toEqual(
      G.charWidths,
    );
    for (const [s, w] of G.widths) expect(font.width(s), JSON.stringify(s)).toBe(w);
  });
});
