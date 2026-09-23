import { Material } from "./Material";


export class LiquidMaterial extends Material {

    public constructor() {
        super();
        this.replaceable();
    }

    public override  isSolid(): boolean {
        return false;
    }

    public override isLiquid(): boolean {
        return true;
    }

    public override blocksMotion(): boolean {
        return false;
    }
};
