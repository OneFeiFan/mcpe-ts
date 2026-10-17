# util 包

对照：`src/util/*.h / *.cpp` ↔ `packages/util/src/*.ts`。2026-10 全量审核。

## Mth（Mth.h / Mth.cpp）

| 函数                                             | 结论                                                                                                                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 常量 PI、TWO_PI、DEGRAD、RADDEG                  | 一致（黄金样本逐位）                                                                                                                                                                                                             |
| initMth、sin、cos                                | 一致（65536 项表与取样逐位）                                                                                                                                                                                                     |
| invSqrt                                          | 一致（快速平方根倒数，逐位）                                                                                                                                                                                                     |
| intFloorDiv                                      | 一致                                                                                                                                                                                                                             |
| floor                                            | **已修 U1**：C++ 形参是 float，double 实参先被舍入（`floor(0.99999999)` 在 C++ 里是 1）；越界输入按 x86 的 `(int)` 强转。改后黄金样本全部样本（含越界）逐位一致                                                                  |
| sqrt、atan、atan2                                | **已修 U2**：以前直接用 `Math.sqrt` 等返回 double；C++ 形参与返回值是 float，改成 `f(Math.sqrt(f(x)))`，黄金样本逐位一致                                                                                                         |
| abs、Min、Max                                    | **已修 U3**：以前用 `Math.abs/min/max`，在 NaN 与 ±0 上和 C++ 的 `a <= b ? a : b` 不同（如 `Min(0, -0)`）；改成 C++ 的比较写法。int 与 float 两个重载 TS 分不出来，所以不做 float 舍入（int 实参超过 2^24 会被改值），注释里写明 |
| clamp                                            | 一致（两个重载写法相同）                                                                                                                                                                                                         |
| lerp、lerpInt、absDecrease、absMax、absMaxSigned | **已修 U4**：改成逐步 float 运算；黄金样本由“近似相等”收紧为逐位，全部通过                                                                                                                                                       |
| random()、random(n)                              | 一致（模块级 Random，任务单 H1 起）                                                                                                                                                                                              |
| Util::removeAll、Util::remove（vector / set）    | 一致（元素比较是指针相等）                                                                                                                                                                                                       |

## Random（Random.h）

| 函数                                                         | 结论                                                                    |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 构造、setSeed、init_genrand                                  | 一致（`long` 种子取低 32 位；`_mti = N + 1` 后由 init_genrand 置为 N）  |
| genrand_int32                                                | 一致（random 黄金样本逐位）                                             |
| nextBoolean                                                  | 怪癖保留：测的是 `0x8000000`（第 27 位），不是最高位                    |
| nextFloat、nextDouble                                        | 一致                                                                    |
| nextInt()、nextInt(n)、nextLong()、nextLong(n)               | 一致；`n <= 0` 在 C++ 里是除零或无符号取模，TS 不处理（游戏里不会出现） |
| nextGaussian                                                 | 一致（`std::log`、`std::sqrt` 是 float 重载，每步 f()）                 |
| rrDiff 三个重载                                              | 一致（各分量的除法在 float 里是精确的）                                 |
| init_by_array、genrand_int31、genrand_real1/3、genrand_res53 | 没有调用者，OMIT(Util) 登记                                             |
| copy                                                         | NEW：对应 C++ 的隐式拷贝构造（`Random randomCopy = random;`）           |

## DataIO（DataIO.h / DataIO.cpp）

| 函数                                                      | 结论                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| writeFloat / Double / Short / Int / LongLong、对应的 read | 一致（小端）                                                                                                                                                |
| readByte                                                  | **已修 U5**：C++ 返回 `char`（x86 上有符号，-128..127），TS 以前返回 0..255。NBT 的调用方自己 `& 0xff`，不受影响；`SynchedEntityData` 的读取因此与 C++ 一致 |
| writeString                                               | 一致（长度 `& 0x7fff`）；ADAPTED：JS 字符串按 UTF-8 编码成字节，ASCII 与 C++ 逐字节相同                                                                     |
| readString                                                | 一致（长度截断、在第一个 `\0` 处截断）；ADAPTED(Safety)：负长度时 C++ 是未定义行为，TS 抛错；非法 UTF-8 序列会变成 U+FFFD（C++ 保留原始字节）               |

## StringUtils（StringUtils.h / .cpp）

| 函数                                          | 结论                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| startsWith、stringTrim（两个重载）、removeAll | 一致                                                                                                           |
| stringReplace                                 | 一致；ADAPTED(Safety)：`src` 为空、或 `maxCount = -1` 且 `dst` 含 `src` 时 C++ 死循环，TS 直接返回（已有单测） |
| hashCode                                      | 一致（按 UTF-8 字节、`char` 有符号；溢出回绕）                                                                 |

## 其余

| 文件                                          | 结论                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WeighedRandom                                 | 一致                                                                                                                                                                                                                                                                                                                           |
| SmoothFloat.getNewDeltaValue                  | **已修 U6**：形参是 float，实参先转 float 再参与运算                                                                                                                                                                                                                                                                           |
| Color                                         | **已修 U7**：构造函数以前按“是不是整数、是否都在 0..1”猜 int 版还是 float 版（`new Color(1, 1, 1)` 会变成白色），float 版越界还抛错（C++ 只有调试版 assert）。改成：构造函数 = int 版，`Color.fromFloat` = float 版（R10）。`getHSBColor` 改成逐步 float 运算；唯一的调用者 `Biome.getSkyColor`（天空颜色）同步改成 float 运算 |
| PerfTimer                                     | 结构一致（push / pop / popPush / getLog，含 C++ 的 `totalTime2` 取的是 root 而不是 path 这一怪癖）；计时值用 double 而非 float——只影响调试界面上的百分比显示（三档规则第三档）。ADAPTED(Safety)：空栈 pop 时 C++ 未定义，TS 忽略并提示一次                                                                                     |
| BitStream、RakDataIO                          | 只实现存档用到的子集（ADAPTED(Network)），存档黄金样本逐字节钉住                                                                                                                                                                                                                                                               |
| cpp.ts、Util.ts、CollectionUtils.ts、index.ts | NEW / 汇总文件，无对应 C++ 逻辑                                                                                                                                                                                                                                                                                                |
