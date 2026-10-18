# world/entity：HangingEntity

对照：`src/world/entity/HangingEntity.h / .cpp` ↔ `packages/world/src/entity/HangingEntity.ts`（305 行，17 个函数）。
第 2 批的一部分。两处加法结合顺序已在 W5 改过（`setDir` 里 `x - w - ss` 一类），本轮补齐其余行。

## 结论表

| 函数                                                                  | 结论                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HangingEntity(Level*)` / `HangingEntity(Level*, int, int, int, int)` | **已修 W11**：构造里的 `init()` 改为 `HangingEntity.prototype.init.call`（C++ 非虚，构造期间不派发到子类）。五参构造丢弃 `dir`、随后被 `init()` 的 `dir = 0` 覆盖——原版怪癖照抄。ADAPTED：单参构造里 `xTile/yTile/zTile` 在 C++ 未初始化（UB），TS 取 0 |
| `setPosition(int, int, int)`                                          | 一致                                                                                                                                                                                                                                                    |
| `init()`                                                              | 一致（`heightOffset = 0`、`setSize(0.5f, 0.5f)`、`dir = 0`、`checkInterval = 0`）                                                                                                                                                                       |
| `setDir(int)`                                                         | **已修 W5 + W11**：`bb.set` 的加法结合顺序是 W5 改的；本轮给两处 `yRot = dir * 90` 补 `f()`。其余（`w/h/d /= 32.0f`、`xTile + 0.5f`、`offs`、`ss`）已是分步 float                                                                                       |
| `offs(int)`                                                           | 一致（32 与 64 两个分支返回同一个 0.5f，原样）                                                                                                                                                                                                          |
| `tick()`                                                              | 一致（`checkInterval++ == 20*5` 是后置自增；不调 `super.tick()`，所以不跑 baseTick）                                                                                                                                                                    |
| `survives()`                                                          | 一致（`getWidth()/16` 是 C++ 整数除法，TS 用 `Math.trunc`；“重叠实体”检查写在 `for (ss)` 里面、会重复 `ws` 次，原样保留）                                                                                                                               |
| `isHangingEntity()` / `isPickable()`                                  | 一致                                                                                                                                                                                                                                                    |
| `interact(Player*)`                                                   | 一致（拿弓时返回 false；服务端才 remove/markHurt/dropItem；`instabuild` 不掉落）                                                                                                                                                                        |
| `move(float, float, float)`                                           | **已修 W11**：三个 float 形参先转 float（C++ 在调用边界就舍入）                                                                                                                                                                                         |
| `push(float, float, float)`                                           | **已修 W11**：形参先转 float；另外 TS 把两个重载合成一个方法，`push(Entity*)` 现在显式委托给 `Entity.prototype.push`（C++ 里 HangingEntity 只覆盖三参重载，一参仍走 Entity 的实现；Entity 内部再虚调用到三参 push，双方都会掉落）                       |
| `addAdditonalSaveData(CompoundTag*)`                                  | 一致（`Direction` 与 `Dir` 两个键都写、值不同；byte 截断用 `<< 24 >> 24`）                                                                                                                                                                              |
| `readAdditionalSaveData(CompoundTag*)`                                | 一致（优先 `Direction`，否则 `Dir` 0..3 重映射，再读 TileX/Y/Z，最后 `setDir`）                                                                                                                                                                         |
| `getBrightness(float)`                                                | 一致（局部 `xTile/zTile` 遮蔽成员是本意：用实体当前位置，不是挂的格子）                                                                                                                                                                                 |
| `hurt(Entity*, int)`                                                  | 一致（服务端 remove/markHurt；创造模式玩家返回 true 且不掉落；忽略 damage）                                                                                                                                                                             |
| `getWidth()` / `getHeight()` / `dropItem()`                           | 一致（纯虚 → TS abstract）                                                                                                                                                                                                                              |

## W11 的测试

`tests/unit/world/hangingentity-audit.test.ts` 2 条，修复前全红：

1. `push(Entity*)`：两个挂件相距 1 格，调用后双方各 `dropItem` 一次并 `removed`。旧 TS 把它当成
   “三参都是 0”的三参重载，什么都不做。
2. 构造函数的 `init`：子类重写的 `init` 在构造期间不能被调用；构造完成后手动调用才派发。

## 验证

- `pnpm check`：类型 ✓ 28.2s、测试 **130 文件 / 1397 条** ✓、台账 **152** ✓。
- 台账 151 → 152：构造函数那行新增了一条 `ADAPTED(Cpp)` 注释（未初始化字段取 0），属预期。
- prettier ✓。
