// 1:1 移植自 src/world/level/LevelListener.h（析构函数按 R3 不移植；addParticle 的联合签名是 TS 适配，见文件内标记）
import type { ParticleType } from '../entity/EntityTypes';
import type { Entity } from '../entity/Entity';
import type { TripodCamera } from '../entity/item/TripodCamera';
import type { Player } from '../entity/player/Player';
import type { TileEntity } from './tile/entity/TileEntity';

export class LevelListener {
  // OMIT(LevelListener): virtual ~LevelListener() {}  LevelListener.h:17 —— 空析构函数，R3 不移植。
  setTilesDirty(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {}

  tileChanged(x: number, y: number, z: number): void {}

  tileBrightnessChanged(x: number, y: number, z: number): void {
    this.tileChanged(x, y, z);
  }

  skyColorChanged(): void {}

  allChanged(): void {}

  takePicture(cam: TripodCamera, entity: Entity): void {}

  addParticle(
    name: string,
    x: number,
    y: number,
    z: number,
    xa: number,
    ya: number,
    za: number,
    data: number,
  ): void;
  addParticle(
    name: ParticleType.Id,
    x: number,
    y: number,
    z: number,
    xa: number,
    ya: number,
    za: number,
    data: number,
  ): void;
  // ADAPTED(Cpp): C++ 只有 string / ParticleType::Id 两个重载；Level.addParticle 的形参是
  // `string | ParticleType.Id`，原样转发时需要这个联合签名。
  addParticle(
    name: string | ParticleType.Id,
    x: number,
    y: number,
    z: number,
    xa: number,
    ya: number,
    za: number,
    data: number,
  ): void;
  addParticle(
    name: string | ParticleType.Id,
    x: number,
    y: number,
    z: number,
    xa: number,
    ya: number,
    za: number,
    data: number,
  ): void {}

  playSound(name: string, x: number, y: number, z: number, volume: number, pitch: number): void {}

  playMusic(name: string, x: number, y: number, z: number, songOffset: number): void {}

  playStreamingMusic(name: string, x: number, y: number, z: number): void {}

  entityAdded(entity: Entity): void {}

  entityRemoved(entity: Entity): void {}

  levelEvent(
    source: Player | null,
    type: number,
    x: number,
    y: number,
    z: number,
    data: number,
  ): void {}

  tileEvent(x: number, y: number, z: number, b0: number, b1: number): void {}

  tileEntityChanged(x: number, y: number, z: number, te: TileEntity): void {}
}
