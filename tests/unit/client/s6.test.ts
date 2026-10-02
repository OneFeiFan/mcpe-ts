import { beforeEach, describe, expect, it } from 'vitest';
import {
  AppPlatform, GL_PROJECTION, GL_PROJECTION_MATRIX, GL_MODELVIEW, GL_MODELVIEW_MATRIX, GL_VERTEX_ARRAY, GLES1, glGetContext, glGetFloatv,
  glhUnProjectf, glLoadIdentity, glMatrixMode, glPopMatrix, glPushMatrix, glRotatef, glSetContext, glTranslatef, gluPerspective,
  Minecraft, OptionId, Options, Tesselator, TextureData, Textures,
} from '@mcpe/client';

beforeEach(() => {
  glSetContext(new GLES1(null)); // 无头模式：只维护状态与矩阵
});

describe('Tesselator', () => {
  it('begin() 后 4 次 vertexUV：6 个顶点，第 4、5 个分别等于第 1、3 个', () => {
    const t = new Tesselator(64 * 36);
    t.begin();
    t.vertexUV(0, 0, 0, 0, 0);
    t.vertexUV(1, 0, 0, 1, 0);
    t.vertexUV(1, 1, 0, 1, 1);
    t.vertexUV(0, 1, 0, 0, 1);
    expect(t._vertexCountForTest()).toBe(6);
    expect(t._vertexForTest(3)).toEqual(t._vertexForTest(0));
    expect(t._vertexForTest(4)).toEqual(t._vertexForTest(2));
    expect(t._vertexForTest(5).slice(0, 5)).toEqual([0, 1, 0, 0, 1]);
  });

  it('color 打包为 RGBA 内存顺序；(int)(x × 255) 截断；int 与 float 两种重载分开', () => {
    const t = new Tesselator(64 * 36);
    t.begin();
    t.color(1, 1, 1, 1);
    expect(t.getColor() >>> 0).toBe(0xffffffff);
    t.color(0.18, 0.54, 0.18, 1);
    const c = t.getColor() >>> 0;
    expect([c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff, c >>> 24]).toEqual([45, 137, 45, 255]); // r、g、b、a
    t.colorInt(128, 128, 128);
    expect(t.getColor() >>> 0).toBe(0xff808080);
    t.color(128, 128, 128); // 当成 float 版：乘 255 后被截到 255
    expect(t.getColor() >>> 0).toBe(0xffffffff);
    t.color(0x339933);
    expect(t.getColor() >>> 0).toBe(0xff339933); // int 版：r=0x33 g=0x99 b=0x33，alpha 补 255
  });

  it('end() 上传到 VBO 并返回 RenderChunk；draw() 画完关掉客户端数组', () => {
    const t = new Tesselator(64 * 36);
    t.init();
    t.begin();
    for (let i = 0; i < 4; i++) t.vertexUV(i, 0, 0, 0, 0);
    const rc = t.end(false, 0);
    expect(rc.vertexCount).toBe(6);
    expect(glGetContext().bufferSizes.get(rc.vboId)).toBe(6 * 36);
    t.begin();
    t.color(1, 0, 0);
    for (let i = 0; i < 4; i++) t.vertexUV(i, 0, 0, 0, 0);
    const before = glGetContext().drawCalls;
    t.draw();
    expect(glGetContext().drawCalls).toBe(before + 1);
    expect(glGetContext().isClientStateEnabled(GL_VERTEX_ARRAY)).toBe(false);
  });
});

describe('gles', () => {
  it('gluPerspective(70, 16/9, 0.05, 256) 与 gles.cpp 的公式一致（列主序，m[2][3] = −1）', () => {
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    gluPerspective(70, 16 / 9, 0.05, 256);
    const m = new Float32Array(16);
    glGetFloatv(GL_PROJECTION_MATRIX, m);
    const f = Math.fround;
    const rad = f(f(f(70 / 2) * f(Math.PI)) / 180);
    const cot = f(Math.cos(rad) / f(Math.sin(rad)));
    const want = [cot / (16 / 9), 0, 0, 0, 0, cot, 0, 0, 0, 0, -(256 + 0.05) / (256 - 0.05), -1, 0, 0, (-2 * 0.05 * 256) / (256 - 0.05), 0];
    want.forEach((v, i) => expect(m[i]).toBeCloseTo(v, 5));
    expect(m[11]).toBe(-1); // m[2][3]
  });

  it('矩阵栈：push、translate、pop 回到原样；rotate 90° 绕 z 把 x 轴转到 y 轴', () => {
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glPushMatrix();
    glTranslatef(1, 2, 3);
    const m = new Float32Array(16);
    glGetFloatv(GL_MODELVIEW_MATRIX, m);
    expect([m[12], m[13], m[14]]).toEqual([1, 2, 3]);
    glPopMatrix();
    glGetFloatv(GL_MODELVIEW_MATRIX, m);
    expect([m[12], m[13], m[14]]).toEqual([0, 0, 0]);
    glRotatef(90, 0, 0, 1);
    glGetFloatv(GL_MODELVIEW_MATRIX, m);
    expect(m[0]).toBeCloseTo(0);
    expect(m[1]).toBeCloseTo(1);
  });

  it('glhUnProjectf：先投影再反投影回到原点', () => {
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    gluPerspective(70, 1, 0.05, 256);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
    glTranslatef(0, 0, -10);
    const P = new Float32Array(16), M = new Float32Array(16);
    glGetFloatv(GL_PROJECTION_MATRIX, P);
    glGetFloatv(GL_MODELVIEW_MATRIX, M);
    const vp = [0, 0, 100, 100];
    // 物体坐标 (1, 2, 0) → 窗口坐标
    const eye = [1, 2, -10, 1];
    const clip = [0, 1, 2, 3].map((r) => P[r]! * eye[0]! + P[4 + r]! * eye[1]! + P[8 + r]! * eye[2]! + P[12 + r]! * eye[3]!);
    const ndc = clip.slice(0, 3).map((v) => v / clip[3]!);
    const win = [(ndc[0]! + 1) * 50, (ndc[1]! + 1) * 50, (ndc[2]! + 1) / 2];
    const out = new Float32Array(3);
    expect(glhUnProjectf(win[0]!, win[1]!, win[2]!, M, P, vp, out)).toBe(1);
    expect(out[0]).toBeCloseTo(1, 3);
    expect(out[1]).toBeCloseTo(2, 3);
    expect(out[2]).toBeCloseTo(0, 2);
  });
});

describe('Options', () => {
  const updates: [number, boolean | number][] = [];
  const mc = { optionUpdated: (k: number, v: boolean | number) => updates.push([k, v]) } as unknown as Minecraft;

  it('默认值（分支默认选项，网页版不乘 0.4 的灵敏度）', () => {
    const o = new Options(mc);
    expect([
      o.getBooleanValue(OptionId.OPTIONS_FANCY_GRAPHICS), o.getBooleanValue(OptionId.OPTIONS_AMBIENT_OCCLUSION),
      o.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE), o.getBooleanValue(OptionId.OPTIONS_FOLIAGE_TINT),
      o.getBooleanValue(OptionId.OPTIONS_TINTED_SIDE), o.getBooleanValue(OptionId.OPTIONS_BETA_SKY),
      o.getProgressValue(OptionId.OPTIONS_SENSITIVITY), o.getBooleanValue(OptionId.OPTIONS_NORMAL_LIGHTING),
      o.getBooleanValue(OptionId.OPTIONS_USE_TOUCHSCREEN), o.getIntValue(OptionId.OPTIONS_FOG_TYPE),
    ]).toEqual([true, true, 2, false, false, false, 0.5, true, true, 0]);
    expect(o.getIntValue(OptionId.OPTIONS_COMPLETE_LIGHTING)).toBe(0); // 没登记进表的 id
    expect(o.getStringValue(OptionId.OPTIONS_USERNAME)).toBe('Steve');
  });

  it('set、toggle 按选项类型设值、夹到范围内，并通知 Minecraft', () => {
    const o = new Options(mc);
    updates.length = 0;
    o.set(OptionId.OPTIONS_VIEW_DISTANCE, 9);
    o.toggle(OptionId.OPTIONS_AMBIENT_OCCLUSION);
    o.set(OptionId.OPTIONS_SENSITIVITY, 0.75);
    expect([o.getIntValue(OptionId.OPTIONS_VIEW_DISTANCE), o.getBooleanValue(OptionId.OPTIONS_AMBIENT_OCCLUSION), o.getProgressValue(OptionId.OPTIONS_SENSITIVITY)]).toEqual([4, false, 0.75]);
    expect(updates).toEqual([[OptionId.OPTIONS_VIEW_DISTANCE, 9], [OptionId.OPTIONS_AMBIENT_OCCLUSION, false], [OptionId.OPTIONS_SENSITIVITY, 0.75]]);
    // 选项是模块级全局对象（C++ 的文件级全局变量），恢复默认，免得影响其他用例
    o.set(OptionId.OPTIONS_VIEW_DISTANCE, 2);
    o.toggle(OptionId.OPTIONS_AMBIENT_OCCLUSION);
    o.set(OptionId.OPTIONS_SENSITIVITY, 0.5);
  });

  it('序列化与解析照 C++：bool 写成 1/0，float 是 %g 风格', () => {
    const o = new Options(mc);
    expect(o.getOpt(OptionId.OPTIONS_AMBIENT_OCCLUSION)!.serialize()).toBe('options.ao:1');
    expect(o.getOpt(OptionId.OPTIONS_SENSITIVITY)!.serialize()).toBe('options.sensitivity:0.5');
    expect(o.getOpt(OptionId.OPTIONS_KEY_SNEAK)!.serialize()).toBe('options.key.sneak:10');
    const fog = o.getOpt(OptionId.OPTIONS_FOG_TYPE)!;
    expect([fog.parse('2abc'), o.getIntValue(OptionId.OPTIONS_FOG_TYPE), fog.parse('x'), o.getIntValue(OptionId.OPTIONS_FOG_TYPE)]).toEqual([true, 2, false, 2]);
    fog.parse('0');
  });
});

describe('Textures', () => {
  class FakePlatform extends AppPlatform {
    override loadTexture(name: string): TextureData {
      const t = new TextureData();
      if (name !== 'terrain.png') return t; // 没有数据
      t.w = 2;
      t.h = 1;
      t.data = new Uint8Array([10, 20, 30, 255, 1, 2, 3, 0]);
      return t;
    }
  }

  it('加载、缓存、RGBA 转 ARGB；加载失败记为 InvalidId', () => {
    const tex = new Textures(null, new FakePlatform());
    const id = tex.loadTexture('terrain.png');
    expect(id).not.toBe(Textures.InvalidId);
    expect(tex.loadTexture('terrain.png')).toBe(id);
    expect(Array.from(tex.loadTexturePixels(id, 'terrain.png'), (p) => p >>> 0)).toEqual([0xff0a141e, 0x00010203]);
    expect(tex.loadTexture('missing.png')).toBe(Textures.InvalidId);
    expect(glGetContext().boundTexture).toBe(id);
  });
});
