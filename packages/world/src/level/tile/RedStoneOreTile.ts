import { Tile } from './Tile';
import { Material } from '../material/Material';
import { Level } from '../Level';
import type { Player } from '../../entity/player/Player';
import type { Entity } from '../../entity/Entity';
import type { Random } from '@mcpe/util';
import { ParticleType } from '../../entity/EntityTypes';

export class RedStoneOreTile extends Tile {
  private readonly lit: boolean;

  /** C++ RedStoneOreTile::RedStoneOreTile(int id, int tex, bool lit) */
  constructor(id: number, tex: number, lit: boolean) {
    super(id, tex, Material.stone);
    if (lit) {
      this.setTicking(true);
    }
    this.lit = lit;
  }

  /** C++ RedStoneOreTile::getTickDelay() */
  override getTickDelay(): number {
    return 30;
  }

  /** C++ RedStoneOreTile::attack(Level*, int, int, int, Player*) */
  override attack(level: Level, x: number, y: number, z: number, player: Player): void {
    this.interact(level, x, y, z);
    super.attack(level, x, y, z, player);
  }

  /** C++ RedStoneOreTile::stepOn(Level*, int, int, int, Entity*) */
  override stepOn(level: Level, x: number, y: number, z: number, entity: Entity): void {
    this.interact(level, x, y, z);
    super.stepOn(level, x, y, z, entity);
  }

  /** C++ RedStoneOreTile::use(Level*, int, int, int, Player*) */
  override use(level: Level, x: number, y: number, z: number, player: Player): boolean {
    this.interact(level, x, y, z);
    return super.use(level, x, y, z, player);
  }

  /** C++ RedStoneOreTile::interact(Level*, int, int, int) */
  interact(level: Level, x: number, y: number, z: number): void {
    this.poofParticles(level, x, y, z);
    if (this.id === Tile.redStoneOre.id) {
      level.setTile(x, y, z, Tile.redStoneOre_lit.id);
    }
  }

  /** C++ RedStoneOreTile::tick(Level*, int, int, int, Random*) */
  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (this.id === Tile.redStoneOre_lit.id) {
      level.setTile(x, y, z, Tile.redStoneOre.id);
    }
  }

  /** C++ RedStoneOreTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    // C++: //return Item.redStone.id; return 0;
    return 0;
  }

  /** C++ RedStoneOreTile::getResourceCount(Random* random) */
  override getResourceCount(random: Random): number {
    return 4 + random.nextInt(2);
  }

  /** C++ RedStoneOreTile::animateTick(Level*, int, int, int, Random*) */
  override animateTick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (this.lit) {
      this.poofParticles(level, x, y, z);
    }
  }

  /** C++ RedStoneOreTile::poofParticles(Level*, int, int, int) */
  private poofParticles(level: Level, x: number, y: number, z: number): void {
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

      // C++ 里第三个条件是 yy < 0（不是 yy < y），疑似 bug，按原样复刻
      if (xx < x || xx > x + 1 || yy < 0 || yy > y + 1 || zz < z || zz > z + 1) {
        level.addParticle(ParticleType.reddust, xx, yy, zz, 0, 0, 0);
      }
    }
  }
}
