# TripodCamera（src/world/entity/item/TripodCamera.h / .cpp ↔ packages/world/src/entity/item/TripodCamera.ts）

第 2 批（world/entity/item）。工作表 8 行全部有结论。C++ `.h` 32 行 + `.cpp` 88 行（共 120 行），
TS 审核前 111 行、审核后 116 行。新增编号 **W26**。

C++ 侧要点：

- 成员：`int life`（public，初始化列表 80）、`Player* owner`（protected）、`bool activated`（protected，初始化列表 false）。
- 成员函数全部是 `virtual`（`tick` / `isPickable` / `isPushable` / `interact` / `interactPreventDefault` /
  `getShadowHeightOffs` 在 `Entity.h` 里声明为 virtual，`getEntityTypeId` 是 pure virtual），
  TS 全部 `override`，与 C++ 一致；无重载、无遮蔽（`Mob` / `Entity` 没有同名 `life` / `owner` / `activated` 字段）。
- 构造函数初始化列表写法是 `super(level) → owner → life(80) → activated(false)`；C++ 实际按成员**声明**顺序
  初始化（`life → owner → activated`），TS 也按声明顺序赋值（三者互不依赖、无可观察差异）。
- 没有未初始化成员。`setPos` / `setSize` 在 C++ 是 virtual；`Mob` 重写了 `setSize` 但只转调 `super::setSize`，
  `setPos` 无人重写 —— 构造期间派发到哪一层结果都相同，TS 的普通调用等价。

## 工作表结论

| #   | C++ 函数                                                         | C++ 位置            | TS 方法                  | TS 行 | 相似度 | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------- | ------------------- | ------------------------ | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `TripodCamera(Level*, Player* owner, float x, float y, float z)` | TripodCamera.cpp:6  | `constructor`            | 31    | 0.70   | **已修 W26**：三个 float 形参入口补 `f()`（以前 `setPos` 内部会舍入、但随后 `xo = x; yo = y; zo = z;` 直接赋未舍入的 double 实参，实参不能在 float32 精确表示时 `xo` 与 `this.x` 不一致）。同时 `xRot = xRotO = owner->xRot` / `yRot = yRotO = owner->yRot` 补 `f()`（C++ 字段是 float，实参类型 `float`，赋值即舍入）。其余一致：成员初始化顺序（按声明 `life → owner → activated`）、`entityRendererId = ER_TRIPODCAMERA_RENDERER`、`blocksBuilding = true`、`setSize(1.0f, 1.5f)`、`heightOffset = bbHeight / 2.0f - 0.25f`（左结合、每步 float）、`setPos(x, y, z)`、只对齐 `xo/yo/zo`（**不设 xOld/yOld/zOld**，与 PrimedTnt 相同） |
| 2   | `isPickable()`                                                   | TripodCamera.cpp:29 | `isPickable`             | 57    | 0.91   | 一致：`!removed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3   | `interactPreventDefault()`                                       | TripodCamera.cpp:34 | `interactPreventDefault` | 78    | 1.00   | 一致：恒 `true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4   | `interact(Player* player)`                                       | TripodCamera.cpp:39 | `interact`               | 72    | 1.00   | 一致：`activated = true; return true;`；C++ 形参未使用，TS 用 `_player`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | `tick()`                                                         | TripodCamera.cpp:45 | `tick`                   | 88    | 0.82   | 一致：不调 `super.tick()`；`xo/yo/zo` 存旧值；`yd -= 0.04f` → `move(xd, yd, zd)` → 三个 `*= 0.98f`；落地时 `xd *= 0.7f`、`zd *= 0.7f`、`yd *= -0.5f`，每步 float；`activated` 时 `--life`，`life == 0` 先 `remove()`（`else if`，同一帧不会既拍照又移除），`life == 8` 时 `takePicture(this, owner)` + 三团 `explode` 粒子（y+0.6f / 0.8f / 1.0f，每步 float），`life > 8` 时 `smoke` 粒子（y+1.0f）。**等于判断照抄**，没有改成 `<=`                                                                                                                                                                                                    |
| 6   | `getShadowHeightOffs()`                                          | TripodCamera.cpp:79 | `getShadowHeightOffs`    | 83    | 1.00   | 一致：返回 0（不取基类的 `bbHeight / 2`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 7   | `isPushable()`                                                   | TripodCamera.cpp:84 | `isPushable`             | 62    | 1.00   | 一致：恒 `false`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 8   | `getEntityTypeId() const`                                        | TripodCamera.h:18   | `getEntityTypeId`        | 67    | 1.00   | 一致：头文件内联 `return 0`，TS 写死 0（**怪癖保留**：`EntityTypes` 里确实没有 TripodCamera 这个 id，文件头已注明）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

工作表的“C++ 有、TS 没有”“TS 有、C++ 没有”两张清单均为空。

补充核对：

- `PARTICLETYPE(explode)` / `PARTICLETYPE(smoke)` 宏是逗号表达式，C++ 实际传给 `addParticle` 的是字符串
  `"explode"` / `"smoke"`；TS 传的是 `ParticleType.explode` / `.smoke` 数字，由 `LevelRenderer.addParticle`
  单点归一化成名字（该处已标 `ADAPTED(Cpp)`，同 PrimedTnt / Snowball 等既有写法），本文件不另改。
- `remove()` 是 `Entity` 的 virtual；`TripodCamera` / `Mob` 都没重写，TS 的 `this.remove()` 等价。
- 无随机数、无容器、无字符串、无日志、无 DEFERRED / OMIT 标记；文件头注释的“120 行”“EntityTypes 里没有这个 id”
  均与 C++ 核对属实。

**W26 验证**：新增 `tests/unit/world/tripodcamera-audit.test.ts`（2 条）：

1. 用 `0.1 / 0.2 / 0.3` 构造，断言 `xo/yo/zo` 取 `f(实参)` 且与 `setPos` 后的 `this.x/y/z` 相同，同时
   `xOld/yOld/zOld` 仍为 0；
2. `owner.xRot/yRot` 给 `0.1/0.2`，断言 `xRot/xRotO`、`yRot/yRotO` 都是舍入后的 float。

分别撤掉“形参舍入”和“朝向舍入”时对应测试变红，恢复后全绿。既有 `tripodcamera.test.ts`（13 条）不受影响。
`npx tsc -p packages/world --noEmit` 0 错误；`npx prettier --check` 通过。`pnpm ledger` 本文件贡献 0 条
（文件里没有任何 DEFERRED / OMIT / ADAPTED 标记）；工作区总数 168 → 170 的两条新增全部来自**另一项未提交任务**
的 `Chicken.ts`（`DEFERRED(待确认)`、`ADAPTED(Cpp)`），与本文件无关。
