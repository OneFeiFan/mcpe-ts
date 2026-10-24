# PathFinder（`src/world/level/pathfinder/PathFinder.h` ↔ `packages/world/src/level/pathfinder/PathFinder.ts`）

审核编号：**W94**。参考 C++ 的整个实现都写在头文件 `PathFinder.h` 里，**没有 PathFinder.cpp**
（`clean.py` 读 `.cpp` 会报 FileNotFound，这是正常的）。TS 文件审核后 318 行。

## C++ 侧要点

- `FreeCache`（PathFinder.h:5-32）是文件内的另一个类：`cache`、`setCenterPos`、`getValue`、`setValue`、
  `clear`、`_index`。全库 grep 只有定义、没有任何实例化，是死代码。
- 两个构造函数：`PathFinder()` 把 `level` 置 NULL；`PathFinder(LevelSource*)` 调 `setLevelSource`。
  两者都把 `canOpenDoors`、`avoidWater` 置 false。
- `findPath` 四个重载：两个 public（传 Entity* / 传 int 坐标），两个 private（传 float 点 / 传 Node*）。
  R10 分别命名为 `findPathToEntity`、`findPathToTile`、`findPathToPoint`、`findPathBetween`。
- 文件级静态量：`static int __created;`（零初始化）、`static int __maxCreated = 0;`；`findPathBetween`
  开头把 `__created` 清零，`logMax` 在破纪录时打日志。
- 计时用 `static Stopwatch w; w.start()/w.stop()`（h:60、h:102），不参与结果。
- 字段：`LevelSource* level`、`BinaryHeap openSet`、`std::map<int, TNode> nodes`、
  `Node _nodes[MAX_NODES]`、`std::vector<Node*> _pending`、`int _nodeIndex`（**未初始化**，但每次
  `findPath` 开头必置 0）、`Node* neighbors[32]`；public 的 `canOpenDoors`、`avoidWater`。
- 原版怪癖（全部照原样保留）：
  - `isFree` 里的 `walkable` 只赋值、从不参与返回，`TYPE_WALKABLE` 永远不会出现；
  - 门分支里 `int data = level->getData(...)` 取了却不用，开关判断用的是 `entity->level`；
  - 起点在水里时 `avoidWater` 被置 false，`resetAvoidWater` 记下旧值却从不恢复；
  - 节点表按 `Node::createHash` 查（`std::map<int, TNode>`），哈希相同的不同坐标被当成同一个节点；
  - 找目标时 `break` 只跳出内层循环；
  - `new_Node` 在 `_nodeIndex < MAX_NODES` 时复用池里的节点，超过才 `new`。
- `isFree` 的水分支**不 continue**，会继续走材质判断；门打开时 `continue` 跳过材质判断；栅栏直接返回。

## 工作表结论（19 行 + 缺失项）

| #   | C++ 函数 / 位置                            | TS 方法 / 行        | 结论                                                                 |
| --- | ------------------------------------------ | ------------------- | -------------------------------------------------------------------- |
| 1   | `cache(w * w * h)`（h:24）                 | 无                  | OMIT：属于 `FreeCache`，全库无实例化（死代码）                       |
| 2   | `setCenterPos`（h:26）                     | 无                  | 同上                                                                 |
| 3   | `getValue`（h:31）                         | 无                  | 同上                                                                 |
| 4   | `setValue`（h:34）                         | 无                  | 同上                                                                 |
| 5   | `clear`（h:37）                            | 无                  | 同上（注意：与 `BinaryHeap::clear` 无关）                            |
| 6   | `_index`（h:32）                           | 无                  | 同上                                                                 |
| 7   | `avoidWater(false)`（h:58，构造函数 1）    | 字段初始化          | 一致：`avoidWater = false`                                           |
| 8   | `avoidWater(false)`（h:58，构造函数 2）    | 字段初始化          | 一致：同上                                                           |
| 9   | `setLevelSource`（h:65）                   | `setLevelSource` 50 | 一致                                                                 |
| 10  | `findPath(Path*, Entity*, Entity*, float)` | `findPathToEntity` 57 | 一致（R10）；`maxDist` 入口舍入见 W94-1                            |
| 11  | `findPath(Path*, Entity*, int x,y,z, float)` | `findPathToTile` 61 | 一致（R10）；int→float 的转换顺序见 W94-1                          |
| 12  | `findPath(Path&, Entity*, float xt,yt,zt, float)` | `findPathToPoint` 73 | **已修 W94-1**：四个 float 形参入口先舍入                    |
| 13  | `findPath(Path&, Entity*, Node*, Node*, size, float)` | `findPathBetween` 96 | 一致：A* 主循环、`closest`、`openSet.changeCost`、`logMax`    |
| 14  | `getNeighbors`（h:184）                    | `getNeighbors` 162  | 一致：n/w/e/s 顺序、`!closed`、`distanceTo < maxDist` 严格小于      |
| 15  | `getNode(Entity*, x,y,z, size, jumpSize)`  | `getNodeFor` 183    | 一致：jumpSize、drop≥4、水/岩浆提前返回                              |
| 16  | `getNode(int x,y,z)`（h:105）              | `getNode` 219       | 一致：按 createHash 查 Map；碰撞共用节点                             |
| 17  | `isFree`（h:240）                          | `isFree` 231        | 一致：walkable 只算不返回；水分支落到材质判断                        |
| 18  | `reconstruct_path`（h:174）                | `reconstruct_path` 267 | 一致：从 to 往回数、倒序填数组、`path.copyNodes`                 |
| 19  | `new_Node`（h:288）                        | `new_Node` 285      | 一致：C++ 池复用与 JS 每次新建结果相同（相似度低是因为省略了池）    |

工作表没有列出的成员（已人工补核）：

| C++ 成员                              | TS 对应                          | 结论                                                                 |
| ------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `PathFinder()` / `PathFinder(LevelSource*)` | 单个带默认值的构造函数      | 一致：`level` 默认 null；两个 bool 都是 false                        |
| `static int __created` / `__maxCreated` | 模块级 `stats`                 | 一致：`findPathBetween` 清零 created，maxCreated 跨实例保留           |
| `Stopwatch w`                         | 无                               | OMIT：只计时                                                         |
| `Node _nodes[MAX_NODES]` / `_pending` | 无                               | OMIT：节点池与延迟释放，GC 接管；结果相同                            |
| `int _nodeIndex`（未初始化）          | `private _nodeIndex = 0`         | 一致：C++ 每次 `findPath` 开头必置 0，不存在读未初始化值              |
| `Node* neighbors[32]`                 | `private neighbors: Node[]`      | 一致：每次只读写 `0..p-1`                                            |

TS 里有、C++ 没有的：`logMax`（把 C++ 两处重复的破纪录日志收成一个私有方法，行为逐句相同）。

## 修复

**W94-1 `findPathToPoint` 的 float 形参入口没有舍入（清单第 2 条）。**
C++ 的 `findPath(Path&, Entity*, float xt, float yt, float zt, float maxDist)` 四个形参都是 float，
调用方传入的 double 会在函数入口被舍入。TS 原来只在部分表达式里 `f()`，`maxDist` 直接拿 double 去和
`Node::distanceTo` 的 float 结果做严格小于比较，边界上会多算一个邻居。修复：

```ts
xt = f(xt);
yt = f(yt);
zt = f(zt);
maxDist = f(maxDist);
```

同时把 `findPathToTile` 的 `f(x + 0.5)` 改成 `f(f(x) + 0.5)`：C++ 是先把 int 转成 float 再加 `0.5f`，
坐标很大（超过 2^24）时两种写法舍入结果不同。

先红后绿（`cp` 备份 → 临时删掉 `maxDist = f(maxDist)` → 跑测试 → `cp` 恢复）：

- 红：`pnpm exec vitest run tests/unit/world/pathfinder-audit.test.ts` 退出码 1，1 failed | 3 passed：
  `AssertionError: expected true to be false`（W94-1）。场景：起点 (0,1,0)、目标 (2,1,1)，
  东邻到目标的距离正好是 `float(sqrt(2))`；`maxDist = Math.SQRT2` 不舍入时
  `1.414213538 < 1.414213562` 成立，会把这个邻居算进去并找到路；舍入后两者相等，严格小于不成立。
- 绿：恢复后 4/4 通过。

## OMIT

- `OMIT(PathFinder): class FreeCache { ... }`：全库没有实例化，纯死代码。
- `OMIT(PathFinder): static Stopwatch w; w.start(); w.stop();`：只做计时，不影响寻路结果。
- `OMIT(PathFinder): Node _nodes[MAX_NODES]; std::vector<Node*> _pending;`：节点池与延迟释放；
  JS 每次新建节点，C++ 复用池节点时也是整对象赋值（所有字段重置），两者结果相同，内存由 GC 接管。

## 35 条清单核对要点

- 第 1–2 条：float 形参入口见 W94-1；`findPathBetween` 的 `tentative_g_score`、`g/h/f` 每一步都已
  `f()`；`Node::distanceTo` 返回 float。
- 第 3–7 条：`Mth::floor` 用的是 TS 的 `Mth.floor`（按 float 舍入后向下取整，负数也正确）；
  `(int)(e->bb.y0)` 用 `Math.trunc`；`e->bbWidth + 1`、`/2` 都按 float 逐步舍入。
- 第 8 条：整数除法只有 `e->bbWidth / 2`（C++ 里是 float/int，不是整数除法）；无遗漏。
- 第 9–12 条：`createHash` 的位运算与 C++ int 截断一致；没有 long / 字符串格式化差异；
  `LOGI` 的文本与 C++ 相同。
- 第 13–18 条：四个 `findPath` 重载按 R10 改名；`getNode` 两个重载按 R10 改名；虚函数关系不适用
  （PathFinder 没有继承）；无默认参数差异；`neighbors`、`size` 不构成字段遮蔽。
- 第 19 条：构造函数初始化列表的两个 bool 与 `level` 都已覆盖；`_nodeIndex` 见上表。
- 第 20 条：可见性与 C++ 一致：`setLevelSource`、两个 public `findPath` 是 public，其余 private；
  `canOpenDoors`、`avoidWater` 是 public 字段。
- 第 21–25 条：`getNode` 返回 Map 里的同一对象（对应 C++ 指针语义）；`reconstruct_path` 传给
  `Path.copyNodes` 的数组随后被复制；`neighbors` 数组复用但只读有效前缀；无排序/哈希差异
  （`std::map` 与 JS `Map` 都只按 int 键查）。
- 第 26–29 条：随机数不适用；边界条件（`yy > 0`、`drop >= 4`、`y > 0`）与分支顺序逐句相同；
  `break` 只跳出内层循环的行为保留。
- 第 30–33 条：无字符串/字符转换；`isFree` 的 tileId 比较、`getData` 的丢弃调用都保留。
- 第 34 条：新增 3 处 `OMIT`，没有 `ADAPTED`。
- 第 35 条：文件头原有的“省略”说明保留，并补上了台账能识别的单行 OMIT 标记。

## 验证

- `pnpm exec vitest run tests/unit/world/pathfinder-audit.test.ts`：4/4 通过（红态见上）。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误。
- `npx prettier --check packages/world/src/level/pathfinder/PathFinder.ts tests/unit/world/pathfinder-audit.test.ts`：通过。
- `pnpm ledger`：220 → 223 条（+3 `OMIT`）。
