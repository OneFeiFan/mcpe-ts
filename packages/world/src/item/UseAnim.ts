// 1:1 移植自 src/world/item/UseAnim.h（C++ 的 enum UseAnim::UseAnimation）
export namespace UseAnim {
  export enum UseAnimation {
    none  = 0,
    eat   = 1,
    drink = 2,
    block = 3,
    bow   = 4,
  }

  export const none  = UseAnimation.none;
  export const eat   = UseAnimation.eat;
  export const drink = UseAnimation.drink;
  export const block = UseAnimation.block;
  export const bow   = UseAnimation.bow;
}