import { Material } from "./Material";


export class DecorationMaterial extends Material {

    public override  isSolid(): boolean {
        return false;
    }

    public override blocksLight(): boolean {
        return false;
    }

    public override blocksMotion(): boolean {
        return false;
    }
};