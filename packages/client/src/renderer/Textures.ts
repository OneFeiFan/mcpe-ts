/**
 * 1:1 移植自 src/client/renderer/Textures.h 与 Textures.cpp（S6）：纹理的加载、缓存、绑定。
 *  - MIPMAP 为 false → NEAREST；blur、clamp 都是 false → REPEAT。
 *  - loadTexturePixels 把 RGBA 字节转成 ARGB 的 int 数组（GrassColor、FoliageColor 用它）。
 *  - 动态纹理（水、熔岩、火）在 Minecraft::init 里添加，本轮 DEFERRED(DynamicTexture)；tick 照常移植，列表为空时什么都不做。
 *  - TextureId 在 C++ 里是 GLuint，InvalidId 是 -1（即 0xFFFFFFFF）；这里的纹理名都是小正整数，InvalidId 直接用 -1，比较结果相同。
 *  - PVRTC 压缩纹理只在 __APPLE__ 下上传，这里同样跳过。
 */
import { LOGI } from '@mcpe/platform';
import { Util } from '@mcpe/util';
import type { AppPlatform } from '../AppPlatform';
import type { Options } from '../Options';
import {
  GL_CLAMP_TO_EDGE, GL_LINEAR, GL_LINEAR_MIPMAP_LINEAR, GL_NEAREST, GL_REPEAT, GL_RGB, GL_RGBA, GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER, GL_TEXTURE_WRAP_S, GL_TEXTURE_WRAP_T, GL_UNSIGNED_BYTE, GL_UNSIGNED_SHORT_4_4_4_4, GL_UNSIGNED_SHORT_5_5_5_1,
  GL_UNSIGNED_SHORT_5_6_5, glBindTexture2, glDeleteTextures, glGenTextures, glTexImage2D2, glTexParameteri2, glTexSubImage2D2,
} from './gles';
import type { DynamicTexture } from './ptexture/DynamicTexture';
import { type TextureData, TextureFormat } from './TextureData';

export type TextureId = number;

export class Textures {
  static MIPMAP = false;
  static textureChanges = 0;
  static readonly InvalidId: TextureId = -1;

  private idMap = new Map<string, TextureId>();
  private loadedImages = new Map<TextureId, TextureData>();
  private options: Options | null;
  private platform: AppPlatform;
  private clamp = false;
  private blur = false;
  private lastBoundTexture: TextureId = Textures.InvalidId;
  private dynamicTextures: DynamicTexture[] = [];

  constructor(options_: Options | null, platform_: AppPlatform) {
    this.options = options_;
    this.platform = platform_;
  }

  addDynamicTexture(dynamicTexture: DynamicTexture): void {
    this.dynamicTextures.push(dynamicTexture);
    dynamicTexture.tick();
  }

  bind(id: TextureId): void {
    if (id !== Textures.InvalidId && this.lastBoundTexture !== id) {
      glBindTexture2(GL_TEXTURE_2D, id);
      this.lastBoundTexture = id;
      ++Textures.textureChanges;
    } else if (id === Textures.InvalidId) {
      LOGI('invalidId!');
    }
  }

  loadTexture(resourceName: string, inTextureFolder = true): TextureId {
    const it = this.idMap.get(resourceName);
    if (it !== undefined) return it;
    const isUrl = Util.startsWith(resourceName, 'http://') || Util.startsWith(resourceName, 'https://');
    const texdata = this.platform.loadTexture(resourceName, isUrl ? false : inTextureFolder);
    if (texdata.data) return this.assignTexture(resourceName, texdata);
    else if (texdata.identifier !== Textures.InvalidId) {
      if (!this.idMap.has(resourceName)) this.idMap.set(resourceName, texdata.identifier); // std::map::insert 不覆盖已有键
    } else {
      if (!this.idMap.has(resourceName)) this.idMap.set(resourceName, Textures.InvalidId);
    }
    return Textures.InvalidId;
  }

  loadAndBindTexture(resourceName: string): TextureId {
    const id = this.loadTexture(resourceName);
    if (id !== Textures.InvalidId) this.bind(id);
    return id;
  }

  assignTexture(resourceName: string, img: TextureData): TextureId {
    const ids = [0];
    glGenTextures(1, ids);
    const id = ids[0]!;
    this.bind(id);
    if (Textures.MIPMAP) {
      glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
      glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    } else {
      glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
      glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    }
    if (this.blur) {
      glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
      glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    }
    if (this.clamp) {
      glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
      glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    } else {
      glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
      glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    }
    switch (img.format) {
      case TextureFormat.TEXF_COMPRESSED_PVRTC_4444:
      case TextureFormat.TEXF_COMPRESSED_PVRTC_565:
      case TextureFormat.TEXF_COMPRESSED_PVRTC_5551:
        // 只在 __APPLE__ 下 glCompressedTexImage2D
        break;
      default: {
        const mode = img.transparent ? GL_RGBA : GL_RGB;
        if (img.format === TextureFormat.TEXF_UNCOMPRESSED_565) {
          glTexImage2D2(GL_TEXTURE_2D, 0, mode, img.w, img.h, 0, mode, GL_UNSIGNED_SHORT_5_6_5, img.data);
        } else if (img.format === TextureFormat.TEXF_UNCOMPRESSED_4444) {
          glTexImage2D2(GL_TEXTURE_2D, 0, mode, img.w, img.h, 0, mode, GL_UNSIGNED_SHORT_4_4_4_4, img.data);
        } else if (img.format === TextureFormat.TEXF_UNCOMPRESSED_5551) {
          glTexImage2D2(GL_TEXTURE_2D, 0, mode, img.w, img.h, 0, mode, GL_UNSIGNED_SHORT_5_5_5_1, img.data);
        } else {
          glTexImage2D2(GL_TEXTURE_2D, 0, mode, img.w, img.h, 0, mode, GL_UNSIGNED_BYTE, img.data);
        }
        break;
      }
    }
    if (!this.idMap.has(resourceName)) this.idMap.set(resourceName, id);
    if (!this.loadedImages.has(id)) this.loadedImages.set(id, img);
    return id;
  }

  getTemporaryTextureData(id: TextureId): TextureData | null {
    return this.loadedImages.get(id) ?? null;
  }

  /** @return ARGB（C++ 返回 new int[size]） */
  loadTexturePixels(texId: TextureId, _resourceName: string): Int32Array {
    const texture = this.getTemporaryTextureData(texId)!; // storing raw pixels
    const size = texture.w * texture.h;
    const pixels = new Int32Array(size);
    const raw = texture.data!;
    for (let i = 0; i < size; i++) {
      const r = raw[i * 4 + 0]!;
      const g = raw[i * 4 + 1]!;
      const b = raw[i * 4 + 2]!;
      const a = raw[i * 4 + 3]!;
      pixels[i] = (a << 24) | (r << 16) | (g << 8) | b;
    }
    return pixels;
  }

  tick(uploadToGraphicsCard: boolean): void {
    for (let i = 0; i < this.dynamicTextures.length; ++i) {
      const tex = this.dynamicTextures[i]!;
      tex.tick();
      if (uploadToGraphicsCard) {
        tex.bindTexture(this);
        for (let xx = 0; xx < tex.replicate; xx++)
          for (let yy = 0; yy < tex.replicate; yy++) {
            glTexSubImage2D2(GL_TEXTURE_2D, 0, ((tex.tex % 16) * 16) + xx * 16, (((tex.tex / 16) | 0) * 16) + yy * 16, 16, 16, GL_RGBA, GL_UNSIGNED_BYTE, tex.pixels);
          }
      }
    }
  }

  clear(): void {
    for (const id of this.idMap.values()) {
      if (id !== Textures.InvalidId) glDeleteTextures(1, [id]);
    }
    this.idMap.clear();
    this.loadedImages.clear();
    this.lastBoundTexture = Textures.InvalidId;
  }

  reloadAll(): void {}

  static isTextureIdValid(t: TextureId): boolean {
    return t !== Textures.InvalidId;
  }

  private smoothBlend(c0: number, c1: number): number {
    const a0 = ((c0 & 0xff000000) >>> 24) & 0xff;
    const a1 = ((c1 & 0xff000000) >>> 24) & 0xff;
    return ((((a0 + a1) >> 1) << 24) + (((c0 & 0x00fefefe) + (c1 & 0x00fefefe)) >> 1)) | 0;
  }

  private crispBlend(c0: number, c1: number): number {
    let a0 = ((c0 & 0xff000000) >>> 24) & 0xff;
    let a1 = ((c1 & 0xff000000) >>> 24) & 0xff;
    let a = 255;
    if (a0 + a1 === 0) {
      a0 = 1;
      a1 = 1;
      a = 0;
    }
    const r0 = ((c0 >> 16) & 0xff) * a0;
    const g0 = ((c0 >> 8) & 0xff) * a0;
    const b0 = (c0 & 0xff) * a0;
    const r1 = ((c1 >> 16) & 0xff) * a1;
    const g1 = ((c1 >> 8) & 0xff) * a1;
    const b1 = (c1 & 0xff) * a1;
    const r = ((r0 + r1) / (a0 + a1)) | 0;
    const g = ((g0 + g1) / (a0 + a1)) | 0;
    const b = ((b0 + b1) / (a0 + a1)) | 0;
    return (a << 24) | (r << 16) | (g << 8) | b;
  }
}
