// 1:1 移植自 src/world/Direction.h 与 Direction.cpp（S2 前置，BedTile 要用）
import { Facing } from './Facing';

export class Direction {
  static readonly UNDEFINED = -1;
  static readonly SOUTH = 0;
  static readonly WEST = 1;
  static readonly NORTH = 2;
  static readonly EAST = 3;

  static readonly DIRECTION_FACING: readonly number[] = [Facing.SOUTH, Facing.WEST, Facing.NORTH, Facing.EAST];
  static readonly FACING_DIRECTION: readonly number[] = [
    Direction.UNDEFINED, Direction.UNDEFINED, Direction.NORTH, Direction.SOUTH, Direction.WEST, Direction.EAST,
  ];
  static readonly DIRECTION_OPPOSITE: readonly number[] = [Direction.NORTH, Direction.EAST, Direction.SOUTH, Direction.WEST];
  static readonly RELATIVE_DIRECTION_FACING: readonly (readonly number[])[] = [
    [Facing.DOWN, Facing.UP, Facing.SOUTH, Facing.NORTH, Facing.EAST, Facing.WEST],
    [Facing.DOWN, Facing.UP, Facing.EAST, Facing.WEST, Facing.NORTH, Facing.SOUTH],
    [Facing.DOWN, Facing.UP, Facing.NORTH, Facing.SOUTH, Facing.WEST, Facing.EAST],
    [Facing.DOWN, Facing.UP, Facing.WEST, Facing.EAST, Facing.SOUTH, Facing.NORTH],
  ];
}
