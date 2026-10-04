/**
 * `ADAPTED(Web)`：音频后端与音源包的**安装点**。**没有 C++ 对应物**。
 *
 * 【为什么需要它】C++ 里 `SoundEngine` 的后端是**按值成员、类型编译期定死**的
 * （`SoundSystem soundSystem;`，靠 `#if` 选 `SoundSystemSL` / `SoundSystemAL` / 基类），
 * 数据是 `Sound.cpp` 里那 101 个**编译进二进制的 `SA_*` 全局**。
 * TS 两边都没有对应的东西：
 *   - 后端要运行时注入（`packages/client` 不能依赖 `apps/web`）；
 *   - 数据要运行时从 `sounds.bin` 取（6 MB，不可能编进 JS）。
 *
 * 所以留一个"启动时装一次"的口子：`apps/web/src/main.ts` 在建 app **之前**调
 * `installSoundBackend(system, bank)`；`Minecraft` 建 `SoundEngine` 时读它。
 *
 * **没装的时候**（无头测试、老的启动路径）：拿到的是基类 `SoundSystem`（8 个方法全空）
 * 和 `bank = null` —— 这恰好就是**原版网页版的行为**（一点声音都没有），所以是安全的默认值。
 */
import type { SoundBank } from './SoundBank';
import { SoundSystem } from './SoundSystem';

export type InstalledSoundBackend = {
  system: SoundSystem;
  bank: SoundBank | null;
};

let installed: InstalledSoundBackend | null = null;

/** 启动时装一次（重复调用以最后一次为准，方便测试） */
export function installSoundBackend(system: SoundSystem, bank: SoundBank | null): void {
  installed = { system, bank };
}

/** 拿当前装的后端；没装就返回 null */
export function installedSoundBackend(): InstalledSoundBackend | null {
  return installed;
}

/** 要一个后端实例：没装就给基类（= 静音，和原版网页版一致） */
export function soundSystemOrDefault(): SoundSystem {
  return installed?.system ?? new SoundSystem();
}

/** 要音源包：没装就给 null */
export function soundBankOrNull(): SoundBank | null {
  return installed?.bank ?? null;
}

/** 只给测试用：把安装状态清掉 */
export function _resetSoundBackendForTest(): void {
  installed = null;
}
