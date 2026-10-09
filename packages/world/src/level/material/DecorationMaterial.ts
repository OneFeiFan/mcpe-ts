// 1:1 移植自 src/world/level/material/DecorationMaterial.h
import { Material } from './Material';

export class DecorationMaterial extends Material {
  public constructor() {
    super();
  }

  public override isSolid(): boolean {
    return false;
  }

  public override blocksLight(): boolean {
    return false;
  }

  public override blocksMotion(): boolean {
    return false;
  }
}
