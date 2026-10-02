// 1:1 移植自 src/world/level/tile/entity/TileEntityRendererId.h（C++ 的 enum 写成常量对象）
export const TileEntityRendererId = {
  TR_DEFAULT_RENDERER: 0,
  TR_CHEST_RENDERER: 1,
  TR_SIGN_RENDERER: 2,
} as const;
export type TileEntityRendererId = (typeof TileEntityRendererId)[keyof typeof TileEntityRendererId];
