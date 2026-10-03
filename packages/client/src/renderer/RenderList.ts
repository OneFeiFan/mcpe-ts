/**
 * 1:1 移植自 src/client/renderer/RenderList.h 与 RenderList.cpp：一帧里要画的渲染区块列表。
 * USE_VBO：render() 走 renderChunks()，逐个平移到区块位置、绑定它的 VBO、glDrawArrays；glCallLists 分支不移植。
 * addR 按值复制 RenderChunk（R5）。
 */
import {
  GL_ARRAY_BUFFER,
  GL_COLOR_ARRAY,
  GL_FLOAT,
  GL_TEXTURE_COORD_ARRAY,
  GL_TRIANGLES,
  GL_UNSIGNED_BYTE,
  GL_VERTEX_ARRAY,
  glBindBuffer2,
  glColorPointer2,
  glDisableClientState2,
  glDrawArrays2,
  glEnableClientState2,
  glPopMatrix2,
  glPushMatrix2,
  glTexCoordPointer2,
  glTranslatef2,
  glVertexPointer2,
} from './gles';
import { RenderChunk } from './RenderChunk';
import { VertexSizeBytes } from './Tesselator';

export class RenderList {
  private static readonly MAX_NUM_OBJECTS = 1024 * 3;

  xOff = 0;
  yOff = 0;
  zOff = 0;
  lists = new Int32Array(RenderList.MAX_NUM_OBJECTS);
  rlists: RenderChunk[] = Array.from({ length: RenderList.MAX_NUM_OBJECTS }, () => {
    const rc = new RenderChunk();
    rc.vboId = 0xffffffff; // rlists[i].vboId = -1;
    return rc;
  });
  listIndex = 0; // C++ 未初始化，init() 里置 0
  inited = false;
  rendered = false;
  private bufferLimit = 0;

  init(xOff: number, yOff: number, zOff: number): void {
    this.inited = true;
    this.listIndex = 0;
    this.xOff = xOff;
    this.yOff = yOff;
    this.zOff = zOff;
  }

  add(list: number): void {
    this.lists[this.listIndex] = list;
    if (this.listIndex === RenderList.MAX_NUM_OBJECTS) /*lists.remaining() == 0)*/ this.render();
  }

  addR(chunk: RenderChunk): void {
    this.rlists[this.listIndex]!.assign(chunk);
  }

  next(): void {
    ++this.listIndex;
  }

  render(): void {
    if (!this.inited) return;
    if (!this.rendered) {
      this.bufferLimit = this.listIndex;
      this.listIndex = 0;
      this.rendered = true;
    }
    if (this.listIndex < this.bufferLimit) {
      glPushMatrix2();
      glTranslatef2(-this.xOff, -this.yOff, -this.zOff);
      // USE_VBO
      this.renderChunks();
      glPopMatrix2();
    }
  }

  renderChunks(): void {
    glEnableClientState2(GL_VERTEX_ARRAY);
    glEnableClientState2(GL_COLOR_ARRAY);
    glEnableClientState2(GL_TEXTURE_COORD_ARRAY);
    const Stride = VertexSizeBytes;
    for (let i = 0; i < this.bufferLimit; ++i) {
      const rc = this.rlists[i]!;
      glPushMatrix2();
      glTranslatef2(rc.pos.x, rc.pos.y, rc.pos.z);
      glBindBuffer2(GL_ARRAY_BUFFER, rc.vboId);
      glVertexPointer2(3, GL_FLOAT, Stride, 0);
      glTexCoordPointer2(2, GL_FLOAT, Stride, 3 * 4);
      glColorPointer2(4, GL_UNSIGNED_BYTE, Stride, 5 * 4);
      glDrawArrays2(GL_TRIANGLES, 0, rc.vertexCount);
      glPopMatrix2();
    }
    glDisableClientState2(GL_VERTEX_ARRAY);
    glDisableClientState2(GL_COLOR_ARRAY);
    glDisableClientState2(GL_TEXTURE_COORD_ARRAY);
  }

  clear(): void {
    this.inited = false;
    this.rendered = false;
  }
}
