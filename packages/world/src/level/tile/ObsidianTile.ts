import { StoneTile } from "./StoneTile";
import { Level } from "../Level";
import type { Random } from "@mcpe/util";
import { ParticleType } from "../../entity/EntityTypes";
import { Tile } from "./Tile";


export class ObsidianTile extends StoneTile {
  private readonly isGlowing: boolean;

  /** C++ ObsidianTile::ObsidianTile(int id, int tex, bool isGlowing) */
  constructor(id: number, tex: number, isGlowing: boolean) {
    super(id, tex);
    this.isGlowing = isGlowing;
  }

  /** C++ ObsidianTile::getResourceCount(Random* random) */
  override getResourceCount(_random: Random): number {
    return 1;
  }

  /** C++ ObsidianTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return Tile.obsidian.id;
  }

  /** C++ ObsidianTile::animateTick(Level*, int, int, int, Random*) */
  override animateTick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (this.isGlowing) {
      this.poofParticles(level, x, y, z);
    }
  }

  /** C++ ObsidianTile::poofParticles(Level*, int, int, int) */
  poofParticles(level: Level, x: number, y: number, z: number): void {
    const random = level.random;
    const r = 1 / 16.0;

    for (let i = 0; i < 6; i++) {
      let xx = x + random.nextFloat();
      let yy = y + random.nextFloat();
      let zz = z + random.nextFloat();

      if (i === 0 && !level.isSolidBlockingTile(x, y + 1, z)) yy = y + 1 + r;
      if (i === 1 && !level.isSolidBlockingTile(x, y - 1, z)) yy = y + 0 - r;
      if (i === 2 && !level.isSolidBlockingTile(x, y, z + 1)) zz = z + 1 + r;
      if (i === 3 && !level.isSolidBlockingTile(x, y, z - 1)) zz = z + 0 - r;
      if (i === 4 && !level.isSolidBlockingTile(x + 1, y, z)) xx = x + 1 + r;
      if (i === 5 && !level.isSolidBlockingTile(x - 1, y, z)) xx = x + 0 - r;

      // C++ 里第三个条件是 yy < 0（不是 yy < y）。这是原代码的疑似 bug，
      // 导致 i == 1（向下）方向的粒子几乎从不添加。按第一/二档精神复刻。
      if (xx < x || xx > x + 1 || yy < 0 || yy > y + 1 || zz < z || zz > z + 1) {
        level.addParticle(ParticleType.reddust, xx, yy, zz, 0, 0, 0);
      }
    }
  }
}