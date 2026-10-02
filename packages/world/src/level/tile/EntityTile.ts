import { Tile } from "./Tile";
import { Material } from "../material/Material";
import { Level } from "../Level";
import { TileEntity } from "./entity/TileEntity";

export abstract class EntityTile extends Tile {
  /** C++ EntityTile::EntityTile(int id, const Material* material) */
  protected constructor(id: number, material: Material);
  /** C++ EntityTile::EntityTile(int id, int tex, const Material* material) */
  protected constructor(id: number, tex: number, material: Material);
  protected constructor(id: number, a: Material | number, b?: Material) {
    if (typeof a === "number") {
      super(id, a, b!);
    } else {
      super(id, a);
    }
    // C++: isEntityTile[this->id] = true
    Tile.isEntityTile[this.id] = true;
  }

  /** C++ EntityTile::newTileEntity() — pure virtual */
  abstract newTileEntity(): TileEntity;

  /** C++ EntityTile::onPlace(Level*, int, int, int) */
  override onPlace(level: Level, x: number, y: number, z: number): void {
    super.onPlace(level, x, y, z);
    level.setTileEntity(x, y, z, this.newTileEntity());
  }

  /** C++ EntityTile::onRemove(Level*, int, int, int) */
  override onRemove(level: Level, x: number, y: number, z: number): void {
    super.onRemove(level, x, y, z);
    level.removeTileEntity(x, y, z);
  }

  /** C++ EntityTile::triggerEvent(Level*, int, int, int, int, int) */
  override triggerEvent(
    level: Level,
    x: number, y: number, z: number,
    b0: number, b1: number,
  ): void {
    super.triggerEvent(level, x, y, z, b0, b1);
    const te = level.getTileEntity(x, y, z);
    if (te !== null) {
      te.triggerEvent(b0, b1);
    }
  }
}