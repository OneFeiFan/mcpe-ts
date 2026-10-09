/**
 * 1:1 移植自 src/client/player/LocalPlayer.h 与 LocalPlayer.cpp（S12 阶段 C，部分移植）。替换前向声明。
 * 部分：网络包（PlayerEquipmentPacket、PlayerArmorEquipmentPacket 等）、界面（容器、合成、告示牌编辑）、统计 DEFERRED。
 * 由 C++ 类转写脚本生成初稿后逐个函数人工核对。
 */
import { InBedScreen } from '../gui/screens/InBedScreen';
import { ErrorCodes } from '../ErrorCodes';
import { ChestScreen } from '../gui/screens/ChestScreen';
import { FurnaceScreen } from '../gui/screens/FurnaceScreen';
import { WorkbenchScreen } from '../gui/screens/crafting/WorkbenchScreen';
import { StonecutterScreen } from '../gui/screens/crafting/StonecutterScreen';
import { TextEditScreen } from '../gui/screens/TextEditScreen';
import { Keyboard, LOGI } from '@mcpe/platform';
import { Mth, SmoothFloat } from '@mcpe/util';
import { SharedConstants } from '@mcpe/core';
import type { CompoundTag } from '@mcpe/nbt';
import {
  BedSleepingResult,
  BowItem,
  type ChestTileEntity,
  type Entity,
  type FurnaceTileEntity,
  Item,
  type ItemEntity,
  ItemInstance,
  type Level,
  Material,
  Mob,
  Player,
  Tile,
  type TileEntity,
  TileEntityType,
  type SignTileEntity,
  Vec3,
} from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import { OptionId } from '../Options';
import { TakeAnimationParticle } from '../particle/TakeAnimationParticle';
import type { IMoveInput } from './input/IMoveInput';

const f = Math.fround;
/** LocalPlayer.cpp 的自由函数 isJumpable */
function isJumpable(tileId: number): boolean {
  return (
    tileId !== Tile.fence.id &&
    tileId !== Tile.fenceGate.id &&
    tileId !== Tile.stoneSlabHalf.id &&
    tileId !== Tile.trapdoor.id &&
    tileId !== Tile.sign.id &&
    tileId !== Tile.wallSign.id &&
    Tile.tiles[tileId] != null &&
    Tile.tiles[tileId]!.getRenderShape() !== Tile.SHAPE_STAIRS
  );
}

/** LocalPlayer::tick 里的 static bool hasPostedError */
const localPlayerStatics = { hasPostedError: false };

export class LocalPlayer extends Player {
  yBob: number = 0;
  xBob: number = 0;
  yBobO: number = 0;
  xBobO: number = 0;
  input: IMoveInput | null = null;
  autoJumpEnabled: boolean = false;
  protected minecraft!: Minecraft;
  protected jumpTriggerTime: number = 0;
  protected ascendTriggerTime: number = 0;
  protected descendTriggerTime: number = 0;
  protected ascending: boolean = false;
  protected descending: boolean = false;
  private flyX: number = 0;
  private flyY: number = 0;
  private flyZ: number = 0;
  private smoothFlyX = new SmoothFloat();
  private smoothFlyY = new SmoothFloat();
  private smoothFlyZ = new SmoothFloat();
  private autoJumpTime: number = 0;
  private sentInventoryItemId: number = 0;
  private sentInventoryItemData: number = 0;
  private armorTypeHash: number = 0;
  private sprinting: boolean = false;
  private sprintDoubleTapTimer: number = 0;
  private prevForwardHeld: boolean = false;

  override animateRespawn(): void {}

  chat(message: string): void {}

  awardStat(_stat: unknown, _count: number): void {
    // DEFERRED(Stats)：Stat*
  }

  setSprinting(sprint: boolean): void {
    this.sprinting = sprint;
  }

  constructor(
    minecraft: Minecraft,
    level: Level,
    username: string,
    dimension: number,
    isCreative: boolean,
  ) {
    super(level, isCreative);
    this.minecraft = minecraft;
    this.input = null;
    this.sentInventoryItemId = -1;
    this.sentInventoryItemData = -1;
    this.autoJumpEnabled = true;
    this.armorTypeHash = 0;
    this.sprinting = false;
    this.sprintDoubleTapTimer = 0;
    this.prevForwardHeld = false;
    this.xBob = 0.0;
    this.yBob = 0.0;
    this.xBobO = 0.0;
    this.yBobO = 0.0;
    this.dimension = dimension;
    this._init();

    if (minecraft.options.getStringValue(OptionId.OPTIONS_USERNAME).length !== 0) {
      this.textureName = 'mob/char.png';

      this.name = minecraft.options.getStringValue(OptionId.OPTIONS_USERNAME);
      LOGI('test '); // printf("test \n");
      // DEFERRED(Network): new CThread(fetchSkinForPlayer, this); new CThread(fetchCapeForPlayer, this);（从网上下载皮肤与披风）
    }
  }

  override _init(): void {
    this.autoJumpTime = 0;
    this.jumpTriggerTime = 0;
    this.ascendTriggerTime = 0;
    this.descendTriggerTime = 0;
    this.ascending = false;
    this.descending = false;

    let item = this.inventory.getSelected();
    this.sentInventoryItemId = item ? item.id : 0;
    this.sentInventoryItemData = item ? item.getAuxValue() : 0;
  }

  override reset(): void {
    super.reset();
    this._init();
  }

  override tick(): void {
    super.tick();
    if (!this.useItem.isNull()) {
      const item = this.inventory.getSelected();
      if (item !== null && item.equals(this.useItem)) {
        // *item == useItem
        if (this.useItemDuration <= 25 && this.useItemDuration % 4 === 0) {
          this.spawnEatParticles(item, 5);
        }
        if (--this.useItemDuration === 0) {
          if (!this.level.isClientSide) {
            this.completeUsingItem();
          } else {
            // DEFERRED(Network): EntityEventPacket p(entityId, EntityEvent::USE_ITEM_COMPLETE); level->raknetInstance->send(p);
          }
        }
      } else {
        this.stopUsingItem();
      }
    }
    // DEFERRED(Network): if (minecraft->isOnline()) { MovePlayerPacket / PlayerEquipmentPacket …（单机时 isOnline 为假）}
    this.updateArmorTypeHash();
    if (!this.minecraft.screen && this.containerMenu) {
      if (!localPlayerStatics.hasPostedError) {
        this.minecraft.gui.postError(ErrorCodes.ContainerRefStillExistsAfterDestruction);
        localPlayerStatics.hasPostedError = true;
      }
    }
  }

  override move(xa: number, ya: number, za: number): void {
    if (
      this === this.minecraft.player &&
      this.minecraft.options.getBooleanValue(OptionId.OPTIONS_IS_FLYING)
    ) {
      this.noPhysics = true;
      let tmp = this.walkDist;
      this.calculateFlight(xa, ya, za);
      this.fallDistance = 0;
      this.yd = 0;
      super.move(this.flyX, this.flyY, this.flyZ);
      this.onGround = true;
      this.walkDist = tmp;
    } else {
      if (this.autoJumpTime > 0) {
        this.autoJumpTime--;
        this.input!.jumping = true;
      }
      let prevX = this.x,
        prevZ = this.z;

      super.move(xa, ya, za);

      let newX = this.x,
        newZ = this.z;

      if (
        this.autoJumpTime <= 0 &&
        this.minecraft.options.getBooleanValue(OptionId.OPTIONS_AUTOJUMP)
      ) {
        let jump = false;
        if (
          Mth.floor(prevX * 2.0) !== Mth.floor(newX * 2.0) ||
          Mth.floor(prevZ * 2.0) !== Mth.floor(newZ * 2.0)
        ) {
          let dist = Mth.sqrt(xa * xa + za * za);
          let xx = Mth.floor(this.x + xa / dist);
          let zz = Mth.floor(this.z + za / dist);
          let tileId = this.level.getTile(xx, Math.trunc(this.y - 1), zz);
          jump =
            this.isSolidTile(xx, Math.trunc(this.y - 1), zz) &&
            !this.isSolidTile(xx, Math.trunc(this.y), zz) &&
            !this.isSolidTile(xx, Math.trunc(this.y + 1), zz) &&
            isJumpable(tileId);
        }
        if (jump) {
          this.autoJumpTime = 1;
        }
      }
    }
  }

  override aiStep(): void {
    this.jumpTriggerTime--;
    this.ascendTriggerTime--;
    this.descendTriggerTime--;

    let wasJumping = this.input!.jumping;
    let screenCovering = this.minecraft.screen !== null && !this.minecraft.screen.passEvents;
    if (!screenCovering) this.input!.tick(this);

    {
      let forwardHeld = this.input!.ya > 0;
      if (
        forwardHeld &&
        !this.prevForwardHeld &&
        this.minecraft.options.getBooleanValue(OptionId.OPTIONS_ALLOW_SPRINT)
      ) {
        if (this.sprintDoubleTapTimer > 0) this.sprinting = true;
        else this.sprintDoubleTapTimer = 7;
      }
      if (!forwardHeld) {
        this.sprinting = false;
      }
      if (this.sprintDoubleTapTimer > 0) this.sprintDoubleTapTimer--;
      this.prevForwardHeld = forwardHeld;
    }
    if (this.input!.sneaking) this.sprinting = false;

    if (this.input!.sneaking) {
      if (this.ySlideOffset < 0.2) this.ySlideOffset = 0.2;
    }
    if (this.abilities.mayfly) {
      if (!wasJumping && this.input!.jumping) {
        if (this.jumpTriggerTime <= 0) this.jumpTriggerTime = 7;
        else {
          this.abilities.flying = !this.abilities.flying;
          this.jumpTriggerTime = 0;
        }
      }
      if (this.abilities.flying) {
        if (this.input!.wantUp) {
          this.yd += 0.15;
        }
        if (this.input!.wantDown) {
          this.yd -= 0.15;
        }
      }
    }

    if (this.isUsingItem()) {
      let k = 0.35;
      this.input!.xa *= k;
      this.input!.ya *= k;
    }

    Mob.prototype.aiStep.call(this); // C++：Mob::aiStep(); 随后 super::aiStep();（原样两次）
    super.aiStep();

    this.yBobO = this.yBob;
    this.xBobO = this.xBob;
    this.xBob += (this.xRot - this.xBob) * 0.5;
    this.yBob += (this.yRot - this.yBob) * 0.5;

    if (this.interpolateOnly()) this.updateAi();
  }

  override updateAi(): void {
    super.updateAi();
    this.xxa = this.input!.xa;
    this.yya = this.input!.ya;
    this.jumping = this.input!.jumping || this.autoJumpTime > 0;
  }

  setKey(eventKey: number, eventKeyState: boolean): void {
    this.input!.setKey(eventKey, eventKeyState);
  }

  releaseAllKeys(): void {
    if (this.input) this.input.releaseAllKeys();
  }

  override addAdditonalSaveData(entityTag: CompoundTag): void {
    super.addAdditonalSaveData(entityTag);
    entityTag.putInt('Score', this.score);
  }

  override readAdditionalSaveData(entityTag: CompoundTag): void {
    super.readAdditionalSaveData(entityTag);
    this.score = entityTag.getInt('Score');
  }

  override closeContainer(): void {
    if (this.level.isClientSide) {
      // DEFERRED(Network): ContainerClosePacket packet(containerMenu->containerId); minecraft->raknetInstance->send(packet);
    }
    super.closeContainer();
    this.minecraft.setScreen(null);
  }

  override drop(item: ItemInstance, randomly: boolean): void {
    if (!item) return;

    if (this.level.isClientSide) {
      // DEFERRED(Network): DropItemPacket packet(entityId, *item); minecraft->raknetInstance->send(packet); delete item;
    } else {
      super.drop(item, randomly);
    }
  }

  override take(e: Entity, orgCount: number): void {
    if (e.isItemEntity()) {
      // C++：minecraft->particleEngine->add(new TakeAnimationParticle(minecraft->level, e, this, -0.5f));
      //   C++ 在这两处都不判空（单机时一定都有值）；TS 的类型是 `| null`，所以挡一下。
      const minecraft = this.minecraft;
      if (minecraft.particleEngine !== null && minecraft.level !== null) {
        minecraft.particleEngine.add(
          // -0.5f（float32 里能精确表示，包一层只是照规矩标出它是 float 字面量）
          new TakeAnimationParticle(minecraft.level, e as ItemEntity, this, f(-0.5)),
        );
      }
    }
    void orgCount;
  }

  override startCrafting(x: number, y: number, z: number, tableSize: number): void {
    (void x, void y, void z);
    if (!this.minecraft.isCreativeMode()) this.minecraft.setScreen(new WorkbenchScreen(tableSize));
  }

  override startStonecutting(x: number, y: number, z: number): void {
    (void x, void y, void z);
    this.minecraft.setScreen(new StonecutterScreen());
  }

  override openContainer(container: ChestTileEntity): void {
    this.minecraft.setScreen(new ChestScreen(this, container));
  }

  override openFurnace(e: FurnaceTileEntity): void {
    this.minecraft.setScreen(new FurnaceScreen(this, e));
  }

  override isSneaking(): boolean {
    return this.input!.sneaking;
  }

  override actuallyHurt(dmg: number): void {
    if (this.minecraft.screen && this.minecraft.screen.closeOnPlayerHurt()) {
      if (this.containerMenu) this.closeContainer();
      else this.minecraft.setScreen(null);
    }
    super.actuallyHurt(dmg);
  }

  hurtTo(newHealth: number): void {
    let dmg = this.health - newHealth;
    if (dmg <= 0) {
      this.health = newHealth;
    } else {
      this.lastHurt = dmg;
      this.lastHealth = this.health;
      this.invulnerableTime = this.invulnerableDuration;

      this.minecraft.player!.bypassArmor = true;
      this.actuallyHurt(dmg);
      this.minecraft.player!.bypassArmor = false;

      this.hurtTime = this.hurtDuration = 10;
    }
  }

  override die(source: Entity | null): void {
    if (this.level.isClientSide) {
      // DEFERRED(Network): SendInventoryPacket packet(this, true); minecraft->raknetInstance->send(packet);
    }
    this.inventory.dropAll(this.level.isClientSide);
    for (let i = 0; i < 4; ++i) {
      // Player::NUM_ARMOR（protected static）
      let item = this.getArmor(i);
      if (!ItemInstance.isArmorItem(item)) return;

      this.drop(new ItemInstance(item!), true);
      this.setArmor(i, null);
    }

    super.die(source);
  }

  override respawn(): void {
    this.minecraft.respawnPlayer();
  }

  getFieldOfViewModifier(): number {
    let targetFov = 1.0;
    if (this.abilities.flying) targetFov *= 1.1;
    targetFov *=
      ((this.walkingSpeed * this.getWalkingSpeedModifier()) / Player.DEFAULT_WALK_SPEED + 1) / 2;

    if (this.isUsingItem() && this.getUseItem()!.id === Item.bow.id) {
      let ticksHeld = this.getTicksUsingItem();
      let scale = ticksHeld / BowItem.MAX_DRAW_DURATION;
      if (scale > 1) {
        scale = 1;
      } else {
        scale *= scale;
      }
      targetFov *= 1.0 - scale * 0.15;
    }
    return targetFov;
  }

  override displayClientMessage(messageId: string): void {
    this.minecraft.gui.displayClientMessage(messageId);
  }

  override causeFallDamage(distance: number): void {
    let dmg = Math.trunc(Math.ceil(distance - 3));
    if (dmg > 0) {
      if (this.level.isClientSide) {
        // DEFERRED(Network): SetHealthPacket packet(SetHealthPacket::HEALTH_MODIFY_OFFSET + dmg); minecraft->raknetInstance->send(packet);
      }
    }
    super.causeFallDamage(distance);
  }

  override startSleepInBed(x: number, y: number, z: number): number {
    let startSleepInBedReturnValue = super.startSleepInBed(x, y, z);
    if (startSleepInBedReturnValue === BedSleepingResult.OK) {
      this.minecraft.setScreen(new InBedScreen());
    }
    return startSleepInBedReturnValue;
  }

  override stopSleepInBed(
    forcefulWakeUp: boolean,
    updateLevelList: boolean,
    saveRespawnPoint: boolean,
  ): void {
    if (this.level.isClientSide) {
      // DEFERRED(Network): PlayerActionPacket packet(PlayerActionPacket::STOP_SLEEPING, 0, 0, 0, 0, entityId); send(packet);
    }
    this.minecraft.setScreen(null);
    super.stopSleepInBed(forcefulWakeUp, updateLevelList, saveRespawnPoint);
  }

  override swing(): void {
    super.swing();

    if (this.swingTime === -1) {
      // DEFERRED(Network): AnimatePacket packet(AnimatePacket::Swing, this); reliability = UNRELIABLE; priority = MEDIUM_PRIORITY; send(packet);
    }
  }

  override openTextEdit(tileEntity: TileEntity): void {
    if (tileEntity.type === TileEntityType.Sign) {
      this.minecraft.setScreen(new TextEditScreen(tileEntity as SignTileEntity));
    }
  }

  override getWalkingSpeedModifier(): number {
    return this.sprinting ? 1.3 : 1.0;
  }

  private calculateFlight(xa: number, ya: number, za: number): void {
    let flySpeed = this.minecraft.options.getProgressValue(OptionId.OPTIONS_FLY_SPEED);
    let sensivity = this.minecraft.options.getProgressValue(OptionId.OPTIONS_SENSITIVITY);

    xa = xa * flySpeed;
    ya = 0;
    za = za * flySpeed;

    if (this.sprinting) {
      let sprintBoost = this.getWalkingSpeedModifier();
      xa *= sprintBoost;
      za *= sprintBoost;
    }

    if (Keyboard.isKeyDown(Keyboard.KEY_E)) ya = 0.2 * flySpeed;
    if (Keyboard.isKeyDown(Keyboard.KEY_Q)) ya = -0.2 * flySpeed;

    this.flyX = 10 * this.smoothFlyX.getNewDeltaValue(xa, 0.35 * sensivity);
    this.flyY = 10 * this.smoothFlyY.getNewDeltaValue(ya, 0.35 * sensivity);
    this.flyZ = 10 * this.smoothFlyZ.getNewDeltaValue(za, 0.35 * sensivity);
  }

  private isSolidTile(x: number, y: number, z: number): boolean {
    let tileId = this.level.getTile(x, y, z);
    return tileId > 0 && Tile.tiles[tileId]!.material.isSolid();
  }

  private updateArmorTypeHash(): void {
    let hash = this.getArmorTypeHash();
    if (hash !== this.armorTypeHash) {
      // DEFERRED(Network): PlayerArmorEquipmentPacket p(this); minecraft->raknetInstance->send(p);
      this.armorTypeHash = hash;
    }
  }
}
