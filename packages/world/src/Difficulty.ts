// 1:1 移植自 src/world/Difficulty.h（S2）。C++ 的 enum 写成常量对象，与 EntityTypes、UseAnim 的写法一致
export const Difficulty = {
  PEACEFUL: 0,
  EASY: 1,
  NORMAL: 2,
  HARD: 3,
  COUNT: 4, // C++ 里自动递增得到 4
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];
