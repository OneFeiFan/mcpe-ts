// 1:1 移植自 src/client/renderer/TextureData.h
export const TextureFormat = {
  TEXF_UNCOMPRESSED_8888: 0,
  TEXF_UNCOMPRESSED_565: 1,
  TEXF_UNCOMPRESSED_5551: 2,
  TEXF_UNCOMPRESSED_4444: 3,
  TEXF_COMPRESSED_PVRTC_565: 4,
  TEXF_COMPRESSED_PVRTC_5551: 5,
  TEXF_COMPRESSED_PVRTC_4444: 6,
} as const;
export type TextureFormat = (typeof TextureFormat)[keyof typeof TextureFormat];

export class TextureData {
  w = 0;
  h = 0;
  data: Uint8Array | null = null; // unsigned char*：RGBA，每像素 4 字节
  numBytes = 0;
  transparent = true;
  memoryHandledExternally = false;
  format: TextureFormat = TextureFormat.TEXF_UNCOMPRESSED_8888;
  identifier = -1;
}
