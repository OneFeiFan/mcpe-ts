/**
 * 1:1 移植自 src/world/level/tile/entity/ChestTileEntity.h 与 ChestTileEntity.cpp（S12 阶段 A 补充）。
 * ADAPTED(Cpp)：C++ 是 TileEntity 与 FillingContainer 的多重继承；这里 extends FillingContainerMixin(TileEntity)，
 *   FillingContainer 构造函数的参数经 initFillingContainer 传入（见 FillingContainer.ts）。
 * ChestTile::ChestTile.EVENT_SET_OPEN_COUNT 来自你在阶段 B 移植的 ChestTile；这里先用同值常量，阶段 C 改为引用 ChestTile。
 * 比较 Tile::chest 的 id 用 idOf（箱子在阶段 C 注册）。C++ 里注释掉的 removeItem、removeItemNoUpdate、setItem 不移植。
 */
import { CompoundTag, ListTag, TAG_Compound } from '@mcpe/nbt';
import { SharedConstants } from '@mcpe/core';
import { Container, ContainerType } from '../../../Container';
import type { Player } from '../../../entity/player/Player';
import { FillingContainerMixin } from '../../../inventory/FillingContainer';
import { ItemInstance } from '../../../item/ItemInstance';
import { ChestTile } from '../ChestTile';
import { Tile } from '../Tile';
import { TileEntity, TileEntityType } from './TileEntity';

export class ChestTileEntity extends FillingContainerMixin(TileEntity) {
  private static readonly ItemsSize = 9 * 3;

  hasCheckedNeighbors = false;
  n: ChestTileEntity | null = null;
  e: ChestTileEntity | null = null;
  w: ChestTileEntity | null = null;
  s: ChestTileEntity | null = null;
  openness = 0;
  oOpenness = 0;
  openCount = 0;
  private tickInterval = 0;

  constructor() {
    super(TileEntityType.Chest);
    this.initFillingContainer(ChestTileEntity.ItemsSize, 0, ContainerType.CONTAINER, false);
  }

  override getContainerSize(): number {
    return ChestTileEntity.ItemsSize;
  }

  override getItem(slot: number): ItemInstance | null {
    return this.items[slot] ?? null;
  }

  override getName(): string {
    return 'container.chest';
  }

  shouldSave(): boolean {
    for (let i = 0; i < ChestTileEntity.ItemsSize; ++i) {
      const it = this.items[i];
      if (it && !it.isNull()) return true;
    }
    return false;
  }

  override load(base: CompoundTag): void {
    super.load(base);
    if (!base.contains('Items')) return;
    const inventoryList = base.getList('Items');
    for (let i = 0; i < inventoryList.size(); i++) {
      const ttag = inventoryList.get(i)!;
      if (ttag.getId() !== TAG_Compound) continue;
      const tag = ttag as CompoundTag;
      const slot = tag.getByte('Slot') & 0xff;
      if (slot >= 0 && slot < ChestTileEntity.ItemsSize) {
        if (!this.items[slot]) this.items[slot] = new ItemInstance(); //@chestodo
        this.items[slot]!.load(tag);
      }
    }
  }

  override save(base: CompoundTag): boolean {
    if (!super.save(base)) return false;
    const listTag = new ListTag();
    for (let i = 0; i < ChestTileEntity.ItemsSize; i++) {
      const it = this.items[i];
      if (it && !it.isNull()) {
        const tag = new CompoundTag();
        tag.putByte('Slot', (i << 24) >> 24);
        it.save(tag);
        listTag.add(tag);
      }
    }
    base.put('Items', listTag);
    return true;
  }

  override getMaxStackSize(): number {
    return Container.LARGE_MAX_STACK_SIZE;
  }

  override stillValid(player: Player): boolean {
    if (this.level!.getTileEntity(this.x, this.y, this.z) !== this) return false;
    if (player.distanceToSqr(this.x + 0.5, this.y + 0.5, this.z + 0.5) > 8 * 8) return false;
    return true;
  }

  override clearCache(): void {
    super.clearCache();
    this.hasCheckedNeighbors = false;
  }

  checkNeighbors(): void {
    if (this.hasCheckedNeighbors) return;
    this.hasCheckedNeighbors = true;
    this.n = null;
    this.e = null;
    this.w = null;
    this.s = null;
    const level = this.level!;
    const { x, y, z } = this;
    const chest = Tile.chest.id;
    if (level.getTile(x - 1, y, z) === chest)
      this.w = level.getTileEntity(x - 1, y, z) as ChestTileEntity;
    if (level.getTile(x + 1, y, z) === chest)
      this.e = level.getTileEntity(x + 1, y, z) as ChestTileEntity;
    if (level.getTile(x, y, z - 1) === chest)
      this.n = level.getTileEntity(x, y, z - 1) as ChestTileEntity;
    if (level.getTile(x, y, z + 1) === chest)
      this.s = level.getTileEntity(x, y, z + 1) as ChestTileEntity;
    if (this.n !== null) this.n.clearCache();
    if (this.s !== null) this.s.clearCache();
    if (this.e !== null) this.e.clearCache();
    if (this.w !== null) this.w.clearCache();
  }

  override tick(): void {
    super.tick();
    this.checkNeighbors();
    const level = this.level!;
    if (++this.tickInterval >= 4 * SharedConstants.TicksPerSecond) {
      level.tileEvent(this.x, this.y, this.z, ChestTile.EVENT_SET_OPEN_COUNT, this.openCount);
      this.tickInterval = 0;
    }
    this.oOpenness = this.openness;
    const speed = 0.1;
    if (this.openCount > 0 && this.openness === 0) {
      if (this.n === null && this.w === null) {
        let xc = this.x + 0.5;
        let zc = this.z + 0.5;
        if (this.s !== null) zc += 0.5;
        if (this.e !== null) xc += 0.5;
        level.playSound(
          xc,
          this.y + 0.5,
          zc,
          'random.chestopen',
          0.5,
          level.random.nextFloat() * 0.1 + 0.9,
        );
      }
    }
    if ((this.openCount === 0 && this.openness > 0) || (this.openCount > 0 && this.openness < 1)) {
      const oldOpen = this.openness;
      if (this.openCount > 0) this.openness += speed;
      else this.openness -= speed;
      if (this.openness > 1) {
        this.openness = 1;
      }
      const lim = 0.5;
      if (this.openness < lim && oldOpen >= lim) {
        if (this.n === null && this.w === null) {
          let xc = this.x + 0.5;
          let zc = this.z + 0.5;
          if (this.s !== null) zc += 0.5;
          if (this.e !== null) xc += 0.5;
          level.playSound(
            xc,
            this.y + 0.5,
            zc,
            'random.chestclosed',
            0.5,
            level.random.nextFloat() * 0.1 + 0.9,
          );
        }
      }
      if (this.openness < 0) {
        this.openness = 0;
      }
    }
  }

  override triggerEvent(b0: number, b1: number): void {
    if (b0 === ChestTile.EVENT_SET_OPEN_COUNT) {
      this.openCount = b1;
    }
  }

  override startOpen(): void {
    this.openCount++;
    this.level!.tileEvent(this.x, this.y, this.z, ChestTile.EVENT_SET_OPEN_COUNT, this.openCount);
  }

  override stopOpen(): void {
    this.openCount--;
    this.level!.tileEvent(this.x, this.y, this.z, ChestTile.EVENT_SET_OPEN_COUNT, this.openCount);
  }

  override setRemoved(): void {
    this.clearCache();
    this.checkNeighbors();
    super.setRemoved();
  }
}
