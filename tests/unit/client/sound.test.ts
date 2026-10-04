import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundDesc, SoundRepository } from '@mcpe/client';

// F1：`SoundDesc` + `SoundRepository`（两个都是纯头文件，加起来约 70 行）。
//
// 【这个文件钉什么】
//   1. 两个构造函数**语义完全不同**：五参数版数据不带头（`frames` 就是数据本身），
//      单参数版数据带头（`frames` 是 `buffer + 16`）；
//   2. `numFrames = size / (channels * byteWidth)` 是 **C++ 整数除法**（要 `Math.trunc`）；
//   3. `frames` 是**共享内存的视图**，不是拷贝（打包文件里每个 desc 都是 subarray）；
//   4. ⚠ 单参数版的视图 **byteOffset 可能不是 0** —— 打包文件里每个 desc 都是切出来的，
//      从 0 开始读头会读到上一个音频的尾巴；
//   5. `SoundRepository` 用 `Mth::random` 随机挑变体、`add` 回写 `name`、无效 desc 不入库。

const f = Math.fround;

/** 造一段"16 字节小端头 + 帧数据"的缓冲（就是 `.pcm` 解码出来的样子） */
function makePacked(channels: number, byteWidth: number, frameRate: number, numFrames: number) {
  const size = channels * byteWidth * numFrames;
  const bytes = new Uint8Array(16 + size);
  const dv = new DataView(bytes.buffer);
  dv.setInt32(0, channels, true);
  dv.setInt32(4, byteWidth, true);
  dv.setInt32(8, frameRate, true);
  dv.setInt32(12, numFrames, true);
  for (let i = 0; i < size; i++) bytes[16 + i] = i & 0xff;
  return bytes;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SoundDesc 的两条构造路径（F1）', () => {
  it('默认构造出来的 desc 是**无效**的（C++ 只把 buffer 置 0，其余是未初始化内存）', () => {
    const d = new SoundDesc();
    expect(d.isValid()).toBe(false);
    expect(d.frames.length).toBe(0);
    expect([d.size, d.channels, d.byteWidth, d.frameRate, d.numFrames]).toEqual([0, 0, 0, 0, 0]);
    expect(d.name).toBe('');
  });

  it('五参数版：`frames` 就是传进来的那份数据本身（不带头）', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const d = new SoundDesc(data, 8, 1, 2, 44100);
    expect(d.isValid()).toBe(true);
    expect(d.frames, 'C++ 是 `frames(data)`，同一个指针').toBe(data);
    expect(d.size).toBe(8);
    expect(d.channels).toBe(1);
    expect(d.byteWidth).toBe(2);
    expect(d.frameRate).toBe(44100);
  });

  it('⚠ 五参数版的 numFrames 是**整数除法**（size=17, ch=2, bw=2 → 4 而不是 4.25）', () => {
    const d = new SoundDesc(new Uint8Array(17), 17, 2, 2, 44100);
    expect(d.numFrames, '写成 `/` 会得到 4.25').toBe(4);
  });

  it('单参数版：从头 16 字节解析（小端 int32 × 4），frames 是 buffer+16', () => {
    const packed = makePacked(1, 2, 44100, 3); // 16 + 6 = 22 字节
    const d = new SoundDesc(packed);
    expect(d.channels).toBe(1);
    expect(d.byteWidth).toBe(2);
    expect(d.frameRate).toBe(44100);
    expect(d.numFrames).toBe(3);
    expect(d.size, 'size = channels*byteWidth*numFrames，不是 data.length').toBe(6);
    expect(d.frames.length).toBe(6);
    expect([...d.frames]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('⚠ 单参数版：byteOffset 不为 0 的视图也要解析对（打包文件里的真实情形）', () => {
    const packed = makePacked(2, 2, 22050, 5);
    const outer = new Uint8Array(packed.length + 8);
    outer.set(packed, 8);
    const view = outer.subarray(8, 8 + packed.length);
    expect(view.byteOffset, '前提：这个视图不是从 0 开始的').toBe(8);

    const d = new SoundDesc(view);
    expect(d.channels, '从 0 开始读会读到前面的垃圾字节').toBe(2);
    expect(d.byteWidth).toBe(2);
    expect(d.frameRate).toBe(22050);
    expect(d.numFrames).toBe(5);
    expect(d.size).toBe(20);
  });

  it('⚠ frames 是**共享内存的视图**，不是拷贝（改原数组能看到）', () => {
    const packed = makePacked(1, 1, 8000, 4);
    const d = new SoundDesc(packed);
    packed[16] = 99;
    expect(d.frames[0], 'C++ 是指针，TS 用 subarray 才等价').toBe(99);
    d.frames[1] = 77;
    expect(packed[17]).toBe(77);
  });

  it('length() = numFrames / frameRate（float 除法）', () => {
    const d = new SoundDesc(makePacked(1, 2, 44100, 22050));
    expect(d.length(), '0.5 秒').toBe(f(f(22050) / 44100));
    expect(d.length()).toBe(0.5);
  });

  it('destroy() 之后 isValid 变 false；再调一次不炸', () => {
    const d = new SoundDesc(makePacked(1, 2, 44100, 1));
    expect(d.isValid()).toBe(true);
    d.destroy();
    expect(d.isValid()).toBe(false);
    expect(d._bufferForTest()).toBeNull();
    expect(() => d.destroy()).not.toThrow();
  });
});

describe('SoundRepository（F1）', () => {
  const ok = () => new SoundDesc(makePacked(1, 2, 44100, 2));

  it('找不到的名字返回 null（C++ 是写日志 + 返回 false）', () => {
    const r = new SoundRepository();
    expect(r.get('step.stone')).toBeNull();
  });

  it('add 会把 sound.name 回写成注册名（C++ 非 const 重载那一句）', () => {
    const r = new SoundRepository();
    const s = ok();
    expect(s.name, '前提：一开始是空的').toBe('');
    r.add('step.stone', s);
    expect(s.name).toBe('step.stone');
  });

  it('无效的 desc 不入库（C++ 开头就 `if (!sound.isValid()) return;`）', () => {
    const r = new SoundRepository();
    const bad = new SoundDesc(); // 默认构造 → 无效
    r.add('step.stone', bad);
    expect(r.get('step.stone')).toBeNull();
    expect(r._variantsForTest('step.stone')).toBe(0);
    expect(bad.name, '早退了就不该回写 name').toBe('');
  });

  it('同一个名字挂多个变体，注册顺序保留', () => {
    const r = new SoundRepository();
    const a = ok();
    const b = ok();
    r.add('step.stone', a);
    r.add('step.stone', b);
    expect(r._variantsForTest('step.stone')).toBe(2);
    // ⚠ 这里必须把随机固定住 —— 不固定的话 `get` 挑到哪个变体是随机的（第一版就断言错了）
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    expect(r.get('step.stone')).toBe(a);
  });

  it('⚠ 用 `Mth::random(n)` 随机挑变体（不是 sharedRandom）', () => {
    const r = new SoundRepository();
    const a = ok();
    const b = ok();
    const c = ok();
    r.add('step.stone', a);
    r.add('step.stone', b);
    r.add('step.stone', c);
    // Mth.random(n) = (Math.random() * n) | 0
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    expect(r.get('step.stone')).toBe(a);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(r.get('step.stone')).toBe(b);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(r.get('step.stone')).toBe(c);
  });

  it('两个名字互不干扰', () => {
    const r = new SoundRepository();
    const a = ok();
    const b = ok();
    r.add('step.stone', a);
    r.add('random.click', b);
    expect(r.get('step.stone')).toBe(a);
    expect(r.get('random.click')).toBe(b);
  });
});
