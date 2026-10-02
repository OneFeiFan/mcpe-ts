// FORWARD-DECL(DynamicTexture)：对应 src/client/renderer/ptexture/DynamicTexture.h（水、熔岩、火的动画纹理）。
// 只列出 Textures::tick 用到的成员。动态纹理在 Minecraft::init 里添加，本轮 DEFERRED(DynamicTexture)。
import type { Textures } from '../Textures';

export interface DynamicTexture {
  tex: number;
  replicate: number;
  pixels: Uint8Array;
  tick(): void;
  bindTexture(textures: Textures): void;
}
