/**
 * 1:1 移植自 src/world/entity/item/FallingTile.h 与 .cpp（D1）。
 *
 * 下落的沙子、沙砾：方块底下被掏空时，`HeavyTile::checkSlide` / `SandTile` 会造一个它出来，
 * 它自由落体到地面再把方块放回去。**在此之前这里只是个 6 行的 FORWARD-DECL 空接口。**
 *
 * 【它不调 `super.tick()`】`tick()` 是整体重写的，所以 **`baseTick` 那套（着火、入水、
 * 掉出世界）一个都不跑** —— 落沙在半空中不会着火，这是原样行为，别"顺手"补上。
 * 本批里 `Arrow` / `Throwable` 反过来是调 `super.tick()` 的，抄的时候别串。
 *
 * 【两处必须原样保留的怪癖】
 *   1. 落地那段是 `if (放置成功) { } else if (!isClientSide) { }` —— **两个分支都是空块**。
 *      原作者把"放不进去时怎么办"的逻辑掏空了，只留下判断本身的副作用（`mayPlace` 与
 *      `setTileAndData` 的调用）。**照抄，别合并不掉**：`setTileAndData` 有副作用，
 *      合并成 `if (mayPlace(...)) setTileAndData(...)` 行为是一样的，但那样就改写了原句。
 *   2. NBT 读回来**没有 `& 0xff`**：`tile = tag.getByte("Tile")` 直接赋给 int。
 *      `getByte` 返回的是有符号 char，所以 tile id 大于 127 的读回来是负数。
 *      （同批的 Arrow / Throwable 读法都带 `& 0xff`，这里不带 —— 不一致是原样，不是笔误。）
 *
 * 【浮点字面量按 C++ 原句的后缀来】`0.98f` / `2.0f` / `0.04f` / `0.7f` / `-0.5f` 都有 `f` 后缀，
 * 所以每个都过 `f()`。见 PITFALLS 第 3 条。
 */
import { SharedConstants } from '@mcpe/core';
import type { CompoundTag } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';
import { Entity } from '../Entity';
import { EntityRendererId } from '../EntityRendererId';
import { EntityTypes } from '../EntityTypes';
import type { Level } from '../../level/Level';

const f = Math.fround;

export class FallingTile extends Entity {
  public tile: number;
  public data: number;
  /**
   * ⚠ 加 `!` 是因为 TS 看不穿"构造函数调了 `init()`，而 `init()` 里给它赋 0"这件事。
   * C++ 的 `time` 也确实**不在构造函数初始化列表里**，全靠 `init()` 那行（FallingTile.cpp）。
   */
  public time!: number;

  /** C++ `FallingTile(Level*)` */
  constructor(level: Level);
  /** C++ `FallingTile(Level*, float x, float y, float z, int tile, int data = 0)` */
  constructor(level: Level, x: number, y: number, z: number, tile: number, data?: number);
  constructor(level: Level, x?: number, y?: number, z?: number, tile?: number, data?: number) {
    super(level);

    // C++ 的初始化列表先置 tile / data，再在函数体里调 init() —— 顺序照抄
    if (x !== undefined) {
      // C++ 形参是 float（W24）：实参先舍入，下面的 setPos 与 xo/xOld 赋的都是舍入后的值
      x = f(x);
      y = f(y!);
      z = f(z!);
      this.tile = tile!;
      this.data = data ?? 0;
      this.init();
      this.setPos(x, y!, z!);
      // C++ 用的是**形参** x/y/z（已经是 float），不是 setPos 之后的成员 —— 两者相等，写法照抄
      this.xo = this.xOld = x;
      this.yo = this.yOld = y!;
      this.zo = this.zOld = z!;
    } else {
      this.tile = 0;
      this.data = 0;
      this.init();
    }
  }

  /** C++ `void FallingTile::init()` */
  init(): void {
    this.entityRendererId = EntityRendererId.ER_FALLINGTILE_RENDERER;
    this.time = 0;
    this.blocksBuilding = true;
    this.setSize(f(0.98), f(0.98));
    this.heightOffset = f(this.bbHeight / f(2));
    this.makeStepSound = false;
    this.xd = 0;
    this.yd = 0;
    this.zd = 0;
  }

  /** C++ `bool FallingTile::isPickable()` */
  override isPickable(): boolean {
    return !this.removed;
  }

  /** C++ `void FallingTile::tick()` —— 整体重写，**不调 super.tick()** */
  override tick(): void {
    if (this.tile === 0) {
      this.remove();
      return;
    }
    this.xo = this.x;
    this.yo = this.y;
    this.zo = this.z;
    this.time++;
    this.yd = f(this.yd - f(0.04));
    this.move(this.xd, this.yd, this.zd);
    this.xd = f(this.xd * f(0.98));
    this.yd = f(this.yd * f(0.98));
    this.zd = f(this.zd * f(0.98));
    if (!this.level.isClientSide) {
      const xt = Mth.floor(this.x);
      const yt = Mth.floor(this.y);
      const zt = Mth.floor(this.z);
      if (this.time === 1) {
        if (this.level.getTile(xt, yt, zt) === this.tile) {
          this.level.setTile(xt, yt, zt, 0);
        } else {
          this.remove();
          return;
        }
      }
      if (this.onGround) {
        this.xd = f(this.xd * f(0.7));
        this.zd = f(this.zd * f(0.7));
        this.yd = f(this.yd * f(-0.5));
        this.remove();
        // ⚠ 这两个分支在原版里就是**空的** —— 只有判断本身的副作用，见文件头第 1 条
        if (
          this.level.mayPlace(this.tile, xt, yt, zt, true, 1) &&
          this.level.setTileAndData(xt, yt, zt, this.tile, this.data)
        ) {
          // 原版空块
        } else if (!this.level.isClientSide) {
          // 原版空块
        }
      } else if (this.time > SharedConstants.TicksPerSecond * 5 && !this.level.isClientSide) {
        this.remove();
      }
    }
  }

  /** C++ `float FallingTile::getShadowHeightOffs()` */
  override getShadowHeightOffs(): number {
    return 0;
  }

  /** C++ `Level* FallingTile::getLevel()` */
  getLevel(): Level {
    return this.level;
  }

  /** C++ `void FallingTile::addAdditonalSaveData(CompoundTag*)` —— 注意拼写 */
  protected override addAdditonalSaveData(tag: CompoundTag): void {
    // C++: putByte("Tile", (char) tile) —— (char) 是有符号的
    tag.putByte('Tile', (this.tile << 24) >> 24);
    tag.putByte('Data', (this.data << 24) >> 24);
    tag.putByte('Time', (this.time << 24) >> 24);
  }

  /** C++ `void FallingTile::readAdditionalSaveData(CompoundTag*)` */
  protected override readAdditionalSaveData(tag: CompoundTag): void {
    // ⚠ 原句就是**不带 `& 0xff`** 的，见文件头第 2 条
    this.tile = tag.getByte('Tile');
    this.data = tag.getByte('Data');
    this.time = tag.getByte('Time');
  }

  /** C++ `int FallingTile::getEntityTypeId() const` */
  override getEntityTypeId(): number {
    return EntityTypes.IdFallingTile;
  }
}
