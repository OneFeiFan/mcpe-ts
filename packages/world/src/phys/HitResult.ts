// 1:1 移植自 src/world/phys/HitResult.h 与 HitResult.cpp
// R10：C++ 的 distanceTo 返回的是距离平方（名字与语义不符），这里叫 distanceToSqr。
import { Vec3 } from './Vec3';
import type { Entity } from '../entity/Entity';

const f = Math.fround;

export const enum HitResultType {
  TILE = 0,
  ENTITY = 1,
  NO_HIT = 2,
}

export class HitResult {
  public type: HitResultType;
  public x: number;
  public y: number;
  public z: number;
  public f: number;
  public pos: Vec3;
  public entity: Entity | null;
  public indirectHit: boolean; // 当玩家站在一个方块上时，如果玩家没有直接看着这个方块，而是通过其他方式（例如通过旁边的方块或其他物体）间接地与这个方块发生碰撞，那么 indirectHit 就会被设置为 true。这个标志可以用于区分玩家是否直接与方块交互，还是通过其他方式间接地与方块交互。

  constructor();

  constructor(x: number, y: number, z: number, f: number, pos: Vec3);

  constructor(entity: Entity);

  constructor(hitResult: HitResult);

  constructor(
    arg0?: number | Entity | HitResult,
    arg1?: number,
    arg2?: number,
    arg3?: number,
    arg4?: Vec3,
  ) {
    // 先完整初始化对象字段，保证对象 shape 稳定。
    // C++ 的默认构造只初始化 type / entity / indirectHit；x / y / z / f 是未初始化内存
    // （读它们是 UB），按方案统一取 0。
    this.type = HitResultType.NO_HIT;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.f = 0;
    this.pos = new Vec3();
    this.entity = null;
    this.indirectHit = false;

    // HitResult()
    if (arguments.length === 0) {
      return;
    }

    // HitResult(const HitResult&)
    if (arg0 instanceof HitResult) {
      this.type = arg0.type;
      this.x = arg0.x;
      this.y = arg0.y;
      this.z = arg0.z;
      this.f = arg0.f;
      this.pos.set(arg0.pos.x, arg0.pos.y, arg0.pos.z);
      this.entity = arg0.entity;
      this.indirectHit = arg0.indirectHit;
      return;
    }

    // HitResult(int, int, int, int, const Vec3&)
    if (typeof arg0 === 'number') {
      if (arg1 === undefined || arg2 === undefined || arg3 === undefined || arg4 === undefined) {
        throw new TypeError('HitResult tile constructor requires 5 arguments');
      }

      this.type = HitResultType.TILE;
      // C++ 的 x / y / z / f 是 int；调用方（Tile::clip 的 xt/yt/zt、AABB.clip 的 0/face）都是整数。
      this.x = arg0;
      this.y = arg1;
      this.z = arg2;
      this.f = arg3;
      this.pos.set(arg4.x, arg4.y, arg4.z);
      this.entity = null;
      this.indirectHit = false;

      return;
    }

    // HitResult(Entity*)
    // ADAPTED(ESM): Entity 用类型导入——值导入会形成 Entity → Level → HitResult 的模块循环。
    // 前面的分支已排除 HitResult / number，剩下的对象参数就是实体，按字段读取 x / y / z。
    if (arg0 !== undefined && typeof arg0 === 'object') {
      this.type = HitResultType.ENTITY;
      this.entity = arg0;
      // C++：pos(entity->x, entity->y, entity->z) —— 走 Vec3 构造函数，-0 会变成 +0。
      this.pos = new Vec3(arg0.x, arg0.y, arg0.z);
      this.indirectHit = false;
      return;
    }

    throw new TypeError('Invalid HitResult constructor arguments');
  }

  /** C++ `float distanceTo(Entity*)`：名字是 distanceTo，返回的却是距离平方。 */
  public distanceToSqr(entity: Entity): number {
    const xd = f(this.pos.x - entity.x);
    const yd = f(this.pos.y - entity.y);
    const zd = f(this.pos.z - entity.z);

    // C++：`xd * xd + yd * yd + zd * zd`，从左到右、每一步都是 float。
    return f(f(f(xd * xd) + f(yd * yd)) + f(zd * zd));
  }

  public isHit(): boolean {
    return this.type !== HitResultType.NO_HIT;
  }
}
