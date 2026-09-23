import { Material } from "./Material";

export class WebMaterial extends Material {
    public constructor() {
        super();
        this.notAlwaysDestroyable();
    }

    public override blocksMotion(): boolean {
        return false;
    }
}