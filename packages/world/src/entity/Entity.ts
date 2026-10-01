// FORWARD-DECL(Entity)：对应 src/world/entity/Entity.h 的前向声明。
// 只列出“已移植代码”实际读写的成员；所有引用必须用 `import type`。
// 移植 Entity.h/.cpp 时，把本文件整体替换为真正的 class Entity（成员名保持一致，调用方不用改）。
export interface Entity {
  x: number;
  y: number;
  z: number;
  heightOffset: number; // Level::playSound(Entity*) 用到
}
