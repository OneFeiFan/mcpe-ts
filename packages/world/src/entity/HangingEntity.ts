/**
 * 1:1 移植自 src/world/entity/HangingEntity.h 与 .cpp（269 行）。抽象基类。
 *
 * 挂在墙上的东西（画、物品展示框…）的公共部分：贴在**方块格**上（`xTile/yTile/zTile`），
 * 每 5 秒检查一次还挂不挂得住（`survives()`），挂不住就掉下来（`dropItem` + `remove`）。
 *
 * 【四处必须原样保留的怪癖】
 *   1. **构造函数收到的 `dir` 参数被丢弃**：五参构造只把 xTile/yTile/zTile 存进初始化列表，
 *      然后调 `init()` —— 而 `init()` 里有一句 `dir = 0`，把刚传进来的方向**覆盖掉了**。
 *      所以新建出来的挂件方向永远是 0（SOUTH），要摆正得另外调 `setDir`。
 *   2. `survives()` 里"有没有别的挂件重叠"那段循环写在 **`for (ss...)` 里面**，不是外面 ——
 *      于是同一个检查会被重复做 `ws` 次。照抄，别"优化"出去。
 *   3. NBT **同时写 `"Direction"` 和 `"Dir"`**（两个字节，值还不一样：Dir 是 0..3 的重映射），
 *      读的时候**优先 `"Direction"`**，没有才看 `"Dir"`。
 *   4. `move()` 和 `push()` 的函数体**一模一样**，C++ 里就是抄了两遍的。
 *
 * 【`tick()` 不调 `super.tick()`】所以 `baseTick` 那套（着火、入水）不跑 —— 和 FallingTile/PrimedTnt 一致。
 *
 * 【`getBrightness` 里局部变量遮蔽了成员】C++ 写的是 `int xTile = Mth::floor(x);`，
 * 与成员 `xTile` 同名 —— 它**故意**用的是局部那个（实体当前位置的格子，不是挂的格子）。
 * 这里保持同名 + 注释，别重命名成别的（改了看不出差别，但就不是原句了）。
 */
import { Mth } from '@mcpe/util';
import type { CompoundTag } from '@mcpe/nbt';
import { Direction } from '../Direction';
import { Entity } from './Entity';
import { Item } from '../item/Item';
import { Player } from './player/Player';
import type { Level } from '../level/Level';

const f = Math.fround;

export abstract class HangingEntity extends Entity {
  /** C++ `int dir;` */
  public dir!: number;
  public xTile!: number;
  public yTile!: number;
  public zTile!: number;
  private checkInterval!: number;

  /** C++ `HangingEntity(Level*)` */
  constructor(level: Level);
  /** C++ `HangingEntity(Level*, int xTile, int yTile, int zTile, int dir)` */
  constructor(level: Level, xTile: number, yTile: number, zTile: number, dir: number);
  constructor(level: Level, xTile?: number, yTile?: number, zTile?: number, _dir?: number) {
    super(level);
    // C++ 的初始化列表只存了 xTile/yTile/zTile；见文件头第 1 条，dir 随后被 init() 覆盖
    this.xTile = xTile ?? 0;
    this.yTile = yTile ?? 0;
    this.zTile = zTile ?? 0;
    this.init();
  }

  /** C++ `void HangingEntity::setPosition(int x, int y, int z)` —— 注意不是 Entity 的 setPos */
  setPosition(x: number, y: number, z: number): void {
    this.xTile = x;
    this.yTile = y;
    this.zTile = z;
  }

  /** C++ `void HangingEntity::init()` */
  init(): void {
    this.heightOffset = 0;
    this.setSize(f(0.5), f(0.5));
    this.dir = 0;
    this.checkInterval = 0;
  }

  /** C++ `void HangingEntity::setDir(int dir)` */
  setDir(dir: number): void {
    this.dir = dir;
    this.yRotO = this.yRot = dir * 90;
    let w = this.getWidth();
    let h = this.getHeight();
    let d = this.getWidth();
    if (dir === Direction.NORTH || dir === Direction.SOUTH) {
      d = f(2.0);
      this.yRot = this.yRotO = Direction.DIRECTION_OPPOSITE[dir]! * 90;
    } else {
      w = f(2.0);
    }
    w = f(w / f(32.0));
    h = f(h / f(32.0));
    d = f(d / f(32.0));
    let x = f(this.xTile + f(0.5));
    let y = f(this.yTile + f(0.5));
    let z = f(this.zTile + f(0.5));
    const offset = f(f(0.5) + f(f(1.0) / f(16.0)));
    if (dir === Direction.NORTH) z = f(z - offset);
    if (dir === Direction.WEST) x = f(x - offset);
    if (dir === Direction.SOUTH) z = f(z + offset);
    if (dir === Direction.EAST) x = f(x + offset);
    if (dir === Direction.NORTH) x = f(x - this.offs(this.getWidth()));
    if (dir === Direction.WEST) z = f(z + this.offs(this.getWidth()));
    if (dir === Direction.SOUTH) x = f(x + this.offs(this.getWidth()));
    if (dir === Direction.EAST) z = f(z - this.offs(this.getWidth()));
    y = f(y + this.offs(this.getHeight()));
    this.setPos(x, y, z);
    const ss = f(-f(f(0.5) / f(16.0)));
    this.bb.set(
      f(f(x - w) - ss),
      f(f(y - h) - ss),
      f(f(z - d) - ss),
      f(f(x + w) + ss),
      f(f(y + h) + ss),
      f(f(z + d) + ss),
    );
  }

  /** C++ `float HangingEntity::offs(int w)` —— 两个分支返回同一个值，但就是这么写的 */
  private offs(w: number): number {
    if (w === 32) return f(0.5);
    if (w === 64) return f(0.5);
    return 0;
  }

  /** C++ `void HangingEntity::tick()` —— 整体重写，**不调 super.tick()** */
  override tick(): void {
    // 注意是**后置自增**：比的是自增之前的值
    if (this.checkInterval++ === 20 * 5 && !this.level.isClientSide) {
      this.checkInterval = 0;
      if (!this.removed && !this.survives()) {
        this.remove();
        this.dropItem();
      }
    }
  }

  /** C++ `bool HangingEntity::survives()` */
  survives(): boolean {
    if (this.level.getCubes(this, this.bb).length !== 0) {
      return false;
    } else {
      const ws = Mth.Max(1, Math.trunc(this.getWidth() / 16));
      const hs = Mth.Max(1, Math.trunc(this.getHeight() / 16));
      let xt = this.xTile;
      let yt = this.yTile;
      let zt = this.zTile;
      if (this.dir === Direction.NORTH) xt = Mth.floor(f(this.x - f(this.getWidth() / f(32.0))));
      if (this.dir === Direction.WEST) zt = Mth.floor(f(this.z - f(this.getWidth() / f(32.0))));
      if (this.dir === Direction.SOUTH) xt = Mth.floor(f(this.x - f(this.getWidth() / f(32.0))));
      if (this.dir === Direction.EAST) zt = Mth.floor(f(this.z - f(this.getWidth() / f(32.0))));
      yt = Mth.floor(f(this.y - f(this.getHeight() / f(32.0))));
      for (let ss = 0; ss < ws; ++ss) {
        for (let yy = 0; yy < hs; ++yy) {
          let m;
          if (this.dir === Direction.NORTH || this.dir === Direction.SOUTH) {
            m = this.level.getMaterial(xt + ss, yt + yy, this.zTile);
          } else {
            m = this.level.getMaterial(this.xTile, yt + yy, zt + ss);
          }
          if (!m.isSolid()) return false;
        }
        // ⚠ 这一段在 for (ss) **里面**，会被重复做 ws 次 —— 原样，见文件头第 2 条
        const entities = this.level.getEntities(this, this.bb);
        for (const entity of entities) {
          if (entity.isHangingEntity()) return false;
        }
      }
    }
    return true;
  }

  /** C++ `bool HangingEntity::isHangingEntity()` */
  override isHangingEntity(): boolean {
    return true;
  }

  /** C++ `bool HangingEntity::isPickable()` */
  override isPickable(): boolean {
    return true;
  }

  /** C++ `bool HangingEntity::interact(Player*)` */
  override interact(player: Player): boolean {
    if (!this.removed && !this.level.isClientSide) {
      if (
        player !== null &&
        player.inventory !== null &&
        player.inventory.getSelected() !== null &&
        player.inventory.getSelected()!.id === Item.bow.id
      )
        return false;
      this.remove();
      this.markHurt();
      if (player !== null && !player.abilities.instabuild) this.dropItem();
      return true;
    } else {
      return !this.removed;
    }
  }

  /** C++ `void HangingEntity::move(float, float, float)` */
  override move(xa: number, ya: number, za: number): void {
    if (
      !this.level.isClientSide &&
      !this.removed &&
      f(f(xa * xa) + f(f(ya * ya) + f(za * za))) > 0
    ) {
      this.dropItem();
      this.remove();
    }
  }

  /** C++ `void HangingEntity::push(float, float, float)` —— 函数体与 move 一模一样，原样 */
  override push(e: Entity): void;
  override push(xa: number, ya: number, za: number): void;
  override push(a: number | Entity, b?: number, c?: number): void {
    // C++ 只重写了三参那个；一参的 `push(Entity*)` 走不到这里（基类那两个重载在 JS 里是一条原型链）。
    // 两个重载在 Entity 里本来是分开的（R10 情形 B），这里按同一套分派写。
    const xa = typeof a === 'number' ? a : 0;
    const ya = typeof a === 'number' ? b! : 0;
    const za = typeof a === 'number' ? c! : 0;
    if (
      !this.level.isClientSide &&
      !this.removed &&
      f(f(xa * xa) + f(f(ya * ya) + f(za * za))) > 0
    ) {
      this.dropItem();
      this.remove();
    }
  }

  /** C++ `void HangingEntity::addAdditonalSaveData(CompoundTag*)` —— 注意拼写 */
  protected override addAdditonalSaveData(tag: CompoundTag): void {
    // ⚠ 两个键都写，值还不一样（Dir 是 0..3 的重映射），见文件头第 3 条
    tag.putByte('Direction', (this.dir << 24) >> 24);
    tag.putInt('TileX', this.xTile);
    tag.putInt('TileY', this.yTile);
    tag.putInt('TileZ', this.zTile);
    switch (this.dir) {
      case Direction.NORTH:
        tag.putByte('Dir', 0);
        break;
      case Direction.WEST:
        tag.putByte('Dir', 1);
        break;
      case Direction.SOUTH:
        tag.putByte('Dir', 2);
        break;
      case Direction.EAST:
        tag.putByte('Dir', 3);
        break;
    }
  }

  /** C++ `void HangingEntity::readAdditionalSaveData(CompoundTag*)` */
  protected override readAdditionalSaveData(tag: CompoundTag): void {
    if (tag.contains('Direction')) {
      this.dir = tag.getByte('Direction');
    } else {
      switch (tag.getByte('Dir')) {
        case 0:
          this.dir = Direction.NORTH;
          break;
        case 1:
          this.dir = Direction.WEST;
          break;
        case 2:
          this.dir = Direction.SOUTH;
          break;
        case 3:
          this.dir = Direction.EAST;
          break;
      }
    }
    this.xTile = tag.getInt('TileX');
    this.yTile = tag.getInt('TileY');
    this.zTile = tag.getInt('TileZ');
    this.setDir(this.dir);
  }

  /** C++ `float HangingEntity::getBrightness(float a)` */
  override getBrightness(_a: number): number {
    // ⚠ 这两个局部变量**遮蔽**了同名成员，原句如此：用的是实体当前位置的格子，不是挂的格子
    const xTile = Mth.floor(this.x);
    const zTile = Mth.floor(this.z);
    if (this.level.hasChunkAt(xTile, 0, zTile)) {
      const yTile = Mth.floor(this.y);
      return this.level.getBrightness(xTile, yTile, zTile);
    }
    return 0;
  }

  /** C++ `bool HangingEntity::hurt(Entity* source, int damage)` */
  override hurt(source: Entity | null, _damage: number): boolean {
    if (!this.removed && !this.level.isClientSide) {
      this.remove();
      this.markHurt();
      const player = Player.asPlayer(source);
      if (player !== null && player.abilities.instabuild) {
        return true;
      }
      this.dropItem();
    }
    return true;
  }

  /** C++ `virtual int getWidth() = 0` */
  abstract getWidth(): number;
  /** C++ `virtual int getHeight() = 0` */
  abstract getHeight(): number;
  /** C++ `virtual void dropItem() = 0` */
  abstract dropItem(): void;
}
