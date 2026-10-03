/**
 * 1:1 移植自 src/world/level/tile/entity/NetherReactorTileEntity.h 与 .cpp（S12 阶段 C，部分移植）。
 * 部分：生成僵尸猪人（MobFactory、MobSpawner，计划外）DEFERRED(Mob)；生成物品、建造与风化下界穹顶照常执行。
 * 由 C++ 类转写脚本生成初稿后人工核对。
 */
import { SharedConstants } from '@mcpe/core';
import { CompoundTag } from '@mcpe/nbt';
import { Mth } from '@mcpe/util';
import { Difficulty } from '../../../Difficulty';
import { createItemEntity } from '../../../entity/Entity';
import { MobTypes } from '../../../entity/EntityTypes';
import { Item } from '../../../item/Item';
import { ItemInstance } from '../../../item/ItemInstance';
import { AABB } from '../../../phys/AABB';
import { Vec3 } from '../../../phys/Vec3';
import { LevelConstants } from '../../LevelConstants';
import { NetherReactor } from '../NetherReactor';
import { NetherReactorPattern } from '../NetherReactorPattern';
import { Tile } from '../Tile';
import { TileEntity, TileEntityType } from './TileEntity';

export class NetherReactorTileEntity extends TileEntity {
  private static readonly NUM_PIG_ZOMBIE_SLOTS = 3;
  private isInitialized: boolean = false;
  private hasFinished: boolean = false;
  private curLevel: number = 0;
  private progress: number = 0;

  constructor() {
      super(TileEntityType.NetherReactor);
      this.isInitialized = false;
      this.progress = 0;
      this.curLevel = 0;
      this.hasFinished = false; }

  override shouldSave(): boolean {
    return true;
  }

  lightItUp(x: number, y: number, z: number): void {
    
    this.curLevel = 0;
    NetherReactor.setPhase(this.level!, x, y, z, 1);
      this.isInitialized = true;
      
      this.buildDome(x, y, z);
      
      this.level!.setNightMode(true);
    
  }

  buildDome(x: number, y: number, z: number): void {
    this.buildFloorVolume(x, y - 3, z, 8, 2, Tile.netherrack.id);
    this.buildHollowedVolume(x, y - 1, z, 8, 4, Tile.netherrack.id, 0);
    this.buildFloorVolume(x, y - 1 + 4, z, 8, 1, Tile.netherrack.id);
    this.buildCrockedRoofVolume(false, x, y - 1 + 5, z, 8, 1, Tile.netherrack.id);
    this.buildCrockedRoofVolume(true, x, y - 1 + 6, z, 5, 8, Tile.netherrack.id);
    this.buildCrockedRoofVolume(false, x, y + -1 + 12, z, 3, 14, Tile.netherrack.id);
  }

  clearDomeSpace(x: number, y: number, z: number): void {
    for(let curX = -12; curX <= 12; ++curX) {
      for(let curY = -3; curY < 40; ++curY) {
        for(let curZ = -12; curZ <= 12; ++curZ) {
          if(curY > 2 || curX < -1 || curX > 1 || curZ < -1 || curZ > 1)
            this.level!.setTile(curX + x, curY + y, curZ + z, 0);
        }
      }
    }
  }

  override tick(): void {
    if(this.level!.isClientSide)
      return;
    if(this.progress < 0) {
      this.remove = true;
    }
    if(this.isInitialized && !this.hasFinished) {
      this.progress++;
      if(this.progress % SharedConstants.TicksPerSecond === 0) {
        let currentTime = this.progress / SharedConstants.TicksPerSecond;
        if(currentTime < 10) {
          this.tickGlowingRedstoneTransformation(currentTime);
        }
        if(currentTime > 42 && currentTime <= 45) {
          
          let currentLayer = 45 - currentTime;
          this.turnGlowingObsidianLayerToObsidian(currentLayer);
        }
        if(this.checkLevelChange(this.progress / SharedConstants.TicksPerSecond)) {
          this.curLevel++;
          this.spawnItems(this.getNumItemsPerLevel(this.curLevel));
          this.trySpawnPigZombies(NetherReactorTileEntity.NUM_PIG_ZOMBIE_SLOTS, this.getNumEnemiesPerLevel(this.curLevel));
        }
      }  
      if(this.progress > SharedConstants.TicksPerSecond * 46) {
        this.finishReactorRun();
      }
    } else if(this.hasFinished) {
      if(this.progress % SharedConstants.TicksPerSecond * 60 === 0) {
        if(this.playersAreCloseBy()) {
          this.trySpawnPigZombies(2, 3);
        } else {
          this.killPigZombies();
        }
      }
    }
  }

  finishReactorRun(): void {
    NetherReactor.setPhase(this.level!, this.x, this.y, this.z, 2);
    this.level!.setNightMode(false);
    this.hasFinished = true;
    this.deterioateDome(this.x, this.y, this.z);
    for(let curX = this.x - 1; curX <= this.x + 1; ++curX) {
      for(let curY = this.y - 1; curY <= this.y + 1; ++curY) {
        for(let curZ = this.z - 1; curZ <= this.z + 1; ++curZ) {
          if(curX !== this.x || curY !== this.y || curZ !== this.z)
            this.level!.setTile(curX, curY, curZ, Tile.obsidian.id);
        }
      }
    }
  }

  override save(tag: CompoundTag): boolean {
    super.save(tag);
    tag.putBoolean("IsInitialized", this.isInitialized);
    tag.putShort("Progress", this.progress);
    tag.putBoolean("HasFinished", this.hasFinished);
    if(this.isInitialized && !this.hasFinished)
      this.level!.setNightMode(true);
    return true;
  }

  override load(tag: CompoundTag): void {
    super.load(tag);
    this.isInitialized = tag.getBoolean("IsInitialized");
    if(this.isInitialized) {
      this.progress = tag.getShort("Progress");
      this.hasFinished = tag.getBoolean("HasFinished");
    }
  }

  getNumEnemiesPerLevel(curLevel: number): number {
    if(curLevel === 0)
      return 3;
    else if(curLevel < 4)
      return 2;
    else if(curLevel < 6)
      return Mth.Max(0, this.level!.random.nextInt(2));
    else
      return Mth.Max(0, this.level!.random.nextInt(1));
  }

  getNumItemsPerLevel(curLevel: number): number {
    if(curLevel === 0)
      return 3 * 3;
    else if(curLevel < 4)
      return 5 * 3;
    else if(curLevel < 8)
      return Mth.Max(0, this.level!.random.nextInt(14 * 3) - 4);
    else
      return Mth.Max(0, this.level!.random.nextInt(9 * 3) - 2);
  }

  spawnItems(numItems: number): void {
    for (let ii = 0; ii < numItems ; ii++) {
      this.spawnItem();
    }
  }

  getName(): string {
      
    return "NetherReactor";
  }

  spawnEnemy(): void {
    // DEFERRED(Mob): Mob* mob = MobFactory::CreateMob(MobTypes::PigZombie, level);（僵尸猪人，计划外）
    let enemyPosition = this.getSpawnPosition(3, 4, -1);
    while(enemyPosition.x < 0 || enemyPosition.z < 0 || enemyPosition.x >= LevelConstants.LEVEL_WIDTH || enemyPosition.z >= LevelConstants.LEVEL_DEPTH) {
      enemyPosition = this.getSpawnPosition(3, 4, -1);
    }
    // DEFERRED(Mob): MobSpawner::addMob(level, mob, enemyPosition.x, enemyPosition.y, enemyPosition.z, 0, 0, true);
  }

  spawnItem(): void {
    let itemPosition= this.getSpawnPosition(3, 4, -1);
    while(itemPosition.x < 0 || itemPosition.z < 0 || itemPosition.x >= LevelConstants.LEVEL_WIDTH || itemPosition.z >= LevelConstants.LEVEL_DEPTH) {
      itemPosition = this.getSpawnPosition(3, 4, -1);
    }
    let item = createItemEntity(this.level!, itemPosition.x, itemPosition.y, itemPosition.z, this.getSpawnItem());
  
    item.throwTime = 10;
    item.age = item.getLifeTime() - SharedConstants.TicksPerSecond * 30;
    this.level!.addEntity(item);
  }

  getSpawnItem(): ItemInstance {
    let itemType = this.level!.random.nextInt(8);
    switch(itemType) {
        case 0: return new ItemInstance(Item.yellowDust, 3);
      case 1: return new ItemInstance(Item.seeds_melon);
      case 2: return new ItemInstance(Tile.mushroom1);
      case 3: return new ItemInstance(Tile.mushroom2);
      case 4: return new ItemInstance(Item.reeds);
      case 5: return new ItemInstance(Tile.cactus);
      case 6: return new ItemInstance(Item.netherQuartz, 4);
      default: return this.GetLowOddsSpawnItem();
    }
  }

  GetLowOddsSpawnItem(): ItemInstance {
    if(this.level!.random.nextInt(10) <= 9 ) {
      const items: Item[] = [Item.arrow, Item.bed, Item.bone, Item.book, Item.bow, Item.bowl, Item.feather, Item.painting, Item.door_wood]; // static Item* items[]
      let itemIndex = this.level!.random.nextInt(items.length);
      let itemToSpawn = items[itemIndex];
      return new ItemInstance(itemToSpawn!);
    } else {
      const tiles: Tile[] = [Tile.bookshelf]; // static Tile* tiles[]
      let tileIndex = this.level!.random.nextInt(tiles.length);
      let tileToSpawn = tiles[tileIndex];
      return new ItemInstance(tileToSpawn!);
    }
  }

  checkLevelChange(progress: number): boolean {
    const levelChangeTime = [10, 13, 20, 22, 25, 30, 34, 36, 38, 40]; // static const int levelChangeTime[]
    let count = levelChangeTime.length;
    for(let a = 0; a < count; ++a) {
      if(levelChangeTime[a] === progress)
        return true;
    }
    return false;
  }

  numOfFreeEnemySlots(): number {
    let numPigZombiesFound = 0;
    let bb = new AABB(this.x, this.y, this.z, this.x + 1.0, this.y + 1.0, this.z + 1.0);
    let nearby =  this.level!.getEntities(null, bb.grow(7, 7, 7));
    for (const it of nearby) {
      if(it.getEntityTypeId() === MobTypes.PigZombie && it.isAlive()) {
        numPigZombiesFound++;
      }
    }
    return NetherReactorTileEntity.NUM_PIG_ZOMBIE_SLOTS - numPigZombiesFound; 
  }

  trySpawnPigZombies(maxNumOfEnemies: number, maxToSpawn: number): void {
    if(this.level!.difficulty === Difficulty.PEACEFUL)
      return;
    let currentNumOfPigZombies = NetherReactorTileEntity.NUM_PIG_ZOMBIE_SLOTS - this.numOfFreeEnemySlots();
    if(currentNumOfPigZombies < maxNumOfEnemies) {
      for(let a = 0;  a < maxToSpawn && currentNumOfPigZombies < maxNumOfEnemies; ++a) {
        this.spawnEnemy();
        currentNumOfPigZombies++;
      }
    }
  }

  tickGlowingRedstoneTransformation(currentTime: number): void {
    switch(currentTime) {
      case 2: return this.turnLayerToGlowingObsidian(0, Tile.stoneBrick.id);
      case 3: return this.turnLayerToGlowingObsidian(1, Tile.stoneBrick.id);
      case 4: return this.turnLayerToGlowingObsidian(2, Tile.stoneBrick.id);
      case 7: return this.turnLayerToGlowingObsidian(0, Tile.goldBlock.id);
      case 8: return this.turnLayerToGlowingObsidian(1, Tile.goldBlock.id);
      case 9: return this.turnLayerToGlowingObsidian(2, Tile.goldBlock.id);
    }
  }

  turnLayerToGlowingObsidian(layer: number, type: number): void {
    let pattern = new NetherReactorPattern();
    for(let checkX = -1; checkX <= 1; ++checkX) {
      for(let checkZ = -1; checkZ <= 1; ++checkZ) {
        if(pattern.getTileAt(layer, checkX + 1, checkZ + 1) === type) {
          this.level!.setTile(this.x + checkX, this.y - 1 + layer, this.z + checkZ, Tile.glowingObsidian.id);
        }
      }
    }
  }

  turnGlowingObsidianLayerToObsidian(layer: number): void {
    let pattern = new NetherReactorPattern();
    for(let checkX = -1; checkX <= 1; ++checkX) {
      for(let checkZ = -1; checkZ <= 1; ++checkZ) {
        if(this.level!.getTile(this.x + checkX, this.y - 1 + layer, this.z + checkZ) !== Tile.netherReactor.id) {
          this.level!.setTile(this.x + checkX, this.y - 1 + layer, this.z + checkZ, Tile.obsidian.id);
        }
      }
    }
  }

  getSpawnPosition(minDistance: number, varibleDistance: number, offset: number): Vec3 {
    let distance = minDistance + this.level!.random.nextFloat() * varibleDistance;
    let rad = this.level!.random.nextFloat() * Mth.TWO_PI;
    return new Vec3(Math.sin(rad) * distance + this.x, offset + this.y, Math.cos(rad) * distance + this.z);
  }

  buildHollowedVolume(x: number, y: number, z: number, expandWidth: number, height: number, wallTileId: number, clearTileId: number): void {
    for(let curY = 0; curY < height; ++curY) {
      for(let curX = -expandWidth; curX <= expandWidth; ++curX) {
        for(let curZ = -expandWidth; curZ <= expandWidth; ++curZ) {
          if((curX === -expandWidth || curX === expandWidth)
          || (curZ === -expandWidth || curZ === expandWidth)) {
            this.level!.setTile(curX + x, curY + y, curZ + z, wallTileId);
          } else if(curY > 2 || curX < -1 || curX > 1 || curZ < -1 || curZ > 1) {
            this.level!.setTile(curX + x, curY + y, curZ + z, clearTileId);
          }
        }
      }
    }
  }

  buildFloorVolume(x: number, y: number, z: number, expandWidth: number, height: number, tileId: number): void {
    for(let curY = 0; curY < height; ++curY) {
      for(let curX = -expandWidth; curX <= expandWidth; ++curX) {
        for(let curZ = -expandWidth; curZ <= expandWidth; ++curZ) {
          this.level!.setTile(curX + x, curY + y, curZ + z, tileId);
        }
      }
    }
  }

  buildCrockedRoofVolume(inverted: boolean, x: number, y: number, z: number, expandWidth: number, height: number, tileId: number): void {
    let fullHeight = height + expandWidth;
    for(let curX = -expandWidth; curX <= expandWidth; ++curX) {
      for(let curZ = -expandWidth; curZ <= expandWidth; ++curZ) {
        let offset = inverted ? ((-curX - curZ) / 2) : ((curX + curZ) / 2);
        let acceptHeight = fullHeight + offset;
        for(let curY = 0; curY < fullHeight + expandWidth; ++curY) {
          if(acceptHeight >= curY
            && (this.isEdge(curX, expandWidth, curZ)
            || acceptHeight === curY )) {
              this.level!.setTile(curX + x, curY + y, curZ + z, tileId);
          }
        }
      }
    }
  }

  isEdge(curX: number, expandWidth: number, curZ: number): boolean {
    return (curX === -expandWidth || curX === expandWidth)
      || (curZ === -expandWidth || curZ === expandWidth);
  }

  deterioateDome(x: number, y: number, z: number): void {
    this.deterioateHollowedVolume(x, y - 1, z, 8, 5, 0);
    this.deterioateCrockedRoofVolume(false, x, y - 1 + 5, z, 8, 1, 0);
    this.deterioateCrockedRoofVolume(true, x, y - 1 + 6, z, 5, 8, 0);
    this.deterioateCrockedRoofVolume(false, x, y + -1 + 12, z, 3, 14, 0);
  }

  deterioateCrockedRoofVolume(inverted: boolean, x: number, y: number, z: number, expandWidth: number, height: number, tileId: number): void {
    let fullHeight = height + expandWidth;
    for(let curX = -expandWidth; curX <= expandWidth; ++curX) {
      for(let curZ = -expandWidth; curZ <= expandWidth; ++curZ) {
        let offset = inverted ? ((-curX - curZ) / 2) : ((curX + curZ) / 2);
        let acceptHeight = fullHeight + offset;
        for(let curY = 0; curY < fullHeight + expandWidth; ++curY) {
          if(acceptHeight >= curY
            && (this.isEdge(curX, expandWidth, curZ))) {
              if(this.level!.random.nextInt(4) === 0) {
                this.level!.setTile(curX + x, curY + y, curZ + z, tileId);
              }
          }
        }
      }
    }
  }

  deterioateHollowedVolume(x: number, y: number, z: number, expandWidth: number, height: number, tileId: number): void {
    for(let curY = 0; curY < height; ++curY) {
      for(let curX = -expandWidth; curX <= expandWidth; ++curX) {
        for(let curZ = -expandWidth; curZ <= expandWidth; ++curZ) {
          if((curX === -expandWidth || curX === expandWidth)
            || (curZ === -expandWidth || curZ === expandWidth)) {
              if(this.level!.random.nextInt(3) === 0)
                this.level!.setTile(curX + x, curY + y, curZ + z, tileId);
          }
        }
      }
    }
  }

  playersAreCloseBy(): boolean {
    let numPlayers = 0;
    let bb = new AABB(this.x, this.y, this.z, this.x + 1.0, this.y + 1.0, this.z + 1.0);
    let nearby =  this.level!.getEntities(null, bb.grow(40, 40, 40));
    for (const it of nearby) {
      if(it.isPlayer() && it.isAlive() ) {
        if(it.distanceTo(this.x, this.y, this.z) < 40)
          numPlayers++;
      }
    }
    return numPlayers !== 0;
  }

  killPigZombies(): void {
    let bb = new AABB(this.x, this.y, this.z, this.x + 1.0, this.y + 1.0, this.z + 1.0);
    let nearby =  this.level!.getEntities(null, bb.grow(40, 40, 40));
    for (const it of nearby) {
      if(it.getEntityTypeId() === MobTypes.PigZombie) {
        it.remove();
      }
    }
  }
}
