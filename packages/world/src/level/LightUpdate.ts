/**
 * 1:1 移植自 src/world/level/LightUpdate.h 与 LightUpdate.cpp（S4）：对一个长方体区域重新计算一层光照。
 *
 * 光照是整数逻辑，本来就与 C++ 逐位一致；乘法按 C++ 的 int 语义写成 Math.imul（区域特别大时 C++ 会溢出，照原样保留）。
 *
 * 【C++ 的拷贝】LightUpdate(const LightUpdate*) 与 LightUpdate(const LightUpdate&) 两个拷贝构造合成构造函数的一个重载，
 *   operator=(const LightUpdate*) 写成 assign(t)（ADAPTED(Cpp)）。
 * 【给 S5 的 Level】Level 的 _lightUpdates 是 std::vector<LightUpdate>（按值存放），TS 里直接存对象即可：
 *   updateLights 里 C++ 先拷贝 back() 再 pop_back()，TS 里 pop() 出来的对象已不在数组里，直接 update 等价。
 *   updateLight 里 expandToContain 修改的是数组里的那一个（C++ 用的是引用），TS 里同样直接改数组元素。
 */
import { Level } from './Level';
import { LightLayer } from './LightLayer';
import { Tile } from './tile/Tile';

export class LightUpdate {
  layer: LightLayer;
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;

  // ADAPTED(Cpp)：C++ 的两个拷贝构造（const LightUpdate* 与 const LightUpdate&）合并成这一个重载
  constructor(t: LightUpdate);
  constructor(
    layer: LightLayer,
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
  );
  constructor(
    a: LightUpdate | LightLayer,
    x0?: number,
    y0?: number,
    z0?: number,
    x1?: number,
    y1?: number,
    z1?: number,
  ) {
    if (a instanceof LightUpdate) {
      this.layer = a.layer;
      this.x0 = a.x0;
      this.y0 = a.y0;
      this.z0 = a.z0;
      this.x1 = a.x1;
      this.y1 = a.y1;
      this.z1 = a.z1;
    } else {
      this.layer = a;
      this.x0 = x0!;
      this.y0 = y0!;
      this.z0 = z0!;
      this.x1 = x1!;
      this.y1 = y1!;
      this.z1 = z1!;
    }
  }

  /** ADAPTED(Cpp)：void operator=(const LightUpdate* t) */
  assign(t: LightUpdate): void {
    this.layer = t.layer;
    this.x0 = t.x0;
    this.y0 = t.y0;
    this.z0 = t.z0;
    this.x1 = t.x1;
    this.y1 = t.y1;
    this.z1 = t.z1;
  }

  update(level: Level): void {
    const layer = this.layer;
    const xd = this.x1 - this.x0 + 1;
    const yd = this.y1 - this.y0 + 1;
    const zd = this.z1 - this.z0 + 1;
    const size = Math.imul(Math.imul(xd, yd), zd);
    if (size > 16 * 16 * 128) {
      return;
    }
    let lastxc = 0;
    let lastzc = 0;
    let hasLast = false;
    let lastOk = false;
    for (let x = this.x0; x <= this.x1; x++)
      for (let z = this.z0; z <= this.z1; z++) {
        const xc = x >> 4;
        const zc = z >> 4;
        let ok = false;
        if (hasLast && xc === lastxc && zc === lastzc) {
          ok = lastOk;
        } else {
          ok = level.hasChunksAt(x, 0, z, 1);
          if (ok) {
            const lc = level.getChunk(x >> 4, z >> 4);
            if (lc.isEmpty()) ok = false;
          }
          lastOk = ok;
          lastxc = xc;
          lastzc = zc;
          // 注意：C++ 这里没有把 hasLast 置为 true，所以每一列都会重新检查区块。照原样保留。
        }
        if (ok) {
          if (this.y0 < 0) this.y0 = 0; // C++ 改的是成员本身
          if (this.y1 >= Level.DEPTH) this.y1 = Level.DEPTH - 1;
          for (let y = this.y0; y <= this.y1; y++) {
            const old = level.getBrightness(layer, x, y, z);
            let target = 0;
            const tile = level.getTile(x, y, z);
            let block = Tile.lightBlock[tile]!;
            if (block === 0) block = 1;
            let emit = 0;
            if (layer === LightLayer.Sky) {
              if (level.isSkyLit(x, y, z)) emit = 15;
            } else if (layer === LightLayer.Block) {
              emit = Tile.lightEmission[tile]!;
            }
            if (block >= 15 && emit === 0) {
              target = 0;
            } else {
              const d0 = level.getBrightness(layer, x - 1, y, z);
              const d1 = level.getBrightness(layer, x + 1, y, z);
              const d2 = level.getBrightness(layer, x, y - 1, z);
              const d3 = level.getBrightness(layer, x, y + 1, z);
              const d4 = level.getBrightness(layer, x, y, z - 1);
              const d5 = level.getBrightness(layer, x, y, z + 1);
              target = d0;
              if (d1 > target) target = d1;
              if (d2 > target) target = d2;
              if (d3 > target) target = d3;
              if (d4 > target) target = d4;
              if (d5 > target) target = d5;
              target -= block;
              if (target < 0) target = 0;
              if (emit > target) target = emit;
            }
            if (old !== target) {
              level.setBrightness(layer, x, y, z, target);
              let t = target - 1;
              if (t < 0) t = 0;
              level.updateLightIfOtherThan(layer, x - 1, y, z, t);
              level.updateLightIfOtherThan(layer, x, y - 1, z, t);
              level.updateLightIfOtherThan(layer, x, y, z - 1, t);
              // 怪癖保留：C++ 写的是 x+1 >= x1 等（循环里 x <= x1，所以恒成立），三个方向照抄。
              if (x + 1 >= this.x1) level.updateLightIfOtherThan(layer, x + 1, y, z, t);
              if (y + 1 >= this.y1) level.updateLightIfOtherThan(layer, x, y + 1, z, t);
              if (z + 1 >= this.z1) level.updateLightIfOtherThan(layer, x, y, z + 1, t);
            }
          }
        }
      }
  }

  expandToContain(
    _x0: number,
    _y0: number,
    _z0: number,
    _x1: number,
    _y1: number,
    _z1: number,
  ): boolean {
    const { x0, y0, z0, x1, y1, z1 } = this;
    if (_x0 >= x0 && _y0 >= y0 && _z0 >= z0 && _x1 <= x1 && _y1 <= y1 && _z1 <= z1) return true;
    const r = 1;
    if (
      _x0 >= x0 - r &&
      _y0 >= y0 - r &&
      _z0 >= z0 - r &&
      _x1 <= x1 + r &&
      _y1 <= y1 + r &&
      _z1 <= z1 + r
    ) {
      const xs = x1 - x0;
      const ys = y1 - y0;
      const zs = z1 - z0;
      if (_x0 > x0) _x0 = x0;
      if (_y0 > y0) _y0 = y0;
      if (_z0 > z0) _z0 = z0;
      if (_x1 < x1) _x1 = x1;
      if (_y1 < y1) _y1 = y1;
      if (_z1 < z1) _z1 = z1;
      const _xs = _x1 - _x0;
      const _ys = _y1 - _y0;
      const _zs = _z1 - _z0;
      const os = Math.imul(Math.imul(xs, ys), zs);
      const ns = Math.imul(Math.imul(_xs, _ys), _zs);
      if (ns - os <= 2) {
        this.x0 = _x0;
        this.y0 = _y0;
        this.z0 = _z0;
        this.x1 = _x1;
        this.y1 = _y1;
        this.z1 = _z1;
        return true;
      }
    }
    return false;
  }
}
