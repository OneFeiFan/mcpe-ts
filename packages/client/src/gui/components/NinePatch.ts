/**
 * 1:1 移植自 src/client/gui/components/NinePatch.h 与 NinePatch.cpp（合成与护甲界面）：九宫格贴图。
 * 四个角固定大小、四条边与中间拉伸。u0..u3 / v0..v3 是 4 条切线的贴图坐标；w、e、n、s 是西、东、北、南的边宽。
 * C++ 用 `(&desc.u0)[xid]` 按成员地址取第 xid 条切线——TS 用数组下标表达同一件事。
 * R10：NinePatchDescription 的私有构造函数 → 静态 make；buildQuad / getPatchInfo 的引用输出参数改为返回值。
 */
import { LOGE } from '@mcpe/platform';
import type { Tesselator } from '../../renderer/Tesselator';
import { Textures } from '../../renderer/Textures';
import { GuiElement } from './GuiElement';
import type { IntRectangle } from './ImageButton';

const f = Math.fround;

export class NinePatchDescription {
  u0 = 0;
  u1 = 0;
  u2 = 0;
  u3 = 0;
  v0 = 0;
  v1 = 0;
  v2 = 0;
  v3 = 0;
  w = 0;
  e = 0;
  n = 0;
  s = 0;
  private imgW = -1;
  private imgH = -1;

  private static make(
    x: number,
    y: number,
    x1: number,
    x2: number,
    x3: number,
    y1: number,
    y2: number,
    y3: number,
    w: number,
    e: number,
    n: number,
    s: number,
  ): NinePatchDescription {
    const d = new NinePatchDescription();
    d.u0 = f(x);
    d.u1 = f(x + x1);
    d.u2 = f(x + x2);
    d.u3 = f(x + x3);
    d.v0 = f(y);
    d.v1 = f(y + y1);
    d.v2 = f(y + y2);
    d.v3 = f(y + y3);
    d.w = f(w);
    d.e = f(e);
    d.n = f(n);
    d.s = f(s);
    return d;
  }

  transformUVForImage(d: { w: number; h: number }): NinePatchDescription {
    return this.transformUVForImageSize(d.w, d.h);
  }

  transformUVForImageSize(w: number, h: number): NinePatchDescription {
    if (this.imgW < 0) this.imgW = this.imgH = 1;
    const us = f(this.imgW / w);
    const vs = f(this.imgH / h);
    this.u0 = f(this.u0 * us);
    this.u1 = f(this.u1 * us);
    this.u2 = f(this.u2 * us);
    this.u3 = f(this.u3 * us);
    this.v0 = f(this.v0 * vs);
    this.v1 = f(this.v1 * vs);
    this.v2 = f(this.v2 * vs);
    this.v3 = f(this.v3 * vs);
    this.imgW = w;
    this.imgH = h;
    return this;
  }

  static createSymmetrical(
    texWidth: number,
    texHeight: number,
    src: IntRectangle,
    xCutAt: number,
    yCutAt: number,
  ): NinePatchDescription {
    const patch = NinePatchDescription.make(
      src.x,
      src.y,
      xCutAt,
      src.w - xCutAt,
      src.w,
      yCutAt,
      src.h - yCutAt,
      src.h,
      xCutAt,
      xCutAt,
      yCutAt,
      yCutAt,
    );
    if (texWidth > 0) patch.transformUVForImageSize(texWidth, texHeight);
    return patch;
  }

  copy(): NinePatchDescription {
    const d = new NinePatchDescription();
    Object.assign(d, this);
    return d;
  }
}

/** C++ 的 struct NinePatchLayer::CachedQuad */
class CachedQuad {
  x0 = 0;
  x1 = 0;
  y0 = 0;
  y1 = 0;
  z = 0;
  u0 = 0;
  u1 = 0;
  v0 = 0;
  v1 = 0;
}

export class NinePatchLayer extends GuiElement {
  private w = -1;
  private h = -1;
  private desc: NinePatchDescription;
  private imageName: string;
  private textures: Textures;
  private excluded = 0;
  private quads: CachedQuad[] = Array.from({ length: 9 }, () => new CachedQuad());

  constructor(desc: NinePatchDescription, imageName: string, textures: Textures, w = 32, h = 32) {
    super();
    this.desc = desc.copy();
    this.imageName = imageName;
    this.textures = textures;
    this.setSize(w, h);
  }

  setSize(w: number, h: number): void {
    w = f(w);
    h = f(h);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    for (let i = 0; i < 9; ++i) this.buildQuad(i);
  }

  draw(t: Tesselator, x: number, y: number): void {
    this.textures.loadAndBindTexture(this.imageName);
    t.begin();
    t.addOffset(x, y, 0);
    for (let i = 0, b = 1; i < 9; ++i, b += b)
      if ((b & this.excluded) === 0) this.d(t, this.quads[i]!);
    t.addOffset(-x, -y, 0);
    t.draw();
  }

  exclude(excludeId: number): NinePatchLayer {
    return this.setExcluded(this.excluded | (1 << excludeId));
  }

  setExcluded(exludeBits: number): NinePatchLayer {
    this.excluded = exludeBits;
    return this;
  }

  getWidth(): number {
    return this.w;
  }

  getHeight(): number {
    return this.h;
  }

  private buildQuad(qid: number): void {
    const q = this.quads[qid]!;
    const yid = Math.trunc(qid / 3);
    const xid = qid - 3 * yid;
    const us = [this.desc.u0, this.desc.u1, this.desc.u2, this.desc.u3];
    const vs = [this.desc.v0, this.desc.v1, this.desc.v2, this.desc.v3];
    q.u0 = us[xid]!;
    q.u1 = us[xid + 1]!;
    q.v0 = vs[yid]!;
    q.v1 = vs[yid + 1]!;
    q.z = 0;
    const [x0, x1, y0, y1] = this.getPatchInfo(xid, yid);
    q.x0 = x0;
    q.x1 = x1;
    q.y0 = y0;
    q.y1 = y1;
  }

  private getPatchInfo(xc: number, yc: number): [number, number, number, number] {
    const d = this.desc;
    let x0 = 0,
      x1 = 0,
      y0 = 0,
      y1 = 0;
    if (xc === 0) {
      x0 = 0;
      x1 = d.w;
    } else if (xc === 1) {
      x0 = d.w;
      x1 = f(this.w - d.e);
    } else if (xc === 2) {
      x0 = f(this.w - d.e);
      x1 = this.w;
    }
    if (yc === 0) {
      y0 = 0;
      y1 = d.n;
    } else if (yc === 1) {
      y0 = d.n;
      y1 = f(this.h - d.s);
    } else if (yc === 2) {
      y0 = f(this.h - d.s);
      y1 = this.h;
    }
    return [x0, x1, y0, y1];
  }

  private d(t: Tesselator, q: CachedQuad): void {
    t.vertexUV(q.x0, q.y1, q.z, q.u0, q.v1);
    t.vertexUV(q.x1, q.y1, q.z, q.u1, q.v1);
    t.vertexUV(q.x1, q.y0, q.z, q.u1, q.v0);
    t.vertexUV(q.x0, q.y0, q.z, q.u0, q.v0);
  }
}

export class NinePatchFactory {
  private textures: Textures;
  private imageName: string;
  private width = 1;
  private height = 1;

  constructor(textures: Textures, imageName: string) {
    this.textures = textures;
    this.imageName = imageName;
    const id = textures.loadTexture(imageName);
    if (id !== Textures.InvalidId) {
      const data = textures.getTemporaryTextureData(id);
      if (data) {
        this.width = data.w;
        this.height = data.h;
      }
    } else {
      LOGE(`Error @ NinePatchFactory::ctor - Couldn't find texture: ${imageName}\n`);
    }
  }

  createSymmetrical(
    src: IntRectangle,
    xCutAt: number,
    yCutAt: number,
    w = 32.0,
    h = 32.0,
  ): NinePatchLayer {
    return new NinePatchLayer(
      NinePatchDescription.createSymmetrical(this.width, this.height, src, xCutAt, yCutAt),
      this.imageName,
      this.textures,
      w,
      h,
    );
  }
}
