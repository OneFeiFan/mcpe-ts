/**
 * 1:1 移植自 src/world/level/levelgen/feature/Feature.h 与 Feature.cpp（地物生成）：所有地物的基类。
 * doUpdate 为真时用 setTileAndData（会通知邻居、触发更新，树苗长树用），否则 setTileAndDataNoUpdate（生成世界用）。
 * R10：placeBlock 的两个重载合并为默认参数 data = 0（情形 A）。
 */
import type { Random } from '@mcpe/util';
import type { Level } from '../../Level';

export abstract class Feature {
  private doUpdate: boolean;

  constructor(doUpdate = false) {
    this.doUpdate = doUpdate;
  }

  abstract place(level: Level, random: Random, x: number, y: number, z: number): boolean;

  init(_v1: number, _v2: number, _v3: number): void {}

  protected placeBlock(
    level: Level,
    x: number,
    y: number,
    z: number,
    tile: number,
    data = 0,
  ): void {
    if (this.doUpdate) {
      level.setTileAndData(x, y, z, tile, data);
    } else {
      level.setTileAndDataNoUpdate(x, y, z, tile, data);
    }
  }
}
