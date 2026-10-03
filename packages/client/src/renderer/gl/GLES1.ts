/**
 * NEW（S6）：在 WebGL2 上复刻 GLES1 固定管线的必要子集（手册附录 B）。gles.ts 的全局 GL 函数都转到这里的“当前上下文”。
 *
 * 覆盖：
 *  - 矩阵：MODELVIEW、PROJECTION、TEXTURE 三个栈，列主序 Float32Array，乘法顺序与 GL 相同（当前矩阵右乘）。
 *  - 顶点数组：VERTEX、TEXTURE_COORD、COLOR（UNSIGNED_BYTE 归一化）、NORMAL；指针在调用 gl*Pointer 时记住当时绑定的
 *    ARRAY_BUFFER（与 GL 语义相同）。没有开启的颜色数组用 glColor4f 的当前色。
 *  - 片元：纹理 × 顶点色（GL_MODULATE）；ALPHA_TEST 按 glAlphaFunc 比较，不通过就 discard；
 *    雾按视空间的 |z| 做 LINEAR、EXP 或 EXP2 混合（与常见的 GLES1 实现及 Emscripten 的 GL 模拟相同）。
 *  - GL_FLAT 用 GLSL ES 3.00 的 flat 变量，取三角形最后一个顶点的颜色，与 GLES1 相同；所以要两套程序（平滑、平直）。
 *  - 深度、剔除、混合、裁剪、视口、清屏直接用 WebGL 的原生状态。
 *  - 光照（glLightfv、glLightModelfv、LIGHTING、LIGHT0/1、COLOR_MATERIAL、NORMALIZE）只保存状态，计算 DEFERRED(GLLighting)：
 *    分支的区块渲染不开光照，只有物品与实体用到。
 *
 * 无头模式：构造时传 null，只维护状态与矩阵、不画任何东西，供 Node 里的单测使用。
 */

// ---- 本文件用到的 GL 枚举（与 gles.ts 导出的同值）
const GL_TEXTURE_2D = 0x0de1;
const GL_ALPHA_TEST = 0x0bc0;
const GL_FOG = 0x0b60;
const GL_LIGHTING = 0x0b50;
const GL_LIGHT0 = 0x4000;
const GL_LIGHT1 = 0x4001;
const GL_COLOR_MATERIAL = 0x0b57;
const GL_NORMALIZE = 0x0ba1;
const GL_RESCALE_NORMAL = 0x803a;
const GL_VERTEX_ARRAY = 0x8074;
const GL_NORMAL_ARRAY = 0x8075;
const GL_COLOR_ARRAY = 0x8076;
const GL_TEXTURE_COORD_ARRAY = 0x8078;
const GL_MODELVIEW = 0x1700;
const GL_PROJECTION = 0x1701;
const GL_TEXTURE = 0x1702;
const GL_MODELVIEW_MATRIX = 0x0ba6;
const GL_PROJECTION_MATRIX = 0x0ba7;
const GL_TEXTURE_MATRIX = 0x0ba8;
const GL_VIEWPORT = 0x0ba2;
const GL_FOG_DENSITY = 0x0b62;
const GL_FOG_START = 0x0b63;
const GL_FOG_END = 0x0b64;
const GL_FOG_MODE = 0x0b65;
const GL_FOG_COLOR = 0x0b66;
const GL_EXP = 0x0800;
const GL_EXP2 = 0x0801;
const GL_LINEAR = 0x2601;
const GL_FLAT = 0x1d00;
const GL_SMOOTH = 0x1d01;
const GL_ALWAYS = 0x0207;
const GL_UNSIGNED_BYTE = 0x1401;
const GL_ARRAY_BUFFER = 0x8892;
const GL_TEXTURE_ENV_MODE = 0x2200;
const GL_MODULATE = 0x2100;

/** 由 GLES1 自己模拟的开关；其余的 glEnable 直接交给 WebGL */
const EMULATED_CAPS = new Set([
  GL_TEXTURE_2D,
  GL_ALPHA_TEST,
  GL_FOG,
  GL_LIGHTING,
  GL_LIGHT0,
  GL_LIGHT1,
  GL_COLOR_MATERIAL,
  GL_NORMALIZE,
  GL_RESCALE_NORMAL,
]);

interface ArrayPointer {
  enabled: boolean;
  size: number;
  type: number;
  stride: number;
  offset: number;
  buffer: number; // 调用 gl*Pointer 时绑定的 ARRAY_BUFFER
}

const ATTR_POS = 0;
const ATTR_UV = 1;
const ATTR_COLOR = 2;

function identity(): Float32Array {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** out = a × b（列主序） */
function mul(a: Float32Array, b: ArrayLike<number>): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r]! * b[c * 4]! +
        a[4 + r]! * b[c * 4 + 1]! +
        a[8 + r]! * b[c * 4 + 2]! +
        a[12 + r]! * b[c * 4 + 3]!;
    }
  return out;
}

const VS = (flat: boolean) => `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec4 aColor;
uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat4 uTexMatrix;
out vec2 vUV;
${flat ? 'flat ' : ''}out vec4 vColor;
out float vFogDist;
void main() {
  vec4 eye = uModelView * vec4(aPos, 1.0);
  gl_Position = uProjection * eye;
  vUV = (uTexMatrix * vec4(aUV, 0.0, 1.0)).xy;
  vColor = aColor;
  vFogDist = abs(eye.z);
}`;

const FS = (flat: boolean) => `#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform bool uTexEnabled;
uniform bool uAlphaTest;
uniform int uAlphaFunc;
uniform float uAlphaRef;
uniform bool uFog;
uniform int uFogMode;
uniform float uFogStart;
uniform float uFogEnd;
uniform float uFogDensity;
uniform vec4 uFogColor;
in vec2 vUV;
${flat ? 'flat ' : ''}in vec4 vColor;
in float vFogDist;
out vec4 outColor;
bool alphaPass(float a) {
  if (uAlphaFunc == ${0x0200}) return false;          // NEVER
  if (uAlphaFunc == ${0x0201}) return a < uAlphaRef;  // LESS
  if (uAlphaFunc == ${0x0202}) return a == uAlphaRef; // EQUAL
  if (uAlphaFunc == ${0x0203}) return a <= uAlphaRef; // LEQUAL
  if (uAlphaFunc == ${0x0204}) return a > uAlphaRef;  // GREATER
  if (uAlphaFunc == ${0x0205}) return a != uAlphaRef; // NOTEQUAL
  if (uAlphaFunc == ${0x0206}) return a >= uAlphaRef; // GEQUAL
  return true;                                        // ALWAYS
}
void main() {
  vec4 c = vColor;
  if (uTexEnabled) c *= texture(uTex, vUV);
  if (uAlphaTest && !alphaPass(c.a)) discard;
  if (uFog) {
    float f;
    if (uFogMode == ${GL_LINEAR}) f = (uFogEnd - vFogDist) / (uFogEnd - uFogStart);
    else if (uFogMode == ${GL_EXP2}) f = exp(-(uFogDensity * vFogDist) * (uFogDensity * vFogDist));
    else f = exp(-uFogDensity * vFogDist);
    c.rgb = mix(uFogColor.rgb, c.rgb, clamp(f, 0.0, 1.0));
  }
  outColor = c;
}`;

interface Program {
  program: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

export class GLES1 {
  readonly gl: WebGL2RenderingContext | null;

  // ---- 矩阵
  private readonly stacks: Float32Array[][] = [[identity()], [identity()], [identity()]];
  private matrixIndex = 0;

  // ---- 固定管线状态
  readonly color = new Float32Array([1, 1, 1, 1]);
  readonly normal = new Float32Array([0, 0, 1]);
  private readonly emulatedEnabled = new Set<number>();
  private readonly nativeEnabled = new Set<number>();
  alphaFunc = GL_ALWAYS;
  alphaRef = 0;
  shadeModel = GL_SMOOTH;
  fogMode = GL_EXP;
  fogStart = 0;
  fogEnd = 1;
  fogDensity = 1;
  readonly fogColor = new Float32Array(4);
  texEnvMode = GL_MODULATE;
  /** 只保存，不参与计算：DEFERRED(GLLighting) */
  readonly lightState = new Map<string, Float32Array>();
  readonly viewport = new Int32Array(4);

  // ---- 顶点数组
  private readonly arrays = new Map<number, ArrayPointer>(
    [GL_VERTEX_ARRAY, GL_TEXTURE_COORD_ARRAY, GL_COLOR_ARRAY, GL_NORMAL_ARRAY].map((k) => [
      k,
      { enabled: false, size: 4, type: 0x1406, stride: 0, offset: 0, buffer: 0 },
    ]),
  );

  // ---- 对象表（GL 的整数名 → WebGL 对象）
  private readonly buffers = new Map<number, WebGLBuffer | null>();
  private readonly textures = new Map<number, WebGLTexture | null>();
  private nextBuffer = 1;
  private nextTexture = 1;
  boundArrayBuffer = 0;
  boundTexture = 0;
  /** 最近一次 glBufferData 的字节数（无头模式下供测试检查） */
  readonly bufferSizes = new Map<number, number>();
  drawCalls = 0;

  private programs: [Program, Program] | null = null;

  constructor(gl: WebGL2RenderingContext | null) {
    this.gl = gl;
    if (gl) {
      this.programs = [this.link(false), this.link(true)];
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.getExtension('EXT_color_buffer_float');
      const vp = gl.getParameter(gl.VIEWPORT) as Int32Array;
      this.viewport.set(vp);
    }
  }

  private link(flat: boolean): Program {
    const gl = this.gl!;
    const compile = (type: number, src: string): WebGLShader => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error('GLES1 着色器编译失败：' + gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VS(flat)));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FS(flat)));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('GLES1 程序链接失败：' + gl.getProgramInfoLog(program));
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of [
      'uModelView',
      'uProjection',
      'uTexMatrix',
      'uTex',
      'uTexEnabled',
      'uAlphaTest',
      'uAlphaFunc',
      'uAlphaRef',
      'uFog',
      'uFogMode',
      'uFogStart',
      'uFogEnd',
      'uFogDensity',
      'uFogColor',
    ])
      u[n] = gl.getUniformLocation(program, n);
    return { program, u };
  }

  // ================================================================ 开关
  enable(cap: number): void {
    if (EMULATED_CAPS.has(cap)) this.emulatedEnabled.add(cap);
    else {
      this.nativeEnabled.add(cap);
      this.gl?.enable(cap);
    }
  }

  disable(cap: number): void {
    if (EMULATED_CAPS.has(cap)) this.emulatedEnabled.delete(cap);
    else {
      this.nativeEnabled.delete(cap);
      this.gl?.disable(cap);
    }
  }

  isEnabled(cap: number): boolean {
    return this.emulatedEnabled.has(cap) || this.nativeEnabled.has(cap);
  }

  // ================================================================ 矩阵
  matrixMode(mode: number): void {
    this.matrixIndex = mode === GL_PROJECTION ? 1 : mode === GL_TEXTURE ? 2 : 0;
  }

  private get top(): Float32Array {
    const s = this.stacks[this.matrixIndex]!;
    return s[s.length - 1]!;
  }

  private set top(m: Float32Array) {
    const s = this.stacks[this.matrixIndex]!;
    s[s.length - 1] = m;
  }

  loadIdentity(): void {
    this.top = identity();
  }

  pushMatrix(): void {
    const s = this.stacks[this.matrixIndex]!;
    s.push(new Float32Array(s[s.length - 1]!));
  }

  popMatrix(): void {
    const s = this.stacks[this.matrixIndex]!;
    if (s.length > 1) s.pop(); // GL 在栈下溢时报 STACK_UNDERFLOW 并忽略
  }

  multMatrix(m: ArrayLike<number>): void {
    this.top = mul(this.top, m);
  }

  translate(x: number, y: number, z: number): void {
    const m = identity();
    m[12] = x;
    m[13] = y;
    m[14] = z;
    this.multMatrix(m);
  }

  scale(x: number, y: number, z: number): void {
    const m = identity();
    m[0] = x;
    m[5] = y;
    m[10] = z;
    this.multMatrix(m);
  }

  rotate(angleDeg: number, x: number, y: number, z: number): void {
    const len = Math.hypot(x, y, z);
    if (len === 0) return;
    x /= len;
    y /= len;
    z /= len;
    const a = (angleDeg * Math.PI) / 180;
    const c = Math.cos(a),
      s = Math.sin(a),
      t = 1 - c;
    const m = new Float32Array(16);
    m[0] = x * x * t + c;
    m[4] = x * y * t - z * s;
    m[8] = x * z * t + y * s;
    m[1] = y * x * t + z * s;
    m[5] = y * y * t + c;
    m[9] = y * z * t - x * s;
    m[2] = x * z * t - y * s;
    m[6] = y * z * t + x * s;
    m[10] = z * z * t + c;
    m[15] = 1;
    this.multMatrix(m);
  }

  ortho(l: number, r: number, b: number, t: number, n: number, f: number): void {
    const m = identity();
    m[0] = 2 / (r - l);
    m[5] = 2 / (t - b);
    m[10] = -2 / (f - n);
    m[12] = -(r + l) / (r - l);
    m[13] = -(t + b) / (t - b);
    m[14] = -(f + n) / (f - n);
    this.multMatrix(m);
  }

  getFloatv(pname: number, out: Float32Array): void {
    const pick = (i: number) => this.stacks[i]![this.stacks[i]!.length - 1]!;
    if (pname === GL_MODELVIEW_MATRIX) out.set(pick(0));
    else if (pname === GL_PROJECTION_MATRIX) out.set(pick(1));
    else if (pname === GL_TEXTURE_MATRIX) out.set(pick(2));
  }

  getIntegerv(pname: number, out: Int32Array): void {
    if (pname === GL_VIEWPORT) out.set(this.viewport);
  }

  // ================================================================ 状态
  setColor(r: number, g: number, b: number, a: number): void {
    this.color[0] = r;
    this.color[1] = g;
    this.color[2] = b;
    this.color[3] = a;
  }

  setFog(pname: number, value: number | ArrayLike<number>): void {
    if (pname === GL_FOG_COLOR) {
      this.fogColor.set(value as ArrayLike<number>);
      return;
    }
    const v = typeof value === 'number' ? value : value[0]!;
    if (pname === GL_FOG_MODE) this.fogMode = v;
    else if (pname === GL_FOG_START) this.fogStart = v;
    else if (pname === GL_FOG_END) this.fogEnd = v;
    else if (pname === GL_FOG_DENSITY) this.fogDensity = v;
  }

  setViewport(x: number, y: number, w: number, h: number): void {
    this.viewport.set([x, y, w, h]);
    this.gl?.viewport(x, y, w, h);
  }

  texEnv(pname: number, param: number): void {
    if (pname === GL_TEXTURE_ENV_MODE) this.texEnvMode = param; // 只支持 MODULATE，分支没有用别的模式
  }

  // ================================================================ 顶点数组
  enableClientState(array: number): void {
    const p = this.arrays.get(array);
    if (p) p.enabled = true;
  }

  disableClientState(array: number): void {
    const p = this.arrays.get(array);
    if (p) p.enabled = false;
  }

  pointer(array: number, size: number, type: number, stride: number, offset: number): void {
    const p = this.arrays.get(array)!;
    p.size = size;
    p.type = type;
    p.stride = stride;
    p.offset = offset;
    p.buffer = this.boundArrayBuffer;
  }

  isClientStateEnabled(array: number): boolean {
    return this.arrays.get(array)?.enabled ?? false;
  }

  // ================================================================ 缓冲
  genBuffers(n: number, out: { [i: number]: number }): void {
    for (let i = 0; i < n; i++) {
      const id = this.nextBuffer++;
      this.buffers.set(id, this.gl ? this.gl.createBuffer() : null);
      out[i] = id;
    }
  }

  bindBuffer(target: number, id: number): void {
    if (target === GL_ARRAY_BUFFER) this.boundArrayBuffer = id;
    if (this.gl) {
      if (id !== 0 && !this.buffers.has(id)) this.buffers.set(id, this.gl.createBuffer());
      this.gl.bindBuffer(target, id === 0 ? null : this.buffers.get(id)!);
    }
  }

  bufferData(target: number, size: number, data: ArrayBufferView | null, usage: number): void {
    if (target === GL_ARRAY_BUFFER) this.bufferSizes.set(this.boundArrayBuffer, size);
    if (!this.gl) return;
    if (data)
      this.gl.bufferData(
        target,
        data,
        usage,
        0,
        size / ((data as Uint8Array).BYTES_PER_ELEMENT ?? 1),
      );
    else this.gl.bufferData(target, size, usage);
  }

  deleteBuffers(n: number, ids: ArrayLike<number>): void {
    for (let i = 0; i < n; i++) {
      const b = this.buffers.get(ids[i]!);
      if (b && this.gl) this.gl.deleteBuffer(b);
      this.buffers.delete(ids[i]!);
      this.bufferSizes.delete(ids[i]!);
      if (this.boundArrayBuffer === ids[i]) this.boundArrayBuffer = 0;
    }
  }

  // ================================================================ 纹理
  genTextures(n: number, out: { [i: number]: number }): void {
    for (let i = 0; i < n; i++) {
      const id = this.nextTexture++;
      this.textures.set(id, this.gl ? this.gl.createTexture() : null);
      out[i] = id;
    }
  }

  bindTexture(target: number, id: number): void {
    this.boundTexture = id;
    if (this.gl) {
      if (id !== 0 && !this.textures.has(id)) this.textures.set(id, this.gl.createTexture());
      this.gl.bindTexture(target, id === 0 ? null : this.textures.get(id)!);
    }
  }

  deleteTextures(n: number, ids: ArrayLike<number>): void {
    for (let i = 0; i < n; i++) {
      const t = this.textures.get(ids[i]!);
      if (t && this.gl) this.gl.deleteTexture(t);
      this.textures.delete(ids[i]!);
      if (this.boundTexture === ids[i]) this.boundTexture = 0;
    }
  }

  // ================================================================ 绘制
  drawArrays(mode: number, first: number, count: number): void {
    this.drawCalls++;
    const gl = this.gl;
    if (!gl || !this.programs) return;
    const prog = this.programs[this.shadeModel === GL_FLAT ? 1 : 0];
    gl.useProgram(prog.program);
    const u = prog.u;
    gl.uniformMatrix4fv(u.uModelView!, false, this.stacks[0]![this.stacks[0]!.length - 1]!);
    gl.uniformMatrix4fv(u.uProjection!, false, this.stacks[1]![this.stacks[1]!.length - 1]!);
    gl.uniformMatrix4fv(u.uTexMatrix!, false, this.stacks[2]![this.stacks[2]!.length - 1]!);
    gl.uniform1i(u.uTex!, 0);
    gl.uniform1i(
      u.uTexEnabled!,
      this.emulatedEnabled.has(GL_TEXTURE_2D) && this.boundTexture !== 0 ? 1 : 0,
    );
    gl.uniform1i(u.uAlphaTest!, this.emulatedEnabled.has(GL_ALPHA_TEST) ? 1 : 0);
    gl.uniform1i(u.uAlphaFunc!, this.alphaFunc);
    gl.uniform1f(u.uAlphaRef!, this.alphaRef);
    gl.uniform1i(u.uFog!, this.emulatedEnabled.has(GL_FOG) ? 1 : 0);
    gl.uniform1i(u.uFogMode!, this.fogMode);
    gl.uniform1f(u.uFogStart!, this.fogStart);
    gl.uniform1f(u.uFogEnd!, this.fogEnd);
    gl.uniform1f(u.uFogDensity!, this.fogDensity);
    gl.uniform4fv(u.uFogColor!, this.fogColor);

    const bindAttr = (array: number, loc: number, fallback: () => void) => {
      const p = this.arrays.get(array)!;
      if (p.enabled) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get(p.buffer) ?? null);
        gl.vertexAttribPointer(
          loc,
          p.size,
          p.type,
          p.type === GL_UNSIGNED_BYTE,
          p.stride,
          p.offset,
        );
        gl.enableVertexAttribArray(loc);
      } else {
        gl.disableVertexAttribArray(loc);
        fallback();
      }
    };
    bindAttr(GL_VERTEX_ARRAY, ATTR_POS, () => gl.vertexAttrib3f(ATTR_POS, 0, 0, 0));
    bindAttr(GL_TEXTURE_COORD_ARRAY, ATTR_UV, () => gl.vertexAttrib2f(ATTR_UV, 0, 0));
    bindAttr(GL_COLOR_ARRAY, ATTR_COLOR, () =>
      gl.vertexAttrib4f(ATTR_COLOR, this.color[0]!, this.color[1]!, this.color[2]!, this.color[3]!),
    );
    gl.drawArrays(mode, first, count);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get(this.boundArrayBuffer) ?? null);
  }
}
