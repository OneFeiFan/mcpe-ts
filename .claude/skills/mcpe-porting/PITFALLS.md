# C++ → TS 语言差异清单（本项目 S0–S13 实际踩过的坑）

每移植完一个单元，逐条对照。每条：现象 → 怎么写 → 项目里的例子。

## A. 数值

1. **整数除法**。C++ `int / int` 向零截断；JS 永远是浮点。
   → 两边都是整数类型时写 `Math.trunc(a / b)`。用 `python tools/porting/divs.py` 列出所有除法逐条判断。
   例：`Gui.getSlotIdAt` 的 `xRel / 20`、准星 `screenWidth / 2 - 8`、`Player::MAX_HEALTH / 2`。
2. **取整方向**。`(int)x` 是向零截断（`Math.trunc`），`Mth::floor` 才是向下（`Math.floor`）。负数时二者不同。
3. **float 精度**。C++ `float` 是 32 位。影响结果的计算（第一、二档：世界生成、物理、存档里的数值）用 `Math.fround` 逐步截断；界面动画（第三档）可以不截。三档规则见手册。
   **⚠ 十进制字面量本身也要过 `f()`**（C-3 踩到的，夹具测不出来）：C++ 的 `0.2f` 是 float，
   TS 直接写 `0.2` 是 **double** —— 两者差约**半个 float ULP**（不是 2⁻⁵³，别想错）。
   所以 `f(r * 0.2)` 与 C++ 的 `r * 0.2f` 结果不同，**实测约 20% 的输入差 1 位**。正确写法是 `f(r * f(0.2))`。
   要分清的是：**两个已经是 float 的值**之间的 `+ - * /`，在 double 里算完再 `fround`，
   与 C++ 的单步 float 运算是**逐位相同**的（double 53 位 ≥ 2×24+2，二次舍入无害）；
   出问题的**只有十进制字面量本身**。
   **⚠ 先看 C++ 原句有没有 `f` 后缀 —— 这才是一切的判据**（C-4 又踩了一次，方向相反）：
   - 写了 `0.2f` / `0.7f` / `-0.7f` → C++ 用 32 位常量，TS 写 `f(x * f(0.2))`；
   - **只写 `-0.7`（没后缀）→ C++ 是 double 字面量**，比较/运算按 double 提升做，
     TS 就**不能包 `f()`** —— 包了反而是错的（`f(-0.7)` 比 `-0.7` 差半个 float ULP）。
   - 二进制的精确与否只是第二步：有 `f` 后缀但这个数（0.25、0.75、1.5、16）本来就精确，
     `f()` 是恒等，包不包都一样；没后缀的一律不包。
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
27. **形参名会骗人 —— 判据永远是参考实现的"行为"，不是它的变量名。** 移植时最容易犯的错是
   "照名字翻译"，而原版的名字本身可能是错的。
   例（真踩过）：`AppPlatform_glfw.h` 的
   ```cpp
   virtual void hideCursor(bool hide) override {
     int isHide = hide ? GLFW_CURSOR_NORMAL : GLFW_CURSOR_HIDDEN;   // ← 反的
     glfwSetInputMode(window, GLFW_CURSOR, isHide);
   }
   ```
   形参叫 `hide`，`hide == true` 设的却是 NORMAL（**显示**）—— 参数的实际含义是"显示"。
   照着名字写成 `hide ? 'none' : ''` 的结果是：进任何界面系统光标都被藏掉，而默认选项又关着
   "游戏自己画光标"，两边都没有，只能盲选。
   **遇到可疑的名字，去追调用方**：`GameRenderer` 调的是 `hideCursor(!rpiCursor)`，
   默认 `rpiCursor = false` —— 这一句就说明了参数真意。查完把结论写进注释（名字照留，别改签名）。
28. **画布坐标与鼠标坐标的单位必须一致（CSS 像素 ≠ 设备像素）。** 浏览器的事件坐标
   （`clientX/Y`、`getBoundingClientRect`、`movementX/Y`）是 **CSS 像素**；
   而 `canvas.width/height` 是 **设备像素**（= CSS × `devicePixelRatio`，为高分屏清晰而放大）。
   把后者当"屏幕尺寸"喂给游戏（`getScreenWidth()`、`app.setSize()`）之后，鼠标就只能够到
   屏幕左上角的 **1/dpr** —— Windows 缩放 125% 是 1/1.25，150% 是 1/1.5，右下角一片点不到。
   **必须在入口处换算一次**：`设备像素 = CSS 像素 × (canvas.width / rect.width)`。
   用这个比值而不是直接读 `devicePixelRatio`，画布尺寸不严格按 dpr 算时也不会跑偏。
   ⚠ 这类 bug 在 `deviceScaleFactor: 1` 的无头测试里**完全测不出来** —— 见下面 F 节。

## E2. 素材不只是图片（任务单 F 教我的）

- **`.pcm` / 别的"音频数据"在参考树里可能是 C 源码，不是二进制。**
  `src/client/sound/data/*.pcm` 长这样：
  `unsigned char PCM_bow[40156] = { 1,0,0,0,2,0,0,0,… };`
  —— 前 16 字节是小端 int32×4 的头（channels / byteWidth / frameRate / numFrames），
  后面是 PCM16。搬之前先 `head -c 32` 看一眼，别照着"裸二进制"的假设写加载器。
  三个实测踩到的：**数值有十进制也有十六进制两种写法**（103 个文件里 17 个是 `0x…`）；
  **有的文件 `};` 后面还粘着别的代码**（`pop2.pcm` 尾巴上是 `SoundDesc SA_pop2(...);`），
  所以只能取第一个 `{` 到第一个 `}`；**解析完要自校验**（数值个数 == 声明长度 ==
  `16 + ch×bw×nf`），不然脏数据会静默流进去。
- **大块素材打成"一个包 + 一份索引"**，一次请求拿全；`tools/sound/build.mjs` 是模板
  （`--check` 只校验不写、`--out` 给测试用）。⚠ **给转换脚本加 `--out`**：默认目标是仓库里
  已提交的产物，测试跑一遍就会把它覆盖成只含临时样例的包。
- **浏览器不认识"裸 PCM"**：`decodeAudioData` 只吃容器格式（WAV/MP3/OGG）。
  裸 PCM16 要自己 `ctx.createBuffer` + 把**交错**样本铺成各声道 Float32
  （`/32768`，注意跨步要乘 `byteWidth` 而不是写死 2）。这也顺带绕开了各浏览器解码器的差异。

## E3. 音频后端特有的两件事（任务单 F）

- **自动播放策略**：`AudioContext` 一开始是 `suspended`，没有用户手势不出声。
  要 `resume()` 得挂 `pointerdown`/`keydown` 监听 —— ⚠ **而这个监听是在建 `AudioContext`
  的时候挂的**。所以 context 必须**在启动时就建**，不能拖到第一次 `playAt`：
  那时候"点开始游戏"已经过去了，用户得再点一次才听得到。
- **声音没法截图**：验收手段要换。给后端加一份**可读的播放调用记录**
  （`plays: [{name,x,y,z,volume,pitch}]`），场景里断言"**调了、参数对**"，
  而不是"我听见了"。记录要写在碰 `AudioContext` **之前**，这样没手势也能断言。

## F. 验证时的坑

- 无头浏览器锁定鼠标指针后渲染极慢（每秒约 1 帧），截图会超时。场景里不要点击画面，用 `window.__app` 直接操作（`app.screenChooser.setScreen(id)`、`app.player.xRot = …`）。
- 浏览器里的状态检查要看“值”，不要只看“没报错”。例：选中格子后读 `inventory.getItem(0).getName()`。
- 截图一定要用图片查看工具打开看一眼。只看脚本退出码，发现不了”画错了图”这类问题。
- **`tools/verify/smoke.mjs` 默认 `deviceScaleFactor: 1`，会掩盖一整类高分屏 bug**（见第 28 条）。
  要测坐标换算就跑 `SMOKE_DPR=1.5 node tools/verify/smoke.mjs tools/verify/scenarios/cursor.mjs`。
  凡是”点得准不准””光标的坐标对不对”这类问题，**光看脚本过不过没用，要换 dpr 再跑一遍**。
- **改 `player.xRot` 之后要连 `xRotO` 一起改，否则镜头不会真的转过去。**
  相机渲染用的是插值 `xRotO + (xRot - xRotO) * a`，而 `xRotO` 只在 `Entity.tick()` 里被赋成 `xRot`。
  平时看不出来（下个 tick 就对齐了），但**一旦 `app.pause = true` 把世界按住，就再也没有 tick** ——
  此时改 `xRot` 只被插值走一小截，画面基本没转。表现是"明明对准了却一片空白"，
  很容易误判成渲染没生效（D2.5 就在这里绕了半天）。`yRot` / `yRotO` 同理。
- **`vitest` 不做类型检查 —— `new 抽象类` 这类错误只有 `pnpm typecheck` 抓得到。**
  测试全绿、`typecheck` 全红是可能的（E9 的 `new Entity(level)`、SoundDesc 那次都栽过）。
  跑测试之外**一定单独跑一遍 `pnpm typecheck`**。
- **数台账标记要用 `tools/ledger.mjs` 里那条严格正则**（`//\s*(DEFERRED|OMIT|ADAPTED|FORWARD-DECL)\(系统\)`），
  不要用宽松的 `grep "OMIT(x)"` —— 正文里提到"标 `OMIT(x)`"的说明文字会被算进去
  （数错过两次：231 那次数成 12/8，Sound 那次数成 15 而实际是 11）。
  同理，**数测试条数要用 vitest 自己的报告**（`--reporter=json` 或汇总行），
  不要数源码里的 `it(` —— `for` 循环生成的用例数对不上。
- **想拍"运动中的东西"，用 `app.pause = true` 定格再拍，然后记得放开。**
  `Minecraft.pause` 只挡 `level.tick / tickEntities`，渲染照跑，
  所以按住之后等一两秒让画面追上来就能拍到静止的一帧（无头浏览器只有约 1 帧/秒，不等就是空画面）。
