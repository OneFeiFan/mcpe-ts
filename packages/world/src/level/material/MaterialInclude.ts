// ADAPTED(ESM)：对应 C++ Material.cpp 里 initMaterials() 的“include 全部子类再 new”那一段，原因见下
// 平台适配（ES 模块）：C++ 的 Material.cpp 直接 #include 全部子类再在 initMaterials() 里 new。
// ES 模块里基类若 import 子类、子类又 extends 基类，会在加载时触发
// "Cannot access 'Material' before initialization"（TDZ）。因此：
//   1. Material.ts 只用 `import type` 引用子类；
//   2. 由本文件（相当于 C++ 的 include-all）import 全部子类，再注入给 Material.initMaterials。
// 调用方一律使用这里导出的 initMaterials()。Tile / Item 的注册表沿用同一模式（TileInclude.ts）。
import { Material } from './Material';
import { DecorationMaterial } from './DecorationMaterial';
import { GasMaterial } from './GasMaterial';
import { LiquidMaterial } from './LiquidMaterial';
import { WebMaterial } from './WebMaterial';

export function initMaterials(): void {
  Material.initMaterials({ GasMaterial, LiquidMaterial, DecorationMaterial, WebMaterial });
}
