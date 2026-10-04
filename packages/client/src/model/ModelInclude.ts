/**
 * 1:1 对应 src/client/model/ModelInclude.h（17 行，**9 条 `#include`**）。
 *
 * ⚠️ 任务单 G 里曾把这份文件写成"在 C++ 里是空的（只有文件头）"—— **那是错的**。
 *   当初是用 `tool/porting/clean.py` 看的，而 `clean.py` 会把 `#include` 这类预处理行
 *   整行删掉，于是输出里只剩下 `##### ModelInclude.h` 一行标题，看着像空文件。
 *   原始文件 `wc -c` = 407 字节，`grep -c include` = 9。
 *
 * 【它是什么】C++ 里这个头文件本身没有代码，只是把 9 个模型类一次 `#include` 进来，
 * 谁要用模型就 `#include "ModelInclude.h"`。TS 里没有 `#include`，但**"哪些模型类存在"
 * 这份清单仍然需要有个地方落脚** —— 没搬过来的那些就记在这里。
 *
 * 【这份清单里 TS 侧目前的对应关系】9 条里：
 *   - 2 条已落地（`HumanoidModel` G7、`ChickenModel` G9 —— 本文件里各有一条再导出）；
 *   - 6 条**不搬**（4 只四足兽 + 僵尸 + 骷髅）：它们要的实体类在 TS 里根本不存在，
 *     见文件末尾的 6 条 `OMIT(Entity)`；
 *   - 1 条**挡住**（`SignModel`）：它唯一的用户是方块实体渲染器，见文件末尾的 `DEFERRED`。
 *
 * 【不在这个头文件里的那几个】`QuadrupedModel`（上面 4 只四足兽的父类）、
 * `ChestModel`（`ChestRenderer` 直接 include）、`SpiderModel` / `CreeperModel`
 * （各自的渲染器直接 include）—— C++ 的 `ModelInclude.h` 里本来就没有它们，
 * 所以这里也不列；它们跟着自己的渲染器一起走。
 */

// 已落地（G7）：玩家、僵尸、骷髅共用的人形模型（64×32 与 64×64 两套皮肤）。
// C++ 的 `#include "HumanoidModel.h"`（ModelInclude.h:4）在 TS 里就是一条再导出。
export * from './HumanoidModel.js';

// 已落地（G9）：鸡 —— 本任务单里**第一个画面上看得见的生物**。
// ⚠ 它的父类是 **`Model` 而不是 `QuadrupedModel`**（ChickenModel.h:9，实测过），
//   所以不依赖下面那 4 只四足兽，也就能先于它们落地。
// C++ 的 `#include "ChickenModel.h"`（ModelInclude.h:6）在 TS 里就是这条再导出。
export * from './ChickenModel.js';
// OMIT(Entity): #include "CowModel.h"  ModelInclude.h:7
//   牛。TS 里没有 `Cow` 实体类（`packages/world/src/entity/` 全 30 个文件实测只有
//   `Chicken` 一个生物），`MobFactory::CreateMob` 整条 OMIT —— 模型搬过来没人能渲染。
//   等 `MobFactory` / `Sheep` 那条链解开时一起补。
// OMIT(Entity): #include "PigModel.h"  ModelInclude.h:8
//   猪，理由同牛。
// OMIT(Entity): #include "SheepModel.h"  ModelInclude.h:9
//   羊，理由同牛。
// OMIT(Entity): #include "SheepFurModel.h"  ModelInclude.h:10
//   羊身上那层毛（`SheepRenderer` 画第二遍用的），理由同牛。
// OMIT(Entity): #include "ZombieModel.h"  ModelInclude.h:12
//   僵尸。它父类是 `HumanoidModel`（ZombieModel.h:8），但实体类不存在，理由同牛。
// OMIT(Entity): #include "SkeletonModel.h"  ModelInclude.h:13
//   骷髅。它父类是 `ZombieModel`（SkeletonModel.h:9），实体类不存在，理由同牛。
// DEFERRED(TileEntityRender): #include "SignModel.h"  ModelInclude.h:15
//   告示牌。它唯一的用户是 `renderer/tileentity/SignRenderer`（`SignRenderer.h:18`
//   有个 `SignModel signModel` 成员），而方块实体渲染器在 TS 里还没搬 ——
//   `LevelRenderer.ts:913` 那条 `DEFERRED(TileEntityRender)` 就是它的调用点。
//   等方块实体渲染器落地时一起搬。

// 9 条 include 里已落地 2 条（`HumanoidModel` G7、`ChickenModel` G9），还剩
// 6 条 `OMIT(Entity)`、1 条 `DEFERRED(TileEntityRender)`。空 `export {}` 留着是为了让
// 这个文件**成为一个模块** —— 否则 `tsc` 会说 "is not a module"，`index.ts` 那边
// `export * from './model/ModelInclude.js'` 就编不过。
export {};
