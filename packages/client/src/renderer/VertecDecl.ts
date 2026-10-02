// 1:1 移植自 src/client/renderer/VertecDecl.h（文件名照 C++ 的拼写）：顶点结构的字节布局。
// struct VertexDeclPTC  { GLfloat x, y, z; GLfloat u, v; GLuint color; }               → 24 字节
// struct VertexDeclPTCN { GLfloat x, y, z; GLfloat u, v; GLuint color; GLfloat nx, ny, nz; } → 36 字节（Tesselator 用它）
export const VertexDeclPTC = { SIZE: 24, X: 0, Y: 4, Z: 8, U: 12, V: 16, COLOR: 20 } as const;
export const VertexDeclPTCN = { SIZE: 36, X: 0, Y: 4, Z: 8, U: 12, V: 16, COLOR: 20, NX: 24, NY: 28, NZ: 32 } as const;
