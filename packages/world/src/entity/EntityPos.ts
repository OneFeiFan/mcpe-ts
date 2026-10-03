export class EntityPos {
  public x: number;
  public y: number;
  public z: number;
  public yRot: number;
  public xRot: number;
  public rot: boolean;
  public move: boolean;

  /** C++ EntityPos::EntityPos(float x, float y, float z, float yRot, float xRot) */
  constructor(x: number, y: number, z: number, yRot: number, xRot: number);
  /** C++ EntityPos::EntityPos(float x, float y, float z) */
  constructor(x: number, y: number, z: number);
  /** C++ EntityPos::EntityPos(float yRot, float xRot) */
  constructor(yRot: number, xRot: number);
  constructor(a: number, b: number, c?: number, d?: number, e?: number) {
    // C++ 的三个构造函数都不初始化全部字段：
    //   - (x, y, z)      -> yRot, xRot 未初始化
    //   - (yRot, xRot)   -> x, y, z 未初始化
    // 未初始化字段的读取在 C++ 是 UB。TS 里统一给 0，保证确定性。
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.yRot = 0;
    this.xRot = 0;
    this.rot = false;
    this.move = false;

    if (c !== undefined && d !== undefined && e !== undefined) {
      // (x, y, z, yRot, xRot)
      this.x = a;
      this.y = b;
      this.z = c;
      this.yRot = d;
      this.xRot = e;
      this.rot = true;
      this.move = true;
    } else if (c !== undefined) {
      // (x, y, z)
      this.x = a;
      this.y = b;
      this.z = c;
      this.move = true;
      this.rot = false;
    } else {
      // (yRot, xRot)
      this.yRot = a;
      this.xRot = b;
      this.rot = true;
      this.move = false;
    }
  }
}
