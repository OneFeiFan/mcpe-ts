/**
 * 1:1 移植自 src/world/entity/Mob.h 与 Mob.cpp（S12 阶段 C，部分移植）。
 * 部分：新版生物 AI（MoveControl、JumpControl、PathNavigation、GoalSelector、Sensing，计划外）的语句 DEFERRED(MobAI)；
 *   网络包（MoveEntityPacket 等）DEFERRED(Network)；声音、粒子照常调用 Level 的接口。
 * 由 tools 的 C++ 类转写脚本生成初稿后逐个函数人工核对。
 */
import { LOGI } from '@mcpe/platform';
import { CompoundTag } from '@mcpe/nbt';
import { Mth, Random, TIMER_POP, TIMER_POP_PUSH, TIMER_PUSH } from '@mcpe/util';
import { SharedConstants } from '@mcpe/core';
import { Entity } from './Entity';
import { EntityEvent } from './EntityEvent';
import { SharedFlagsInformation } from './SharedFlags';
import { SynchedEntityData } from './SynchedEntityData';
import { ItemInstance } from '../item/ItemInstance';
import type { Level } from '../level/Level';
import { Material } from '../level/material/Material';
import { Tile } from '../level/tile/Tile';
import { HitResult } from '../phys/HitResult';
import { Vec3 } from '../phys/Vec3';
import { ParticleType } from './EntityTypes';

export abstract class Mob extends Entity {
  static readonly ATTACK_DURATION = 5;
  static readonly SWING_DURATION = 8;
  invulnerableDuration: number = 0;
  timeOffs: number = 0;
  rotA: number = 0;
  yBodyRot: number = 0;
  yBodyRotO: number = 0;
  oAttackAnim: number = 0;
  attackAnim: number = 0;
  health: number = 0;
  lastHealth: number = 0;
  hurtTime: number = 0;
  hurtDuration: number = 0;
  hurtDir: number = 0;
  deathTime: number = 0;
  attackTime: number = 0;
  oTilt: number = 0;
  tilt: number = 0;
  lookTime: number = 0;
  fallTime: number = 0;
  walkAnimSpeedO: number = 0;
  walkAnimSpeed: number = 0;
  walkAnimPos: number = 0;
  aimDirection = new Vec3(0, 0, 0);
  arrowCount: number = 0;
  removeArrowTime: number = 0;
  random = new Random();
  sensing: unknown = null; // DEFERRED(MobAI)
  bypassArmor: boolean = false;
  protected entityData = new SynchedEntityData();
  protected swinging: boolean = false;
  protected swingTime: number = 0;
  protected noActionTime: number = 0;
  protected xxa: number = 0;
  protected yya: number = 0;
  protected yRotA: number = 0;
  protected defaultLookAngle: number = 0;
  protected runSpeed: number = 0;
  protected walkingSpeed: number = 0;
  protected flyingSpeed: number = 0;
  protected xCape: number = 0;
  protected yCape: number = 0;
  protected zCape: number = 0;
  protected xc: number = 0;
  protected yc: number = 0;
  protected zc: number = 0;
  textureName: string = '';
  capeTextureName: string = '';
  modelName: string = '';
  deathScore: number = 0;
  oRun: number = 0;
  run: number = 0;
  animStep: number = 0;
  animStepO: number = 0;
  rotOffs: number = 0;
  bobStrength: number = 0;
  renderOffset: number = 0;
  lSteps: number = 0;
  lx: number = 0;
  ly: number = 0;
  lz: number = 0;
  lyr: number = 0;
  lxr: number = 0;
  lastHurt: number = 0;
  dmgSpill: number = 0;
  sentX: number = 0;
  sentY: number = 0;
  sentZ: number = 0;
  sentRotX: number = 0;
  sentRotY: number = 0;
  sentXd: number = 0;
  sentYd: number = 0;
  sentZd: number = 0;
  allowAlpha: boolean = false;
  jumping: boolean = false;
  autoSendPosRot: boolean = false;
  moveControl: unknown = null; // DEFERRED(MobAI)
  jumpControl: unknown = null; // DEFERRED(MobAI)
  navigation: unknown = null; // DEFERRED(MobAI)
  goalSelector: unknown = null; // DEFERRED(MobAI)
  targetSelector: unknown = null; // DEFERRED(MobAI)
  private lookingAtId: number = 0;
  private ambientSoundTime: number = 0;
  private speed: number = 0;

  getItemInHandIcon(item: ItemInstance, layer: number): number {
      return item.getIcon();  
    }

  getMaxHealth(): number { return 10; }

  override isMob(): boolean { return true; }

  isBaby(): boolean { return false; }

  getCarriedItem(): ItemInstance | null {return null;}

  getUseItemDuration(): number {return 0;}

  hasDied(): boolean { return this.health <= 0; }

  setxxa(xxa: number): void { this.xxa = xxa; }

  setyya(yya: number): void { this.yya = yya; }

  getCapeX(): number { return this.xCape; }

  getCapeY(): number { return this.yCape; }

  getCapeZ(): number { return this.zCape; }

  getCapePrevX(): number { return this.xc; }

  getCapePrevY(): number { return this.yc; }

  getCapePrevZ(): number { return this.zc; }

  constructor(level: Level) {
    // ADAPTED(Cpp)：C++ 在构造函数里调用虚函数时只会调到本类（Mob）的版本；JS 会派发到子类，所以显式调用 Mob.prototype 上的版本。
      super(level);
      this.invulnerableDuration = 20;
      this.textureName = "mob/char.png";
      this.capeTextureName = "";
      this.allowAlpha = true;
      this.modelName = "";
      this.bobStrength = 1;
      this.deathScore = 0;
      this.renderOffset = 0;
      this.lookingAtId = 0;
      this.jumping = false;
      this.defaultLookAngle = 0.0;
      this.runSpeed = 0.7;
      this.walkingSpeed = 0.1;
      this.flyingSpeed = 0.02;
      this.run = 0;
      this.oRun = 0;
      this.animStep = 0;
      this.animStepO = 0;
      this.lx = 0;
      this.ly = 0;
      this.lz = 0;
      this.lxr = 0;
      this.lyr = 0;
      this.lSteps = 0;
      this.walkAnimSpeed = 0;
      this.walkAnimSpeedO = 0;
      this.walkAnimPos = 0;
      this.attackAnim = 0;
      this.oAttackAnim = 0;
      this.autoSendPosRot = true;
      this.sentX = 0;
      this.sentY = 0;
      this.sentZ = 0;
      this.sentRotX = 0;
      this.sentRotY = 0;
      this.sentXd = 0;
      this.sentYd = 0;
      this.sentZd = 0;
      this.arrowCount = 0;
      this.removeArrowTime = 0;
      this.speed = 0;
      this.moveControl = null;
      this.jumpControl = null;
      this.navigation = null;
      this.goalSelector = null;
      this.targetSelector = null;
      this.sensing = null;
      this.swinging = false;
      this.swingTime = 0;
      this.lastHurt = 0;
      this.dmgSpill = 0;
      this.bypassArmor = false;
    this.entityData.defineByte(SharedFlagsInformation.DATA_SHARED_FLAGS_ID, 0);
    this.entityData.defineShort(Entity.DATA_AIR_SUPPLY_ID, Entity.TOTAL_AIR_SUPPLY);
  
    Mob.prototype._init.call(this);
    this.health = Mob.prototype.getMaxHealth.call(this);
  
    this.blocksBuilding = true;
    this.ambientSoundTime = -level.random.nextInt(100);
  
    this.rotA = (Mth.random() + 1) * 0.01;
    this.setPos(this.x, this.y, this.z);
    this.timeOffs = Mth.random() * 12398;
    this.yRot = (Mth.random() * Mth.PI * 2);
  
    this.footSize = 0.5;
  
    
    this.xCape = this.x;
    this.yCape = this.y;
    this.zCape = this.z;
  
    this.xc = this.xCape;
    this.yc = this.yCape;
    this.zc = this.zCape;
  }

  override _init(): void {
    this.yBodyRot = 0;
    this.yBodyRotO = 0;
    this.rotOffs = 0;
    this.fallTime = 0;
    this.lastHurt = 0;
    this.deathTime = 0;
    this.attackTime = 0;
    this.tilt = 0;
    this.oTilt = 0;
    this.hurtDuration = 0;
    this.hurtTime = 0;
    this.hurtDir = 0;
    this.lookTime = 0;
    this.noActionTime = 0;
    this.xxa = 0; this.yya = 0;
    this.yRotA = 0;
  
    this.health = 10;
    this.lastHealth = 20;
  }

  override reset(): void {
    super.reset();
    this._init();
  }

  knockback(source: Entity | null, dmg: number, xd: number, zd: number): void {
    let dd = Mth.invSqrt(xd * xd + zd * zd);
    let pow = 0.4;
  
    this.xd *= 0.5;
    this.yd *= 0.5;
    this.zd *= 0.5;
  
    this.xd -= xd * dd * pow;
    this.yd += 0.4;
    this.zd -= zd * dd * pow;
  
    if (this.yd > 0.4) this.yd = 0.4;
  }

  die(source: Entity | null): void {
    if (this.deathScore > 0 && source !== null) source.awardKillScore(this, this.deathScore);
  
    if (!this.level.isClientSide) {
      if (!this.isBaby()) {
        this.dropDeathLoot();
      }
      this.level.broadcastEntityEvent(this, EntityEvent.DEATH);
    }
  }

  canSee(target: Entity): boolean {
    return !this.level.clip(new Vec3(this.x, this.y + this.getHeadHeight(), this.z), new Vec3(target.x, target.y + target.getHeadHeight(), target.z)).isHit();
  }

  onLadder(): boolean {
    let xt = Mth.floor(this.x);
    let yt = Mth.floor(this.bb.y0);
    let zt = Mth.floor(this.z);
    return this.level.getTile(xt, yt, zt) === Tile.ladder.id || this.level.getTile(xt, yt + 1, zt) === Tile.ladder.id;
  }

  spawnAnim(): void {
    
  }

  getTexture(): string {
    return this.textureName;
  }

  setTextureName(name: string): void {
    this.textureName = name;
  }

  getCapeTexture(): string {
    return this.capeTextureName;
  }

  setCapeTextureName(name: string): void {
    this.capeTextureName = name;
  }

  override isAlive(): boolean {
    return !this.removed && this.health > 0;
  }

  override isPickable(): boolean {
    return !this.removed;
  }

  override isPushable(): boolean {
    return !this.removed;
  }

  override isOnFire(): boolean {
      return this.onFire > 0 || this.getSharedFlag(SharedFlagsInformation.FLAG_ONFIRE);
  }

  override isShootable(): boolean {
    return true;
  }

  getMoveControl(): unknown { // DEFERRED(MobAI)：MoveControl
    return this.moveControl;
  }

  getJumpControl(): unknown { // DEFERRED(MobAI)：JumpControl
    return this.jumpControl;
  }

  isSleeping(): boolean {
      return false;
  }

  isWaterMob(): boolean {
    return false;
  }

  override isSneaking(): boolean {
      return this.getSharedFlag(SharedFlagsInformation.FLAG_SNEAKING);
  }

  setSneaking(value: boolean): void {
      this.setSharedFlag(SharedFlagsInformation.FLAG_SNEAKING, value);
  }

  override getHeadHeight(): number {
    return this.bbHeight * 0.85;
  }

  getVoicePitch(): number {
    if (this.isBaby()) {
      return (this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1.5;
    }
    return (this.random.nextFloat() - this.random.nextFloat()) * 0.2 + 1.0;
  }

  playAmbientSound(): void {
    let ambient = this.getAmbientSound();
    if (ambient !== null) { // C++ 返回 const char*，可能为 NULL
      this.level.playSound(this, ambient, this.getSoundVolume(), this.getVoicePitch());
    }
  }

  getAmbientSoundInterval(): number {
    return 8 * SharedConstants.TicksPerSecond;
  }

  override lerpTo(x: number, y: number, z: number, yRot: number, xRot: number, steps: number): void {
    
    this.lx = x;
    this.ly = y + this.heightOffset;
    this.lz = z;
    this.lyr = yRot;
    this.lxr = xRot;
  
    this.lSteps = steps;
  }

  setYya(yya: number): void {
    this.yya = yya;
  }

  getSpeed(): number {
    return this.speed;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.yya = speed;
  }

  setJumping(jump: boolean): void {
    this.jumping = jump;
  }

  override tick(): void {
    this.xc = this.xCape;
    this.yc = this.yCape;
    this.zc = this.zCape;
  
    super.tick();
  
    if (this.arrowCount > 0) {
      if (this.removeArrowTime <= 0) {
        this.removeArrowTime = 20 * 3;
      }
      this.removeArrowTime--;
      if (this.removeArrowTime <= 0) {
        this.arrowCount--;
      }
    }
  
    if (this.lSteps > 0) {
      let xt = this.x + (this.lx - this.x) / this.lSteps;
      let yt = this.y + (this.ly - this.y) / this.lSteps;
      let zt = this.z + (this.lz - this.z) / this.lSteps;
  
      let yrd = this.lyr - this.yRot;
      while (yrd < -180)
        yrd += 360;
      while (yrd >= 180)
        yrd -= 360;
  
      this.yRot += (yrd) / this.lSteps;
      this.xRot += (this.lxr - this.xRot) / this.lSteps;
  
      this.lSteps--;
      this.setPos(xt, yt, zt);
      this.setRot(this.yRot, this.xRot);
    }
  
    this.aiStep();
  
    this.updateWalkAnim();
  
    let xd = this.x - this.xo;
    let zd = this.z - this.zo;
  
    let sideDist = Mth.sqrt(xd * xd + zd * zd);
  
    let yBodyRotT = this.yBodyRot;
  
    let walkSpeed = 0;
    this.oRun = this.run;
    let tRun = 0;
    if (sideDist <= 0.05) {
      
    } else {
      tRun = 1;
      walkSpeed = sideDist * 3;
      yBodyRotT = Mth.atan2(zd, xd) * Mth.RADDEG - 90;
    }
    if (this.attackAnim > 0) {
      yBodyRotT = this.yRot;
    }
    if (!this.onGround) {
      tRun = 0;
    }
    this.run = this.run + (tRun - this.run) * 0.3;
  
    
  
    let yBodyRotD = yBodyRotT - this.yBodyRot;
    while (yBodyRotD < -180)
      yBodyRotD += 360;
    while (yBodyRotD >= 180)
      yBodyRotD -= 360;
    this.yBodyRot += yBodyRotD * 0.3;
  
    let headDiff = this.yRot - this.yBodyRot;
    while (headDiff < -180)
      headDiff += 360;
    while (headDiff >= 180)
      headDiff -= 360;
    let behind = headDiff < -90 || headDiff >= 90;
    if (headDiff < -75) headDiff = -75;
    if (headDiff >= 75) headDiff = +75;
    this.yBodyRot = this.yRot - headDiff;
    if (headDiff * headDiff > 50 * 50) {
      this.yBodyRot += headDiff * 0.2;
    }
  
    if (behind) {
      walkSpeed *= -1;
    }
    while (this.yRot - this.yRotO < -180)
      this.yRotO -= 360;
    while (this.yRot - this.yRotO >= 180)
      this.yRotO += 360;
  
    while (this.yBodyRot - this.yBodyRotO < -180)
      this.yBodyRotO -= 360;
    while (this.yBodyRot - this.yBodyRotO >= 180)
      this.yBodyRotO += 360;
  
    while (this.xRot - this.xRotO < -180)
      this.xRotO -= 360;
    while (this.xRot - this.xRotO >= 180)
      this.xRotO += 360;
    this.animStep += walkSpeed;
  
    
    let dxCape = this.x - this.xCape;
    let dyCape = this.y - this.yCape;
    let dzCape = this.z - this.zCape;
  
    let interp = 0.15; 
    let interpY = 0.12; 
  
    this.xCape += dxCape * interp;
    this.yCape += dyCape * interpY;
    this.zCape += dzCape * interp;
  }

  override baseTick(): void {
    this.oAttackAnim = this.attackAnim;
    super.baseTick();
  
    TIMER_PUSH("mobBaseTick");
  
  
    if (!this.level.isClientSide) {
          
          this.setSharedFlag(SharedFlagsInformation.FLAG_ONFIRE, this.onFire > 0);
      } else {
          
          if (!this.getSharedFlag(SharedFlagsInformation.FLAG_ONFIRE)) {
              this.onFire = 0;
          }
      }
  
  
    if (((this.ambientSoundTime++ & 15) === 0) && this.random.nextInt(2000) < this.ambientSoundTime) {
        this.ambientSoundTime = -this.getAmbientSoundInterval();
        this.playAmbientSound();
    }
  
    if (this.isAlive() && this.isInWall()) {
      this.hurt(null, 1);
    }
  
    
  
    if (this.isAlive() && this.isUnderLiquid(Material.water) && !this.isWaterMob()) {
      this.airSupply--;
      if (this.airSupply === -20) {
        this.airSupply = 0;
        for (let i = 0; i < 8; i++) {
          let xo = this.random.nextFloat() - this.random.nextFloat();
          let yo = this.random.nextFloat() - this.random.nextFloat();
          let zo = this.random.nextFloat() - this.random.nextFloat();
          this.level.addParticle('bubble', this.x + xo, this.y + yo, this.z + zo, this.xd, this.yd, this.zd);
        }
        this.hurt(null, 2);
      }
      
    } else {
      this.airSupply = this.airCapacity;
    }
  
    this.oTilt = this.tilt;
    if (this.attackTime > 0) this.attackTime--;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.invulnerableTime > 0) this.invulnerableTime--;
  
    if (this.hasDied()) {
        this.deathTime++;
        if (this.deathTime > SharedConstants.TicksPerSecond) {
            this.beforeRemove();
            this.remove();
            for (let i = 0; i < 20; i++) {
                let xa = (2.0 * this.random.nextFloat() - 1.0) * (2.0 * this.random.nextFloat() - 1.0) * 0.02;
          let ya = (2.0 * this.random.nextFloat() - 1.0) * (2.0 * this.random.nextFloat() - 1.0) * 0.02;
          let za = (2.0 * this.random.nextFloat() - 1.0) * (2.0 * this.random.nextFloat() - 1.0) * 0.02;
                this.level.addParticle('explode', this.x + this.random.nextFloat() * this.bbWidth * 2 - this.bbWidth, this.y + this.random.nextFloat() * this.bbHeight, this.z + this.random.nextFloat() * this.bbWidth * 2 - this.bbWidth, xa, ya, za);
            }
        }
    }
  
    this.animStepO = this.animStep;
  
    this.yBodyRotO = this.yBodyRot;
    this.yRotO = this.yRot;
    this.xRotO = this.xRot;
  
    TIMER_POP();
  
    if (!this.level.isClientSide) {
      if (this.autoSendPosRot) {
        if (this.autoSendPosRot && (Math.abs(this.x - this.sentX) > 0.1 || Math.abs(this.y - this.sentY) > 0.05 || Math.abs(this.z - this.sentZ) > 0.1 || Math.abs(this.sentRotX - this.xRot) > 1 || Math.abs(this.sentRotY - this.yRot) > 1)) {
          // DEFERRED(Network): MoveEntityPacket_PosRot packet(this); level->raknetInstance->send(packet);
          this.sentX = this.x;
          this.sentY = this.y;
          this.sentZ = this.z;
          this.sentRotX = this.xRot;
          this.sentRotY = this.yRot;
        }
      }
  
      let ddx = Math.abs(this.xd - this.sentXd);
      let ddy = Math.abs(this.yd - this.sentYd);
      let ddz = Math.abs(this.zd - this.sentZd);
      let max = 0.02;
      let diff = ddx*ddx + ddy*ddy + ddz*ddz;
      if (diff > max*max || (diff > 0 && this.xd === 0 && this.yd === 0 && this.zd === 0)) {
        this.sentXd = this.xd;
        this.sentYd = this.yd;
        this.sentZd = this.zd;
        // DEFERRED(Network): SetEntityMotionPacket packet(this); level->raknetInstance->send(packet);
        
      }
    }
  }

  superTick(): void {
    super.tick();
  }

  heal(heal: number): void {
    if (this.hasDied()) return;
  
    this.health += heal;
    if (this.health > 20) this.health = 20;
    this.invulnerableTime = this.invulnerableDuration / 2;
  }

  override hurt(source: Entity | null, dmg: number): boolean {
    if (this.level.isClientSide) return false;
    this.noActionTime = 0;
  
    if (this.hasDied()) return false;
  
    this.walkAnimSpeed = 1.5;
  
    let sound = true;
    if (this.invulnerableTime > this.invulnerableDuration / 2.0) {
      if (dmg <= this.lastHurt) return false;
      this.actuallyHurt(dmg - this.lastHurt);
      this.lastHurt = dmg;
      sound = false;
    } else {
      this.lastHurt = dmg;
      this.lastHealth = this.health;
      this.invulnerableTime = this.invulnerableDuration;
      this.actuallyHurt(dmg);
      this.hurtTime = this.hurtDuration = 10;
      this.hurtDuration = 10;
    }
  
    this.hurtDir = 0;
  
    if (sound) {
      this.level.broadcastEntityEvent(this, EntityEvent.HURT);
      this.markHurt();
      if (source !== null) {
        let xd = source.x - this.x;
        let zd = source.z - this.z;
        while (xd * xd + zd * zd < 0.0001) {
          xd = (Mth.random() - Mth.random()) * 0.01;
          zd = (Mth.random() - Mth.random()) * 0.01;
        }
        this.hurtDir = (Math.atan2(zd, xd) * Mth.RADDEG) - this.yRot;
        this.knockback(source, dmg, xd, zd);
      } else {
        this.hurtDir = Math.trunc(Mth.random() * 2.0) * 180.0;
      }
    }
  
    if (this.hasDied()) {
      if (sound) this.level.playSound(this, this.getDeathSound(), this.getSoundVolume(), this.getVoicePitch());
      this.die(source);
    } else {
      if (sound) this.level.playSound(this, this.getHurtSound(), this.getSoundVolume(), this.getVoicePitch());
    }
  
    return true;
  }

  actuallyHurt(dmg: number): void {
      if (!this.bypassArmor) {
        dmg = this.getDamageAfterArmorAbsorb(dmg);
      }
    this.health -= dmg;
  }

  override animateHurt(): void {
    this.hurtTime = this.hurtDuration = 10;
    this.hurtDir = 0;
  }

  getArmorValue(): number {
    let val = 0;
      
      return val;
  }

  pick(range: number, a: number): HitResult {
    let from = this.getPos(a);
    const v = this.getViewVector(a); // C++ 的 from + getViewVector(a) * range（Vec3 运算符）
    return this.level.clip(from, new Vec3(from.x + v.x * range, from.y + v.y * range, from.z + v.z * range));
  }

  travel(xa: number, ya: number): void {
    if (this.isInWater()) {
      let yo = this.y;
      this.moveRelative(xa, ya, 0.02);
      this.move(this.xd, this.yd, this.zd);
  
      this.xd *= 0.80;
      this.yd *= 0.80;
      this.zd *= 0.80;
      this.yd -= 0.02;
  
      if (this.horizontalCollision && this.isFree(this.xd, this.yd + 0.6 - this.y + yo, this.zd)) {
        this.yd = 0.3;
      }
    } else if (this.isInLava()) {
      let yo = this.y;
      this.moveRelative(xa, ya, 0.02);
      this.move(this.xd, this.yd, this.zd);
      this.xd *= 0.50;
      this.yd *= 0.50;
      this.zd *= 0.50;
      this.yd -= 0.02;
  
      if (this.horizontalCollision && this.isFree(this.xd, this.yd + 0.6 - this.y + yo, this.zd)) {
        this.yd = 0.3;
      }
    } else {
      let friction = 0.91;
      if (this.onGround) {
        friction = 0.6 * 0.91;
        let t = this.level.getTile(Mth.floor(this.x), Mth.floor(this.bb.y0 - 0.5), Mth.floor(this.z));
        if (t > 0) {
          friction = Tile.tiles[t]!.friction * 0.91;
        }
      }
  
      let friction2 = (0.6 * 0.6 * 0.91 * 0.91 * 0.6 * 0.91) / (friction * friction * friction);
      this.moveRelative(xa, ya, (this.onGround ? this.walkingSpeed * friction2 : this.flyingSpeed));
  
      friction = 0.91;
      if (this.onGround) {
        friction = 0.6 * 0.91;
        let t = this.level.getTile(Mth.floor(this.x), Mth.floor(this.bb.y0 - 0.5), Mth.floor(this.z));
        if (t > 0) {
          friction = Tile.tiles[t]!.friction * 0.91;
        }
      }
      
      if (this.onLadder()) {
        this.fallDistance = 0;
        if (this.yd < -0.15) this.yd = -0.15;
        if (this.isSneaking() && this.yd < 0) this.yd = 0;
      }
  
      this.move(this.xd, this.yd, this.zd);
  
      
      if (this.horizontalCollision && this.onLadder()) {
        this.yd = 0.2;
      }
  
      this.yd -= 0.08;
      this.yd *= 0.98;
      this.xd *= friction;
      this.zd *= friction;
    }
  
  }

  updateWalkAnim(): void {
    this.walkAnimSpeedO = this.walkAnimSpeed;
    let xxd = this.x - this.xo;
    let zzd = this.z - this.zo;
    let wst = Mth.sqrt(xxd * xxd + zzd * zzd) * 4;
    if (wst > 1) wst = 1;
    this.walkAnimSpeed += (wst - this.walkAnimSpeed) * 0.4;
    this.walkAnimPos += this.walkAnimSpeed;
  }

  aiStep(): void {
    
    TIMER_PUSH("ai");
    if (this.isImmobile()) {
      this.jumping = false;
      this.xxa = 0;
      this.yya = 0;
      this.yRotA = 0;
    } else {
      if (!this.interpolateOnly()) {
        if (this.useNewAi()) {
          TIMER_PUSH("newAi");
          this.newServerAiStep();
          TIMER_POP();
        }
        else {
          TIMER_PUSH("oldAi");
          this.updateAi();
          TIMER_POP();
        }
      }
    }
    TIMER_POP_PUSH("move");
  
    let inWater = this.isInWater();
    let inLava = this.isInLava();
  
    if (this.jumping) {
      if (inWater) {
        this.yd += 0.04;
      } else if (inLava) {
        this.yd += 0.04;
      } else if (this.onGround) {
        this.jumpFromGround();
      }
    }
  
    this.xxa *= 0.98;
    this.yya *= 0.98;
    this.yRotA *= 0.9;
  
    let normalSpeed = this.walkingSpeed;
    let normalAirControllSpeed = this.flyingSpeed;
    this.walkingSpeed *= this.getWalkingSpeedModifier();
    this.flyingSpeed  *= this.getWalkingSpeedModifier();
    this.travel(this.xxa, this.yya);
    this.walkingSpeed = normalSpeed;
    this.flyingSpeed = normalAirControllSpeed;
  
    TIMER_POP_PUSH("push");
    let player = null;
    if(this.isPlayer()) {
      player = this;
    }
    if(player === null || !player.isSleeping())  {
      let entities = this.level.getEntities(this, this.bb.grow(0.2, 0, 0.2));
      for (let i = 0; i < entities.length; i++) {
        let e = entities[i]!;
        if(e.isPlayer()) {
          let p = e as unknown as Mob; // C++ (Player*) e
          if(p.isSleeping())
            continue;
        }
        if (e.isPushable()) e.push(this);
      }
    }
    TIMER_POP();
  }

  override getEntityData(): SynchedEntityData | null {
    return this.entityData;
  }

  override addAdditonalSaveData(entityTag: CompoundTag): void {
    entityTag.putShort("Health", ((this.health << 16) >> 16));
    entityTag.putShort("HurtTime", ((this.hurtTime << 16) >> 16));
    entityTag.putShort("DeathTime", ((this.deathTime << 16) >> 16));
    entityTag.putShort("AttackTime", ((this.attackTime << 16) >> 16));
  
    
  }

  override readAdditionalSaveData(tag: CompoundTag): void {
    this.health = tag.getShort("Health");
    this.hurtTime = tag.getShort("HurtTime");
    this.deathTime = tag.getShort("DeathTime");
    this.attackTime = tag.getShort("AttackTime");
  
    
  }

  lookAt(e: Entity, yMax: number, xMax: number): void {
    let xd = e.x - this.x;
    let yd: number;
    let zd = e.z - this.z;
  
    if (false) { 
      let mob = e as Mob; // C++ (Mob*) e
      yd = (this.y + this.getHeadHeight()) - (mob.y + mob.getHeadHeight());
    } else {
      yd = (e.bb.y0 + e.bb.y1) / 2 - (this.y + this.getHeadHeight());
    }
  
    let sd = Mth.sqrt(xd * xd + zd * zd);
  
    let yRotD = (Math.atan2(zd, xd) * 180 / Mth.PI) - 90;
    let xRotD = (Math.atan2(yd, sd) * 180 / Mth.PI);
    this.xRot = -this.rotlerp(this.xRot, xRotD, xMax);
    this.yRot = this.rotlerp(this.yRot, yRotD, yMax);
  }

  isLookingAtAnEntity(): boolean {
    return this.lookingAtId !== 0;
  }

  beforeRemove(): void {
  }

  canSpawn(): boolean {
    return this.level.isUnobstructed(this.bb) && this.level.getCubes(this, this.bb).length === 0 && !this.level.containsAnyLiquid(this.bb);
  }

  getAttackAnim(a: number): number {
    let diff = this.attackAnim - this.oAttackAnim;
    if (diff < 0) diff += 1;
    return this.oAttackAnim + diff * a;
  }

  getPos(a: number): Vec3 {
    if (a === 1) {
      return new Vec3(this.x, this.y, this.z);
    }
    let x = this.xo + (this.x - this.xo) * a;
    let y = this.yo + (this.y - this.yo) * a;
    let z = this.zo + (this.z - this.zo) * a;
  
    return new Vec3(x, y, z);
  }

  getLookAngle(): Vec3 {
    return this.getViewVector(1);
  }

  getViewVector(a: number): Vec3 {
    if (a === 1) {
      let yCos = Mth.cos(-this.yRot * Mth.DEGRAD - Mth.PI);
      let ySin = Mth.sin(-this.yRot * Mth.DEGRAD - Mth.PI);
      let xCos = -Mth.cos(-this.xRot * Mth.DEGRAD);
      let xSin = Mth.sin(-this.xRot * Mth.DEGRAD);
  
      return new Vec3(ySin * xCos, xSin, yCos * xCos); 
    }
    let xRot = this.xRotO + (this.xRot - this.xRotO) * a;
    let yRot = this.yRotO + (this.yRot - this.yRotO) * a;
  
    let yCos = Mth.cos(-yRot * Mth.DEGRAD - Mth.PI);
    let ySin = Mth.sin(-yRot * Mth.DEGRAD - Mth.PI);
    let xCos = -Mth.cos(-xRot * Mth.DEGRAD);
    let xSin = Mth.sin(-xRot * Mth.DEGRAD);
  
    return new Vec3(ySin * xCos, xSin, yCos * xCos); 
  }

  getMaxSpawnClusterSize(): number {
    return 4;
  }

  override handleEntityEvent(id: number): void {
      if (id === EntityEvent.HURT) {
          this.walkAnimSpeed = 1.5;
  
          this.invulnerableTime = this.invulnerableDuration;
          this.hurtTime = this.hurtDuration = 10;
          this.hurtDir = 0;
  
          this.level.playSound(this, this.getHurtSound(), this.getSoundVolume(), this.getVoicePitch());
          this.hurt(null, 0);
      } else if (id === EntityEvent.DEATH) {
          this.level.playSound(this, this.getDeathSound(), this.getSoundVolume(), this.getVoicePitch());
          this.health = 0;
          this.die(null);
      } else {
          super.handleEntityEvent(id);
      }
  }

  swing(): void {
    if (!this.swinging || this.swingTime >= 3 || this.swingTime < 0) {
      this.swingTime = -1;
      this.swinging = true;
    }
  }

  protected override causeFallDamage(distance: number): void {
    let dmg = Math.trunc(Math.ceil(distance - 3));
  
    if (dmg > 0) {
      this.level.playSound(this, (dmg > 4)?"damage.fallbig":"damage.fallsmall", 0.75, 1);
  
      this.hurt(null, dmg);
  
      let t = this.level.getTile(Mth.floor(this.x), Mth.floor(this.y - 0.2 - this.heightOffset), Mth.floor(this.z));
      if (t > 0) {
        const soundType = Tile.tiles[t]!.soundType;
        this.level.playSound(this, soundType.getStepSound(), soundType.getVolume() * 0.5, soundType.getPitch() * 0.75);
      }
    }
  }

  protected override outOfWorld(): void {
    let oldHealth = this.health;
    this.hurt(null, 4);
    if (this.health >= oldHealth)
      this.actuallyHurt(4);
  }

  protected removeWhenFarAway(): boolean {
    return true;
  }

  protected getDeathLoot(): number {
    return 0;
  }

  protected dropDeathLoot(): void {
    let loot = this.getDeathLoot();
    if (loot > 0) {
      let count = this.random.nextInt(3);
      for (let i = 0; i < count; i++)
        this.spawnAtLocation(loot, 1);
    }
  }

  protected isImmobile(): boolean {
    return this.hasDied();
  }

  protected jumpFromGround(): void {
    this.yd = 0.42;
  }

  protected updateAi(): void {
      this.noActionTime++;
  
    let player = this.level.getNearestPlayer(this, -1);
    this.checkDespawnFrom(player);
  
      this.xxa = 0;
      this.yya = 0;
  
      let lookDistance = 8;
      if (this.random.nextFloat() < 0.02) {
          player = this.level.getNearestPlayer(this, lookDistance);
          if (player !== null) {
              this.lookingAtId = player.entityId;
              this.lookTime = 10 + this.random.nextInt(20);
          } else {
              this.yRotA = (this.random.nextFloat() - 0.5) * 20;
          }
      }
  
      if (this.lookingAtId !== 0) {
      let lookingAt = this.level.getEntity(this.lookingAtId);
      this.lookingAtId = 0;
      if (lookingAt !== null) {
        this.lookAt(lookingAt, 10, this.getMaxHeadXRot());
        if (this.lookTime-- <= 0 || lookingAt.removed || lookingAt.distanceToSqr(this) > lookDistance * lookDistance) {
                this.lookingAtId = 0;
          } else {
          this.lookingAtId = lookingAt.entityId;
        }
      }
      } else {
          if (this.random.nextFloat() < 0.05) {
              this.yRotA = (this.random.nextFloat() - 0.5) * 20;
          }
          this.yRot += this.yRotA;
          this.xRot = this.defaultLookAngle;
      }
  
      let inWater = this.isInWater();
      let inLava = this.isInLava();
      if (inWater || inLava) this.jumping = this.random.nextFloat() < 0.8;
  }

  protected newServerAiStep(): void {
    this.noActionTime++;
  
    TIMER_PUSH("checkDespawn");
    this.checkDespawn();
    this.jumping = false;
  
    TIMER_POP_PUSH("sensing");
    // DEFERRED(MobAI): if (sensing) sensing->tick();
  
    if (this.random.nextInt(5) === 0) {
      TIMER_POP_PUSH("targetSelector");
      
      // DEFERRED(MobAI): if (targetSelector) targetSelector->tick();
      
  
      TIMER_POP_PUSH("goalSelector");
      
      // DEFERRED(MobAI): if (goalSelector) goalSelector->tick();
      
    }
  
    TIMER_POP_PUSH("navigation");
    // DEFERRED(MobAI): if (navigation) navigation->tick();
  
    
    
  
    TIMER_POP_PUSH("controls");
    // DEFERRED(MobAI): if (moveControl) moveControl->tick(); 
    // DEFERRED(MobAI): if (jumpControl) jumpControl->tick();
  
    TIMER_POP();
  }

  protected override setSize(w: number, h: number): void {
    super.setSize(w, h);
  }

  protected getMaxHeadXRot(): number {
    return 10;
  }

  protected getSoundVolume(): number {
    return 1;
  }

  /** C++ 返回 const char*（可能为 NULL） */
  protected getAmbientSound(): string | null {
    return null;
  }

  protected getHurtSound(): string {
    return "random.hurt";
  }

  protected getDeathSound(): string {
    return "random.hurt";
  }

  protected getWalkingSpeedModifier(): number {
    let speed = 0.7; 
  
    
    
    
    
    
    
    return speed;
  }

  protected getDamageAfterArmorAbsorb(damage: number): number {
      let absorb = 25 - this.getArmorValue();
      let v = (damage) * absorb + this.dmgSpill;
      this.hurtArmor(damage);
      damage = v / 25;
      this.dmgSpill = v % 25;
      return damage;
  }

  protected hurtArmor(damage: number): void {}

  protected interpolateOnly(): boolean {
    return this.level.isClientSide;
  }

  protected useNewAi(): boolean {
    return false;
  }

  protected getSharedFlag(flag: number): boolean {
    return this.entityData.getFlag(SharedFlagsInformation.DATA_SHARED_FLAGS_ID, flag);
  }

  protected setSharedFlag(flag: number, value: boolean): void {
    if(value) {
      this.entityData.setFlag(SharedFlagsInformation.DATA_SHARED_FLAGS_ID, flag);
    }
    else {
      this.entityData.clearFlag(SharedFlagsInformation.DATA_SHARED_FLAGS_ID, flag);
    }
  }

  /** C++ 的两个重载：checkDespawn() 取最近的玩家后转调 checkDespawn(Mob*)（R10：后者命名为 checkDespawnFrom） */
  protected checkDespawn(): void {
    this.checkDespawnFrom(this.level.getNearestPlayer(this, -1));
  }

  protected checkDespawnFrom(nearestBlocking: Mob | null): void {
    if (nearestBlocking !== null) {
      let removeIfFar = this.removeWhenFarAway();
      let xd = nearestBlocking.x - this.x;
      let yd = nearestBlocking.y - this.y;
      let zd = nearestBlocking.z - this.z;
      let sd = xd * xd + yd * yd + zd * zd;
  
      if (removeIfFar && sd > 96 * 96) {
        
        this.remove();
      }
  
      if (this.noActionTime > 30 * SharedConstants.TicksPerSecond && this.random.nextInt(800) === 0 && removeIfFar && sd > 32 * 32)
        this.remove();
      else
        this.noActionTime = 0;
    }
  }

  protected updateAttackAnim(): void {
    if (this.swinging) {
      if (++this.swingTime >= Mob.SWING_DURATION) {
        this.swingTime = 0;
        this.swinging = false;
        
      }
    } else {
      this.swingTime = 0;
    }
  
    this.attackAnim = this.swingTime / Mob.SWING_DURATION;
  }

  private rotlerp(a: number, b: number, max: number): number {
    let diff = b - a;
    while (diff < -180)
      diff += 360;
    while (diff >= 180)
      diff -= 360;
    if (diff > max) {
      diff = max;
    }
    if (diff < -max) {
      diff = -max;
    }
    return a + diff;
  }
}
