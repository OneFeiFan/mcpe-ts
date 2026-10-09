// 1:1 移植自 src/nbt/DoubleTag.h
import type { IDataInput, IDataOutput } from '@mcpe/util';
import { Tag, TAG_Double } from './Tag';

export class DoubleTag extends Tag {
  public data: number;

  constructor(name: string, data: number = 0.0) {
    super(name);
    this.data = data;
  }

  write(dos: IDataOutput): void {
    dos.writeDouble(this.data);
  }

  load(dis: IDataInput): void {
    this.data = dis.readDouble();
  }

  getId(): number {
    return TAG_Double;
  }

  toString(): string {
    // 若仅用于调试，用 String(this.data) 即可
    // 若要复刻 C++ stringstream 默认精度（6 位有效数字），用下面的实现
    return formatCppDouble(this.data);
  }

  copy(): Tag {
    return new DoubleTag(this.getName(), this.data);
  }

  override equals(rhs: Tag): boolean {
    if (super.equals(rhs)) {
      // 使用 === 而不是 Object.is，以匹配 C++ 的 == 语义
      return this.data === (rhs as DoubleTag).data;
    }
    return false;
  }
}

/**
 * 模拟 C++ std::stringstream 默认格式化（6 位有效数字）
 * 只在需要严格复刻 toString 时使用。
 */
function formatCppDouble(v: number): string {
  if (Number.isNaN(v)) return 'nan';
  if (v === Infinity) return 'inf';
  if (v === -Infinity) return '-inf';
  if (v === 0) return Object.is(v, -0) ? '-0' : '0';

  const precision = 6;
  const exp = Math.floor(Math.log10(Math.abs(v)));
  let s = v.toExponential(precision - 1);

  // 如果指数在 [-4, precision-1] 内，用定点
  if (exp >= -4 && exp < precision) {
    return v
      .toPrecision(precision)
      .replace(/\.?0+$/, '')
      .replace(/\.$/, '');
  }
  // 否则用科学计数法，C++ 风格：1.23457e+08
  s = s.replace(/e([+-])(\d)$/, 'e$10$2');
  return s;
}
