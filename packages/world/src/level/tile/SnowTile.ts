import { Tile } from "./Tile";
import { Material } from "../material/Material";
import { Level } from "../Level";
import { Item } from "../../item/Item";
import { LightLayer } from "../LightLayer";
import type { Random } from "@mcpe/util";

export class SnowTile extends Tile {
  /** C++ SnowTile::SnowTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.snow);
    this.setTicking(true);
  }

  /** C++ SnowTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return Item.snowBall.id;
  }

  /** C++ SnowTile::getResourceCount(Random* random) */
  override getResourceCount(_random: Random): number {
    return 4;
  }

  /** C++ SnowTile::tick(Level*, int, int, int, Random*) */
  override tick(level: Level, x: number, y: number, z: number, _random: Random): void {
    if (level.getBrightness(LightLayer.Block, x, y, z) > 11) {
      this.spawnResources(level, x, y, z, level.getData(x, y, z), 0);
      level.setTile(x, y, z, 0);
    }
  }
}