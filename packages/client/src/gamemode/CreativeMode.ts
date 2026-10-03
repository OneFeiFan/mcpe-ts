// 1:1 移植自 src/client/gamemode/CreativeMode.h 与 CreativeMode.cpp（S12 阶段 C）
import { type Abilities, Item } from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import { GameMode } from './GameMode';

/** CreativeMode.cpp 的文件内常量 */
const DestructionTickDelay = 5;

export class CreativeMode extends GameMode {
  constructor(minecraft: Minecraft) {
    super(minecraft);
  }

  override startDestroyBlock(x: number, y: number, z: number, face: number): void {
    const carried = this.minecraft.player!.getCarriedItem();
    if (carried !== null && carried.id === Item.bow.id) return;
    this.creativeDestroyBlock(x, y, z, face);
    this.destroyDelay = DestructionTickDelay;
  }

  continueDestroyBlock(x: number, y: number, z: number, face: number): void {
    this.destroyDelay--;
    if (this.destroyDelay <= 0) {
      this.destroyDelay = DestructionTickDelay;
      this.creativeDestroyBlock(x, y, z, face);
    }
  }

  override stopDestroyBlock(): void {
    this.destroyDelay = 0;
  }

  override isCreativeType(): boolean {
    return true;
  }

  override initAbilities(abilities: Abilities): void {
    abilities.mayfly = true;
    abilities.instabuild = true;
    abilities.invulnerable = true;
  }

  private creativeDestroyBlock(x: number, y: number, z: number, face: number): void {
    this.minecraft.level!.extinguishFire(x, y, z, face);
    this.destroyBlock(x, y, z, face);
  }
}
