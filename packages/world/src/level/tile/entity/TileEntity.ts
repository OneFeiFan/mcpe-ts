/**
 * 1:1 移植自 src/world/level/tile/entity/TileEntity.h 与 TileEntity.cpp（S11 阶段 A）。替换原来的 FORWARD-DECL(TileEntity)。
 * 包括同一对文件里的 TileEntityType、TileEntityFactory 与自由函数 partitionTileEntities。
 *
 * ADAPTED(ESM)：工厂的 switch 要 new 四个子类，而子类文件都 import 本文件；为避免 ES 模块循环，子类由 TileEntityInclude.ts 注入
 *   （与 TileInclude、MaterialInclude 同一做法）。没有注入的子类在被创建时报出写明原因的错误。
 * C++ 的 x、y、z 没有初始化，这里取 0；std::map<std::string,int> 与 std::map<int,std::string> 写成 Map。
 * partitionTileEntities 里的 std::map<TilePos, …> 按 TilePos::operator<（比较 hashCode）判等，所以用 hashCode 作键。
 */
import { LOGE, LOGI } from '@mcpe/platform';
import type { CompoundTag } from '@mcpe/nbt';
import type { Level } from '../../Level';
import { TilePos } from '../../TilePos';
import { Tile } from '../Tile';
import { TileEntityRendererId } from './TileEntityRendererId';

export class TileEntityType {
  static readonly Undefined = 0;
  static readonly Furnace = 1;
  static readonly Chest = 2;
  static readonly NetherReactor = 3;
  static readonly Sign = 4;
}

/** ADAPTED(ESM)：由 TileEntityInclude.ts 注入的子类 */
export interface TileEntityClasses {
  Furnace?: new () => TileEntity;
  Chest?: new () => TileEntity;
  Sign?: new () => TileEntity;
  NetherReactor?: new () => TileEntity;
}

export class TileEntityFactory {
  static classes: TileEntityClasses = {};

  private static need(name: keyof TileEntityClasses, when: string): new () => TileEntity {
    const c = TileEntityFactory.classes[name];
    if (!c)
      throw new Error(`${name}TileEntity 尚未移植（${when}），或没有经 TileEntityInclude 注入`);
    return c;
  }

  static createTileEntity(type: number): TileEntity | null {
    switch (type) {
      case TileEntityType.Furnace:
        return new (TileEntityFactory.need('Furnace', 'S12 阶段 A'))();
      case TileEntityType.Chest:
        return new (TileEntityFactory.need('Chest', 'S12 阶段 C'))();
      case TileEntityType.Sign:
        return new (TileEntityFactory.need('Sign', 'S11 阶段 A'))();
      case TileEntityType.NetherReactor:
        return new (TileEntityFactory.need('NetherReactor', 'S12 阶段 C'))();
      default:
        LOGE(`Can't find TileEntity of type: ${type}`);
        return null;
    }
  }
}

export abstract class TileEntity {
  private static _runningId = 0;
  private static idClassMap = new Map<string, number>();
  private static classIdMap = new Map<number, string>();

  level: Level | null = null;
  x = 0; // C++ 未初始化
  y = 0;
  z = 0;
  data = -1;
  type: number;
  runningId: number;
  clientSideOnly = false;
  rendererId: TileEntityRendererId = TileEntityRendererId.TR_DEFAULT_RENDERER;
  protected tile: Tile | null = null;
  protected remove = false;

  constructor(tileEntityType: number) {
    this.type = tileEntityType;
    this.runningId = ++TileEntity._runningId;
  }

  static initTileEntities(): void {
    TileEntity.setId(TileEntityType.Furnace, 'Furnace');
    TileEntity.setId(TileEntityType.Chest, 'Chest');
    TileEntity.setId(TileEntityType.NetherReactor, 'NetherReactor');
    TileEntity.setId(TileEntityType.Sign, 'Sign');
  }

  static teardownTileEntities(): void {}

  abstract shouldSave(): boolean;

  load(tag: CompoundTag): void {
    this.x = tag.getInt('x');
    this.y = tag.getInt('y');
    this.z = tag.getInt('z');
    LOGI(`Loaded tile entity @ ${this.x}, ${this.y}, ${this.z}`);
  }

  save(tag: CompoundTag): boolean {
    const it = TileEntity.classIdMap.get(this.type);
    if (it === undefined) {
      LOGE(`TileEntityType ${this.type} is missing a mapping! This is a bug!`);
      return false;
    }
    tag.putString('id', it);
    tag.putInt('x', this.x);
    tag.putInt('y', this.y);
    tag.putInt('z', this.z);
    return true;
  }

  tick(): void {}

  isFinished(): boolean {
    return false;
  }

  static loadStatic(tag: CompoundTag): TileEntity | null {
    let entity: TileEntity | null = null;
    const id = tag.getString('id');
    const cit = TileEntity.idClassMap.get(id);
    if (cit !== undefined) {
      entity = TileEntityFactory.createTileEntity(cit);
      if (entity) {
        entity.load(tag);
      } else LOGE(`Couldn't create TileEntity of type: '${cit}'`);
    } else {
      LOGE(`Couldn't find TileEntity type: '${id}'`);
    }
    return entity;
  }

  setLevelAndPos(level: Level | null, x: number, y: number, z: number): void {
    this.level = level;
    this.x = x;
    this.y = y;
    this.z = z;
    if (level) {
      this.tile = Tile.tiles[level.getTile(x, y, z)] ?? null;
    }
  }

  getData(): number {
    if (this.data === -1) this.data = this.level!.getData(this.x, this.y, this.z);
    return this.data;
  }

  setData(data: number): void {
    this.data = data;
    this.level!.setData(this.x, this.y, this.z, data);
  }

  setChanged(): void {
    if (this.level !== null) {
      this.data = this.level.getData(this.x, this.y, this.z);
      this.level.tileEntityChanged(this.x, this.y, this.z, this);
    }
  }

  distanceToSqr(xPlayer: number, yPlayer: number, zPlayer: number): number {
    const xd = this.x + 0.5 - xPlayer;
    const yd = this.y + 0.5 - yPlayer;
    const zd = this.z + 0.5 - zPlayer;
    return xd * xd + yd * yd + zd * zd;
  }

  getTile(): Tile | null {
    if (this.tile === null)
      this.tile = Tile.tiles[this.level!.getTile(this.x, this.y, this.z)] ?? null;
    return this.tile;
  }

  /** C++ 返回 Packet*；网络未移植，基类返回 NULL */
  getUpdatePacket(): unknown {
    return null;
  }

  isRemoved(): boolean {
    return this.remove;
  }

  setRemoved(): void {
    this.remove = true;
  }

  clearRemoved(): void {
    this.remove = false;
  }

  triggerEvent(_b0: number, _b1: number): void {}

  clearCache(): void {
    this.tile = null;
    this.data = -1;
  }

  /** C++ 的两个重载：成员 isType(Type) 与静态 isType(te, Type) */
  isType(Type: number): boolean {
    return this.type === Type;
  }

  static isType(te: TileEntity | null, Type: number): boolean {
    return te !== null && te.isType(Type);
  }

  private static setId(type: number, id: string): void {
    if (TileEntity.idClassMap.has(id)) {
      LOGE(`Duplicate id: ${id}`);
      return;
    }
    TileEntity.idClassMap.set(id, type);
    if (!TileEntity.classIdMap.has(type)) TileEntity.classIdMap.set(type, id); // std::map::insert 不覆盖
  }
}

export function partitionTileEntities(
  input: readonly TileEntity[],
  keep: TileEntity[],
  dontKeep: TileEntity[],
): number {
  const m = new Map<number, TileEntity>(); // std::map<TilePos, TileEntity*>，按 hashCode 判等
  for (let i = 0; i < input.length; ++i) {
    const e = input[i]!;
    const p = new TilePos(e.x, e.y, e.z);
    if (!m.has(p.hashCode()) && e.shouldSave()) {
      m.set(p.hashCode(), e);
      keep.push(e);
    } else dontKeep.push(e);
  }
  return keep.length;
}
