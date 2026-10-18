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

/**
 * C++ 流的默认浮点格式（`ss << x`，等价于 printf 的 `%g`，精度 6）：
 * 按 P 位有效数字舍入（**精确值上的四舍六入五成双**，与 glibc 相同；JS 的 toExponential 遇到恰好一半时总是进位，所以不能直接用），
 * 得到指数 X；P > X >= -4 时用定点，否则用科学计数法（指数至少两位）；去掉末尾的 0 与小数点。
 * 例：0.1 → "0.1"，1234567 → "1.23457e+06"，1234565 → "1.23456e+06"，999999.5 → "1e+06"，1e-5 → "1e-05"，NaN → "nan"。
 */
export function formatG(v: number, precision = 6): string {
  if (Number.isNaN(v)) return 'nan';
  if (v === Infinity) return 'inf';
  if (v === -Infinity) return '-inf';
  if (v === 0) return Object.is(v, -0) ? '-0' : '0';
  const P = precision === 0 ? 1 : precision;
  // double 的精确值 = N / D
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(v));
  const hi = dv.getUint32(0);
  const lo = dv.getUint32(4);
  const bexp = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e2: number;
  if (bexp === 0) e2 = -1074;
  else {
    mant |= 1n << 52n;
    e2 = bexp - 1075;
  }
  let N = e2 >= 0 ? mant << BigInt(e2) : mant;
  let D = e2 >= 0 ? 1n : 1n << BigInt(-e2);
  // 十进制指数 X：10^X <= N/D < 10^(X+1)
  let X = Math.floor(Math.log10(Math.abs(v)));
  const pow10 = (k: number): bigint => 10n ** BigInt(k);
  const ge = (k: number): boolean => (k >= 0 ? N >= pow10(k) * D : N * pow10(-k) >= D); // N/D >= 10^k ?
  while (!ge(X)) X--;
  while (ge(X + 1)) X++;
  // 取 P 位有效数字：q = round(N/D * 10^(P-1-X))，恰好一半时取偶数
  const k = P - 1 - X;
  if (k >= 0) N *= pow10(k);
  else D *= pow10(-k);
  let q = N / D;
  const r2 = (N - q * D) * 2n;
  if (r2 > D || (r2 === D && (q & 1n) === 1n)) q += 1n;
  if (q === pow10(P)) {
    q = pow10(P - 1);
    X += 1;
  }
  const digits = q.toString(); // P 位
  const sign = v < 0 ? '-' : '';
  const strip = (t: string): string =>
    t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
  if (P > X && X >= -4) {
    let t: string;
    if (X >= 0) t = digits.slice(0, X + 1) + '.' + digits.slice(X + 1);
    else t = '0.' + '0'.repeat(-X - 1) + digits;
    return sign + strip(t);
  }
  const m = strip(digits[0]! + '.' + digits.slice(1));
  return `${sign}${m}e${X < 0 ? '-' : '+'}${String(Math.abs(X)).padStart(2, '0')}`;
}
