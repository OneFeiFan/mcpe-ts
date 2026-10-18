# 逐模块人工审核记录

**审核方法与规则见 `docs/全量审核方案.md`（严格版，继续审核前必读）；文件级进度见 [待审清单.md](待审清单.md)。**

全量审核（2026-10 起）：每个 TS 函数与对应的 C++ 函数并排逐行对照，按 `docs/移植规范.md` 与 `docs/经验教训.md` 的检查清单过一遍：

1. 控制流：分支、提前返回、循环边界、调用顺序；
2. 数值：`f` 后缀、float 形参（实参先转 float）、整数截断、整数除法、32 位回绕、C 库函数与 `Mth` 函数；
3. 按值 / 按引用；
4. 虚函数：调用点的静态类型、非虚函数、构造期间的调用、遮蔽；
5. 重载与默认参数；
6. 容器：有序遍历、边遍历边删、`set` / `map` 语义；
7. 随机数：哪个随机源、取数顺序；
8. 未初始化字段；DEFERRED / OMIT 是否仍成立；注释与文件头是否准确。

每个函数一个结论：**一致**、**怪癖保留**（原版的奇怪行为照抄）、**已修**（移植错误，编号写进提交说明）、**原版 bug**（登记，以后再定）、**ADAPTED**（有意偏离，理由在代码里）。

| 批次 | 模块                          | 记录                                         | 状态   |
| ---- | ----------------------------- | -------------------------------------------- | ------ |
| 1    | util                          | [util.md](util.md)                           | 完成   |
| 1    | nbt、platform                 | [nbt.md](nbt.md)、[platform.md](platform.md) | 完成   |
| 2    | world/phys（含实体移动部分）  | [world-phys.md](world-phys.md)               | 进行中 |
| 2    | world/entity（Entity）        | [entity.md](entity.md)                       | 完成   |
| 2    | world/entity（小文件组）      | [entity-misc.md](entity-misc.md)             | 完成   |
| 2    | world/entity（HangingEntity） | [entity-hanging.md](entity-hanging.md)       | 完成   |
| 2    | world/entity（Mob 第 1 组）   | [mob.md](mob.md)                             | 进行中 |
