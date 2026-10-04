/**
 * 1:1 移植自 src/world/entity/Motive.h 与 .cpp（136 行）。画作尺寸/贴图表。
 *
 * 【⚠ 两个顺序陷阱，弄错一处随机画作分布就变了】
 *   1. `getAllMotivesAsList()` 的返回顺序**和成员声明顺序不一样** ——
 *      列表里 **`Aztec2` 排在 `Alban` 前面**（声明顺序是 Alban 再 Aztec2）。
 *      `Painting.setRandomMotive` 的随机下标就建立在这个顺序上。
 *   2. **`Aztec` 根本不在列表里**。它声明了、也被 `getMotiveByName` 的遍历源排除在外 ——
 *      于是 `getMotiveByName("Aztec")` 找不到，会返回 `DefaultImage`（= Kebab）。
 *      这是原样行为，别"顺手"补进去。
 *
 * 【isPublic = false 的四张】（Earth/Wind/Fire/Water）不会被 `setRandomMotive` 选中，
 * 但它们**在列表里**，所以照样占下标。
 */
export class Motive {
  static readonly MAX_MOTIVE_NAME_LENGTH = 13;

  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly uo: number;
  readonly vo: number;
  readonly isPublic: boolean;

  constructor(name: string, w: number, h: number, uo: number, vo: number, isPublic = true) {
    this.name = name;
    this.w = w;
    this.h = h;
    this.uo = uo;
    this.vo = vo;
    this.isPublic = isPublic;
  }

  // ---- 静态实例（声明顺序照 C++；`DefaultImage` 必须排在 Kebab 之后） ----
  static readonly Kebab = new Motive('Kebab', 16, 16, 0 * 16, 0 * 16);
  static readonly Aztec = new Motive('Aztec', 16, 16, 1 * 16, 0 * 16);
  static readonly Alban = new Motive('Alban', 16, 16, 2 * 16, 0 * 16);
  static readonly Aztec2 = new Motive('Aztec2', 16, 16, 3 * 16, 0 * 16);
  static readonly Bomb = new Motive('Bomb', 16, 16, 4 * 16, 0 * 16);
  static readonly Plant = new Motive('Plant', 16, 16, 5 * 16, 0 * 16);
  static readonly Wasteland = new Motive('Wasteland', 16, 16, 6 * 16, 0 * 16);
  static readonly Pool = new Motive('Pool', 32, 16, 0 * 16, 2 * 16);
  static readonly Courbet = new Motive('Courbet', 32, 16, 2 * 16, 2 * 16);
  static readonly Sea = new Motive('Sea', 32, 16, 4 * 16, 2 * 16);
  static readonly Sunset = new Motive('Sunset', 32, 16, 6 * 16, 2 * 16);
  static readonly Creebet = new Motive('Creebet', 32, 16, 8 * 16, 2 * 16);
  static readonly Wanderer = new Motive('Wanderer', 16, 32, 0 * 16, 4 * 16);
  static readonly Graham = new Motive('Graham', 16, 32, 1 * 16, 4 * 16);
  static readonly Match = new Motive('Match', 32, 32, 0 * 16, 8 * 16);
  static readonly Bust = new Motive('Bust', 32, 32, 2 * 16, 8 * 16);
  static readonly Stage = new Motive('Stage', 32, 32, 4 * 16, 8 * 16);
  static readonly Void = new Motive('Void', 32, 32, 6 * 16, 8 * 16);
  static readonly SkullAndRoses = new Motive('SkullAndRoses', 32, 32, 8 * 16, 8 * 16);
  static readonly Fighters = new Motive('Fighters', 64, 32, 0 * 16, 6 * 16);
  static readonly Pointer = new Motive('Pointer', 64, 64, 0 * 16, 12 * 16);
  static readonly Pigscene = new Motive('Pigscene', 64, 64, 4 * 16, 12 * 16);
  static readonly BurningSkull = new Motive('BurningSkull', 64, 64, 8 * 16, 12 * 16);
  static readonly Skeleton = new Motive('Skeleton', 64, 48, 12 * 16, 4 * 16);
  static readonly DonkeyKong = new Motive('DonkeyKong', 64, 48, 12 * 16, 7 * 16);
  static readonly Earth = new Motive('Earth', 32, 32, 0 * 16, 10 * 16, false);
  static readonly Wind = new Motive('Wind', 32, 32, 2 * 16, 10 * 16, false);
  static readonly Fire = new Motive('Fire', 32, 32, 4 * 16, 10 * 16, false);
  static readonly Water = new Motive('Water', 32, 32, 6 * 16, 10 * 16, false);
  static readonly DefaultImage = Motive.Kebab;

  /**
   * C++ `static std::vector<const Motive*> Motive::getAllMotivesAsList()`。
   *
   * ⚠ 这个顺序是**逐个从 C++ 抄下来的**，不是按上面声明顺序生成的：
   *   `Aztec2` 在 `Alban` 前、**`Aztec` 不在里面**（见文件头）。
   */
  static getAllMotivesAsList(): Motive[] {
    return [
      Motive.Kebab,
      Motive.Aztec2,
      Motive.Alban,
      Motive.Bomb,
      Motive.Plant,
      Motive.Wasteland,
      Motive.Pool,
      Motive.Courbet,
      Motive.Sea,
      Motive.Sunset,
      Motive.Creebet,
      Motive.Wanderer,
      Motive.Graham,
      Motive.Match,
      Motive.Bust,
      Motive.Stage,
      Motive.Void,
      Motive.SkullAndRoses,
      Motive.Fighters,
      Motive.Pointer,
      Motive.Pigscene,
      Motive.BurningSkull,
      Motive.Skeleton,
      Motive.DonkeyKong,
      Motive.Earth,
      Motive.Wind,
      Motive.Fire,
      Motive.Water,
    ];
  }

  /** C++ `static const Motive* Motive::getMotiveByName(const std::string&)` */
  static getMotiveByName(name: string): Motive {
    const allMovies = Motive.getAllMotivesAsList();
    for (const m of allMovies) {
      if (m.name === name) return m;
    }
    return Motive.DefaultImage;
  }
}
