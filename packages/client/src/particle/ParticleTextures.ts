// ADAPTED(ESM)：C++ ParticleEngine.h 的纹理档常量单独成文件，原因见下
/**
 * C++ `ParticleEngine.h:13-18` 的五个纹理档常量。
 *
 * 【为什么单独一个文件，而不是放在 ParticleEngine.ts 里】
 * C++ 里它们是 `ParticleEngine` 的静态常量，基类 `Particle::getParticleTexture()` 返回
 * `ParticleEngine::MISC_TEXTURE` 时两边在同一个头文件里，没这问题。
 * 但 TS 里 `Particle.ts` **不能** import `ParticleEngine.ts` —— 那个文件要 import 子类
 * （`destroy`/`crack` 里 `new TerrainParticle`），于是形成
 * `Particle → ParticleEngine → TerrainParticle → Particle` 的环。
 * 单测会**先**加载 `Particle`，那时环正好炸在 `class TerrainParticle extends Particle`
 * 上（PITFALLS 第 16 条 "Class extends value undefined"）。
 * 仓库里同类做法见 `Tile.ts:5`、`Item.ts:51`：基类/注册表文件不 import 子类。
 *
 * `ParticleEngine.ts` 会把这五个常量原样 re-export 一份，所以调用点照样能写
 * `ParticleEngine.MISC_TEXTURE`，和 C++ 的写法一致。
 */

/** C++ `ParticleEngine::MISC_TEXTURE` —— 贴 particles.png */
export const MISC_TEXTURE = 0;
/** C++ `ParticleEngine::TERRAIN_TEXTURE` —— 贴 terrain.png */
export const TERRAIN_TEXTURE = 1;
/** C++ `ParticleEngine::ITEM_TEXTURE` —— 贴 gui/items.png */
export const ITEM_TEXTURE = 2;
/** C++ `ParticleEngine::ENTITY_PARTICLE_TEXTURE` —— 不在这里 bind，走 `renderLit` */
export const ENTITY_PARTICLE_TEXTURE = 3;
/** C++ `ParticleEngine::TEXTURE_COUNT` */
export const TEXTURE_COUNT = 4;
