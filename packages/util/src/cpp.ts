/**
 * C++ 数值语义辅助（手册规则 R4）。NEW：C++ 里没有对应文件。
 * 全部是无分配的单表达式函数，V8 优化后会内联到调用处。
 * i8 / i16 / u8 / u16 / u32 假定输入已是整数（与 C++ 整型之间的截断转换一致）。
 */

/**
 * C++ 的 `(int)` 强转（float/double → int）：范围内向零截断。
 * 越界或 NaN 在 C++ 里是未定义行为；x86 的 cvttss2si / cvttsd2si 得到 INT_MIN，
 * 黄金样本在 x86-64 上生成，这里按同样结果实现。
 * 例：`Mth::sin(700000)` 的查表下标越界，C++ 得 INT_MIN & 65535 = 0。
 */
export function f2i(x: number): number {
  // NaN 两个比较都为 false，自然落到 INT_MIN 分支
  return x >= -2147483648 && x < 2147483648 ? x | 0 : -2147483648;
}

/** `(signed char)v` */
export function i8(v: number): number {
  return (v << 24) >> 24;
}

/** `(short)v`，如 MouseAction 的 x、y、dx、dy */
export function i16(v: number): number {
  return (v << 16) >> 16;
}

/** `(unsigned char)v`，如 Keyboard::feed 的 keyCode */
export function u8(v: number): number {
  return v & 0xff;
}

/** `(unsigned short)v` */
export function u16(v: number): number {
  return v & 0xffff;
}

/** `(unsigned int)v` */
export function u32(v: number): number {
  return v >>> 0;
}
