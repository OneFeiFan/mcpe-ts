/**
 * 1:1 移植自 src/client/renderer/Tesselator.h 与 Tesselator.cpp（S6）：顶点构建器。
 *
 * 顶点格式是 VertexDeclPTCN（36 字节：pos 3f@0、uv 2f@12、color u32@20、normal 3f@24），存在一块 ArrayBuffer 里，
 * 用 Float32Array 与 Uint32Array 两个视图读写（等价于 C++ 的 VERTEX 数组）。instance 的缓冲是 sizeof(GLfloat) × MAX_FLOATS ＝ 8 MB。
 * GL_QUADS：每凑够 4 个顶点就补出第 1、3 个的拷贝，输出 v0,v1,v2,v0,v2,v3 两个三角形（从不把 GL_QUADS 交给 GL）。
 * USE_VBO：end() 只上传到 VBO 并返回 RenderChunk；draw() 上传后立刻画。
 *
 * 【C++ 的 color 重载】同样参数个数、只靠 int / float 区分的重载，JS 分不出来，写成不同名字（调用处要按 C++ 的实参类型选）：
 *   color(int c)、color(int c, int alpha)                → color(c)、color(c, alpha)
 *   color(float r, g, b)、color(float r, g, b, a)        → color(r, g, b)、color(r, g, b, a)（乘 255 后截断）
 *   color(int r, g, b)、color(int r, g, b, a)            → colorInt(r, g, b)、colorInt(r, g, b, a)
 *   color(char r, g, b)                                  → colorChar(r, g, b)
 * 例如 C++ 的 t.color(255, 255, 255) 是 int 版，要写成 colorInt；写成 color 会被当成 float 再乘 255（结果被截到 255，碰巧相同，
 * 但 color(128, 128, 128) 就不同了）。
 */
import { LOGI } from '@mcpe/platform';
import type { Vec3 } from '@mcpe/world';
import {
  GL_ARRAY_BUFFER,
  GL_COLOR_ARRAY,
  GL_DYNAMIC_DRAW,
  GL_FLOAT,
  GL_NORMAL_ARRAY,
  GL_QUADS,
  GL_STATIC_DRAW,
  GL_TEXTURE_COORD_ARRAY,
  GL_TRIANGLES,
  GL_UNSIGNED_BYTE,
  GL_VERTEX_ARRAY,
  glBindBuffer2,
  glBufferData2,
  glColorPointer2,
  glDisableClientState2,
  glDrawArrays2,
  glEnableClientState2,
  glGenBuffers2,
  glNormalPointer,
  glTexCoordPointer2,
  glVertexPointer2,
} from './gles';
import { RenderChunk } from './RenderChunk';
import { VertexDeclPTCN } from './VertecDecl';

/** extern const int VertexSizeBytes = sizeof(VERTEX) */
export const VertexSizeBytes = VertexDeclPTCN.SIZE;
/** 每个顶点占几个 32 位槽 */
const SLOTS = VertexSizeBytes / 4;

export class Tesselator {
  private static readonly MAX_MEMORY_USE = 16 * 1024 * 1024;
  private static readonly MAX_FLOATS = Tesselator.MAX_MEMORY_USE / 4 / 2;

  static readonly ACCESS_DYNAMIC = 1;
  static readonly ACCESS_STATIC = 2;

  /** Tesselator Tesselator::instance(sizeof(GLfloat) * MAX_FLOATS); // max size in bytes */
  static readonly instance = new Tesselator(4 * Tesselator.MAX_FLOATS);

  private readonly _buf: ArrayBuffer;
  private readonly _f32: Float32Array;
  private readonly _u32: Uint32Array;
  private vertices = 0;
  private xo = 0;
  private yo = 0;
  private zo = 0;
  private u = 0;
  private v = 0;
  private _color = 0; // unsigned int
  private _nx = 0;
  private _ny = 0;
  private _nz = 0;
  private _sx = 1;
  private _sy = 1;
  private hasColor = false;
  private hasTexture = false;
  private hasNormal = false;
  private _noColor = false;
  private _voidBeginEnd = false;
  private p = 0;
  private count = 0;
  private tesselating = false;
  private vboMode = false; // C++ 声明了但从未使用
  private vboCounts = 128;
  private vboId = -1;
  private readonly vboIds: Uint32Array;
  private size: number;
  private totalSize = 0;
  private maxVertices: number;
  private mode = 0;
  private accessMode = Tesselator.ACCESS_STATIC;

  /** C++ 的构造函数是 private；TS 里除了 instance，测试也会单独建小缓冲 */
  constructor(size: number) {
    this.size = size;
    this.maxVertices = (size / VertexSizeBytes) | 0;
    this.vboIds = new Uint32Array(this.vboCounts);
    this._buf = new ArrayBuffer(this.maxVertices * VertexSizeBytes);
    this._f32 = new Float32Array(this._buf);
    this._u32 = new Uint32Array(this._buf);
    LOGI(`Vsize: ${VertexSizeBytes}, ${VertexSizeBytes}`);
  }

  init(): void {
    glGenBuffers2(this.vboCounts, this.vboIds);
  }

  clear(): void {
    this.accessMode = Tesselator.ACCESS_STATIC;
    this.vertices = 0;
    this.count = 0;
    this.p = 0;
    this._voidBeginEnd = false;
  }

  getVboCount(): number {
    return this.vboCounts;
  }

  end(useMine: boolean, bufferId: number): RenderChunk {
    if (!this.tesselating) LOGI('not tesselating!');
    if (!this.tesselating || this._voidBeginEnd) return new RenderChunk();
    this.tesselating = false;
    const o_vertices = this.vertices;
    if (this.vertices > 0) {
      if (this.p <= 0 || this.p > this.maxVertices) {
        this.clear();
        return new RenderChunk();
      }
      const bytes = this.p * VertexSizeBytes;
      if (bytes <= 0) return new RenderChunk();
      if (++this.vboId >= this.vboCounts) this.vboId = 0;
      // USE_VBO
      if (!useMine) {
        bufferId = this.vboIds[this.vboId]!;
      }
      const access = GL_STATIC_DRAW; //(accessMode==ACCESS_DYNAMIC) ? GL_DYNAMIC_DRAW : GL_STATIC_DRAW;
      glBindBuffer2(GL_ARRAY_BUFFER, bufferId);
      glBufferData2(GL_ARRAY_BUFFER, bytes, new Uint8Array(this._buf, 0, bytes), access); // GL_STREAM_DRAW
      this.totalSize += bytes;
    }
    this.clear();
    return new RenderChunk(bufferId, o_vertices);
  }

  begin(mode = GL_QUADS): void {
    if (this.tesselating || this._voidBeginEnd) {
      if (this.tesselating && !this._voidBeginEnd) LOGI('already tesselating!');
      return;
    }
    this.tesselating = true;
    this.clear();
    this.mode = mode;
    this.hasNormal = false;
    this.hasColor = false;
    this.hasTexture = false;
    this._noColor = false;
  }

  tex(u: number, v: number): void {
    this.hasTexture = true;
    this.u = u;
    this.v = v;
  }

  getColor(): number {
    return this._color | 0;
  }

  /** color(int c) 与 color(int c, int alpha)；或 color(float r, g, b[, a]) */
  color(c: number, alpha?: number): void;
  color(r: number, g: number, b: number, a?: number): void;
  color(a: number, b?: number, c?: number, d?: number): void {
    if (c === undefined) {
      const r = (a >> 16) & 255;
      const g = (a >> 8) & 255;
      const bl = a & 255;
      if (b === undefined) this.colorInt(r, g, bl);
      else this.colorInt(r, g, bl, b);
      return;
    }
    // 浮点版：(int) (x * 255)
    if (d === undefined)
      this.colorInt(Math.trunc(a * 255) | 0, Math.trunc(b! * 255) | 0, Math.trunc(c * 255) | 0);
    else
      this.colorInt(
        Math.trunc(a * 255) | 0,
        Math.trunc(b! * 255) | 0,
        Math.trunc(c * 255) | 0,
        Math.trunc(d * 255) | 0,
      );
  }

  // ADAPTED(Cpp): C++ 的 color(int r, int g, int b[, int a]) 与 float 版同参数个数，改名 colorInt（见文件头）
  colorInt(r: number, g: number, b: number, a = 255): void {
    if (this._noColor) return;
    if (r > 255) r = 255;
    if (g > 255) g = 255;
    if (b > 255) b = 255;
    if (a > 255) a = 255;
    if (r < 0) r = 0;
    if (g < 0) g = 0;
    if (b < 0) b = 0;
    if (a < 0) a = 0;
    this.hasColor = true;
    this._color = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; // 内存顺序 RGBA（小端）
  }

  // ADAPTED(Cpp): C++ 的 color(char r, char g, char b)，改名 colorChar
  colorChar(r: number, g: number, b: number): void {
    this.colorInt(r & 0xff, g & 0xff, b & 0xff);
  }

  colorABGR(c: number): void {
    if (this._noColor) return;
    this.hasColor = true;
    this._color = c >>> 0;
  }

  vertexUV(x: number, y: number, z: number, u: number, v: number): void {
    this.tex(u, v);
    this.vertex(x, y, z);
  }

  scale2d(sx: number, sy: number): void {
    this._sx *= sx;
    this._sy *= sy;
  }

  resetScale(): void {
    this._sx = this._sy = 1;
  }

  vertex(x: number, y: number, z: number): void {
    const f32 = this._f32,
      u32 = this._u32;
    this.count++;
    if (this.mode === GL_QUADS && (this.count & 3) === 0) {
      for (let i = 0; i < 2; i++) {
        const offs = 3 - i;
        if (this.p - offs < 0 || this.p >= this.maxVertices) {
          this.clear();
          return;
        }
        const src = (this.p - offs) * SLOTS;
        const dst = this.p * SLOTS;
        if (this.hasTexture) {
          f32[dst + 3] = f32[src + 3]!;
          f32[dst + 4] = f32[src + 4]!;
        }
        if (this.hasColor) {
          u32[dst + 5] = u32[src + 5]!;
        }
        if (this.hasNormal) {
          f32[dst + 6] = f32[src + 6]!;
          f32[dst + 7] = f32[src + 7]!;
          f32[dst + 8] = f32[src + 8]!;
        }
        f32[dst] = f32[src]!;
        f32[dst + 1] = f32[src + 1]!;
        f32[dst + 2] = f32[src + 2]!;
        ++this.vertices;
        ++this.p;
      }
    }
    if (this.p < 0 || this.p >= this.maxVertices) {
      this.clear();
      return;
    }
    const o = this.p * SLOTS;
    if (this.hasTexture) {
      f32[o + 3] = this.u;
      f32[o + 4] = this.v;
    }
    if (this.hasColor) {
      u32[o + 5] = this._color;
    }
    if (this.hasNormal) {
      f32[o + 6] = this._nx;
      f32[o + 7] = this._ny;
      f32[o + 8] = this._nz;
    }
    f32[o] = this._sx * (x + this.xo);
    f32[o + 1] = this._sy * (y + this.yo);
    f32[o + 2] = z + this.zo;
    ++this.p;
    ++this.vertices;
    if ((this.vertices & 3) === 0 && this.p >= this.maxVertices - 1) {
      for (let i = 0; i < 3; ++i)
        LOGI("Overwriting the vertex buffer! This chunk/entity won't show up");
      this.clear();
    }
  }

  noColor(): void {
    this._noColor = true;
  }

  private setAccessMode(mode: number): void {
    this.accessMode = mode;
  }

  normal(x: number, y: number, z: number): void {
    if (!this.tesselating) LOGI('But..');
    this.hasNormal = true;
    this._nx = x;
    this._ny = y;
    this._nz = z;
  }

  offset(v: Vec3): void;
  offset(xo: number, yo: number, zo: number): void;
  offset(a: number | Vec3, yo?: number, zo?: number): void {
    if (typeof a === 'number') {
      this.xo = a;
      this.yo = yo!;
      this.zo = zo!;
    } else {
      this.xo = a.x;
      this.yo = a.y;
      this.zo = a.z;
    }
  }

  addOffset(v: Vec3): void;
  addOffset(x: number, y: number, z: number): void;
  addOffset(a: number | Vec3, y?: number, z?: number): void {
    if (typeof a === 'number') {
      this.xo += a;
      this.yo += y!;
      this.zo += z!;
    } else {
      this.xo += a.x;
      this.yo += a.y;
      this.zo += a.z;
    }
  }

  draw(): void {
    if (!this.tesselating) LOGI('not (draw) tesselating!');
    if (!this.tesselating || this._voidBeginEnd) return;
    this.tesselating = false;
    if (this.vertices > 0) {
      if (this.p <= 0 || this.p > this.maxVertices) {
        this.clear();
        return;
      }
      const bytes = this.p * VertexSizeBytes;
      if (bytes <= 0) {
        this.clear();
        return;
      }
      if (++this.vboId >= this.vboCounts) this.vboId = 0;
      const bufferId = this.vboIds[this.vboId]!;
      const access = GL_DYNAMIC_DRAW; //(accessMode==ACCESS_DYNAMIC) ? GL_DYNAMIC_DRAW : GL_STATIC_DRAW;
      glBindBuffer2(GL_ARRAY_BUFFER, bufferId);
      glBufferData2(GL_ARRAY_BUFFER, bytes, new Uint8Array(this._buf, 0, bytes), access); // GL_STREAM_DRAW
      if (this.hasTexture) {
        glTexCoordPointer2(2, GL_FLOAT, VertexSizeBytes, 3 * 4);
        glEnableClientState2(GL_TEXTURE_COORD_ARRAY);
      }
      if (this.hasColor) {
        glColorPointer2(4, GL_UNSIGNED_BYTE, VertexSizeBytes, 5 * 4);
        glEnableClientState2(GL_COLOR_ARRAY);
      }
      if (this.hasNormal) {
        glNormalPointer(GL_FLOAT, VertexSizeBytes, 6 * 4);
        glEnableClientState2(GL_NORMAL_ARRAY);
      }
      glVertexPointer2(3, GL_FLOAT, VertexSizeBytes, 0);
      glEnableClientState2(GL_VERTEX_ARRAY);
      if (this.mode === GL_QUADS) {
        glDrawArrays2(GL_TRIANGLES, 0, this.vertices);
      } else {
        glDrawArrays2(this.mode, 0, this.vertices);
      }
      glDisableClientState2(GL_VERTEX_ARRAY);
      if (this.hasTexture) glDisableClientState2(GL_TEXTURE_COORD_ARRAY);
      if (this.hasColor) glDisableClientState2(GL_COLOR_ARRAY);
      if (this.hasNormal) glDisableClientState2(GL_NORMAL_ARRAY);
    }
    this.clear();
  }

  voidBeginAndEndCalls(doVoid: boolean): void {
    this._voidBeginEnd = doVoid;
  }

  enableColor(): void {
    this._noColor = false;
  }

  beginOverride(): void {
    this.begin();
    this.voidBeginAndEndCalls(true);
  }

  endOverrideAndDraw(): void {
    this.voidBeginAndEndCalls(false);
    this.draw();
  }

  isOverridden(): boolean {
    return this._voidBeginEnd;
  }

  endOverride(bufferId: number): RenderChunk {
    this.voidBeginAndEndCalls(false);
    return this.end(true, bufferId);
  }

  /** ADAPTED(Test)：只给测试用，第 i 个顶点的 [x, y, z, u, v, color, nx, ny, nz] */
  _vertexForTest(i: number): number[] {
    const o = i * SLOTS;
    return [
      this._f32[o]!,
      this._f32[o + 1]!,
      this._f32[o + 2]!,
      this._f32[o + 3]!,
      this._f32[o + 4]!,
      this._u32[o + 5]!,
      this._f32[o + 6]!,
      this._f32[o + 7]!,
      this._f32[o + 8]!,
    ];
  }

  /** ADAPTED(Test)：只给测试用 */
  _vertexCountForTest(): number {
    return this.vertices;
  }
}
