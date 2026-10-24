// 1:1 移植自 src/world/level/material/Material.h 与 Material.cpp
import type { DecorationMaterial } from './DecorationMaterial';
import type { GasMaterial } from './GasMaterial';
import type { LiquidMaterial } from './LiquidMaterial';
import type { WebMaterial } from './WebMaterial';
/** 由 MaterialInclude.ts 注入的子类构造器（见该文件说明）。 */
export interface MaterialClasses {
  readonly GasMaterial: new () => GasMaterial;
  readonly LiquidMaterial: new () => LiquidMaterial;
  readonly DecorationMaterial: new () => DecorationMaterial;
  readonly WebMaterial: new () => WebMaterial;
}

export class Material {
  private _flammable: boolean;
  private _neverBuildable: boolean;
  private _isAlwaysDestroyable: boolean;
  private _replaceable: boolean;

  public static air: Material;
  public static dirt: Material;
  public static wood: Material;
  public static stone: Material;
  public static metal: Material;
  public static water: Material;
  public static lava: Material;
  public static leaves: Material;
  public static plant: Material;
  public static replaceable_plant: Material;
  public static sponge: Material;
  public static cloth: Material;
  public static fire: Material;
  public static sand: Material;
  public static decoration: Material;
  public static glass: Material;
  public static explosive: Material;
  public static coral: Material;
  public static ice: Material;
  public static topSnow: Material;
  public static snow: Material;
  public static cactus: Material;
  public static clay: Material;
  public static vegetable: Material;
  public static portal: Material;
  public static cake: Material;
  public static web: Material;

  // OMIT(Material): teardownMaterials() { SAFEDEL(air); … }  Material.cpp:71 —— JS 由 GC 接管（R3）
  // OMIT(Material): virtual ~Material() {}  Material.h:83 —— 空析构函数，R3 不移植
  public static initMaterials(c: MaterialClasses) {
    Material.air = new c.GasMaterial();
    Material.dirt = new Material();
    Material.wood = new Material().flammable();
    Material.stone = new Material().notAlwaysDestroyable();
    Material.metal = new Material().notAlwaysDestroyable();
    Material.water = new c.LiquidMaterial();
    Material.lava = new c.LiquidMaterial();
    Material.leaves = new Material().flammable().neverBuildable();
    Material.plant = new c.DecorationMaterial();
    Material.replaceable_plant = new c.DecorationMaterial().replaceable().flammable();
    Material.sponge = new Material();
    Material.cloth = new Material().flammable();
    Material.fire = new c.GasMaterial();
    Material.sand = new Material();
    Material.decoration = new c.DecorationMaterial();
    Material.glass = new Material().neverBuildable();
    Material.explosive = new Material().flammable().neverBuildable();
    Material.coral = new Material();
    Material.ice = new Material().neverBuildable();
    Material.topSnow = new c.DecorationMaterial()
      .neverBuildable()
      .notAlwaysDestroyable()
      .replaceable();
    Material.snow = new Material().notAlwaysDestroyable();
    Material.cactus = new Material().neverBuildable();
    Material.clay = new Material();
    Material.vegetable = new Material();
    Material.portal = new Material();
    Material.cake = new Material();
    Material.web = new c.WebMaterial();
  }

  public isLiquid(): boolean {
    return false;
  }

  public isSolid(): boolean {
    return true;
  }

  public letsWaterThrough(): boolean {
    return !this.isLiquid() && !this.isSolid();
  }

  public blocksLight(): boolean {
    return true;
  }

  public blocksMotion(): boolean {
    return true;
  }

  public isSolidBlocking(): boolean {
    if (this._neverBuildable) return false;
    return this.blocksMotion();
  }

  public isAlwaysDestroyable(): boolean {
    // these materials will always drop resources when destroyed,
    // regardless of player's equipment
    return this._isAlwaysDestroyable;
  }

  public isFlammable(): boolean {
    return this._flammable;
  }

  public isReplaceable(): boolean {
    return this._replaceable;
  }

  protected constructor() {
    this._flammable = false;
    this._neverBuildable = false;
    this._isAlwaysDestroyable = true;
    this._replaceable = false;
  }

  protected flammable(): Material {
    this._flammable = true;
    return this;
  }

  protected neverBuildable(): Material {
    this._neverBuildable = true;
    return this;
  }

  protected notAlwaysDestroyable(): Material {
    this._isAlwaysDestroyable = false;
    return this;
  }

  protected replaceable(): Material {
    this._replaceable = true;
    return this;
  }
}
