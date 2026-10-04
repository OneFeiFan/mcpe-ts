import { describe, expect, it } from 'vitest';
import { SoundDesc } from '@mcpe/client';
import {
  AL_MAX_DISTANCE,
  AL_REFERENCE_DISTANCE,
  AL_ROLLOFF_FACTOR,
  pcm16ToFloatPerChannel,
} from '../../../apps/web/src/WebAudioSoundSystem';

// F4：Web Audio 后端的**纯函数**部分。
//
// 后端本身（`playAt` / `AudioContext`）只能在浏览器里跑，判据是 F7 场景；
// 但"交错 PCM16 → 分声道 Float32"这一段是纯计算，而且**最容易错又最难看出来**：
// 交错顺序错了声音会变成噪声、byteWidth 算错了会全变调。单独钉住。

/** 造一段"16 字节头 + 交错 PCM16" */
function packed(channels: number, byteWidth: number, numFrames: number, samples: number[][]) {
  const size = channels * byteWidth * numFrames;
  const bytes = new Uint8Array(16 + size);
  const dv = new DataView(bytes.buffer);
  dv.setInt32(0, channels, true);
  dv.setInt32(4, byteWidth, true);
  dv.setInt32(8, 44100, true);
  dv.setInt32(12, numFrames, true);
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < channels; c++) {
      dv.setInt16(16 + (i * channels + c) * byteWidth, samples[c]![i]!, true);
    }
  }
  return new SoundDesc(bytes);
}

describe('pcm16ToFloatPerChannel（F4）', () => {
  it('单声道：直接按 /32768 归一化', () => {
    const d = packed(1, 2, 3, [[0, 16384, -32768]]);
    const planes = pcm16ToFloatPerChannel(d);
    expect(planes.length).toBe(1);
    expect([...planes[0]!]).toEqual([0, 0.5, -1]);
  });

  it('⚠ 立体声：交错的 (L,R,L,R) 要拆成两条声道，不是混在一起', () => {
    // click.pcm 就是立体声（103 个文件里唯一一个）
    const d = packed(2, 2, 3, [
      [100, 200, 300], // 左
      [-100, -200, -300], // 右
    ]);
    const planes = pcm16ToFloatPerChannel(d);
    expect(planes.length).toBe(2);
    expect(planes[0]!.length).toBe(3);
    expect(planes[1]!.length).toBe(3);
    expect(planes[0]![0]).toBeCloseTo(100 / 32768, 10);
    expect(planes[0]![2]).toBeCloseTo(300 / 32768, 10);
    expect(planes[1]![0]).toBeCloseTo(-100 / 32768, 10);
    expect(planes[1]![2]).toBeCloseTo(-300 / 32768, 10);
  });

  it('结果落在 [-1, 1)（32768 做分母，不是 32767）', () => {
    const d = packed(1, 2, 2, [[32767, -32768]]);
    const planes = pcm16ToFloatPerChannel(d);
    expect(planes[0]![0]).toBeLessThan(1);
    expect(planes[0]![0]).toBeCloseTo(32767 / 32768, 10);
    expect(planes[0]![1]).toBe(-1);
  });

  it('⚠ byteWidth 用在跨步上：一个样本占 2 字节，不能按 1 字节数', () => {
    const d = packed(1, 2, 2, [[1, 2]]);
    // 如果实现里漏乘 byteWidth，第二个样本会读到 0
    const planes = pcm16ToFloatPerChannel(d);
    expect(planes[0]![0]).not.toBe(planes[0]![1]);
    expect(planes[0]![1]).toBeCloseTo(2 / 32768, 10);
  });
});

describe('OpenAL 那三个常数（F4）', () => {
  it('照抄 SoundSystemAL.cpp:71-73，不是拍脑袋定的', () => {
    expect(AL_REFERENCE_DISTANCE).toBe(5.0);
    expect(AL_MAX_DISTANCE).toBe(16.0);
    expect(AL_ROLLOFF_FACTOR).toBe(6.0);
  });
});
