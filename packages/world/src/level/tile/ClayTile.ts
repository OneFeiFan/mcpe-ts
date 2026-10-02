import { Tile } from "./Tile";
import { Material } from "../material/Material";
import { Item } from "../../item/Item";
import type { Random } from "@mcpe/util";

export class ClayTile extends Tile {
  /** C++ ClayTile::ClayTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.clay);
  }

  /** C++ ClayTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return Item.clay.id;
  }

  /** C++ ClayTile::getResourceCount(Random* random) */
  override getResourceCount(_random: Random): number {
    return 4;
  }
}