/**
 * 1:1 移植自 src/client/gamemode/GameMode.h 与 GameMode.cpp（S12 阶段 C，部分移植）。替换前向声明。
 * 部分：粒子（particleEngine->destroy）、声音（soundEngine->play）、Gui 的挖掘进度、网络包（RemoveBlockPacket、UseItemPacket、
 *   PlayerActionPacket，单机时 level->isClientSide 为假、isOnline 为假，本来就不发送）DEFERRED。
 * Player::interact(Entity*) 按 R10 命名为 interactWith。
 */
import { LOGI } from '@mcpe/platform';
import {
  type Abilities,
  type Entity,
  Item,
  type ItemInstance,
  type Level,
  Material,
  type Player,
  Tile,
  type Vec3,
} from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import { OptionId } from '../Options';
import { LocalPlayer } from '../player/LocalPlayer';

const f = Math.fround;

export abstract class GameMode {
  oDestroyProgress = 0;
  destroyProgress = 0;
  protected minecraft: Minecraft;
  protected destroyTicks = 0;
  protected destroyDelay = 0;

  constructor(minecraft: Minecraft) {
    this.minecraft = minecraft;
  }

  initLevel(_level: Level): void {}

  startDestroyBlock(x: number, y: number, z: number, face: number): void {
    const carried = this.minecraft.player!.getCarriedItem();
    if (carried !== null && carried.id === Item.bow.id) return;
    this.destroyBlock(x, y, z, face);
  }

  destroyBlock(x: number, y: number, z: number, _face: number): boolean {
    const level = this.minecraft.level!;
    const oldTile = Tile.tiles[level.getTile(x, y, z)] ?? null;
    if (!oldTile) return false;
    if (level.adventureSettings.immutableWorld) {
      if (oldTile !== Tile.leaves && oldTile.material !== Material.plant) {
        return false;
      }
    }
    this.minecraft.particleEngine?.destroy(x, y, z);
    const data = level.getData(x, y, z);
    const changed = level.setTile(x, y, z, 0);
    if (changed) {
      this.minecraft.soundEngine?.play(
        oldTile.soundType.getBreakSound(),
        x + f(0.5),
        y + f(0.5),
        z + f(0.5),
        f(f(oldTile.soundType.getVolume() + f(1.0)) / f(2.0)),
        f(oldTile.soundType.getPitch() * f(0.8)),
      );
      oldTile.destroy(level, x, y, z, data);
      if (this.minecraft.options.getBooleanValue(OptionId.OPTIONS_DESTROY_VIBRATION))
        this.minecraft.platform()!.vibrate(24);
      // DEFERRED(Network): if (minecraft->isOnline()) { RemoveBlockPacket packet(minecraft->player, x, y, z); minecraft->raknetInstance->send(packet); }
    }
    return changed;
  }

  abstract continueDestroyBlock(x: number, y: number, z: number, face: number): void;

  stopDestroyBlock(): void {}

  tick(): void {
    this.oDestroyProgress = this.destroyProgress;
  }

  render(a: number): void {
    if (this.destroyProgress <= 0) {
      // DEFERRED(Gui): minecraft->gui.progress = 0;
      this.minecraft.levelRenderer!.destroyProgress = 0;
    } else {
      const dp = this.oDestroyProgress + (this.destroyProgress - this.oDestroyProgress) * a;
      // DEFERRED(Gui): minecraft->gui.progress = dp;
      this.minecraft.levelRenderer!.destroyProgress = dp;
    }
  }

  getPickRange(): number {
    return 5.0;
  }

  useItem(player: Player, level: Level, item: ItemInstance): boolean {
    const oldCount = item.count;
    const itemInstance = item.use(level, player);
    if (level.isClientSide) {
      // DEFERRED(Network): UseItemPacket packet(item, player->entityId, player->aimDirection, …); minecraft->raknetInstance->send(packet);
    }
    if (itemInstance !== item || (itemInstance !== null && itemInstance.count !== oldCount)) {
      return true;
    }
    return false;
  }

  useItemOn(
    player: Player,
    level: Level,
    item: ItemInstance | null,
    x: number,
    y: number,
    z: number,
    face: number,
    hit: Vec3,
  ): boolean {
    const clickX = hit.x - x;
    const clickY = hit.y - y;
    const clickZ = hit.z - z;
    if (level.isClientSide) {
      LOGI(`${player.x} ${player.y} ${player.z}`);
      item = player.inventory.getSelected();
      // DEFERRED(Network): UseItemPacket packet(x, y, z, face, item, …); minecraft->raknetInstance->send(packet);
    }
    const t = level.getTile(x, y, z);
    if (t === Tile.invisible_bedrock.id) return false;
    if (t > 0 && Tile.tiles[t]!.use(level, x, y, z, player)) return true;
    if (item === null) return false;
    if (this.isCreativeType()) {
      const aux = item.getAuxValue();
      const count = item.count;
      const success = item.useOn(player, level, x, y, z, face, clickX, clickY, clickZ);
      item.setAuxValue(aux);
      item.count = count;
      return success;
    } else {
      return item.useOn(player, level, x, y, z, face, clickX, clickY, clickZ);
    }
  }

  createPlayer(level: Level): Player {
    return new LocalPlayer(
      this.minecraft,
      level,
      this.minecraft.options.getStringValue(OptionId.OPTIONS_USERNAME),
      level.dimension.id,
      this.isCreativeType(),
    );
  }

  initPlayer(player: Player): void {
    this.initAbilities(player.abilities);
  }

  adjustPlayer(_player: Player): void {}

  canHurtPlayer(): boolean {
    return false;
  }

  interact(player: Player, entity: Entity): void {
    player.interactWith(entity);
  }

  attack(player: Player, entity: Entity): void {
    const level = this.minecraft.level!;
    if (level.adventureSettings.noPvP && entity.isPlayer()) return;
    if (level.adventureSettings.noPvM && entity.isMob()) return;
    player.attack(entity);
  }

  handleInventoryMouseClick(
    _containerId: number,
    _slotNum: number,
    _buttonNum: number,
    _player: Player,
  ): ItemInstance | null {
    return null;
  }

  handleCloseInventory(_containerId: number, _player: Player): void {}

  isCreativeType(): boolean {
    return false;
  }

  isSurvivalType(): boolean {
    return false;
  }

  initAbilities(_abilities: Abilities): void {}

  releaseUsingItem(player: Player): void {
    if (this.minecraft.level!.isClientSide && player.isUsingItem()) {
      // DEFERRED(Network): PlayerActionPacket packet(PlayerActionPacket::RELEASE_USE_ITEM, 0, 0, 0, 0, player->entityId); send(packet);
    }
    player.releaseUsingItem();
  }
}
