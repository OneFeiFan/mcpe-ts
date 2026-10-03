// FORWARD-DECL(Font)：对应 src/client/gui/Font.h。S13 阶段 B 由你完整移植，用真正的 class Font 整体替换本文件（同名同路径）。
// 这里只列出 Claude 已移植的代码（ItemRenderer）调用的成员，名字与 C++ 一致。
export interface Font {
  /** C++ 的 width(const std::string&) */
  width(str: string): number;
  /** C++ 的 drawShadow(const std::string&, float x, float y, int color) */
  drawShadow(str: string, x: number, y: number, color: number): void;
}
