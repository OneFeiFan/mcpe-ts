/**
 * 1:1 移植自 src/world/level/levelgen/feature/BasicTree.h：大橡树（主干 + 斜伸的枝干 + 一团团树叶）。
 * 这一版里没有任何调用点：Biome、ForestBiome、RainforestBiome、Sapling 里 `new BasicTree(...)` 的语句都被注释掉了
 *   （那些空的 `if (random->nextInt(n) == 0) {}` 还在，照样消耗随机数）。移植它只是为了完整，黄金样本 G17-2 直接调用它。
 * 浮点（按 G17-2 与 C++ 逐方块对照确定）：
 *   - 头文件里不带 Mth:: 的 sin、cos、sqrt、pow 是 C 库的 double 版本；Mth::floor 只有 float 版本（double 参数先转 float）；
 *   - 不带 Mth:: 的 abs 作用在 float 上时是 float 重载（std::abs(float)）：G17-2 的 treeShape 表能分辨（换成 ::abs(int) 会对不上）。
 * 原样保留：
 *   - place 里 `int seed = random->nextLong()`：64 位截成 32 位，再 setSeed；
 *   - limb 里算了 dir（xdiff / zdiff 两个分支都设成 0），placeBlock 的 data 恒为 0；
 *   - branchDensity 赋了值但不用；rnd 构造时按时间播种，place 里再按传入的 random 重新播种。
 */
import { Mth, Random } from '@mcpe/util';
import type { Level } from '../../Level';
import { Tile } from '../../tile/Tile';
import { Feature } from './Feature';

const f = Math.fround;
/** 不带 Mth:: 的 abs(float)：G17-2 确认是 float 重载（false 时按 ::abs(int) 先截断，仅供对照） */
const FLOAT_ABS = true;
const absF = (v: number): number => (FLOAT_ABS ? Math.abs(v) : Math.abs(Math.trunc(v)));
/** Mth::floor(float)：参数先转 float */
const floorF = (v: number): number => Mth.floor(f(v));

export class BasicTree extends Feature {
  private axisConversionArray = [2, 0, 0, 1, 2, 1];
  private rnd = new Random();
  private thisLevel: Level | null = null;
  private origin = [0, 0, 0];
  private height = 0;
  private trunkHeight = 0;
  private trunkHeightScale = f(0.618);
  protected branchDensity = 1.0;
  private branchSlope = f(0.381);
  private widthScale = 1.0;
  private foliageDensity = 1.0;
  private trunkWidth = 1;
  private heightVariance = 12;
  private foliageHeight = 4;
  private foliageCoords: number[][] = [];
  private foliageCoordsLength = 0;

  constructor(doUpdate: boolean) {
    super(doUpdate);
  }

  private prepare(): void {
    const origin = this.origin;
    this.trunkHeight = Math.trunc(f(this.height * this.trunkHeightScale));
    if (this.trunkHeight >= this.height) this.trunkHeight = this.height - 1;
    let clustersPerY = Math.trunc(f(1.382) + Math.pow((this.foliageDensity * this.height) / 13.0, 2));
    if (clustersPerY < 1) clustersPerY = 1;
    const temp: number[][] = [];
    let y = origin[1]! + this.height - this.foliageHeight;
    let clusterCount = 1;
    const trunkTop = origin[1]! + this.trunkHeight;
    let relativeY = y - origin[1]!;
    temp[0] = [origin[0]!, y, origin[2]!, trunkTop];
    y--;
    while (relativeY >= 0) {
      let num = 0;
      const shapefac = this.treeShape(relativeY);
      if (shapefac < 0) {
        y--;
        relativeY--;
        continue;
      }
      const originOffset = f(0.5);
      while (num < clustersPerY) {
        const radius = f(this.widthScale * f(shapefac * f(this.rnd.nextFloat() + f(0.328))));
        const angle = f(f(this.rnd.nextFloat() * 2.0) * f(3.14159));
        const x = floorF(radius * Math.sin(angle) + origin[0]! + originOffset);
        const z = floorF(radius * Math.cos(angle) + origin[2]! + originOffset);
        const checkStart = [x, y, z];
        const checkEnd = [x, y + this.foliageHeight, z];
        if (this.checkLine(checkStart, checkEnd) === -1) {
          const checkBranchBase = [origin[0]!, origin[1]!, origin[2]!];
          const distance = f(Math.sqrt(Math.pow(Math.abs(origin[0]! - checkStart[0]!), 2.0) + Math.pow(Math.abs(origin[2]! - checkStart[2]!), 2.0)));
          const branchHeight = f(distance * this.branchSlope);
          if (f(checkStart[1]! - branchHeight) > trunkTop) {
            checkBranchBase[1] = trunkTop;
          } else {
            checkBranchBase[1] = Math.trunc(f(checkStart[1]! - branchHeight));
          }
          if (this.checkLine(checkBranchBase, checkStart) === -1) {
            temp[clusterCount] = [x, y, z, checkBranchBase[1]!];
            clusterCount++;
          }
        }
        num++;
      }
      y--;
      relativeY--;
    }
    this.foliageCoordsLength = clusterCount;
    this.foliageCoords = temp.slice(0, clusterCount);
  }

  private crossection(x: number, y: number, z: number, radius: number, direction: number, material: number): void {
    const level = this.thisLevel!;
    const rad = Math.trunc(radius + 0.618);
    const secidx1 = this.axisConversionArray[direction]!;
    const secidx2 = this.axisConversionArray[direction + 3]!;
    const center = [x, y, z];
    const position = [0, 0, 0];
    let offset1 = -rad;
    let offset2 = -rad;
    position[direction] = center[direction]!;
    while (offset1 <= rad) {
      position[secidx1] = center[secidx1]! + offset1;
      offset2 = -rad;
      while (offset2 <= rad) {
        const off1 = f(offset1 + f(0.5));
        const off2 = f(offset2 + f(0.5));
        const thisdistance = f(f(off1 * off1) + f(off2 * off2));
        if (thisdistance > f(radius * radius)) {
          offset2++;
          continue;
        }
        position[secidx2] = center[secidx2]! + offset2;
        const thismat = level.getTile(position[0]!, position[1]!, position[2]!);
        if (!(thismat === 0 || thismat === Tile.leaves.id)) {
          offset2++;
          continue;
        }
        this.placeBlock(level, position[0]!, position[1]!, position[2]!, material, 0);
        offset2++;
      }
      offset1++;
    }
  }

  private treeShape(y: number): number {
    if (y < f(this.height * f(0.3))) return f(-1.618);
    const radius = f(this.height / 2.0);
    const adjacent = f(f(this.height / 2.0) - y);
    let distance: number;
    if (adjacent === 0) distance = radius;
    else if (absF(adjacent) >= radius) distance = 0.0;
    else distance = f(Math.sqrt(Math.pow(absF(radius), 2) - Math.pow(absF(adjacent), 2)));
    distance = f(distance * f(0.5));
    return distance;
  }

  private foliageShape(y: number): number {
    if (y < 0 || y >= this.foliageHeight) return -1;
    else if (y === 0 || y === this.foliageHeight - 1) return 2;
    else return 3;
  }

  private foliageCluster(x: number, y: number, z: number): void {
    const topy = y + this.foliageHeight;
    let cury = topy - 1;
    while (cury >= y) {
      const radius = this.foliageShape(cury - y);
      this.crossection(x, cury, z, radius, 1, Tile.leaves.id);
      cury--;
    }
  }

  private limb(start: number[], end: number[], material: number): void {
    const delta = [0, 0, 0];
    let primidx = 0;
    for (let idx = 0; idx < 3; idx++) {
      delta[idx] = end[idx]! - start[idx]!;
      if (Math.abs(delta[idx]!) > Math.abs(delta[primidx]!)) primidx = idx;
    }
    if (delta[primidx] === 0) return;
    const secidx1 = this.axisConversionArray[primidx]!;
    const secidx2 = this.axisConversionArray[primidx + 3]!;
    const primsign = delta[primidx]! > 0 ? 1 : -1;
    const secfac1 = f(delta[secidx1]! / delta[primidx]!);
    const secfac2 = f(delta[secidx2]! / delta[primidx]!);
    const coordinate = [0, 0, 0];
    let primoffset = 0;
    const endoffset = delta[primidx]! + primsign;
    while (primoffset !== endoffset) {
      coordinate[primidx] = floorF(start[primidx]! + primoffset + 0.5);
      coordinate[secidx1] = floorF(f(start[secidx1]! + f(primoffset * secfac1)) + 0.5);
      coordinate[secidx2] = floorF(f(start[secidx2]! + f(primoffset * secfac2)) + 0.5);
      const dir = 0; // C++ 的 xdiff / zdiff 两个分支都设成 0
      this.placeBlock(this.thisLevel!, coordinate[0]!, coordinate[1]!, coordinate[2]!, material, dir);
      primoffset += primsign;
    }
  }

  private makeFoliage(): void {
    for (let idx = 0; idx < this.foliageCoordsLength; idx++) {
      const c = this.foliageCoords[idx]!;
      this.foliageCluster(c[0]!, c[1]!, c[2]!);
    }
  }

  private trimBranches(localY: number): boolean {
    if (localY < this.height * 0.2) return false;
    else return true;
  }

  private makeTrunk(): void {
    const x = this.origin[0]!;
    const startY = this.origin[1]!;
    const topY = this.origin[1]! + this.trunkHeight;
    const z = this.origin[2]!;
    const startCoord = [x, startY, z];
    const endCoord = [x, topY, z];
    this.limb(startCoord, endCoord, Tile.treeTrunk.id);
    if (this.trunkWidth === 2) {
      startCoord[0]! += 1;
      endCoord[0]! += 1;
      this.limb(startCoord, endCoord, Tile.treeTrunk.id);
      startCoord[2]! += 1;
      endCoord[2]! += 1;
      this.limb(startCoord, endCoord, Tile.treeTrunk.id);
      startCoord[0]! += -1;
      endCoord[0]! += -1;
      this.limb(startCoord, endCoord, Tile.treeTrunk.id);
    }
  }

  private makeBranches(): void {
    const baseCoord = [this.origin[0]!, this.origin[1]!, this.origin[2]!];
    for (let idx = 0; idx < this.foliageCoordsLength; idx++) {
      const coordValues = this.foliageCoords[idx]!;
      const endCoord = [coordValues[0]!, coordValues[1]!, coordValues[2]!];
      baseCoord[1] = coordValues[3]!;
      const localY = baseCoord[1]! - this.origin[1]!;
      if (this.trimBranches(localY)) {
        this.limb(baseCoord, endCoord, Tile.treeTrunk.id);
      }
    }
  }

  private checkLine(start: number[], end: number[]): number {
    const level = this.thisLevel!;
    const delta = [0, 0, 0];
    let primidx = 0;
    for (let idx = 0; idx < 3; idx++) {
      delta[idx] = end[idx]! - start[idx]!;
      if (Math.abs(delta[idx]!) > Math.abs(delta[primidx]!)) primidx = idx;
    }
    if (delta[primidx] === 0) return -1;
    const secidx1 = this.axisConversionArray[primidx]!;
    const secidx2 = this.axisConversionArray[primidx + 3]!;
    const primsign = delta[primidx]! > 0 ? 1 : -1;
    const secfac1 = f(delta[secidx1]! / delta[primidx]!);
    const secfac2 = f(delta[secidx2]! / delta[primidx]!);
    const coordinate = [0, 0, 0];
    let primoffset = 0;
    const endoffset = delta[primidx]! + primsign;
    while (primoffset !== endoffset) {
      coordinate[primidx] = start[primidx]! + primoffset;
      coordinate[secidx1] = floorF(start[secidx1]! + f(primoffset * secfac1));
      coordinate[secidx2] = floorF(start[secidx2]! + f(primoffset * secfac2));
      const thismat = level.getTile(coordinate[0]!, coordinate[1]!, coordinate[2]!);
      if (!(thismat === 0 || thismat === Tile.leaves.id)) {
        break;
      }
      primoffset += primsign;
    }
    if (primoffset === endoffset) {
      return -1;
    } else {
      return Math.abs(primoffset);
    }
  }

  private checkLocation(): boolean {
    const o = this.origin;
    const startPosition = [o[0]!, o[1]!, o[2]!];
    const endPosition = [o[0]!, o[1]! + this.height - 1, o[2]!];
    const baseMaterial = this.thisLevel!.getTile(o[0]!, o[1]! - 1, o[2]!);
    if (!(baseMaterial === 2 || baseMaterial === 3)) {
      return false;
    }
    const allowedHeight = this.checkLine(startPosition, endPosition);
    if (allowedHeight === -1) {
      return true;
    } else if (allowedHeight < 6) {
      return false;
    } else {
      this.height = allowedHeight;
      return true;
    }
  }

  override init(heightInit: number, widthInit: number, foliageDensityInit: number): void {
    this.heightVariance = Math.trunc(f(f(heightInit) * 12));
    if (heightInit > 0.5) this.foliageHeight = 5;
    this.widthScale = f(widthInit);
    this.foliageDensity = f(foliageDensityInit);
  }

  place(level: Level, random: Random, x: number, y: number, z: number): boolean {
    this.thisLevel = level;
    const seed = random.nextLong() | 0; // int seed = random->nextLong()（C++ 的 nextLong 返回 genrand_int32() >> 1）
    this.rnd.setSeed(seed);
    this.origin = [x, y, z];
    if (this.height === 0) {
      this.height = 5 + this.rnd.nextInt(this.heightVariance);
    }
    if (!this.checkLocation()) {
      return false;
    }
    this.prepare();
    this.makeFoliage();
    this.makeTrunk();
    this.makeBranches();
    return true;
  }
}
