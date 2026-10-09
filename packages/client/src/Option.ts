/**
 * 1:1 移植自 src/client/Option.h 与 Option.cpp（S6）：单个选项的值、范围、解析与序列化。
 *  - parse 里的 sscanf("%f") / sscanf("%d")：只取开头能解析的部分，解析不出来返回 false、值不变。
 *  - serialize 照 std::ostringstream 的输出：bool 写成 1/0，float 用默认的 6 位有效数字（%g 风格）。
 *  - OptionFloat 的值按 float 存（C++ 的 float 成员）。
 */
import { Mth } from '@mcpe/util';

const f = Math.fround;
/** std::ostringstream << value 的默认格式 */
function ostreamValue(value: number | boolean | string, isFloat: boolean): string {
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string') return value;
  if (!isFloat) return String(value);
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 'nan' : value > 0 ? 'inf' : '-inf';
  if (value === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(value)));
  if (exp < -5 || exp >= 6) {
    const [m, e] = value.toExponential(5).split('e');
    const mant = m!.replace(/\.?0+$/, '');
    const ev = Number(e);
    return `${mant}e${ev < 0 ? '-' : '+'}${String(Math.abs(ev)).padStart(2, '0')}`;
  }
  return Number(value.toPrecision(6)).toString();
}

const FLOAT_RE = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[+-]?inf(?:inity)?|[+-]?nan)/i;
const INT_RE = /^\s*([+-]?\d+)/;

export class Option {
  protected m_key: string;

  constructor(key: string) {
    this.m_key = 'options.' + key;
  }

  getStringId(): string {
    return this.m_key;
  }

  parse(_value: string): boolean {
    return false;
  }

  serialize(): string {
    return this.m_key + ':';
  }

  protected serialize_value(value: number | boolean | string, isFloat = false): string {
    return this.m_key + ':' + ostreamValue(value, isFloat);
  }

  protected parse_bool_like(value: string): boolean | null {
    if (value === 'true' || value === 'YES') return true;
    if (value === 'false' || value === 'NO') return false;
    return null;
  }
}

export class OptionFloat extends Option {
  private m_value: number;
  private m_min: number;
  private m_max: number;

  constructor(key: string, value = 0.0, min = 0.0, max = 1.0) {
    super(key);
    this.m_value = f(value);
    this.m_min = f(min);
    this.m_max = f(max);
  }

  get(): number {
    return this.m_value;
  }

  set(value: number): void {
    this.m_value = f(Mth.clamp(value, this.m_min, this.m_max));
  }

  getMin(): number {
    return this.m_min;
  }

  getMax(): number {
    return this.m_max;
  }

  override parse(value: string): boolean {
    const b = this.parse_bool_like(value);
    if (b !== null) {
      this.m_value = b ? 1.0 : 0.0;
      return true;
    }
    const m = FLOAT_RE.exec(value);
    if (!m) return false;
    this.m_value = f(parseFloat(m[1]!.replace(/^([+-]?)inf(inity)?$/i, '$1Infinity')));
    return true;
  }

  override serialize(): string {
    return this.serialize_value(this.m_value, true);
  }
}

export class OptionInt extends Option {
  private m_value: number;
  private m_min: number;
  private m_max: number;

  constructor(key: string, value = 0, min = -999999, max = 999999) {
    super(key);
    this.m_value = value;
    this.m_min = min;
    this.m_max = max;
  }

  get(): number {
    return this.m_value;
  }

  set(value: number): void {
    this.m_value = Mth.clamp(value, this.m_min, this.m_max);
  }

  getMin(): number {
    return this.m_min;
  }

  getMax(): number {
    return this.m_max;
  }

  override parse(value: string): boolean {
    const b = this.parse_bool_like(value);
    if (b !== null) {
      this.m_value = b ? 1 : 0;
      return true;
    }
    const m = INT_RE.exec(value);
    if (!m) return false;
    this.m_value = parseInt(m[1]!, 10) | 0;
    return true;
  }

  override serialize(): string {
    return this.serialize_value(this.m_value);
  }
}

export class OptionBool extends Option {
  private m_value: boolean;

  constructor(key: string, value = false) {
    super(key);
    this.m_value = value;
  }

  get(): boolean {
    return this.m_value;
  }

  /** C++ 的 set(int value)：非零即 true */
  set(value: number | boolean): void {
    this.m_value = !!value;
  }

  toggle(): void {
    this.m_value = !this.m_value;
  }

  override parse(value: string): boolean {
    if (value === '0') {
      this.m_value = false;
      return true;
    }
    if (value === '1') {
      this.m_value = true;
      return true;
    }
    const b = this.parse_bool_like(value);
    if (b === null) return false;
    this.m_value = b;
    return true;
  }

  override serialize(): string {
    return this.serialize_value(this.m_value);
  }
}

export class OptionString extends Option {
  private m_value: string;

  constructor(key: string, str = '') {
    super(key);
    this.m_value = str;
  }

  get(): string {
    return this.m_value;
  }

  set(value: string): void {
    this.m_value = value;
  }

  override parse(value: string): boolean {
    this.m_value = value;
    return true;
  }

  override serialize(): string {
    return this.m_key + ':' + this.m_value;
  }
}
