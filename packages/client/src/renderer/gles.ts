/**
 * ADAPTED（S6）：对应 src/client/renderer/gles.h、gles.cpp。
 *
 * C++ 直接调用 GLES1 的全局函数（glEnable、glVertexPointer …），这里导出同名函数，转给当前的 GLES1 上下文（gl/GLES1.ts），
 * 调用处与 C++ 完全一样：glEnable(GL_TEXTURE_2D)、glTranslatef(x, y, z)。
 *  - 先用 glSetContext(new GLES1(webgl2)) 设定上下文（C++ 里由 EGL/浏览器隐式提供，ADAPTED）。
 *  - 指针参数：glGenBuffers(n, ids) 往数组里写；glGetFloatv(pname, out) 写进 Float32Array；
 *    gl*Pointer 的偏移 (GLvoid*)(3 * 4) 写成数字 3 * 4；glBufferData、glTexImage2D 的数据是 ArrayBufferView。
 *  - 构建开关（决策 D2 与 CMakeLists.txt）：USE_VBO、OPENGL_ES 都为真（CMake 对所有目标都定义了 OPENGL_ES），所以 glInit 是空的；
 *    没定义 GLDEBUG，*2 别名就是原函数；__EMSCRIPTEN__ 为真，anGenBuffers 调用 glGenBuffers。
 *  - 显示列表（glNewList 等）、glCompressedTexImage2D（只用于 iOS 的 PVRTC）不实现，见手册附录 B。
 */
import { GLES1 } from './gl/GLES1';

// ================================================================ 常量（GLES1 规范中的值）
export const GL_FALSE = 0, GL_TRUE = 1;
export const GL_DEPTH_BUFFER_BIT = 0x0100, GL_STENCIL_BUFFER_BIT = 0x0400, GL_COLOR_BUFFER_BIT = 0x4000;
export const GL_POINTS = 0, GL_LINES = 1, GL_LINE_LOOP = 2, GL_LINE_STRIP = 3, GL_TRIANGLES = 4, GL_TRIANGLE_STRIP = 5, GL_TRIANGLE_FAN = 6;
/** gles.h：#define GL_QUADS 0x0007（Tesselator 自己拆成三角形，从不交给 GL） */
export const GL_QUADS = 0x0007;
export const GL_NEVER = 0x0200, GL_LESS = 0x0201, GL_EQUAL = 0x0202, GL_LEQUAL = 0x0203, GL_GREATER = 0x0204, GL_NOTEQUAL = 0x0205, GL_GEQUAL = 0x0206, GL_ALWAYS = 0x0207;
export const GL_ZERO = 0, GL_ONE = 1, GL_SRC_COLOR = 0x0300, GL_ONE_MINUS_SRC_COLOR = 0x0301, GL_SRC_ALPHA = 0x0302, GL_ONE_MINUS_SRC_ALPHA = 0x0303;
export const GL_DST_ALPHA = 0x0304, GL_ONE_MINUS_DST_ALPHA = 0x0305, GL_DST_COLOR = 0x0306, GL_ONE_MINUS_DST_COLOR = 0x0307, GL_SRC_ALPHA_SATURATE = 0x0308;
export const GL_FRONT = 0x0404, GL_BACK = 0x0405, GL_FRONT_AND_BACK = 0x0408, GL_CW = 0x0900, GL_CCW = 0x0901;
export const GL_FOG = 0x0b60, GL_LIGHTING = 0x0b50, GL_TEXTURE_2D = 0x0de1, GL_CULL_FACE = 0x0b44, GL_ALPHA_TEST = 0x0bc0, GL_BLEND = 0x0be2;
export const GL_DITHER = 0x0bd0, GL_STENCIL_TEST = 0x0b90, GL_DEPTH_TEST = 0x0b71, GL_SCISSOR_TEST = 0x0c11, GL_COLOR_MATERIAL = 0x0b57;
export const GL_NORMALIZE = 0x0ba1, GL_RESCALE_NORMAL = 0x803a, GL_POLYGON_OFFSET_FILL = 0x8037, GL_LINE_SMOOTH = 0x0b20, GL_POINT_SMOOTH = 0x0b10;
export const GL_VERTEX_ARRAY = 0x8074, GL_NORMAL_ARRAY = 0x8075, GL_COLOR_ARRAY = 0x8076, GL_TEXTURE_COORD_ARRAY = 0x8078;
export const GL_LIGHT0 = 0x4000, GL_LIGHT1 = 0x4001, GL_AMBIENT = 0x1200, GL_DIFFUSE = 0x1201, GL_SPECULAR = 0x1202, GL_POSITION = 0x1203;
export const GL_LIGHT_MODEL_AMBIENT = 0x0b53, GL_AMBIENT_AND_DIFFUSE = 0x1602;
export const GL_FOG_DENSITY = 0x0b62, GL_FOG_START = 0x0b63, GL_FOG_END = 0x0b64, GL_FOG_MODE = 0x0b65, GL_FOG_COLOR = 0x0b66;
export const GL_EXP = 0x0800, GL_EXP2 = 0x0801, GL_LINEAR = 0x2601;
export const GL_FLAT = 0x1d00, GL_SMOOTH = 0x1d01;
export const GL_MODELVIEW = 0x1700, GL_PROJECTION = 0x1701, GL_TEXTURE = 0x1702;
export const GL_MODELVIEW_MATRIX = 0x0ba6, GL_PROJECTION_MATRIX = 0x0ba7, GL_TEXTURE_MATRIX = 0x0ba8, GL_VIEWPORT = 0x0ba2;
export const GL_BYTE = 0x1400, GL_UNSIGNED_BYTE = 0x1401, GL_SHORT = 0x1402, GL_UNSIGNED_SHORT = 0x1403, GL_FLOAT = 0x1406, GL_FIXED = 0x140c;
export const GL_ALPHA = 0x1906, GL_RGB = 0x1907, GL_RGBA = 0x1908, GL_LUMINANCE = 0x1909, GL_LUMINANCE_ALPHA = 0x190a;
export const GL_UNSIGNED_SHORT_4_4_4_4 = 0x8033, GL_UNSIGNED_SHORT_5_5_5_1 = 0x8034, GL_UNSIGNED_SHORT_5_6_5 = 0x8363;
export const GL_NEAREST = 0x2600, GL_NEAREST_MIPMAP_NEAREST = 0x2700, GL_LINEAR_MIPMAP_NEAREST = 0x2701, GL_NEAREST_MIPMAP_LINEAR = 0x2702, GL_LINEAR_MIPMAP_LINEAR = 0x2703;
export const GL_TEXTURE_MAG_FILTER = 0x2800, GL_TEXTURE_MIN_FILTER = 0x2801, GL_TEXTURE_WRAP_S = 0x2802, GL_TEXTURE_WRAP_T = 0x2803, GL_REPEAT = 0x2901, GL_CLAMP_TO_EDGE = 0x812f;
export const GL_TEXTURE_ENV = 0x2300, GL_TEXTURE_ENV_MODE = 0x2200, GL_MODULATE = 0x2100, GL_REPLACE = 0x1e01;
export const GL_ARRAY_BUFFER = 0x8892, GL_ELEMENT_ARRAY_BUFFER = 0x8893, GL_STATIC_DRAW = 0x88e4, GL_DYNAMIC_DRAW = 0x88e8, GL_STREAM_DRAW = 0x88e0;
export const GL_PERSPECTIVE_CORRECTION_HINT = 0x0c50, GL_FOG_HINT = 0x0c54, GL_DONT_CARE = 0x1100, GL_FASTEST = 0x1101, GL_NICEST = 0x1102;
export const GL_NO_ERROR = 0;

/** 构建开关（D2）：常量形式，供以后照抄 #ifdef 的地方判断 */
export const USE_VBO = true;
export const OPENGL_ES = true;

// ================================================================ 当前上下文
let ctx: GLES1 | null = null;

// ADAPTED(Web): C++ 的 GL 上下文由 EGL / 浏览器隐式提供；TS 里要显式设定
export function glSetContext(c: GLES1): void {
  ctx = c;
}

export function glGetContext(): GLES1 {
  if (!ctx) throw new Error('还没有 GL 上下文：先调用 glSetContext(new GLES1(webgl2 或 null))');
  return ctx;
}

const C = glGetContext;

// ================================================================ GLES1 函数
export const glEnable = (cap: number): void => C().enable(cap);
export const glDisable = (cap: number): void => C().disable(cap);
export const glIsEnabled = (cap: number): boolean => C().isEnabled(cap);
export const glShadeModel = (mode: number): void => void (C().shadeModel = mode);
export const glDepthFunc = (func: number): void => C().gl?.depthFunc(func);
export const glDepthMask = (flag: boolean | number): void => C().gl?.depthMask(!!flag);
export const glDepthRangef = (n: number, f: number): void => C().gl?.depthRange(n, f);
export const glClearDepthf = (d: number): void => C().gl?.clearDepth(d);
export const glAlphaFunc = (func: number, ref: number): void => {
  const c = C();
  c.alphaFunc = func;
  c.alphaRef = ref;
};
export const glCullFace = (mode: number): void => C().gl?.cullFace(mode);
export const glFrontFace = (mode: number): void => C().gl?.frontFace(mode);
export const glBlendFunc = (s: number, d: number): void => C().gl?.blendFunc(s, d);
export const glColorMask = (r: boolean | number, g: boolean | number, b: boolean | number, a: boolean | number): void => C().gl?.colorMask(!!r, !!g, !!b, !!a);
export const glHint = (_target: number, _mode: number): void => {}; // 空操作（WebGL2 没有这些提示）
export const glScissor = (x: number, y: number, w: number, h: number): void => C().gl?.scissor(x, y, w, h);
export const glViewport = (x: number, y: number, w: number, h: number): void => C().setViewport(x, y, w, h);
export const glClear = (mask: number): void => C().gl?.clear(mask);
export const glClearColor = (r: number, g: number, b: number, a: number): void => C().gl?.clearColor(r, g, b, a);
export const glColor4f = (r: number, g: number, b: number, a: number): void => C().setColor(r, g, b, a);
export const glNormal3f = (x: number, y: number, z: number): void => C().normal.set([x, y, z]);
export const glLineWidth = (w: number): void => C().gl?.lineWidth(w);
export const glPolygonOffset = (factor: number, units: number): void => C().gl?.polygonOffset(factor, units);
export const glGetError = (): number => C().gl?.getError() ?? GL_NO_ERROR;
export const glTexEnvi = (_target: number, pname: number, param: number): void => C().texEnv(pname, param);
export const glTexEnvf = glTexEnvi;

export const glMatrixMode = (mode: number): void => C().matrixMode(mode);
export const glLoadIdentity = (): void => C().loadIdentity();
export const glPushMatrix = (): void => C().pushMatrix();
export const glPopMatrix = (): void => C().popMatrix();
export const glTranslatef = (x: number, y: number, z: number): void => C().translate(x, y, z);
export const glRotatef = (a: number, x: number, y: number, z: number): void => C().rotate(a, x, y, z);
export const glScalef = (x: number, y: number, z: number): void => C().scale(x, y, z);
export const glMultMatrixf = (m: ArrayLike<number>): void => C().multMatrix(m);
export const glOrthof = (l: number, r: number, b: number, t: number, n: number, f: number): void => C().ortho(l, r, b, t, n, f);
export const glGetFloatv = (pname: number, out: Float32Array): void => C().getFloatv(pname, out);
export const glGetIntegerv = (pname: number, out: Int32Array): void => C().getIntegerv(pname, out);

export const glFogf = (pname: number, param: number): void => C().setFog(pname, param);
export const glFogfv = (pname: number, params: ArrayLike<number>): void => C().setFog(pname, params);
/** GLES 的 glFogx 收 GLfixed；分支只用它设 GL_FOG_MODE（枚举值原样传入），与 glFogf 相同 */
export const glFogx = (pname: number, param: number): void => C().setFog(pname, param);
// DEFERRED(GLLighting): 光照只保存状态，不参与着色（区块渲染不开光照）
export const glLightfv = (light: number, pname: number, params: ArrayLike<number>): void => void C().lightState.set(`${light}:${pname}`, new Float32Array(params));
export const glLightModelfv = (pname: number, params: ArrayLike<number>): void => void C().lightState.set(`model:${pname}`, new Float32Array(params));

export const glEnableClientState = (array: number): void => C().enableClientState(array);
export const glDisableClientState = (array: number): void => C().disableClientState(array);
export const glVertexPointer = (size: number, type: number, stride: number, offset: number): void => C().pointer(GL_VERTEX_ARRAY, size, type, stride, offset);
export const glTexCoordPointer = (size: number, type: number, stride: number, offset: number): void => C().pointer(GL_TEXTURE_COORD_ARRAY, size, type, stride, offset);
export const glColorPointer = (size: number, type: number, stride: number, offset: number): void => C().pointer(GL_COLOR_ARRAY, size, type, stride, offset);
export const glNormalPointer = (type: number, stride: number, offset: number): void => C().pointer(GL_NORMAL_ARRAY, 3, type, stride, offset);

export const glGenBuffers = (n: number, buffers: { [i: number]: number }): void => C().genBuffers(n, buffers);
export const glBindBuffer = (target: number, id: number): void => C().bindBuffer(target, id);
export const glBufferData = (target: number, size: number, data: ArrayBufferView | null, usage: number): void => C().bufferData(target, size, data, usage);
export const glDeleteBuffers = (n: number, ids: ArrayLike<number>): void => C().deleteBuffers(n, ids);
export const glDrawArrays = (mode: number, first: number, count: number): void => C().drawArrays(mode, first, count);

export const glGenTextures = (n: number, textures: { [i: number]: number }): void => C().genTextures(n, textures);
export const glBindTexture = (target: number, id: number): void => C().bindTexture(target, id);
export const glDeleteTextures = (n: number, ids: ArrayLike<number>): void => C().deleteTextures(n, ids);
export const glTexParameteri = (target: number, pname: number, param: number): void => C().gl?.texParameteri(target, pname, param);
export const glTexImage2D = (target: number, level: number, internalFormat: number, w: number, h: number, border: number, format: number, type: number, pixels: ArrayBufferView | null): void =>
  C().gl?.texImage2D(target, level, internalFormat, w, h, border, format, type, pixels);
export const glTexSubImage2D = (target: number, level: number, x: number, y: number, w: number, h: number, format: number, type: number, pixels: ArrayBufferView): void =>
  C().gl?.texSubImage2D(target, level, x, y, w, h, format, type, pixels);

// ================================================================ *2 别名（没有定义 GLDEBUG：就是原函数）
export const glTranslatef2 = glTranslatef, glRotatef2 = glRotatef, glScalef2 = glScalef, glPushMatrix2 = glPushMatrix, glPopMatrix2 = glPopMatrix;
export const glLoadIdentity2 = glLoadIdentity, glVertexPointer2 = glVertexPointer, glColorPointer2 = glColorPointer, glTexCoordPointer2 = glTexCoordPointer;
export const glNormalPointer2 = glNormalPointer, glEnableClientState2 = glEnableClientState, glDisableClientState2 = glDisableClientState, glDrawArrays2 = glDrawArrays;
export const glTexParameteri2 = glTexParameteri, glTexImage2D2 = glTexImage2D, glTexSubImage2D2 = glTexSubImage2D, glBindBuffer2 = glBindBuffer, glBufferData2 = glBufferData;
export const glBindTexture2 = glBindTexture, glEnable2 = glEnable, glDisable2 = glDisable, glColor4f2 = glColor4f, glBlendFunc2 = glBlendFunc, glShadeModel2 = glShadeModel;

// ================================================================ gles.cpp
const __glPi = Math.fround(3.14159265358979323846);

/** 与 gles.cpp 相同：m[4][4] 按 &m[0][0] 交给 glMultMatrixf，所以 m[c][r] 是列主序的第 c 列第 r 行 */
export function gluPerspective(fovy: number, aspect: number, zNear: number, zFar: number): void {
  const f = Math.fround;
  const radians = f(f(f(f(fovy) / 2.0) * __glPi) / 180.0);
  const deltaZ = f(f(zFar) - f(zNear));
  const sine = f(Math.sin(radians));
  if (deltaZ === 0.0 || sine === 0.0 || aspect === 0.0) {
    return;
  }
  const cotangent = f(Math.cos(radians) / sine);
  const m = new Float32Array(16);
  __gluMakeIdentityf(m);
  m[0 * 4 + 0] = cotangent / aspect;
  m[1 * 4 + 1] = cotangent;
  m[2 * 4 + 2] = -(zFar + zNear) / deltaZ;
  m[2 * 4 + 3] = -1.0;
  m[3 * 4 + 2] = (-2.0 * zNear * zFar) / deltaZ;
  m[3 * 4 + 3] = 0;
  glMultMatrixf(m);
}

function __gluMakeIdentityf(m: Float32Array): void {
  m.fill(0);
  m[0] = m[5] = m[10] = m[15] = 1;
}

/** OPENGL_ES 已定义：#ifndef OPENGL_ES 里的 glewInit 不执行 */
export function glInit(): void {}

/** __EMSCRIPTEN__ 分支：直接调用 glGenBuffers */
export function anGenBuffers(n: number, buffers: { [i: number]: number }): void {
  glGenBuffers(n, buffers);
}
export const glGenBuffers2 = anGenBuffers;

export function drawArrayVT(bufferId: number, vertices: number, vertexSize = 36, mode = GL_TRIANGLES): void {
  glBindBuffer2(GL_ARRAY_BUFFER, bufferId);
  glTexCoordPointer2(2, GL_FLOAT, vertexSize, 3 * 4);
  glEnableClientState2(GL_TEXTURE_COORD_ARRAY);
  glVertexPointer2(3, GL_FLOAT, vertexSize, 0);
  glEnableClientState2(GL_VERTEX_ARRAY);
  glDrawArrays2(mode, 0, vertices);
  glDisableClientState2(GL_VERTEX_ARRAY);
  glDisableClientState2(GL_TEXTURE_COORD_ARRAY);
}

export function drawArrayVTC(bufferId: number, vertices: number, vertexSize = 36): void {
  glEnableClientState2(GL_VERTEX_ARRAY);
  glEnableClientState2(GL_TEXTURE_COORD_ARRAY);
  glEnableClientState2(GL_COLOR_ARRAY);
  glBindBuffer2(GL_ARRAY_BUFFER, bufferId);
  glVertexPointer2(3, GL_FLOAT, vertexSize, 0);
  glTexCoordPointer2(2, GL_FLOAT, vertexSize, 3 * 4);
  glColorPointer2(4, GL_UNSIGNED_BYTE, vertexSize, 5 * 4);
  glDrawArrays2(GL_TRIANGLES, 0, vertices);
  glDisableClientState2(GL_VERTEX_ARRAY);
  glDisableClientState2(GL_TEXTURE_COORD_ARRAY);
  glDisableClientState2(GL_COLOR_ARRAY);
}

export function drawArrayVTN(bufferId: number, vertices: number, vertexSize = 36): void {
  glEnableClientState2(GL_VERTEX_ARRAY);
  glEnableClientState2(GL_TEXTURE_COORD_ARRAY);
  glEnableClientState2(GL_NORMAL_ARRAY);
  glBindBuffer2(GL_ARRAY_BUFFER, bufferId);
  glVertexPointer2(3, GL_FLOAT, vertexSize, 0);
  glTexCoordPointer2(2, GL_FLOAT, vertexSize, 3 * 4);
  glNormalPointer(GL_FLOAT, vertexSize, 6 * 4);
  glDrawArrays2(GL_TRIANGLES, 0, vertices);
  glDisableClientState2(GL_VERTEX_ARRAY);
  glDisableClientState2(GL_TEXTURE_COORD_ARRAY);
  glDisableClientState2(GL_NORMAL_ARRAY);
}

/** USE_VBO 下的 #define drawArrayVT_NoState drawArrayVT 等 */
export const drawArrayVT_NoState = drawArrayVT;
export const drawArrayVTC_NoState = drawArrayVTC;
export const drawArrayVTN_NoState = drawArrayVTN;

export function MultiplyMatrices4by4OpenGL_FLOAT(result: Float32Array, matrix1: ArrayLike<number>, matrix2: ArrayLike<number>): void {
  const m1 = matrix1, m2 = matrix2;
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      result[c * 4 + r] = m1[r]! * m2[c * 4]! + m1[4 + r]! * m2[c * 4 + 1]! + m1[8 + r]! * m2[c * 4 + 2]! + m1[12 + r]! * m2[c * 4 + 3]!;
}

export function MultiplyMatrixByVector4by4OpenGL_FLOAT(resultvector: Float32Array, matrix: ArrayLike<number>, pvector: ArrayLike<number>): void {
  const m = matrix, p = pvector;
  resultvector[0] = m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]! * p[3]!;
  resultvector[1] = m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]! * p[3]!;
  resultvector[2] = m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]! * p[3]!;
  resultvector[3] = m[3]! * p[0]! + m[7]! * p[1]! + m[11]! * p[2]! + m[15]! * p[3]!;
}

/** 与 gles.cpp 的 glhInvertMatrixf2 相同（高斯消元、按列选主元）；返回 1 成功、0 奇异 */
export function glhInvertMatrixf2(m: ArrayLike<number>, out: Float32Array): number {
  const MAT = (r: number, c: number) => m[c * 4 + r]!;
  const wtmp = [new Float32Array(8), new Float32Array(8), new Float32Array(8), new Float32Array(8)];
  let r0 = wtmp[0]!, r1 = wtmp[1]!, r2 = wtmp[2]!, r3 = wtmp[3]!;
  r0.set([MAT(0, 0), MAT(0, 1), MAT(0, 2), MAT(0, 3), 1, 0, 0, 0]);
  r1.set([MAT(1, 0), MAT(1, 1), MAT(1, 2), MAT(1, 3), 0, 1, 0, 0]);
  r2.set([MAT(2, 0), MAT(2, 1), MAT(2, 2), MAT(2, 3), 0, 0, 1, 0]);
  r3.set([MAT(3, 0), MAT(3, 1), MAT(3, 2), MAT(3, 3), 0, 0, 0, 1]);
  let t = r0;
  /* choose pivot - or die */
  if (Math.abs(r3[0]!) > Math.abs(r2[0]!)) { t = r3; r3 = r2; r2 = t; }
  if (Math.abs(r2[0]!) > Math.abs(r1[0]!)) { t = r2; r2 = r1; r1 = t; }
  if (Math.abs(r1[0]!) > Math.abs(r0[0]!)) { t = r1; r1 = r0; r0 = t; }
  if (0.0 === r0[0]) return 0;
  /* eliminate first variable */
  let m1 = r1[0]! / r0[0]!, m2 = r2[0]! / r0[0]!, m3 = r3[0]! / r0[0]!;
  for (let k = 1; k < 4; k++) {
    const s = r0[k]!;
    r1[k]! -= m1 * s; r2[k]! -= m2 * s; r3[k]! -= m3 * s;
  }
  for (let k = 4; k < 8; k++) {
    const s = r0[k]!;
    if (s !== 0.0) { r1[k]! -= m1 * s; r2[k]! -= m2 * s; r3[k]! -= m3 * s; }
  }
  /* choose pivot - or die */
  if (Math.abs(r3[1]!) > Math.abs(r2[1]!)) { t = r3; r3 = r2; r2 = t; }
  if (Math.abs(r2[1]!) > Math.abs(r1[1]!)) { t = r2; r2 = r1; r1 = t; }
  if (0.0 === r1[1]) return 0;
  /* eliminate second variable */
  m2 = r2[1]! / r1[1]!;
  m3 = r3[1]! / r1[1]!;
  r2[2]! -= m2 * r1[2]!; r3[2]! -= m3 * r1[2]!;
  r2[3]! -= m2 * r1[3]!; r3[3]! -= m3 * r1[3]!;
  for (let k = 4; k < 8; k++) {
    const s = r1[k]!;
    if (0.0 !== s) { r2[k]! -= m2 * s; r3[k]! -= m3 * s; }
  }
  /* choose pivot - or die */
  if (Math.abs(r3[2]!) > Math.abs(r2[2]!)) { t = r3; r3 = r2; r2 = t; }
  if (0.0 === r2[2]) return 0;
  /* eliminate third variable */
  m3 = r3[2]! / r2[2]!;
  for (let k = 3; k < 8; k++) r3[k]! -= m3 * r2[k]!;
  /* last check */
  if (0.0 === r3[3]) return 0;
  let s = 1.0 / r3[3]!; /* now back substitute row 3 */
  for (let k = 4; k < 8; k++) r3[k]! *= s;
  m2 = r2[3]!; /* now back substitute row 2 */
  s = 1.0 / r2[2]!;
  for (let k = 4; k < 8; k++) r2[k] = s * (r2[k]! - r3[k]! * m2);
  m1 = r1[3]!;
  for (let k = 4; k < 8; k++) r1[k]! -= r3[k]! * m1;
  let m0 = r0[3]!;
  for (let k = 4; k < 8; k++) r0[k]! -= r3[k]! * m0;
  m1 = r1[2]!; /* now back substitute row 1 */
  s = 1.0 / r1[1]!;
  for (let k = 4; k < 8; k++) r1[k] = s * (r1[k]! - r2[k]! * m1);
  m0 = r0[2]!;
  for (let k = 4; k < 8; k++) r0[k]! -= r2[k]! * m0;
  m0 = r0[1]!; /* now back substitute row 0 */
  s = 1.0 / r0[0]!;
  for (let k = 4; k < 8; k++) r0[k] = s * (r0[k]! - r1[k]! * m0);
  const rows = [r0, r1, r2, r3];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[c * 4 + r] = rows[r]![4 + c]!;
  return 1;
}

export function glhUnProjectf(winx: number, winy: number, winz: number, modelview: ArrayLike<number>, projection: ArrayLike<number>, viewport: ArrayLike<number>, objectCoordinate: Float32Array): number {
  const m = new Float32Array(16), A = new Float32Array(16);
  const inp = new Float32Array(4), out = new Float32Array(4);
  MultiplyMatrices4by4OpenGL_FLOAT(A, projection, modelview);
  if (glhInvertMatrixf2(A, m) === 0) return 0;
  inp[0] = ((winx - viewport[0]!) / viewport[2]!) * 2.0 - 1.0;
  inp[1] = ((winy - viewport[1]!) / viewport[3]!) * 2.0 - 1.0;
  inp[2] = 2.0 * winz - 1.0;
  inp[3] = 1.0;
  MultiplyMatrixByVector4by4OpenGL_FLOAT(out, m, inp);
  if (out[3] === 0.0) return 0;
  out[3] = 1.0 / out[3]!;
  objectCoordinate[0] = out[0]! * out[3]!;
  objectCoordinate[1] = out[1]! * out[3]!;
  objectCoordinate[2] = out[2]! * out[3]!;
  return 1;
}
