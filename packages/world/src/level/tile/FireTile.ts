// 1:1 移植自 src/world/level/tile/FireTile.h（S3）
import type { Random } from '@mcpe/util';
import type { AABB } from '../../phys/AABB';
import { idOf } from '../../Unregistered';
import type { Level } from '../Level';
import type { LevelSource } from '../LevelSource';
import { Material } from '../material/Material';
import { Tile } from './Tile';

export class FireTile extends Tile {
  static readonly FLAME_INSTANT = 60;
  static readonly FLAME_EASY = 30;
  static readonly FLAME_MEDIUM = 15;
  static readonly FLAME_HARD = 5;
  static readonly BURN_INSTANT = 100;
  static readonly BURN_EASY = 60;
  static readonly BURN_MEDIUM = 20;
  static readonly BURN_HARD = 5;
  static readonly BURN_NEVER = 0;

  private readonly flameOdds = new Int32Array(256);
  private readonly burnOdds = new Int32Array(256);

  constructor(id: number, tex: number) {
    super(id, tex, Material.fire);
    // flameOdds / burnOdds 已由 Int32Array 置 0（C++ 在这里用循环清零）
    this.setFlammable(Tile.wood.id, FireTile.FLAME_HARD, FireTile.BURN_MEDIUM);
    this.setFlammable(Tile.treeTrunk.id, FireTile.FLAME_HARD, FireTile.BURN_HARD);
    this.setFlammable(Tile.leaves.id, FireTile.FLAME_EASY, FireTile.BURN_EASY);
    this.setFlammable(Tile.bookshelf.id, FireTile.FLAME_EASY, FireTile.BURN_MEDIUM);
    this.setFlammable(Tile.tnt.id, FireTile.FLAME_MEDIUM, FireTile.BURN_INSTANT);
    this.setFlammable(Tile.cloth.id, FireTile.FLAME_EASY, FireTile.BURN_EASY);
    this.setTicking(true); //@fire
  }

  override getAABB(_level: Level, _x: number, _y: number, _z: number): AABB | null {
    return null;
  }

  /** C++ 在这里新增的非 virtual 方法 */
  blocksLight(): boolean {
    return false;
  }

  override isSolidRender(): boolean {
    return false;
  }

  override isCubeShaped(): boolean {
    return false;
  }

  override getRenderShape(): number {
    return Tile.SHAPE_FIRE;
  }

  override getResourceCount(_random: Random): number {
    return 0;
  }

  override getTickDelay(): number {
    return 10;
  }

  override tick(level: Level, x: number, y: number, z: number, random: Random): void {
    const infiniBurn = level.getTile(x, y - 1, z) === Tile.netherrack.id;
    const age = level.getData(x, y, z);
    if (age < 15) {
      level.setData(x, y, z, age + 1);
      level.addToTickNextTick(x, y, z, this.id, this.getTickDelay());
    }
    if (!infiniBurn && !this.isValidFireLocation(level, x, y, z)) {
      if (!level.isSolidBlockingTile(x, y - 1, z) || age > 3) level.setTile(x, y, z, 0);
      return;
    }
    if (!infiniBurn && !this.canBurn(level, x, y - 1, z)) {
      if (age === 15 && random.nextInt(4) === 0) {
        level.setTile(x, y, z, 0);
        return;
      }
    }
    if (age % 2 === 0 && age > 2) {
      this.checkBurn(level, x + 1, y, z, 300, random);
      this.checkBurn(level, x - 1, y, z, 300, random);
      this.checkBurn(level, x, y - 1, z, 250, random);
      this.checkBurn(level, x, y + 1, z, 250, random);
      this.checkBurn(level, x, y, z - 1, 300, random);
      this.checkBurn(level, x, y, z + 1, 300, random);
      for (let xx = x - 1; xx <= x + 1; xx++) {
        for (let zz = z - 1; zz <= z + 1; zz++) {
          for (let yy = y - 1; yy <= y + 4; yy++) {
            if (xx === x && yy === y && zz === z) continue;
            let rate = 100;
            if (yy > y + 1) {
              rate += (yy - (y + 1)) * 100;
            }
            const odds = this.getFireOdds(level, xx, yy, zz);
            if (odds > 0 && random.nextInt(rate) <= odds) {
              level.setTile(xx, yy, zz, this.id);
            }
          }
        }
      }
    }
    if (age === 15) {
      this.checkBurn(level, x + 1, y, z, 1, random);
      this.checkBurn(level, x - 1, y, z, 1, random);
      this.checkBurn(level, x, y - 1, z, 1, random);
      this.checkBurn(level, x, y + 1, z, 1, random);
      this.checkBurn(level, x, y, z - 1, 1, random);
      this.checkBurn(level, x, y, z + 1, 1, random);
    }
  }

  /** C++ mayPick() */
  override mayPickBasic(): boolean {
    return false;
  }

  override getRenderLayer(): number {
    return Tile.RENDERLAYER_ALPHATEST;
  }

  canBurn(level: LevelSource, x: number, y: number, z: number): boolean {
    return this.flameOdds[level.getTile(x, y, z)]! > 0;
  }

  getFlammability(level: Level, x: number, y: number, z: number, odds: number): number {
    const f = this.flameOdds[level.getTile(x, y, z)]!;
    if (f > odds) return f;
    return odds;
  }

  /** C++ mayPlace(Level* level, int x, int y, int z, unsigned char face) */
  override mayPlaceOnFace(level: Level, x: number, y: number, z: number, _face: number): boolean {
    return level.isSolidBlockingTile(x, y - 1, z) || this.isValidFireLocation(level, x, y, z);
  }

  override neighborChanged(level: Level, x: number, y: number, z: number, _type: number): void {
    if (!level.isSolidBlockingTile(x, y - 1, z) && !this.isValidFireLocation(level, x, y, z)) {
      level.setTile(x, y, z, 0);
      return;
    }
  }

  override onPlace(level: Level, x: number, y: number, z: number): void {
    if (!level.isSolidBlockingTile(x, y - 1, z) && !this.isValidFireLocation(level, x, y, z)) {
      level.setTile(x, y, z, 0);
      return;
    }
    level.addToTickNextTick(x, y, z, this.id, this.getTickDelay());
  }

  isFlammable(tile: number): boolean {
    return this.flameOdds[tile]! > 0;
  }

  ignite(level: Level, x: number, y: number, z: number): void {
    let lit = false;
    if (!lit) lit = this.tryIgnite(level, x, y + 1, z);
    if (!lit) lit = this.tryIgnite(level, x - 1, y, z);
    if (!lit) lit = this.tryIgnite(level, x + 1, y, z);
    if (!lit) lit = this.tryIgnite(level, x, y, z - 1);
    if (!lit) lit = this.tryIgnite(level, x, y, z + 1);
    if (!lit) lit = this.tryIgnite(level, x, y - 1, z);
    if (!lit) {
      level.setTile(x, y, z, Tile.fire.id);
    }
  }

  override animateTick(level: Level, x: number, y: number, z: number, random: Random): void {
    if (random.nextInt(24) === 0) {
      level.playSound(
        x + 0.5,
        y + 0.5,
        z + 0.5,
        'fire.fire',
        1 + random.nextFloat(),
        random.nextFloat() * 0.7 + 0.3,
      );
    }
    const fire = Tile.fire;
    // PARTICLETYPE(largesmoke) 是逗号表达式 (ParticleType::largesmoke, "largesmoke")，实际传的是字符串
    if (level.isSolidBlockingTile(x, y - 1, z) || fire.canBurn(level, x, y - 1, z)) {
      for (let i = 0; i < 3; i++) {
        const xx = x + random.nextFloat();
        const yy = y + random.nextFloat() * 0.5 + 0.5;
        const zz = z + random.nextFloat();
        level.addParticle('largesmoke', xx, yy, zz, 0, 0, 0);
      }
    } else {
      if (fire.canBurn(level, x - 1, y, z)) {
        for (let i = 0; i < 2; i++) {
          const xx = x + random.nextFloat() * 0.1;
          const yy = y + random.nextFloat();
          const zz = z + random.nextFloat();
          level.addParticle('largesmoke', xx, yy, zz, 0, 0, 0);
        }
      }
      if (fire.canBurn(level, x + 1, y, z)) {
        for (let i = 0; i < 2; i++) {
          const xx = x + 1 - random.nextFloat() * 0.1;
          const yy = y + random.nextFloat();
          const zz = z + random.nextFloat();
          level.addParticle('largesmoke', xx, yy, zz, 0, 0, 0);
        }
      }
      if (fire.canBurn(level, x, y, z - 1)) {
        for (let i = 0; i < 2; i++) {
          const xx = x + random.nextFloat();
          const yy = y + random.nextFloat();
          const zz = z + random.nextFloat() * 0.1;
          level.addParticle('largesmoke', xx, yy, zz, 0, 0, 0);
        }
      }
      if (fire.canBurn(level, x, y, z + 1)) {
        for (let i = 0; i < 2; i++) {
          const xx = x + random.nextFloat();
          const yy = y + random.nextFloat();
          const zz = z + 1 - random.nextFloat() * 0.1;
          level.addParticle('largesmoke', xx, yy, zz, 0, 0, 0);
        }
      }
      if (fire.canBurn(level, x, y + 1, z)) {
        for (let i = 0; i < 2; i++) {
          const xx = x + random.nextFloat();
          const yy = y + 1 - random.nextFloat() * 0.1;
          const zz = z + random.nextFloat();
          level.addParticle('largesmoke', xx, yy, zz, 0, 0, 0);
        }
      }
    }
  }

  private setFlammable(id: number, flame: number, burn: number): void {
    this.flameOdds[id] = flame;
    this.burnOdds[id] = burn;
  }

  private checkBurn(
    level: Level,
    x: number,
    y: number,
    z: number,
    chance: number,
    random: Random,
  ): void {
    const odds = this.burnOdds[level.getTile(x, y, z)]!;
    if (random.nextInt(chance) < odds) {
      // ADAPTED(DeferredTile): == Tile::tnt->id —— 火一旦烧到木头或树叶就会走到这里；tnt 未注册时恒为 false
      const wasTnt = level.getTile(x, y, z) === Tile.tnt.id;
      if (random.nextInt(2) === 0) {
        level.setTile(x, y, z, this.id);
      } else {
        level.setTile(x, y, z, 0);
      }
      if (wasTnt) {
        Tile.tnt.destroy(level, x, y, z, 0);
      }
    }
  }

  private isValidFireLocation(level: Level, x: number, y: number, z: number): boolean {
    if (this.canBurn(level, x + 1, y, z)) return true;
    if (this.canBurn(level, x - 1, y, z)) return true;
    if (this.canBurn(level, x, y - 1, z)) return true;
    if (this.canBurn(level, x, y + 1, z)) return true;
    if (this.canBurn(level, x, y, z - 1)) return true;
    if (this.canBurn(level, x, y, z + 1)) return true;
    return false;
  }

  private getFireOdds(level: Level, x: number, y: number, z: number): number {
    let odds = 0;
    if (!level.isEmptyTile(x, y, z)) return 0;
    odds = this.getFlammability(level, x + 1, y, z, odds);
    odds = this.getFlammability(level, x - 1, y, z, odds);
    odds = this.getFlammability(level, x, y - 1, z, odds);
    odds = this.getFlammability(level, x, y + 1, z, odds);
    odds = this.getFlammability(level, x, y, z - 1, odds);
    odds = this.getFlammability(level, x, y, z + 1, odds);
    return odds;
  }

  private tryIgnite(level: Level, x: number, y: number, z: number): boolean {
    const t = level.getTile(x, y, z);
    if (t === Tile.fire.id) return true;
    if (t === 0) {
      level.setTile(x, y, z, Tile.fire.id);
      return true;
    }
    return false;
  }
}
