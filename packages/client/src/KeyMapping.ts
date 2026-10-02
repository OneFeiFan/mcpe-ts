// 1:1 移植自 src/client/KeyMapping.h
export class KeyMapping {
  name = '';
  key = 0; // C++ 默认构造时未初始化，这里取 0

  constructor();
  constructor(name_: string, key_: number);
  constructor(name_?: string, key_?: number) {
    if (name_ !== undefined) {
      this.name = name_;
      this.key = key_!;
    }
  }
}
