// 1:1 移植自 src/world/level/LightLayer.h/.cpp（S4 前置）。只有 Sky 与 Block 两个实例，调用方按身份比较（C++ 比较地址）。
export class LightLayer {
  static readonly Sky = new LightLayer(15);
  static readonly Block = new LightLayer(0);

  private constructor(readonly surrounding: number) {}
}
