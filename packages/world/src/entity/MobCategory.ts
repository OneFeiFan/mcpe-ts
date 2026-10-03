// 1:1 移植自 src/world/entity/MobCategory.h/.cpp（S2 前置）。三个实例按身份比较（C++ 比较地址）。
import { Material } from '../level/material/Material';
import { MobTypes } from './EntityTypes';

export class MobCategory {
  static readonly monster = new MobCategory(MobTypes.BaseEnemy, 10, 20, false);
  static readonly creature = new MobCategory(MobTypes.BaseCreature, 10, 15, true);
  static readonly waterCreature = new MobCategory(MobTypes.BaseWaterCreature, 5, 10, true);
  static readonly values: readonly MobCategory[] = [
    MobCategory.monster,
    MobCategory.creature,
    MobCategory.waterCreature,
  ];
  static readonly numValues = MobCategory.values.length;

  private _spawnPositionMaterial: Material | null = null;

  private constructor(
    private readonly _baseClassId: number,
    private readonly _max: number,
    private readonly _maxPerLevel: number,
    private readonly _isFriendly: boolean,
  ) {}

  /** 要在 initMaterials 之后调用（NinecraftApp::init 的顺序） */
  static initMobCategories(): void {
    MobCategory.monster.setMaterial(Material.air);
    MobCategory.creature.setMaterial(Material.air);
    MobCategory.waterCreature.setMaterial(Material.water);
  }

  getBaseClassId(): number {
    return this._baseClassId;
  }

  getMaxInstancesPerChunk(): number {
    return this._max;
  }

  getMaxInstancesPerLevel(): number {
    return this._maxPerLevel;
  }

  getSpawnPositionMaterial(): Material | null {
    return this._spawnPositionMaterial;
  }

  isFriendly(): boolean {
    return this._isFriendly;
  }

  private setMaterial(material: Material): void {
    this._spawnPositionMaterial = material;
  }
}
