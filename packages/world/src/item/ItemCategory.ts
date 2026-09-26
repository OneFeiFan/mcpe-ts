// 1:1 移植自 src/world/item/ItemCategory.h
export class ItemCategory {
  static readonly Structures = 1;
  static readonly Tools = 2;
  static readonly FoodArmor = 4;
  static readonly Decorations = 8;
  static readonly Mechanisms = 16;
  static readonly NUM_CATEGORIES = 5;

  static categoryToString(id: number): string {
    switch (id) {
      case ItemCategory.Structures: return 'Structures';
      case ItemCategory.Tools: return 'Tools';
      case ItemCategory.FoodArmor: return 'Food and\nArmor';
      case ItemCategory.Decorations: return 'Decorations';
      case ItemCategory.Mechanisms: return 'Mechanisms';
      default: return '<Unknown category>';
    }
  }
}
