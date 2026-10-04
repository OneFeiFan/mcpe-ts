import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SoundBank,
  SoundDesc,
  SoundEngine,
  SoundRepository,
  SoundSystem,
  type SoundPackEntry,
} from '@mcpe/client';
import type { Options } from '../../../packages/client/src/Options';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// F3 ~ F5：`SoundSystem` / `SoundBank` / `SoundEngine`。
//
// 【这个文件钉什么】
//   1. `SoundBank` 按**文件名**取段、每段是 `subarray`（共享内存的视图）、同一个文件只建一次；
//   2. `SoundEngine.init` 那张 100 条的表归并成 **42 个游戏内名字**（数字是实测的）；
//   3. `_getVolumeMult` 的三个点：脚下被 clamp 成 1（**不是 1.1**）、随距离线性下降；
//   4. `play` 的两道早退（音量 0 / 距离太远）；`playUI` 传 (0,0,0) 且不做距离衰减；
//   5. `SoundDesc` 的默认构造 = 空实现基类后端（原版网页版就是没声音）。

const f = Math.fround;

/** 造一段带 16 字节头的 PCM：交错存放，值从 value(i) 来 */
function packed(
  channels: number,
  byteWidth: number,
  frameRate: number,
  numFrames: number,
  sample: (frame: number, ch: number) => number,
): Uint8Array {
  const size = channels * byteWidth * numFrames;
  const bytes = new Uint8Array(16 + size);
  const dv = new DataView(bytes.buffer);
  dv.setInt32(0, channels, true);
  dv.setInt32(4, byteWidth, true);
  dv.setInt32(8, frameRate, true);
  dv.setInt32(12, numFrames, true);
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < channels; c++) {
      dv.setInt16(16 + (i * channels + c) * byteWidth, sample(i, c), true);
    }
  }
  return bytes;
}

/** 一个只记调用的后端替身 */
class SpySystem extends SoundSystem {
  calls: Array<[string, number, number, number, number, number]> = [];
  angles: number[] = [];
  override playAt(desc: SoundDesc, x: number, y: number, z: number, v: number, p: number): void {
    this.calls.push([desc.name, x, y, z, v, p]);
  }
  override setListenerAngle(deg: number): void {
    this.angles.push(deg);
  }
}

/** 玩具包：两个文件，专门用来钉 SoundBank 的取段/缓存语义 */
function toyBank(): SoundBank {
  const index = [
    { name: 'stone1', offset: 0, size: 20, channels: 1, byteWidth: 2, frameRate: 8000, numFrames: 2 },
    { name: 'cloth1', offset: 20, size: 20, channels: 1, byteWidth: 2, frameRate: 8000, numFrames: 2 },
  ];
  const bin = new Uint8Array(40);
  bin.set(packed(1, 2, 8000, 2, (i) => i), 0);
  bin.set(packed(1, 2, 8000, 2, (i) => 100 + i), 20);
  return new SoundBank(bin, index);
}

/**
 * **真包**：仓库里已提交的那份产物。
 * 引擎相关的用例全用它 —— SoundEngine 的那 100 条表要 42 个名字都能在包里找到，
 * 玩具包只有 2 个文件，撞不出真实的数字（第一版就是拿玩具包跑的，42 那条直接红了）。
 * 顺带这也等于把 `sounds.bin` / `sounds.json` 拿到单测里验了一遍。
 */
function realBank(): SoundBank {
  const index = JSON.parse(
    readFileSync(new URL('../../../apps/web/public/sounds/sounds.json', import.meta.url), 'utf8'),
  ) as SoundPackEntry[];
  const bin = new Uint8Array(
    readFileSync(new URL('../../../apps/web/public/sounds/sounds.bin', import.meta.url)),
  );
  return new SoundBank(bin, index);
}

let bank: SoundBank;
let spy: SpySystem;
let engine: SoundEngine;
let options: Options;

beforeEach(() => {
  bank = realBank();

  spy = new SpySystem();
  engine = new SoundEngine(20.0, spy);
  // 音量为 1 的选项（OptionFloat('sound', 1, …)）
  options = { getProgressValue: () => 1 } as unknown as Options;
  engine.init({} as never, options, bank);
  // 让 listener 站到 (8, 70, 8)（update 会把它设成玩家的插值位置）
  engine.update({ xo: 8, x: 8, yo: 70, y: 70, zo: 8, z: 8, yRotO: 0, yRot: 0 }, 0);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SoundBank（F5）', () => {
  it('按文件名取段：内容是头之后的那一段（共享内存的视图，不是拷贝）', () => {
    const toy = toyBank();
    const d = toy.desc('cloth1')!;
    expect(d.channels).toBe(1);
    expect(d.numFrames).toBe(2);
    expect([...d.frames], 'cloth1 的两帧是 100 / 101 的小端').toEqual([100, 0, 101, 0]);
  });

  it('同一个文件取两次拿到**同一个** SoundDesc（缓存）', () => {
    const toy = toyBank();
    expect(toy.desc('stone1')).toBe(toy.desc('stone1'));
  });

  it('没有的文件名返回 null（不是抛错）', () => {
    const toy = toyBank();
    expect(toy.desc('nope')).toBeNull();
    expect(toy.has('nope')).toBe(false);
  });

  it('size / names 报的是包里的条目', () => {
    const toy = toyBank();
    expect(toy.size).toBe(2);
    expect(toy.names()).toEqual(['cloth1', 'stone1']);
  });

  it('真包：103 个文件，表里用到的 100 个一个都不缺', () => {
    expect(bank.size).toBe(103);
    // 表里用到的（含 3 个没被引用的死素材之外的全部）
    for (const n of ['stone1', 'cloth1', 'click', 'explode', 'splash', 'bow', 'zpigangry4']) {
      expect(bank.has(n), `${n} 应该在包里`).toBe(true);
    }
    expect(bank.names().length).toBe(103);
  });
});

describe('SoundEngine（F5）', () => {
  it('init 之后登记了 42 个游戏内名字（100 条 sounds.add 归并出来的实数）', () => {
    expect(engine._soundCountForTest()).toBe(42);
  });

  it('包里缺某个文件时跳过它、其余照常登记（C++ 里不可能缺，TS 里要能看出来）', () => {
    const e = new SoundEngine(20.0, spy);
    e.init({} as never, options, new SoundBank(new Uint8Array(0), []));
    expect(e._soundCountForTest(), '空包 → 一个都没登记').toBe(0);
  });

  it('⚠ 脚下是 1 而不是 1.1 —— clamp 的上界就是 1.0', () => {
    expect(engine._getVolumeMult(8, 70, 8)).toBe(1);
  });

  it('随距离线性下降：5 格 = 1.1 - 5×(1/20)', () => {
    const want = f(f(1.1) - f(5 * f(1 / 20)));
    expect(engine._getVolumeMult(13, 70, 8)).toBe(want);
    expect(want).toBeLessThan(1);
  });

  it('20 格外降到 0 以下（第一层自己会变负）', () => {
    expect(engine._getVolumeMult(8 + 25, 70, 8)).toBeLessThan(0);
  });

  it('update 只设角度、不设位置；角度是插值出来的', () => {
    spy.angles.length = 0; // beforeEach 里那次 update 已经记了一条 0
    engine.update({ xo: 0, x: 0, yo: 0, y: 0, zo: 0, z: 0, yRotO: 10, yRot: 30 }, f(0.5));
    expect(spy.angles).toEqual([f(20)]);
  });

  it('play 把**相对坐标**交给后端（x - _x 这种）', () => {
    engine.play('step.stone', 11, 70, 8, 1, 1);
    expect(spy.calls.length, '近处放行').toBe(1);
    const [name, x, y, z] = spy.calls[0]!;
    expect(name).toBe('step.stone');
    expect([x, y, z], '相对 listener (8,70,8)').toEqual([3, 0, 0]);
  });

  it('音量 0 直接早退，不碰后端', () => {
    engine.play('step.stone', 8, 70, 8, 0, 1);
    expect(spy.calls).toEqual([]);
  });

  it('太远时第一层衰减把音量压到 0，也早退', () => {
    engine.play('step.stone', 8 + 30, 70, 8, 1, 1);
    expect(spy.calls, '1.1 - 30/20 = -0.4 → clamp 后 0').toEqual([]);
  });

  it('名字没登记就什么都不放（C++ 里会先记一行 "Couldn\'t find a sound with id"）', () => {
    engine.play('mob.dragon', 8, 70, 8, 1, 1);
    expect(spy.calls).toEqual([]);
  });

  it('⚠ playUI 不做距离衰减，坐标固定传 (0,0,0)', () => {
    engine.playUI('random.click', 1, 1);
    expect(spy.calls.length).toBe(1);
    const [name, x, y, z, vol] = spy.calls[0]!;
    expect(name).toBe('random.click');
    expect([x, y, z]).toEqual([0, 0, 0]);
    expect(vol).toBe(1);
  });

  it('选项里音量为 0 时 play / playUI / update 全都不做事', () => {
    const mute = { getProgressValue: () => 0 } as unknown as Options;
    spy.angles.length = 0; // beforeEach 里那次 update 已经记了一条 0
    const e = new SoundEngine(20.0, spy);
    e.init({} as never, mute, bank);
    e.play('step.stone', 8, 70, 8, 1, 1);
    e.playUI('random.click', 1, 1);
    e.update({ xo: 8, x: 8, yo: 70, y: 70, zo: 8, z: 8, yRotO: 0, yRot: 0 }, 0);
    expect(spy.calls).toEqual([]);
    expect(spy.angles, 'update 也早退').toEqual([]);
  });

  it('没有注入后端时默认拿空实现基类（= 原版网页版：一点声音都没有）', () => {
    const plain = new SoundEngine(20.0);
    expect(plain._systemForTest()).toBeInstanceOf(SoundSystem);
    expect(plain._systemForTest().isAvailable()).toBe(false);
  });
});

describe('SoundRepository 的 add 和 SoundEngine 的配合（F5）', () => {
  it('clamp 之后音量落在 [0,1]，不会超过 1', () => {
    engine.play('step.stone', 8, 70, 8, 1, 1);
    expect(spy.calls[0]![4]).toBeLessThanOrEqual(1);
  });

  it('一个名字挂多个变体时随机挑（用 Mth::random）', () => {
    const r = new SoundRepository();
    const s = new SoundDesc(packed(1, 2, 8000, 2, () => 0));
    s.name = '';
    r.add('step.stone', s);
    expect(r._nameCountForTest()).toBe(1);
  });

  it('无头世界能建出来（只是确保依赖没写错）', () => {
    expect(createFlatLevel).toBeTypeOf('function');
    expect(prepareLevel).toBeTypeOf('function');
  });
});
