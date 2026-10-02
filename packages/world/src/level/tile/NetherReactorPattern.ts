import { Tile } from "./Tile";

export class NetherReactorPattern {
  private readonly pattern: number[][][] = [
    [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
  ];

  /** C++ NetherReactorPattern::NetherReactorPattern() */
  constructor() {
    const goldId = Tile.goldBlock.id;
    const stoneId = Tile.stoneBrick.id;
    const netherCoreId = Tile.netherReactor.id;

    const types: number[][][] = [
      // Level 0
      [
        [goldId, stoneId, goldId],
        [stoneId, stoneId, stoneId],
        [goldId, stoneId, goldId],
      ],
      // Level 1
      [
        [stoneId, 0, stoneId],
        [0, netherCoreId, 0],
        [stoneId, 0, stoneId],
      ],
      // Level 2
      [
        [0, stoneId, 0],
        [stoneId, stoneId, stoneId],
        [0, stoneId, 0],
      ],
    ];

    for (let setLevel = 0; setLevel <= 2; ++setLevel) {
      for (let setX = 0; setX <= 2; ++setX) {
        for (let setZ = 0; setZ <= 2; ++setZ) {
          this.setTileAt(setLevel, setX, setZ, types[setLevel]![setX]![setZ]!);
        }
      }
    }
  }

  /** C++ NetherReactorPattern::setTileAt(int level, int x, int z, int tile) */
  private setTileAt(level: number, x: number, z: number, tile: number): void {
    this.pattern[level]![x]![z] = tile;
  }

  /** C++ NetherReactorPattern::getTileAt(int level, int x, int z) */
  getTileAt(level: number, x: number, z: number): number {
    return this.pattern[level]![x]![z]!;
  }
}