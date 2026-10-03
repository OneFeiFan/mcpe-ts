# C++ → TS 语言差异清单（本项目 S0–S13 实际踩过的坑）

每移植完一个单元，逐条对照。每条：现象 → 怎么写 → 项目里的例子。

## A. 数值

1. **整数除法**。C++ `int / int` 向零截断；JS 永远是浮点。
   → 两边都是整数类型时写 `Math.trunc(a / b)`。用 `python tools/porting/divs.py` 列出所有除法逐条判断。
   例：`Gui.getSlotIdAt` 的 `xRel / 20`、准星 `screenWidth / 2 - 8`、`Player::MAX_HEALTH / 2`。
2. **取整方向**。`(int)x` 是向零截断（`Math.trunc`），`Mth::floor` 才是向下（`Math.floor`）。负数时二者不同。
3. **float 精度**。C++ `float` 是 32 位。影响结果的计算（第一、二档：世界生成、物理、存档里的数值）用 `Math.fround` 逐步截断；界面动画（第三档）可以不截。三档规则见手册。
4. **整数溢出与位运算**。`int` 乘法用 `Math.imul`；`unsigned` 用 `>>> 0`；`(char)x` 写 `(x << 24) >> 24`，`(short)x` 写 `(x << 16) >> 16`，`(unsigned char)` 写 `x & 0xff`。
   例：ItemEntity 的 `Health` 按 `(char)` 写出，-1 必须是 -1 不是 255。
5. **颜色常量**。`0xff000000` 在 JS 是正数 4278190080；要当 int 用写 `0xff000000 | 0`。
6. **64 位整数**。`long long` 种子、随机数用 BigInt 或项目里现成的 `Random`（已与 C++ 对齐），不要自己写。

## B. 类与对象

7. **构造函数里调用虚函数**。C++ 在基类构造期间只调到基类自己的版本；JS 会派发到子类，而子类字段还没初始化。
   → 构造函数里调用会被重写的方法时写 `本类.prototype.方法.call(this, …)`。例：`Entity`、`Mob`、`Player` 的 `_init`、`getMaxHealth`。
8. **字段初始化时机**。TS 的字段初始化器在 `super()` 返回之后才执行，会覆盖基类构造期间写入的值。
   → 会在基类构造期间被赋值的字段，不要写初始化器（用 `declare` 或在构造函数里赋值）。
9. **成员构造顺序**。C++ 按成员声明顺序构造。某个字段的初始化依赖另一个字段时，在构造函数里按 C++ 的顺序创建。
   例：`Minecraft.gui` 依赖 `options`，所以在构造函数里 `this.options = …` 之后才 `new Gui(this)`。
10. **按值语义**。C++ 按值存放的结构（`ItemInstance`、`Pos`、`Vec3`、`IntRectangle`、`AABB`、`ImageDef`）赋值即复制。
    → 赋值时 `new X(...)` 或 `.copy()`，不要共享引用；函数按值返回的也要复制。
11. **引用与指针输出参数**。`void f(int& x, int& y)` → 返回元组 `[x, y]`；`bool f(GridItem& out)` → 返回 `[ok, out]`。在文件头注明（ADAPTED(Cpp)）。
12. **多重继承**。纯接口 → TS `interface`；带实现的基类 → mixin（例：`FillingContainerMixin(TileEntity)`）。同名方法在一条原型链上会互相遮蔽，按 R10 改名。
13. **重载**（R10）。
    - 情形 A：短版本只是用常量转调长版本 → 合并成一个方法加默认参数。
    - 情形 B：其他 → 保留一个分派入口，其余用描述性名字（例：`getTextureForFace / ForData / At`、`renderGuiItemSized`、`Screen.initScreen`）。
    - 子类重写一律写 `override`（编译器会帮你抓名字对不上）。方法名禁止 `$1`。
14. **static 局部变量** → 模块级状态对象（例：`tickInputStatics`、`debugStatics`）。**文件内 static 函数** → 模块级函数。
15. **抽象类与纯虚函数** → `abstract`；C++ 里有实现的虚函数不要标 abstract。

## C. 模块与运行时

16. **ES 模块循环**。基类文件不能 import 子类（会出现 “Class extends value undefined”）。需要在基类里创建子类时用注册/注入（`TileInclude`、`ItemInclude`、`registerItemEntityClass`）。只用到类型时写 `import type`。
17. **`declare function` 不等于 import**：类型检查通过，运行时报 “not defined”。
18. **未注册的方块/物品是哨兵**：访问 `.id` 会抛错。只比较 id 时用 `idOf(Tile.x)`；注册后改回 `.id`。
19. **C++ 未初始化的静态量要在运行时赋值**。例：`LevelChunk::ChunkBlockCount` 在 `Minecraft::init` 里才设成 32768。
20. **未定义行为不复刻**：读未初始化成员、越界等，黄金样本里标 `uninit` 不比较；TS 里写合理默认值并注释。

## D. 字符串、容器、宏

21. **字符串按字节**。C++ `std::string` 是字节序列：`str[i]` → `str.charCodeAt(i) & 0xff`；`'\xa7'` 是颜色码前缀 §。
22. **printf 格式的怪癖照原样**：`%.ld` 打印 0 时输出空；`%d` 打印浮点是未定义行为（按数值打印并注释 ADAPTED(Cpp)）。
23. **容器**。`std::map` 按键有序 → 遍历前排序；`std::sort` 不稳定 → 注明同序元素次序不保证；`vector::erase` 注意索引变化；`std::set` 去重。
24. **宏**。逐个看展开结果。例：`PARTICLETYPE(x)` 是逗号表达式，结果是字符串 `"x"`；`IRMAPCASE(x)` 是查表。

## E. 网页平台

25. **纹理必须预加载**。`loadTexture` 只从 `apps/web/src/assets.ts` 的预加载表取。漏了一张，会沿用上一次绑定的纹理，表现为“画错了图”（S13 左上角残影 = 暗角画成了 icons.png）。用到新纹理就加进 `PRELOAD`；读文件（语言、存档）加进 `PRELOAD_FILES` 或走存储层。
26. **同步 vs 异步**。C++ 的文件读写、`sleep` 是同步的；浏览器不能阻塞主线程。需要时改为启动时预加载 + 内存缓存 + 异步落盘，标 ADAPTED(Web) 并在文件头说明。

## F. 验证时的坑

- 无头浏览器锁定鼠标指针后渲染极慢（每秒约 1 帧），截图会超时。场景里不要点击画面，用 `window.__app` 直接操作（`app.screenChooser.setScreen(id)`、`app.player.xRot = …`）。
- 浏览器里的状态检查要看“值”，不要只看“没报错”。例：选中格子后读 `inventory.getItem(0).getName()`。
- 截图一定要用图片查看工具打开看一眼。只看脚本退出码，发现不了“画错了图”这类问题。
