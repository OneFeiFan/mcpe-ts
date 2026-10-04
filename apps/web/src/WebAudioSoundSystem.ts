/**
 * Web Audio 后端。**没有 C++ 对应物** —— 这是本任务单少数几处"新增能力"。
 *
 * C++ 的 `SoundEngine.h` 在网页版构建里落到 `#else`，用的是那个 8 个虚函数全空的
 * `SoundSystem` 基类：**原版网页版一点声音都没有**。所以这里的判据不是"和 C++ 一样"，
 * 而是**照 Android/iOS 那条路（`SoundSystemAL.cpp`）的语义复刻**，再加上浏览器特有的两件事。
 *
 * 【复刻 SoundSystemAL 的四处】
 *   1. `playAt` 开头 `if (pitch < 0.01f) pitch = 1;`（`SoundSystemAL.cpp:137`）；
 *   2. 距离模型 `AL_LINEAR_DISTANCE_CLAMPED` + `ref=5 / max=16 / rolloff=6`
 *      （`SoundSystemAL.cpp:65,71-73`）。Web Audio 的 `PannerNode` 有**同一个公式**的
 *      线性模型：`1 - rolloff × (d - ref) / (max - ref)`，夹到 [0,1] —— 三个数字照抄即可；
 *   3. `gain = volume`、`position = (x,y,z)`，坐标是**相对听者的**（听者永远在原点，
 *      因为 `SoundEngine::update` 只设角度不设位置，见 `SoundEngine.ts` 头注释）；
 *   4. 缓冲区按 **`SoundDesc` 的身份**缓存 —— C++ 的 `getBufferId(sound, …)` 就是按 desc
 *      找的（实质是按 `desc.frames` 那个指针）。TS 里用 `desc.frames` 这个视图对象做键。
 *
 * 【浏览器特有的三件事】
 *   - **自动播放策略**：`AudioContext` 一开始是 `suspended`，没有用户手势就不出声。
 *     挂一次性 `pointerdown`/`keydown` 去 `resume()`；
 *   - **数据是裸 PCM16，不是容器格式**（没有 WAV/MP3 头），`decodeAudioData` 解不了。
 *     所以直接 `createBuffer` + 手工把交错 PCM16 铺成各声道的 Float32 ——
 *     顺带完全绕开了各浏览器解码器的差异，比走 `decodeAudioData` 更"1:1"；
 *   - **播放调用记录**：声音没法截图，所以每次 `playAt` 往 `plays` 里推一条，
 *     浏览器场景靠它验收（见任务单坑六）。
 */
import { SoundDesc, SoundSystem } from '@mcpe/client';

/** `AL_LINEAR_DISTANCE_CLAMPED` 的三个常数，照抄 `SoundSystemAL.cpp` */
export const AL_REFERENCE_DISTANCE = 5.0;
export const AL_MAX_DISTANCE = 16.0;
export const AL_ROLLOFF_FACTOR = 6.0;

/** 一次 `playAt` 的记录（给场景脚本断言用） */
export type PlayRecord = {
  name: string;
  x: number;
  y: number;
  z: number;
  volume: number;
  pitch: number;
};

/**
 * 交错 PCM16 → 每声道一条 Float32（[-1, 1)）。
 *
 * 抽出来是因为这一段**最容易错又最难看出来**：声道怎么交错的、`byteWidth` 怎么算的。
 * 单独可测（`tests/unit/client/web-audio.test.ts`）。
 */
export function pcm16ToFloatPerChannel(desc: SoundDesc): Float32Array<ArrayBuffer>[] {
  const { channels, byteWidth, numFrames } = desc;
  const frames = desc.frames;
  const view = new DataView(frames.buffer, frames.byteOffset, frames.byteLength);
  const out: Float32Array<ArrayBuffer>[] = [];
  for (let c = 0; c < channels; c++) {
    // ⚠ 显式给 ArrayBuffer：`Float32Array<ArrayBufferLike>` 传不进 copyToChannel（TS 5.7 的泛型）
    const chan = new Float32Array(new ArrayBuffer(numFrames * Float32Array.BYTES_PER_ELEMENT));
    for (let i = 0; i < numFrames; i++) {
      // 交错存放：第 i 帧的第 c 个声道在第 (i * channels + c) 个样本上
      const offset = (i * channels + c) * byteWidth;
      chan[i] = view.getInt16(offset, true) / 32768;
    }
    out.push(chan);
  }
  return out;
}

export class WebAudioSoundSystem extends SoundSystem {
  private ctx: AudioContext | null = null;
  /** 按 `desc.frames`（视图对象身份）缓存已建好的缓冲 —— 对应 C++ 按指针找 buffer */
  private readonly buffers = new WeakMap<Uint8Array, AudioBuffer>();
  private unlocked = false;
  /** 每次 playAt 记一条；场景脚本读它当判据 */
  readonly plays: PlayRecord[] = [];
  /** 听者朝向（`setListenerAngle` 记下来，playAt 时写进 AudioListener） */
  private listenerDeg = 0;

  /** 拿到（必要时建）AudioContext */
  context(): AudioContext | null {
    if (this.ctx === null) {
      const Ctor =
        (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return null;
      this.ctx = new Ctor();
      this.installUnlock();
    }
    return this.ctx;
  }

  /** 浏览器不认"没有手势就出声"：挂一次性监听，第一次点/按键时 resume */
  private installUnlock(): void {
    if (this.unlocked || typeof document === 'undefined') return;
    const unlock = (): void => {
      this.unlocked = true;
      void this.ctx?.resume();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
  }

  /** C++ `bool isAvailable()` —— 基类返回 false，这里真的有后端 */
  override isAvailable(): boolean {
    return true;
  }

  /** C++ `void enable(bool status)` —— 暂停菜单进出时调（`Minecraft.cpp:1624/1629`） */
  override enable(status: boolean): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    // ADAPTED(Web)：C++ 的 SoundSystem::enable 是空的。浏览器切后台会自己挂起，
    //   这里顺着手动同步一下，暂停菜单进出时行为更符合直觉。
    if (status) void ctx.resume();
    else void ctx.suspend();
  }

  /** C++ `void setListenerAngle(float deg)` */
  override setListenerAngle(deg: number): void {
    this.listenerDeg = deg;
  }

  /**
   * C++ `void playAt(const SoundDesc& desc, float x, float y, float z, float volume, float pitch)`
   */
  override playAt(desc: SoundDesc, x: number, y: number, z: number, volume: number, pitch: number): void {
    // 1:1 照抄 SoundSystemAL.cpp:137
    if (pitch < 0.01) pitch = 1;

    this.plays.push({ name: desc.name, x, y, z, volume, pitch });

    const ctx = this.context();
    if (ctx === null) return;

    const buffer = this.bufferFor(ctx, desc);
    if (buffer === null) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = pitch;

    const gain = ctx.createGain();
    gain.gain.value = volume;

    // 第二层衰减：OpenAL 的 AL_LINEAR_DISTANCE_CLAMPED
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'linear';
    panner.refDistance = AL_REFERENCE_DISTANCE;
    panner.maxDistance = AL_MAX_DISTANCE;
    panner.rolloffFactor = AL_ROLLOFF_FACTOR;
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;

    // ⚠ 听者永远在原点（只有朝向在动）—— 见 SoundEngine.ts 头注释第 1 条
    const listener = ctx.listener;
    const rad = (this.listenerDeg * Math.PI) / 180;
    const fx = -Math.sin(rad);
    const fz = Math.cos(rad);
    if (listener.forwardX) {
      listener.forwardX.value = fx;
      listener.forwardY.value = 0;
      listener.forwardZ.value = fz;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else {
      listener.setOrientation(fx, 0, fz, 0, 1, 0);
    }

    src.connect(gain);
    gain.connect(panner);
    panner.connect(ctx.destination);
    src.start();
  }

  /** 建过就复用；`desc.frames` 是**视图对象身份**，同一个文件每次拿到的都是同一个对象 */
  private bufferFor(ctx: AudioContext, desc: SoundDesc): AudioBuffer | null {
    const cached = this.buffers.get(desc.frames);
    if (cached !== undefined) return cached;

    if (desc.numFrames <= 0 || desc.channels <= 0 || desc.frameRate <= 0) return null;
    const planes = pcm16ToFloatPerChannel(desc);
    const buffer = ctx.createBuffer(desc.channels, desc.numFrames, desc.frameRate);
    for (let c = 0; c < desc.channels; c++) buffer.copyToChannel(planes[c]!, c);

    this.buffers.set(desc.frames, buffer);
    return buffer;
  }
}
