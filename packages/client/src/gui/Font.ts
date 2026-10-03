/**
 * 1:1 移植自 src/client/gui/Font.h 与 Font.cpp（S13；原为你的单元，阶段 C 由 Claude 补完）。替换前向声明。
 * 构建取 USE_VBO 分支（gles.h 无条件定义 USE_VBO）：init 只计算字宽，不建显示列表；draw 一律走 drawSlow（Tesselator）。
 * 字符串：C++ 按字节处理 std::string（char）。这里按 UTF-16 代码单元取 charCodeAt(i) & 0xff；'\xa7'（§）是颜色码前缀。
 * R10：draw 的四个重载（const char* / std::string × 有无 darken）合并为 draw(str, x, y, color, darken = false)（情形 A）；
 *   drawShadow、drawSlow 的 const char* / std::string 两个版本合并为一个。
 * C++ 的怪癖：init 扫描字宽时读 rawPixels[(x + y*w) << 2]，即每个像素的红色分量（不是 alpha）。黄金样本 G13-1 核对。
 */
import type { Options } from '../Options';
import { Tesselator } from '../renderer/Tesselator';
import type { Textures } from '../renderer/Textures';

const SECTION = 0xa7; // '\xa7'

export class Font {
  static readonly DefaultLineHeight = 10;

  fontTexture = 0;
  lineHeight = Font.DefaultLineHeight;
  private charWidths: number[] = new Array<number>(256).fill(0);
  private fcharWidths: number[] = new Array<number>(256).fill(0);
  private index = 0;
  private count = 0;
  private fontName: string;
  private _textures: Textures;
  private options: Options | null;
  private _x = 0;
  private _y = 0;
  private _cols = 16;
  private _rows = 16;
  private _charOffset = 0;

  constructor(options: Options | null, name: string, textures: Textures) {
    this.options = options;
    this.fontName = name;
    this._textures = textures;
    this.init(options);
  }

  init(_options: Options | null): void {
    const fontTexture = this._textures.loadTexture(this.fontName);
    const tex = this._textures.getTemporaryTextureData(fontTexture);
    if (!tex) return;
    const rawPixels = tex.data!;
    const numChars = this._rows * this._cols;
    for (let i = 0; i < numChars; i++) {
      const xt = i % this._cols;
      const yt = Math.trunc(i / this._cols);
      let x = 7;
      for (; x >= 0; x--) {
        const xPixel = this._x + xt * 8 + x;
        let emptyColumn = true;
        for (let y = 0; y < 8 && emptyColumn; y++) {
          const yPixel = this._y + (yt * 8 + y) * tex.w;
          const pixelalpha = rawPixels[(xPixel + yPixel) << 2]!; // 红色分量（见文件头）
          if (pixelalpha > 0) emptyColumn = false;
        }
        if (!emptyColumn) {
          break;
        }
      }
      if (i === 0x20) x = 4 - 2; // ' '
      this.charWidths[i] = x + 2;
      this.fcharWidths[i] = Math.fround(this.charWidths[i]!);
    }
    // USE_VBO：this is <1 —— 不建显示列表
  }

  onGraphicsReset(): void {
    this.init(this.options);
  }

  draw(str: string, x: number, y: number, color: number, darken = false): void {
    this.drawSlow(str, x, y, color, darken); // USE_VBO
  }

  drawShadow(str: string, x: number, y: number, color: number): void {
    this.draw(str, x + 1, y + 1, color, true);
    this.draw(str, x, y, color);
  }

  drawWordWrap(str: string, x: number, y: number, w: number, col: number): void {
    const words = str.split(/[ \n\t\r]+/).filter((s) => s.length > 0); // strtok(" \n\t\r")
    let pos = 0;
    while (pos < words.length) {
      let line = words[pos++] + ' ';
      while (pos < words.length && this.width(line + words[pos]) < w) {
        line += words[pos++] + ' ';
      }
      this.drawShadow(line, x, y, col);
      y += this.lineHeight;
    }
  }

  width(str: string): number {
    let maxLen = 0;
    let len = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i) & 0xff;
      if (c === SECTION) {
        i++;
      } else {
        if (c === 0x0a) {
          if (len > maxLen) maxLen = len;
          len = 0;
        } else {
          len += this.charWidths[c]!;
        }
      }
    }
    return maxLen > len ? maxLen : len;
  }

  height(str: string): number {
    let h = 0;
    let hasLine = false;
    for (let i = 0; i < str.length; ++i) {
      if (str.charCodeAt(i) === 0x0a) hasLine = true;
      else {
        if (hasLine) h += this.lineHeight;
        hasLine = false;
      }
    }
    return h;
  }

  static sanitize(str: string): string {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      if ((str.charCodeAt(i) & 0xff) === SECTION) {
        i++;
      } else {
        out += str[i];
      }
    }
    return out;
  }

  private drawSlow(str: string, x: number, y: number, color: number, darken = false): void {
    if (str === null || str === undefined) return;
    if (darken) {
      const oldAlpha = color & 0xff000000;
      color = (color & 0xfcfcfc) >> 2;
      color += oldAlpha;
    }
    this._textures.loadAndBindTexture(this.fontName);
    const t = Tesselator.instance;
    t.begin();
    let alpha = ((0xff000000 & color) >>> 24) & 0xff;
    if (!alpha) alpha = 0xff;
    t.colorInt((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff, alpha);
    t.addOffset(x, y, 0);
    let xOffset = 0;
    let yOffset = 0;
    for (let k = 0; k < str.length; k++) {
      const ch = str.charCodeAt(k) & 0xff; // while (unsigned char ch = *(str++))
      if (ch === 0) break;
      if (ch === 0x0a) {
        xOffset = 0;
        yOffset += this.lineHeight;
      } else {
        this.buildChar(ch, xOffset, yOffset);
        xOffset += this.fcharWidths[ch]!;
      }
    }
    t.draw();
    t.addOffset(-x, -y, 0);
  }

  private buildChar(i: number, x = 0, y = 0): void {
    const t = Tesselator.instance;
    const ix = (i & 15) * 8;
    const iy = (i >> 4) * 8;
    const s = Math.fround(7.99);
    const uo = 0.0 / 128.0;
    const vo = 0.0 / 128.0;
    t.vertexUV(x, y + s, 0, ix / 128.0 + uo, (iy + s) / 128.0 + vo);
    t.vertexUV(x + s, y + s, 0, (ix + s) / 128.0 + uo, (iy + s) / 128.0 + vo);
    t.vertexUV(x + s, y, 0, (ix + s) / 128.0 + uo, iy / 128.0 + vo);
    t.vertexUV(x, y, 0, ix / 128.0 + uo, iy / 128.0 + vo);
  }
}
