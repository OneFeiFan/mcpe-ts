---
name: mcpe-porting
description: 把 MCPE 0.6.1 的一个 C++ 类或函数 1:1 移植成 TypeScript 时使用。包括读 C++、生成草稿、处理 C++ 与 TS 的语言差异、R10 重载命名、DEFERRED/OMIT 台账标记、接线与验证。凡是要新建或修改 packages/ 下对应 C++ 的代码，都先读这个 skill 和 PITFALLS.md。
---

# C++ → TS 移植流程

## 0. 开工前
- 读任务单（`docs/ai/TASK-*.md`）里当前步骤的“范围”“验收”。只做这一步。
- `git status` 确认工作区干净；`pnpm typecheck && pnpm test` 确认起点是绿的。

## 1. 读 C++
```bash
python tools/porting/clean.py $REF/src/client/gui/screens/Foo.h $REF/src/client/gui/screens/Foo.cpp
```
clean.py 已按网页版构建展开条件编译：`PLATFORM_WEB`、`OPENGL_ES`、`USE_VBO` 视为已定义，其余（`RPI`、`WIN32`、`DEMO_MODE`、`ANDROID`……）视为未定义。**只移植展开后剩下的分支。**
记下：基类、字段（含 C++ 声明顺序）、构造函数初始化列表、每个虚函数、静态成员、文件内 static 函数与 static 局部变量。

## 2. 查依赖
对每个用到的类：`rg -n "export (abstract )?class 名字|export interface 名字" packages`。
- 已移植：直接 import（用具体路径，不要经 `index.ts` 绕回自己的包，避免循环）。
- 未移植、但只用到几个成员：写前向声明文件（`// FORWARD-DECL(名字)`，只列用到的成员），以后整体替换。
- 未移植、且属于计划外系统（网络、声音、粒子、生物 AI、模型……）：这几句标 `DEFERRED(系统名)`。

## 3. 写 TS
- 小于 ~150 行：照 C++ 逐句手写。
- 大类：`tools/porting/README.md` 里的“类转写流程”（cls2ts.py → post.py → 人工核对）。草稿**只是起点**，一定要逐函数对照 C++ 改。
- 文件头写：`1:1 移植自 src/…/Foo.h 与 Foo.cpp（S?? 阶段 ?，部分移植）`，并列出“部分”暂缓了什么、ADAPTED 了什么、R10 改了哪些名字。

## 4. 逐项核对语言差异
打开 `PITFALLS.md`，对照这次的代码逐条过一遍（不是看一眼就算）。必跑：
```bash
python tools/porting/divs.py packages/…/Foo.ts        # 每一处除法：C++ 两边都是整数 → Math.trunc
python tools/porting/members.py /tmp/m.txt packages/…/Base.ts packages/…/Foo.ts
python tools/porting/shadow.py packages/…/Foo.ts /tmp/m.txt   # 漏加的 this.
```

## 5. 接线
`rg -n "DEFERRED\(.*Foo|OMIT\(.*Foo|FORWARD-DECL\(Foo" packages` 找到所有等它的地方，换成真实调用。前向声明文件要被正身整体替换（同名同路径）。

## 6. 验证（三层）
1. `pnpm typecheck`、`pnpm test`。
2. 有数值、随机数、字节格式、碰撞、文字宽度之类可以精确比较的：写黄金样本（skill：golden-sample）。
3. 有画面的：写或更新一个场景，跑 `node tools/verify/smoke.mjs …`（skill：browser-verify），**用图片查看工具打开截图确认**画面对，不要只看退出码。

## 7. 收尾
- `pnpm ledger`：DEFERRED/OMIT 条数应该下降（或者说明为什么上升）。
- `git add -A && git commit -m "S?? …：移植 Foo（暂缓 …）"`。
- 在任务单里把这一步标成完成，写下遇到的新坑（如果是通用的，补进 PITFALLS.md）。
