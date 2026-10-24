/**
 * 1:1 移植自 src/world/level/dimension/Dimension.h 与 Dimension.cpp（S4），同时包含 NormalDayCycleDimension.h 与 DimensionFactory。
 * 替换原来的 FORWARD-DECL(Dimension)。
 *
 * 【C-6 起 createRandomLevelSource 是真调用】它 new 的就是移植好的 `RandomLevelSource`（C-2~C-5），
 *   原来是 DEFERRED(Levelgen) 的 throw。demo 的 FlatDimension（S5）仍然重写它返回 FlatChunkSource。
 *
 * 【C++ 的重载】init(Level*) 是 public，init() 是 protected，TS 只能有一个同名方法，按约定把无参版本写成 initDimension()；
 *   子类要重写 C++ 的 init() 时重写 initDimension。
 * 【ADAPTED(ESM)】NormalDayCycleDimension 继承 Dimension，而 Dimension.getNew 又要 new 它：放在两个文件里会形成模块循环，
 *   加载时触发 TDZ。所以把它定义在本文件，NormalDayCycleDimension.ts 只做转出口，import 路径与 C++ 仍然对应。
 * 【C++ 的未初始化字段】FogType 没有初始化，分支里也没有任何地方给它赋值；这里取 0，即默认的 PE 雾色和天空色。
 * 【三档规则】天空、雾、日出颜色只影响画面；getTimeOfDay 决定天色变暗程度，按 C++ 的 float 语义计算。
 *   C++ 里直接调用 C 库 cos 的地方写成 Math.cos，调用 Mth::cos 的地方写成 Mth.cos（查表），两者结果不同。
 */
import { Mth } from '@mcpe/util';
import { Vec3 } from '../../phys/Vec3';
import { BiomeSource } from '../biome/BiomeSource';
import type { ChunkSource } from '../chunk/ChunkSource';
import { Level } from '../Level';
import { GameType } from '../LevelSettings';
import { RandomLevelSource } from '../levelgen/RandomLevelSource';
import type { LevelData } from '../storage/LevelData';
import { Tile } from '../tile/Tile';

const f = Math.fround;

export class Dimension {
  // OMIT(Dimension): ~Dimension() { delete biomeSource; }  Dimension.cpp:23 —— JS 由 GC 接管（R3）
  static readonly NORMAL = 0;
  static readonly NORMAL_DAYCYCLE = 10;

  level!: Level; // C++ 的 Level* level 也不在初始化列表里，init() 之前不读
  biomeSource: BiomeSource = null!; // C++ 初值 NULL，init() 之后才有
  foggy = false;
  ultraWarm = false;
  hasCeiling = false;
  readonly brightnessRamp = new Float32Array(16); // [Level::MAX_BRIGHTNESS + 1]；C++ 未初始化，init() 会填满
  id = 0;
  // ADAPTED(Safety): C++ Dimension.h:54 的 FogType 没有初始化（运行时由 Minecraft.cpp:1481 赋值）；
  // 取 0 = 默认的 PE 雾色，避免读到未定义值。
  FogType = 0; // lets us choose between what fog we want ig
  protected fogColor = 0x80daff; // long
  protected readonly sunriseCol = new Float32Array(4);

  init(level: Level): void {
    this.level = level;
    this.initDimension();
    this.updateLightRamp();
  }

  /** C++ 的 protected virtual void init() */
  protected initDimension(): void {
    this.biomeSource = new BiomeSource(this.level);
  }

  createRandomLevelSource(): ChunkSource {
    return new RandomLevelSource(
      this.level,
      this.level.getSeed(),
      this.level.getLevelData().getGeneratorVersion(),
      !this.level.isClientSide && this.level.getLevelData().getSpawnMobs(),
    );
  }

  isValidSpawn(x: number, z: number): boolean {
    const topTile = this.level.getTopTile(x, z);
    if (topTile === Tile.invisible_bedrock.id) return false;
    if (!Tile.tiles[topTile]!.isSolidRender()) return false;
    return true;
  }

  isNaturalDimension(): boolean {
    return false;
  }

  getTimeOfDay(_time: number, _a: number): number {
    return 1;
  }

  protected updateLightRamp(): void {
    const ambientLight = f(0.05);
    for (let i = 0; i <= 15; /*Level::MAX_BRIGHTNESS;*/ i++) {
      const v = f(1 - f(i / 16));
      // brightnessRamp[i] = ((1 - v) / (v * 3 + 1)) * (1 - ambientLight) + ambientLight * 3;
      this.brightnessRamp[i] = f(
        f(f(f(1 - v) / f(f(v * 3) + 1)) * f(1 - ambientLight)) + f(ambientLight * 3),
      );
    }
  }

  /** @return C++ 返回成员数组 sunriseCol（复用），不在日出日落时返回 null */
  getSunriseColor(td: number, _a: number): Float32Array | null {
    td = f(td); // C++ 形参是 float，入口先舍入
    const span = f(0.4);
    const tt = f(Mth.cos(f(f(td * Mth.PI) * 2)) - 0.0);
    const mid = -0.0;
    if (tt >= f(mid - span) && tt <= f(mid + span)) {
      const aa = f(f(f(f(tt - mid) / span) * f(0.5)) + f(0.5));
      let mix = f(1 - f(f(1 - Mth.sin(f(aa * Mth.PI))) * f(0.99)));
      mix = f(mix * mix);
      this.sunriseCol[0] = f(f(aa * f(0.3)) + f(0.7));
      this.sunriseCol[1] = f(f(f(aa * aa) * f(0.7)) + f(0.2));
      this.sunriseCol[2] = f(f(f(aa * aa) * 0.0) + f(0.2));
      this.sunriseCol[3] = mix;
      return this.sunriseCol;
    }
    return null;
  }

  getFogColor(td: number, _a: number): Vec3 {
    td = f(td); // C++ 形参是 float，入口先舍入
    this.selectFogColor();
    let br = f(f(Mth.cos(f(f(td * Mth.PI) * 2)) * 2) + f(0.5));
    if (br < 0.0) br = 0.0;
    if (br > 1.0) br = 1.0;
    return this.fogVec(br);
  }

  mayRespawn(): boolean {
    return true;
  }

  static getNew(id: number): Dimension | null {
    if (id === Dimension.NORMAL) return new Dimension();
    if (id === Dimension.NORMAL_DAYCYCLE) return new NormalDayCycleDimension();
    return null;
  }

  getDimension(): string {
    const currentID = this.id;
    if (currentID === Dimension.NORMAL) return 'Overworld';
    if (currentID === Dimension.NORMAL_DAYCYCLE) return 'Overworld';
    return 'Unknown';
  }

  /** Dimension.cpp 与 NormalDayCycleDimension.h 里完全相同的一段：按 FogType 选雾色 */
  // ADAPTED(Cpp): 把两份重复的雾色计算拆成 selectFogColor/fogVec 两个 helper，行为与原句逐步一致。
  protected selectFogColor(): void {
    if (this.FogType === 1) {
      this.fogColor = 0xc0d8ff; // 1 returns java beta styled fog color.
    } else if (this.FogType === 2) {
      this.fogColor = 0x406fe5; // 2 returns some type of unused fog color
    } else {
      this.fogColor = 0x80daff; // otherwise as default we return the mcpe fog color
    }
  }

  /** 两份 getFogColor 里完全相同的后半段 */
  protected fogVec(br: number): Vec3 {
    let r = f(((this.fogColor >> 16) & 0xff) / 255.0);
    let g = f(((this.fogColor >> 8) & 0xff) / 255.0);
    let b = f((this.fogColor & 0xff) / 255.0);
    const rf = f(f(br * f(0.94)) + f(0.06));
    const gf = f(f(br * f(0.94)) + f(0.06));
    const bf = f(f(br * f(0.91)) + f(0.09));
    r = f(r * rf);
    g = f(g * gf);
    b = f(b * bf);
    return new Vec3(r, g, b);
  }
}

/** 1:1 移植自 src/world/level/dimension/NormalDayCycleDimension.h（生存模式用的有昼夜的主世界） */
export class NormalDayCycleDimension extends Dimension {
  override getTimeOfDay(time: number, a: number): number {
    a = f(a); // C++ 形参是 float，入口先舍入
    const dayStep = (time % Level.TICKS_PER_DAY) | 0; // (int) (time % Level::TICKS_PER_DAY)
    let td = f(f(f(dayStep + a) / Level.TICKS_PER_DAY) - f(0.25));
    if (td < 0) td = f(td + 1);
    if (td > 1) td = f(td - 1);
    const tdo = td;
    // C 库 cos：未加 std:: 的 cos 在全局命名空间里只有 ::cos(double)（<cmath> 的 float 重载在 std:: 里），
    // 实参按 float 算好后提升为 double，整个表达式在 double 里算完再赋回 float。s4 黄金样本逐位验证。
    td = f(1 - (Math.cos(f(td * Mth.PI)) + 1) * f(0.5));
    return f(tdo + f(f(td - tdo) / 3));
  }

  override getFogColor(td: number, _a: number): Vec3 {
    td = f(td); // C++ 形参是 float，入口先舍入
    this.selectFogColor();
    // C 库 cos（::cos(double)，说明见 getTimeOfDay）：实参按 float 算，结果在 double 里乘加后赋回 float
    let br = f(Math.cos(f(f(td * Mth.PI) * 2)) * 2 + f(0.5));
    if (br < 0) br = 0;
    if (br > 1) br = 1;
    return this.fogVec(br);
  }
}

/** 1:1 移植自 Dimension.h / Dimension.cpp 里的 DimensionFactory */
export class DimensionFactory {
  static createDefaultDimension(data: LevelData): Dimension | null {
    let dimensionId = Dimension.NORMAL;
    switch (data.getGameType()) {
      case GameType.Survival:
        dimensionId = Dimension.NORMAL_DAYCYCLE;
        break;
      case GameType.Creative:
      default:
        dimensionId = Dimension.NORMAL;
        break;
    }
    return Dimension.getNew(dimensionId);
  }
}
