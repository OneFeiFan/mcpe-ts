/**
 * 1:1 移植自 src/platform/audio/SoundSystem.h（29 行）。
 *
 * 音频后端的抽象。**注意它是"有默认实现的基类"，不是纯接口** ——
 * C++ 里每个虚函数都有空函数体，而且 `SoundEngine` 是**按值**持有它的
 * （`SoundSystem soundSystem;`），所以它必须能实例化。
 *
 * 【为什么这个文件在 `packages/client` 而不是 `packages/platform`】`ADAPTED(Layout)`
 *   C++ 的 `platform/audio/` 靠 `class SoundDesc;` 前向声明躲开了对 client 的依赖，
 *   TS 没有前向声明，而 `platform` 是**被 `client` 依赖的下层** ——
 *   放 platform 就成环了。所以挪到 client，目录结构也跟着 C++ 的 `client/sound/`。
 *
 * 【网页版构建里的真相】`SoundEngine.h` 的三分支在网页版落到 `#else`
 * （`#include SoundSystem.h` + `SoundSystem soundSystem;`），也就是**这个基类本身** ——
 * 8 个方法全是空的，所以原版网页版**一点声音都没有**。
 * 我们额外做了个 Web Audio 后端（`apps/web/src/WebAudioSoundSystem.ts`）来补上这件事，
 * 这是本任务单少数几处"新增能力"之一。
 */
import type { SoundDesc } from './SoundDesc';

export class SoundSystem {
  /** C++ `virtual bool isAvailable() { return false; }` */
  isAvailable(): boolean {
    return false;
  }

  /** C++ `virtual void enable(bool status) {}` */
  enable(_status: boolean): void {}

  /** C++ `virtual void setListenerPos(float x, float y, float z) {}` */
  setListenerPos(_x: number, _y: number, _z: number): void {}

  /** C++ `virtual void setListenerAngle(float deg) {}` */
  setListenerAngle(_deg: number): void {}

  /** C++ `virtual void load(const std::string& name) {}` */
  load(_name: string): void {}

  /** C++ `virtual void play(const std::string& name) {}` */
  play(_name: string): void {}

  /** C++ `virtual void pause(const std::string& name) {}` */
  pause(_name: string): void {}

  /** C++ `virtual void stop(const std::string& name) {}` */
  stop(_name: string): void {}

  /** C++ `virtual void playAt(const SoundDesc& desc, float x, float y, float z, float volume, float pitch) {}` */
  playAt(
    _desc: SoundDesc,
    _x: number,
    _y: number,
    _z: number,
    _volume: number,
    _pitch: number,
  ): void {}
}
