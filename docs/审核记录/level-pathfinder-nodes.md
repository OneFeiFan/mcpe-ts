# PathFinder 节点三件套（BinaryHeap / Node / Path）

审核编号：**W95**（BinaryHeap）、**W96**（Node）、**W97**（Path）。三个文件审核后行为全部一致，
**没有运行时修改**；只补了 3 处 `OMIT` 标记并新增 13 条行为锁定测试。

| 文件              | C++ 对应                        | 审核后行数 |
| ----------------- | ------------------------------- | ---------- |
| `BinaryHeap.ts`   | `BinaryHeap.h`（无 .cpp）       | 127        |
| `Node.ts`         | `Node.h`（无 .cpp）             | 93         |
| `Path.ts`         | `Path.h` + `Path.cpp`           | 129        |

## C++ 侧要点

### Node / TNode

- `Node(int x=0, int y=0, int z=0)` 的初始化列表：`x/y/z`（int→**short** 截断）、`heapIdx(-1)`、
  `g/h/f(0)`、`cameFrom(NULL)`、`closed(false)`、`hash(createHash(x,y,z))`。
  **hash 用的是构造参数（截断前的 int），不是 short 后的 x/y/z。**
- `createHash`：`(y & 0xff) | ((x & 0x7fff) << 8) | ((z & 0x7fff) << 24) | (x<0 ? 0x0080000000 : 0)
  | (z<0 ? 0x0000008000 : 0)`；返回 int，高位靠截断。
- `distanceTo`：三个差值先转 float，平方和按左结合逐步 float，最后 `Mth::sqrt`（double 开方后存回 float）。
- `operator==`：**hash 相同且 x/y/z 相同**；`operator<`（TNode）：先 z、再 x、最后 y。
- 隐式拷贝构造（`new Node(*nodes[i])`）复制全部字段，包括 private 的 hash。

### BinaryHeap

- 数组最小堆：`_size`、`_maxSize(1024)`；`_size == _maxSize` 时 `_maxSize = _size << 1` 并整块搬移。
- `upHeap`：`cost < parent->f` 严格小于才上浮；`downHeap`：`leftCost < rightCost` 为假（**相等**）
  时走右支，`rightIdx >= _size` 时把右子代价当 `FLT_MAX`。
- `clear()` **只把 `_size` 置 0，不遍历节点复位 `heapIdx`**；`pop()` 把最后一个元素搬到根、末尾置 NULL，
  再给弹出的节点 `heapIdx = -1`；`remove()` 把最后一个搬过来后按新代价决定上浮/下沉。
- `changeCost(Node*, float newCost)`：形参是 float，先存进 `node->f`，再用 `newCost < oldCost`
  决定上浮还是下沉。

### Path

- `static int p = 0`，构造函数 `id(++p)`；`nodes(NULL)`、`length(0)`、`index(0)`。
- `copyNodes`：先 `destroy()`，再逐个 `new Node(*nodes[i])`（深拷贝）。
- `destroy()`：逐个 delete、delete[]，然后 `nodes = NULL; index = length = 0`。
- 两个 `currentPos` 重载：无参返回 `Node*`，带 `Entity*` 返回 `Vec3`（转调 `getPos`）。
- `getPos`：`float x = nodes[index]->x + (int)(e->bbWidth + 1) * 0.5f;`（先截断成 int，再乘 0.5f）。
- `sameAs` 比较长度与每个节点的 x/y/z；`endsIn`/`endsInXZ` 用 `Mth::floor`。
- C++ 的默认赋值运算符是逐成员浅拷贝（`PathfinderMob::setPath` 里用到）。

## 工作表结论

### Node（W96）

| #   | C++ 函数 / 位置            | TS 方法 / 行       | 结论                                                         |
| --- | -------------------------- | ------------------ | ------------------------------------------------------------ |
| 1   | `createHash`（Node.h:20）  | `createHash` 31    | 一致：位运算与 int 截断相同                                   |
| 2   | `distanceTo`（Node.h:28）  | `distanceTo` 42    | 一致：逐步 float，`Mth.sqrt` 先 f 再开方再 f                  |
| 3   | `hashCode`（Node.h:39）    | `hashCode` 54      | 一致                                                         |
| 4   | `inOpenSet`（Node.h:43）   | `inOpenSet` 58     | 一致：`heapIdx >= 0`                                          |
| 5   | `toString`（Node.h:47）    | `toString` 62      | 一致：`'Node::toString not implemented'`                      |
| 6   | `TNode(Node*)`（Node.h:65）| `TNode` 构造函数 82 | 一致（工作表把构造参数误当成方法名 `node(node)`）             |
| —   | `Node(int,int,int)`        | `constructor` 24   | 一致：short 截断；hash 用截断前的参数                          |
| —   | `operator==`               | `equals` 50        | 一致（C++ 运算符 → TS 方法）                                  |
| —   | 隐式拷贝构造               | `copy` 67          | 一致：复制全部字段，包括 private hash                         |
| —   | `TNode::operator==`        | `TNode.equals` 84  | 一致                                                         |
| —   | `TNode::operator<`         | `TNode.lessThan` 88| 一致：z → x → y 的比较顺序                                    |

TS 里有、C++ 没有的：`equals` / `copy` / `lessThan` 分别是 C++ 的 `operator==`、拷贝构造、`operator<`
的 TS 写法；不是新行为。

### BinaryHeap（W95）

| #   | C++ 函数 / 位置                 | TS 方法 / 行     | 结论                                                                 |
| --- | ------------------------------- | ---------------- | -------------------------------------------------------------------- |
| 1   | `_maxSize(1024)`（h:14）        | 构造函数字段 15  | 一致（工作表把初始化列表项当成了方法）                                |
| 2   | `insert`（h:25）                | `insert` 19      | 一致：扩容交给 JS 数组；`heapIdx >= 0` 时照样 LOGE                    |
| 3   | `clear`（h:51）                 | `clear` 32       | 一致：只清 `_size`，不复位节点 `heapIdx`（怪癖保留）                  |
| 4   | `pop`（h:55）                   | `pop` 36         | 一致：末尾搬到根、置 NULL、`heapIdx = -1`                             |
| 5   | `remove`（h:66）                | `remove` 45      | 一致                                                                 |
| 6   | `changeCost`（h:87）            | `changeCost` 58  | 一致：见下文的边界分析                                                |
| 7   | `size`（h:101）                 | `size` 68        | 一致                                                                 |
| 8   | `isEmpty`（h:106）              | `isEmpty` 72     | 一致                                                                 |
| 9   | `upHeap`（h:46）                | `upHeap` 76      | 一致：严格小于                                                        |
| 10  | `downHeap`（h:61）              | `downHeap` 92    | 一致：相等走右支，右子越界用 `FLT_MAX`                                |
| —   | 构造函数 / 析构函数             | 构造函数 / 无    | 构造一致；析构 OMIT（GC）                                             |

**`changeCost` 的边界分析**：C++ 的 `newCost` 是 float 形参，入口已舍入；TS 先 `node.f = f(newCost)`，
但分支比较用的是未舍入的 `newCost`。唯一可能走不同分支的情况是“未舍入值 < 旧值、舍入后 == 旧值”；
此时 `upHeap` 和 `downHeap` 拿到的都是等于旧值的代价，而堆里父节点 ≤ 旧值、子节点 ≥ 旧值，
两边都是空操作，最终堆结构完全相同。因此**行为一致**，没有改代码。

### Path（W97）

| #   | C++ 函数 / 位置              | TS 方法 / 行         | 结论                                                     |
| --- | ---------------------------- | -------------------- | -------------------------------------------------------- |
| 1   | `Path()`（Path.cpp:5）       | `constructor` 20     | 一致：`id = ++p`，其余 0/NULL                             |
| 2   | `~Path()`（Path.cpp:41）     | 无                   | OMIT：delete 由 GC 接管                                   |
| 3   | `isEmpty`（Path.cpp:45）     | `isEmpty` 50         | 一致                                                     |
| 4   | `copyNodes`（Path.cpp:49）   | `copyNodes` 24       | 一致：先 destroy，再逐个 `Node.copy()`（深拷贝）          |
| 5   | `destroy`（Path.cpp:57）     | `destroy` 31         | 一致：清空并复位 index/length（delete 由 GC）             |
| 6   | `currentPos()`（Path.cpp:67）| `currentNode` 82     | 一致（R10 重载改名）                                      |
| 7   | `currentPos(Entity*)`        | `currentPos` 78      | 一致                                                     |
| 8   | `next`（Path.cpp:75）        | `next` 38            | 一致                                                     |
| 9   | `setSize`（Path.cpp:79）     | `setSize` 42         | 一致                                                     |
| 10  | `getSize`（Path.cpp:83）     | `getSize` 46         | 一致                                                     |
| 11  | `isDone`（Path.cpp:87）      | `isDone` 54          | 一致                                                     |
| 12  | `last`（Path.cpp:91）        | `last` 58            | 一致                                                     |
| 13  | `get`（Path.cpp:98）         | `get` 65             | 一致                                                     |
| 14  | `getIndex`（Path.cpp:102）   | `getIndex` 69        | 一致                                                     |
| 15  | `setIndex`（Path.cpp:106）   | `setIndex` 73        | 一致                                                     |
| 16  | `getPos`（Path.cpp:110）     | `getPos` 86          | 一致：`(int)(bbWidth + 1) * 0.5f` 的截断顺序              |
| 17  | `sameAs`（Path.cpp:117）     | `sameAs` 94          | 一致                                                     |
| 18  | `endsIn`（Path.cpp:128）     | `endsIn` 109         | 一致                                                     |
| 19  | `endsInXZ`（Path.cpp:136）   | `endsInXZ` 115       | 一致                                                     |
| —   | 默认赋值运算符               | `assignFrom` 122     | 一致（ADAPTED(Cpp)：用方法表达 C++ 的隐式浅拷贝）         |
| —   | `static int p`               | 模块级 `p` 12        | 一致：`++p`                                              |

TS 里有、C++ 没有的：`currentNode`（R10 重载改名）、`assignFrom`（ADAPTED(Cpp)，表达默认赋值）。

## 修复

**无。** 三个文件逐函数核对后行为全部一致，没有 `已修` 行。

## OMIT

- `OMIT(BinaryHeap): ~BinaryHeap() { delete[] _heap; }`：JS 数组由 GC 接管。
- `OMIT(BinaryHeap): _heap = new Node*[_maxSize]; 扩容时 new/delete 整块搬移`：JS 数组自动扩容，
  `_maxSize` 字段保留只为对照。
- `OMIT(Path): ~Path() { destroy(); }`：逐个 delete 节点由 GC 接管；`destroy()` 本身已移植。

## 35 条清单核对要点

- 第 1–2 条：`Node.distanceTo`、`Path.getPos` 的 float 逐步舍入已核对；`changeCost` 的形参舍入见上文
  （行为一致）；没有未初始化读取（`_maxSize`、`_size` 都有初值）。
- 第 3–7 条：`Node` 的 short 截断用 `(v << 16) >> 16`；`createHash` 的 int 截断用位运算；
  `(int)(e->bbWidth + 1)` 用 `Math.trunc`；`* 0.5f` 用 `f(0.5)` 再舍入。
- 第 8 条：没有整数除法。
- 第 9–12 条：`0x0080000000` 在 C++ 是 unsigned int、转 int 后与 TS 的 int32 位模式相同；
  没有 long / 字符串格式化差异；`toString` 文本一致。
- 第 13–18 条：`Node` 的 `operator==`/拷贝构造/`operator<` 分别映射到 `equals`/`copy`/`lessThan`；
  `Path` 的两个 `currentPos` 重载按 R10 处理；无默认参数差异、无字段遮蔽。
- 第 19 条：`Node` 构造函数的初始化顺序无依赖；`BinaryHeap` 构造函数 `_size/_maxSize` 一致；
  `Path` 构造函数 `id` 与 `p` 的先后关系一致（先 `++p` 再赋 id）。
- 第 20 条：可见性一致：`Node.x/y/z/g/h/f/heapIdx/cameFrom/closed` public，`hash` private；
  `BinaryHeap` 的 `_heap/_size/_maxSize` private；`Path.nodes/length/index` private、`id` public。
- 第 21–25 条：`Node.copy` 是深拷贝；`Path.copyNodes` 深拷贝、`assignFrom` 浅拷贝（与 C++ 相同）；
  `BinaryHeap.clear` 不复位 `heapIdx` 的怪癖保留；相等代价的出队顺序已用测试锁定。
- 第 26–29 条：无随机数；`downHeap` 的左右子相等/越界分支、`pop` 的最后一个元素、`remove` 的
  边界都与 C++ 相同；`sameAs` 的短路顺序一致。
- 第 30–33 条：无字符串/字符转换；`LOGE` 文本一致；bool 与 short 的转换已核对。
- 第 34 条：新增 3 处 `OMIT`，没有新增 `ADAPTED`。
- 第 35 条：文件头的说明与实现一致，无需改。

## 验证

- `pnpm exec vitest run tests/unit/world/pathfinder-nodes-audit.test.ts`：13/13 通过。
- `npx tsc -p packages/world --noEmit`：0 错误。
- `npx tsc -p tests/tsconfig.json --noEmit`：0 错误。
- `npx prettier --check BinaryHeap.ts Node.ts Path.ts pathfinder-nodes-audit.test.ts`：通过。
- `pnpm ledger`：223 → 226 条（+3 `OMIT`）。
