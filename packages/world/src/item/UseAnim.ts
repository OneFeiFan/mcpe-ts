// 1:1 移植自 src/world/item/UseAnim.h（C++ 的 enum UseAnim::UseAnimation）
export const UseAnim = {
  none: 0,
  eat: 1,
  drink: 2,
  block: 3,
  bow: 4,
} as const;
export type UseAnimation = (typeof UseAnim)[keyof typeof UseAnim];
