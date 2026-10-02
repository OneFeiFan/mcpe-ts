// 1:1 移植自 src/client/renderer/RenderChunk.h 与 RenderChunk.cpp：一段已上传到 VBO 的顶点。
import { Vec3 } from '@mcpe/world';

export class RenderChunk {
  private static runningId = 0;

  /** GLuint：默认构造里赋的是 -1，按 unsigned 就是 0xFFFFFFFF */
  vboId: number;
  vertexCount: number;
  id: number;
  pos = new Vec3();

  constructor();
  constructor(vboId_: number, vertexCount_: number);
  constructor(vboId_?: number, vertexCount_?: number) {
    this.vboId = vboId_ === undefined ? 0xffffffff : vboId_ >>> 0;
    this.vertexCount = vertexCount_ ?? 0;
    this.id = ++RenderChunk.runningId;
  }

  /** C++ 的拷贝赋值（按值复制所有成员，包括 id 与 pos） */
  assign(rhs: RenderChunk): this {
    this.vboId = rhs.vboId;
    this.vertexCount = rhs.vertexCount;
    this.id = rhs.id;
    this.pos.x = rhs.pos.x;
    this.pos.y = rhs.pos.y;
    this.pos.z = rhs.pos.z;
    return this;
  }
}
