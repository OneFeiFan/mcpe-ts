import { Item } from './Item';

export class ArmorItem extends Item {
  public readonly slot: number;
  public readonly defense: number;
  public readonly modelIndex: number;
  public readonly armorType: ArmorItem.ArmorMaterial;

  constructor(id: number, armorType: ArmorItem.ArmorMaterial, icon: number, slot: number) {
    super(id);
    this.slot = slot;
    this.defense = armorType.getDefenseForSlot(slot);
    this.modelIndex = icon;
    this.armorType = armorType;

    this.setMaxDamage(armorType.getHealthForSlot(slot));
    this.maxStackSize = 1;
  }

  override isArmor(): boolean {
    return true;
  }
}

export namespace ArmorItem {
  export const SLOT_HEAD = 0;
  export const SLOT_TORSO = 1;
  export const SLOT_LEGS = 2;
  export const SLOT_FEET = 3;

  export const healthPerSlot: readonly number[] = [11, 16, 15, 13];

  export class ArmorMaterial {
    private readonly durabilityMultiplier: number;
    private readonly slotProtections: number[];

    constructor(durabilityMultiplier: number, p0: number, p1: number, p2: number, p3: number) {
      this.durabilityMultiplier = durabilityMultiplier;
      this.slotProtections = [p0, p1, p2, p3];
    }

    getHealthForSlot(slot: number): number {
      return ArmorItem.healthPerSlot[slot]! * this.durabilityMultiplier;
    }

    getDefenseForSlot(slot: number): number {
      return this.slotProtections[slot]!;
    }
  }

  export const CLOTH = new ArmorMaterial(5, 1, 3, 2, 1);
  export const CHAIN = new ArmorMaterial(15, 2, 5, 4, 1);
  export const IRON = new ArmorMaterial(15, 2, 6, 5, 2);
  export const GOLD = new ArmorMaterial(7, 2, 5, 3, 1);
  export const DIAMOND = new ArmorMaterial(33, 3, 8, 6, 3);
}
