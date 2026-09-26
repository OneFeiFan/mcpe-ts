// 1:1 移植自 src/world/Facing.h 与 Direction.cpp 里的 Facing 数组（S2 前置，S3 的 Tile 要用）
export class Facing {
  static readonly DOWN = 0;
  static readonly UP = 1;
  static readonly NORTH = 2;
  static readonly SOUTH = 3;
  static readonly WEST = 4;
  static readonly EAST = 5;

  static toString(face: number): string {
    if (face === Facing.DOWN) return 'Down';
    if (face === Facing.UP) return 'Up';
    if (face === Facing.NORTH) return 'North';
    if (face === Facing.SOUTH) return 'South';
    if (face === Facing.WEST) return 'West';
    if (face === Facing.EAST) return 'East';
    return 'Unknown facing';
  }

  static readonly OPPOSITE_FACING: readonly number[] = [Facing.UP, Facing.DOWN, Facing.SOUTH, Facing.NORTH, Facing.EAST, Facing.WEST];
  static readonly STEP_X: readonly number[] = [0, 0, 0, 0, -1, 1];
  static readonly STEP_Y: readonly number[] = [-1, 1, 0, 0, 0, 0];
  static readonly STEP_Z: readonly number[] = [0, 0, -1, 1, 0, 0];
}
