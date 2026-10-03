# 移植辅助脚本（Python 3，无第三方依赖）

都是“读 C++、出草稿、做检查”的工具。**草稿永远要人工逐函数核对**，脚本不理解语义。

| 脚本       | 作用                                                                             | 用法                                         |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| pp.py      | 按网页版构建展开 `#ifdef`（PLATFORM_WEB、OPENGL_ES、USE_VBO 已定义，其余未定义） | `python pp.py <in> <out>`                    |
| clean.py   | pp.py + 去注释、空行、#include，打印出来读                                       | `python clean.py <文件...>`                  |
| fn.py      | 打印某个类的指定成员函数完整函数体                                               | `python fn.py <file.cpp> <类名> <f1,f2>`     |
| cpp2ts.py  | 把一段行号范围（一个函数体）逐行转成 TS 草稿                                     | `python cpp2ts.py <file.cpp> <起> <止>`      |
| members.py | 收集 TS 类的成员名，供 cls2ts.py 加 this.                                        | `python members.py <out.txt> <a.ts> [b.ts…]` |
| cls2ts.py  | 整个 C++ 类 → TS 类草稿（字段带类型、初始化列表、方法体）                        | 见下                                         |
| post.py    | cls2ts 草稿的第二轮修正（override、容器、数学函数、(int) 强转）                  | `python post.py <draft.ts> <基类方法名.txt>` |
| shadow.py  | 找“局部变量与成员同名、声明前就被使用”（漏加 this.）                             | `python shadow.py <file.ts> <成员.txt>`      |
| divs.py    | 列出所有除法，逐条判断是否整数除法                                               | `python divs.py <file.ts>`                   |

## 类转写流程（大类，例如 Mob、Player、Gui）

```bash
# 1. 预处理参考源码（网页版分支）
python tools/porting/pp.py $REF/src/world/entity/Mob.h  /tmp/Mob.h
python tools/porting/pp.py $REF/src/world/entity/Mob.cpp /tmp/Mob.cpp
# 2. 基类成员名（决定哪些标识符加 this.）
python tools/porting/members.py /tmp/base_members.txt packages/world/src/entity/Entity.ts
# 3. 草稿（第 6 个参数是 C++ 基类名，用来把初始化列表里的基类构造变成 super(...)）
python tools/porting/cls2ts.py /tmp/Mob.ts Mob /tmp/Mob.h /tmp/Mob.cpp /tmp/base_members.txt Entity
# 4. 第二轮修正（第 2 个参数：基类方法名，一行一个；用来加 override）
python tools/porting/post.py /tmp/Mob.ts /tmp/base_methods.txt
# 5. 放进 packages/…，补 import、extends、文件头，然后：
pnpm typecheck            # 一批一批修错误
python tools/porting/divs.py   packages/world/src/entity/Mob.ts
python tools/porting/shadow.py packages/world/src/entity/Mob.ts /tmp/base_members.txt
```

草稿里一定要人工处理的：整数除法、`Vec3` 等值类型的运算符（`a + b * k`）、`static` 局部变量、`sprintf`、引用/指针输出参数、
`dynamic_cast`、重载（R10）、网络/声音/粒子语句（标 DEFERRED）。对照 `.claude/skills/mcpe-porting/PITFALLS.md`。
