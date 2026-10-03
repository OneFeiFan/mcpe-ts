---
description: 让 port-reviewer 子代理逐函数对照 C++ 审查一个已移植的 TS 文件
argument-hint: <TS 文件路径> <C++ 相对路径>
---
使用 port-reviewer 子代理审查：$ARGUMENTS
要求它输出“问题清单”（文件:行号、C++ 原句、TS 现状、应改成什么、属于 PITFALLS 哪一条），然后由你逐条修正并重新验证。
