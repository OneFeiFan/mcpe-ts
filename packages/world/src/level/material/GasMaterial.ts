import { Material } from "./Material";


export class GasMaterial extends Material {

    public constructor() {
        super();
        this.replaceable();
    }


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