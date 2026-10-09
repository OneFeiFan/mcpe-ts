// 1:1 移植自 src/world/item/ItemInstance.h 与 ItemInstance.cpp
import { I18n } from '@mcpe/locale';
import { CompoundTag } from '@mcpe/nbt';
import type { Entity } from '../entity/Entity';
import type { Mob } from '../entity/Mob';
import type { Player } from '../entity/player/Player';
import type { Level } from '../level/Level';
import type { Tile } from '../level/tile/Tile';
import { Item } from './Item';
import { UseAnim } from './UseAnim';

export class ItemInstance {
  public count: number = 0;
  public id: number = 0;
  private auxValue: number = 0;

  // ---- 构造函数重载 ----

  constructor();
  constructor(tile: Tile);
  constructor(tile: Tile, count: number);
  constructor(tile: Tile, count: number, auxValue: number);
  constructor(item: Item);
  constructor(item: Item, count: number);
  constructor(item: Item, count: number, auxValue: number);
  constructor(id: number, count: number, damage: number);
  constructor(rhs: ItemInstance);
  constructor(arg0?: unknown, count?: number, auxValue?: number) {
    if (arg0 === undefined) {
      this.init(0, 0, 0);
    } else if (arg0 instanceof ItemInstance) {
      this.id = arg0.id;
      this.count = arg0.count;
      this.auxValue = arg0.auxValue;
    } else if (typeof arg0 === 'number') {
      this.init(arg0, count ?? 0, auxValue ?? 0);
    } else if (typeof arg0 === 'object' && arg0 !== null) {
      // Tile 或 Item，都通过 .id 拿 id
      const id = (arg0 as { id: number }).id;
      this.init(id, count ?? 1, auxValue ?? 0);
    } else {
      this.init(0, 0, 0);
    }
  }

  init(id: number, count: number, damage: number): void {
    this.id = id;
    this.count = count;
    this.auxValue = damage;
  }

  // ---- 空与相等 ----

  isNull(): boolean {
    // 复刻 C++: (id|count|auxValue) == 0
    return (this.id | this.count | this.auxValue) === 0;
  }

  setNull(): void {
    this.id = 0;
    this.count = 0;
    this.auxValue = 0;
  }

  equals(rhs: ItemInstance): boolean {
    return this.id === rhs.id && this.auxValue === rhs.auxValue && this.count === rhs.count;
  }

  matches(b: ItemInstance): boolean {
    return this.id === b.id && this.count === b.count && this.auxValue === b.auxValue;
  }

  static matches(a: ItemInstance | null, b: ItemInstance | null): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return a.matches(b);
  }

  static matchesNulls(a: ItemInstance | null, b: ItemInstance | null): boolean {
    const aNull = !a || a.isNull();
    const bNull = !b || b.isNull();
    if (aNull && bNull) return true;
    if (aNull || bNull) return false;
    return a!.matches(b!);
  }

  sameItem(b: ItemInstance): boolean {
    return this.id === b.id && this.auxValue === b.auxValue;
  }

  // ---- remove：保留原怪异语义 ----

  remove(count: number): ItemInstance {
    // 先修改自身
    this.count -= count;
    // 返回一个 count 为参数值的新实例
    return new ItemInstance(this.id, count, this.auxValue);
  }

  // ---- 委托给 Item 的行为 ----

  getItem(): Item | null {
    return Item.items[this.id] ?? null;
  }

  getIcon(): number {
    return this.getItem()!.getIcon(this.auxValue);
  }

  getDestroySpeed(tile: Tile): number {
    return this.getItem()!.getDestroySpeed(this, tile);
  }

  useOn(
    player: Player,
    level: Level,
    x: number,
    y: number,
    z: number,
    face: number,
    clickX: number,
    clickY: number,
    clickZ: number,
  ): boolean {
    return this.getItem()!.useOn(this, player, level, x, y, z, face, clickX, clickY, clickZ);
  }

  use(level: Level, player: Player): ItemInstance | null {
    return this.getItem()!.use(this, level, player);
  }

  isStackedByData(): boolean {
    return this.getItem()!.isStackedByData();
  }

  isStackable(): boolean {
    return this.getMaxStackSize() > 1 && (!this.isDamageableItem() || !this.isDamaged());
  }

  static isStackable(a: ItemInstance, b: ItemInstance): boolean {
    return (
      a.id === b.id &&
      b.isStackable() &&
      (!b.isStackedByData() || a.getAuxValue() === b.getAuxValue())
    );
  }

  getMaxStackSize(): number {
    return this.getItem()!.getMaxStackSize();
  }

  isDamageableItem(): boolean {
    return this.getItem()!.getMaxDamage() > 0;
  }

  isDamaged(): boolean {
    return this.isDamageableItem() && this.auxValue > 0;
  }

  getDamageValue(): number {
    return this.auxValue;
  }

  getMaxDamage(): number {
    return this.getItem()!.getMaxDamage();
  }

  getAuxValue(): number {
    return this.auxValue;
  }

  setAuxValue(value: number): void {
    this.auxValue = value;
  }

  hurt(i: number): void {
    if (!this.isDamageableItem()) return;

    this.auxValue += i;
    if (this.auxValue > this.getMaxDamage()) {
      this.count--;
      if (this.count < 0) this.count = 0;
      this.auxValue = 0;
    }
  }

  hurtEnemy(mob: Mob): void {
    this.getItem()!.hurtEnemy(this, mob);
  }

  mineBlock(tile: number, x: number, y: number, z: number): void {
    this.getItem()!.mineBlock(this, tile, x, y, z);
  }

  getAttackDamage(entity: Entity): number {
    return this.getItem()!.getAttackDamage(entity);
  }

  canDestroySpecial(tile: Tile): boolean {
    return this.getItem()!.canDestroySpecial(tile);
  }

  snap(player: Player): void {
    // 空实现
  }

  interactEnemy(mob: Mob): void {
    this.getItem()!.interactEnemy(this, mob);
  }

  releaseUsing(level: Level, player: Player, durationLeft: number): void {
    this.getItem()!.releaseUsing(this, level, player, durationLeft);
  }

  getUseDuration(): number {
    return this.getItem()!.getUseDuration(this);
  }

  getUseAnimation(): UseAnim.UseAnimation {
    return this.getItem()!.getUseAnimation();
  }

  useTimeDepleted(level: Level, player: Player): ItemInstance {
    return this.getItem()!.useTimeDepleted(this, level, player);
  }

  // ---- 复制 ----

  copy(): ItemInstance {
    return new ItemInstance(this.id, this.count, this.auxValue);
  }

  static clone(item: ItemInstance | null): ItemInstance | null {
    return item === null ? null : item.copy();
  }

  static cloneSafe(item: ItemInstance | null): ItemInstance {
    return item ? new ItemInstance(item) : new ItemInstance();
  }

  // ---- NBT 序列化 ----

  save(compoundTag: CompoundTag): CompoundTag {
    compoundTag.putShort('id', this.id);
    // 复刻 C++: (unsigned char) count，写低 8 位
    compoundTag.putByte('Count', this.count & 0xff);
    compoundTag.putShort('Damage', this.auxValue);
    return compoundTag;
  }

  load(compoundTag: CompoundTag): void {
    this.id = compoundTag.getShort('id');
    // 复刻 C++: (unsigned char) getByte(...)
    this.count = compoundTag.getByte('Count') & 0xff;
    this.auxValue = compoundTag.getShort('Damage');
  }

  static fromTag(tag: CompoundTag): ItemInstance | null {
    const item = new ItemInstance();
    item.load(tag);
    if (item.getItem() === null) {
      return null;
    }
    return item;
  }

  // ---- 显示 ----

  getDescriptionId(): string {
    return this.id ? this.getItem()!.getDescriptionId(this) : 'EmptyItemInstance';
  }

  setDescriptionId(_id: string): ItemInstance {
    return this;
  }

  getName(): string {
    return I18n.get(this.getDescriptionId() + '.name');
  }

  toString(): string {
    return `${this.count} x ${this.getDescriptionId()}(${this.id})@${this.auxValue}`;
  }

  // ---- 静态查询 ----

  static isArmorItem(instance: ItemInstance | null): boolean {
    if (!instance) return false;
    const item = instance.getItem();
    if (!item) return false;
    return item.isArmor();
  }

  static isBlock(instance: ItemInstance): boolean {
    return instance.id < 256;
  }
}
