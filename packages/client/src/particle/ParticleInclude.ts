/**
 * 1:1 对应 src/client/particle/ParticleInclude.h（粒子类的清单头）。
 *
 * C++ 里这个头文件本身没有代码，只是把 10 个粒子类一次 `#include` 进来，
 * 谁要用粒子就 `#include "ParticleInclude.h"`。TS 里没有 `#include`，
 * 但**"哪些粒子类存在"这份清单仍然需要有个地方落脚** —— 那些没搬过来的类就记在这里。
 *
 * 【这份清单里 TS 侧对不上的三个】见文件末尾的三条 `OMIT(Particle)`。
 * 注意 `SplashParticle.h` 在 C++ 的 `ParticleInclude.h` 里**本来就没有**
 * （它在这个头文件之外，且它的基类 `WaterDropParticle.h` 在参考树里根本不存在）。
 *
 * 【不在这个头文件里的那几个】`BreakingItemParticle`（`LevelRenderer` 直接 include）、
 * `TakeAnimationParticle`（同上）、`ParticleEngine`（引擎，不是粒子）——
 * 它们在 `index.ts` 里各自单独导出，不从这里走。
 */
export * from './Particle';
export * from './BubbleParticle';
export * from './CritParticle2';
export * from './ExplodeParticle';
export * from './FlameParticle';
export * from './LavaParticle';
export * from './RedDustParticle';
export * from './SmokeParticle';
export * from './TerrainParticle';

// OMIT(Particle): class HugeExplosionSeedParticle : public Particle  HugeExplosionSeedParticle.h
//   唯一的 `new` 点在 LevelRenderer.cpp:1471 **整段被注释掉**，字符串分派里也没有
//   `largeexplode` 这个 case —— 搬过来就是"永不执行的代码"。
// OMIT(Particle): class HugeExplosionParticle : public Particle  HugeExplosionParticle.h
//   同上（LevelRenderer.cpp:1472）。另外它还要 `misc/explosion.png`，而这张图在
//   `apps/web/public/images/` 和 `imageManifest.ts` 里都没有。
//   ⚠ 不补这张图也不会花屏：`ParticleEngine.render` 的主循环只跑前 3 档
//   （MISC/TERRAIN/ITEM），第 4 档走 `renderLit`，而 `renderLit` 自己不 bind 纹理。
// OMIT(Particle): class SplashParticle : public WaterDropParticle  SplashParticle.h
//   它的基类 `WaterDropParticle.h` 在参考树里**根本不存在**（`ls $REF/src/client/particle/`
//   没有这个文件），所以网页版构建编译不到它；C++ 的 `ParticleInclude.h` 里也没有这一行。
