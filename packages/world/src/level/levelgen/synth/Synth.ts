// 1:1 移植自 src/world/level/levelgen/synth/Synth.h 与 Synth.cpp（噪声的抽象基类）
export abstract class Synth {
  getDataSize(width: number, height: number): number {
    return Math.imul(Math.imul(width, height), 4); // width * height * sizeof(float)
  }

  abstract getValue(x: number, y: number): number;

  create(width: number, height: number, result: Float32Array): void {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        result[x + y * width] = this.getValue(x, y);
      }
    }
  }
}
