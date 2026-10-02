import { Tile } from "./Tile";
import { Material } from "../material/Material";
import { Level } from "../Level";
import { AABB } from "../../phys/AABB";
import { Entity } from "../../entity/Entity";
import { Item } from "../../item/Item";
import type { Random } from "@mcpe/util";

export class WebTile extends Tile {
  /** C++ WebTile::WebTile(int id, int tex) */
  constructor(id: number, tex: number) {
    super(id, tex, Material.web);
  }

  /** C++ WebTile::getRenderLayer() */
  override getRenderLayer(): number {
    // C++ 里没有 Tile:: 前缀，直接用当前作用域的 RENDERLAYER_ALPHATEST
    return Tile.RENDERLAYER_ALPHATEST;
  }

  /** C++ WebTile::entityInside(Level*, int, int, int, Entity*) */
  override entityInside(
    _level: Level,
    _x: number, _y: number, _z: number,
    entity: Entity,
  ): void {
    entity.makeStuckInWeb();
  }

  /** C++ WebTile::isSolidRender() */
  override isSolidRender(): boolean {
    return false;
  }

  /** C++ WebTile::getAABB(Level*, int, int, int) */
  override getAABB(_level: Level, _x: number, _y: number, _z: number): AABB | null {
    return null;
  }

  /** C++ WebTile::getRenderShape() */
  override getRenderShape(): number {
    return Tile.SHAPE_CROSS_TEXTURE;
  }

  /** C++ WebTile::blocksLight() */
  blocksLight(): boolean {
    return false;
  }

  /** C++ WebTile::isCubeShaped() */
  override isCubeShaped(): boolean {
    return false;
  }

  /** C++ WebTile::getResource(int data, Random* random) */
  override getResource(_data: number, _random: Random): number {
    return Item.string.id;
  }
}