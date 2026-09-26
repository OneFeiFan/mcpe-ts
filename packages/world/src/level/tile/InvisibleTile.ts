import { Material } from "../material/Material";
import { Tile } from "./Tile";

export class InvisibleTile extends Tile {
    constructor(id: number, tex: number, material: Material) {
        super(id, tex, material);
    }

    override getRenderShape(): number {
        return InvisibleTile.SHAPE_INVISIBLE;
    }
}