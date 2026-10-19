/**
 * 1:1 移植自 src/world/entity/Painting.h 与 .cpp（103 行）。继承 `HangingEntity`。
 *
 * 一幅画：贴墙的格子（xTile/yTile/zTile）+ 朝向 + 一张画作（`Motive`）。
 *
 * 【`setRandomMotive` 的随机下标建立在一个**逐个数过的 28 项列表**上】
 * `Motive.getAllMotivesAsList()` 的顺序和声明顺序不同（`Aztec2` 在 `Alban` 前、`Aztec` 根本不在），
 * 列表顺序错一位，随机画作分布就变了 —— 见 Motive.ts 文件头。
 *
 * 【两处原样保留】
 *   1. 两个构造函数的**公共部分**不是抽出来的：`setRandomMotive` 只在五参构造里调，
 *      `entityRendererId` 则三处各写一遍。
 *   2. 五参构造收到的是画作**名字**（不是 Motive 对象），查不到就落到 `DefaultImage`。
 *
 * 【随机源是 `Entity.sharedRandom`】不是 `level.random` —— `setRandomMotive` 里那句
 * `sharedRandom.nextInt(...)` 用的是 Entity 的静态随机数（`Entity.cpp:13` 里按时间播种的）。
 */
import type { CompoundTag } from '@mcpe/nbt';
import { Entity } from './Entity';
import { EntityRendererId } from './EntityRendererId';
import { EntityTypes } from './EntityTypes';
import { HangingEntity } from './HangingEntity';
import { Motive } from './Motive';
import { GameType } from '../level/LevelSettings';
import { Item } from '../item/Item';
import type { Level } from '../level/Level';

export class Painting extends HangingEntity {
  /** C++ `const Motive* motive;` */
  // ADAPTED(Cpp)：C++ 的单参构造不初始化它（UB，PITFALLS #20），TS 取 null；
  // 这样 `addAdditonalSaveData` 里照抄的 `motive != NULL` 守卫才有意义。
  public motive: Motive | null = null;

  /** C++ `Painting(Level*)` */
  constructor(level: Level);
  /** C++ `Painting(Level*, int xTile, int yTile, int zTile, int dir)` */
  constructor(level: Level, xTile: number, yTile: number, zTile: number, dir: number);
  /** C++ `Painting(Level*, int x, int y, int z, int dir, const std::string& motiveName)` */
  constructor(level: Level, x: number, y: number, z: number, dir: number, motiveName: string);
  constructor(level: Level, x?: number, y?: number, z?: number, dir?: number, motiveName?: string) {
    super(level, x ?? 0, y ?? 0, z ?? 0, dir ?? 0);
    if (motiveName !== undefined) {
      // 第三支：按名字查画作；查不到就是 DefaultImage（见 Motive.getMotiveByName）
      this.motive = Motive.getMotiveByName(motiveName);
      this.setDir(dir!);
    } else if (x !== undefined) {
      this.setRandomMotive(dir!);
    }
    this.entityRendererId = EntityRendererId.ER_PAINTING_RENDERER;
  }

  /** C++ `void Painting::setRandomMotive(int dir)` */
  setRandomMotive(dir: number): void {
    const allMotives = Motive.getAllMotivesAsList();
    const survivableMotives: Motive[] = [];
    for (const m of allMotives) {
      if (!m.isPublic) continue;
      this.motive = m;
      this.setDir(dir);
      if (this.survives()) {
        survivableMotives.push(m);
      }
    }
    if (survivableMotives.length !== 0) {
      this.motive = survivableMotives[Entity.sharedRandom.nextInt(survivableMotives.length)]!;
      this.setDir(dir);
    } else {
      this.motive = Motive.DefaultImage;
      this.setDir(dir);
    }
  }

  /** C++ `int Painting::getWidth()` */
  override getWidth(): number {
    // C++ 直接解引用 motive（未设置时是 UB）；实际调用点都发生在 setRandomMotive/setDir 之后。
    return this.motive!.w;
  }

  /** C++ `int Painting::getHeight()` */
  override getHeight(): number {
    return this.motive!.h;
  }

  /** C++ `void Painting::dropItem()` */
  override dropItem(): void {
    if (this.level.getLevelData().getGameType() !== GameType.Creative)
      this.spawnAtLocation(Item.painting.id, 1);
  }

  /** C++ `int Painting::getEntityTypeId() const` */
  override getEntityTypeId(): number {
    return EntityTypes.IdPainting;
  }

  /** C++ `bool Painting::isPickable()` */
  override isPickable(): boolean {
    return true;
  }

  /** C++ `void Painting::addAdditonalSaveData(CompoundTag*)` —— 注意拼写；C++ 头文件里是 public */
  public override addAdditonalSaveData(tag: CompoundTag): void {
    if (this.motive !== null) {
      tag.putString('Motive', this.motive.name);
    }
    super.addAdditonalSaveData(tag);
  }

  /** C++ `void Painting::readAdditionalSaveData(CompoundTag*)`；C++ 头文件里是 public */
  public override readAdditionalSaveData(tag: CompoundTag): void {
    const motiveName = tag.getString('Motive');
    this.motive = Motive.getMotiveByName(motiveName);
    super.readAdditionalSaveData(tag);
  }
}
