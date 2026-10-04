// 1:1 移植自 src/client/gamemode/SurvivalMode.h 与 SurvivalMode.cpp（S12 阶段 C）。挖掘时的声音 DEFERRED(Sound)。
import { type Abilities, Item, ItemInstance, Tile } from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import { GameMode } from './GameMode';

const f = Math.fround;

export class SurvivalMode extends GameMode {
  private xDestroyBlock = -1;
  private yDestroyBlock = -1;
  private zDestroyBlock = -1;

  constructor(minecraft: Minecraft) {
    super(minecraft);
  }

  override destroyBlock(x: number, y: number, z: number, face: number): boolean {
    const mc = this.minecraft;
    const level = mc.level!;
    const player = mc.player!;
    const t = level.getTile(x, y, z);
    const data = level.getData(x, y, z);
    const changed = super.destroyBlock(x, y, z, face);
    const couldDestroy = player.canDestroy(Tile.tiles[t]!);
    const item = player.inventory.getSelected();
    if (item !== null) {
      item.mineBlock(t, x, y, z);
      if (item.count === 0) {
        player.inventory.clearSlot(player.inventory.selected);
      }
    }
    if (changed && couldDestroy) {
      const instance = new ItemInstance(t, 1, data); // C++ 构造了却没有使用
      void instance;
      Tile.tiles[t]!.playerDestroy(level, player, x, y, z, data);
    }
    return changed;
  }

  override startDestroyBlock(x: number, y: number, z: number, face: number): void {
    const mc = this.minecraft;
    const carried = mc.player!.getCarriedItem();
    if (carried !== null && carried.id === Item.bow.id) return;
    const t = mc.level!.getTile(x, y, z);
    if (t > 0 && this.destroyProgress === 0) Tile.tiles[t]!.attack(mc.level!, x, y, z, mc.player!);
    if (t > 0 && Tile.tiles[t]!.getDestroyProgress(mc.player!) >= 1)
      this.destroyBlock(x, y, z, face);
  }

  continueDestroyBlock(x: number, y: number, z: number, face: number): void {
    if (this.destroyDelay > 0) {
      this.destroyDelay--;
      return;
    }
    if (x === this.xDestroyBlock && y === this.yDestroyBlock && z === this.zDestroyBlock) {
      const t = this.minecraft.level!.getTile(x, y, z);
      if (t === 0) return;
      const tile = Tile.tiles[t]!;
      this.destroyProgress += tile.getDestroyProgress(this.minecraft.player!);
      if ((++this.destroyTicks & 3) === 1) {
        if (tile !== null) {
          this.minecraft.soundEngine?.play(
            tile.soundType.getStepSound(),
            x + f(0.5),
            y + f(0.5),
            z + f(0.5),
            f(f(tile.soundType.getVolume() + f(1.0)) / f(8.0)),
            f(tile.soundType.getPitch() * f(0.5)),
          );
        }
      }
      if (this.destroyProgress >= 1) {
        this.destroyBlock(x, y, z, face);
        this.destroyProgress = 0;
        this.oDestroyProgress = 0;
        this.destroyTicks = 0;
        this.destroyDelay = 5;
      }
    } else {
      this.destroyProgress = 0;
      this.oDestroyProgress = 0;
      this.destroyTicks = 0;
      this.xDestroyBlock = x;
      this.yDestroyBlock = y;
      this.zDestroyBlock = z;
    }
  }

  override stopDestroyBlock(): void {
    this.destroyProgress = 0;
    this.destroyDelay = 0;
  }

  override canHurtPlayer(): boolean {
    return true;
  }

  override isSurvivalType(): boolean {
    return true;
  }

  override initAbilities(abilities: Abilities): void {
    abilities.flying = false;
    abilities.mayfly = false;
    abilities.instabuild = false;
    abilities.invulnerable = false;
  }
}
