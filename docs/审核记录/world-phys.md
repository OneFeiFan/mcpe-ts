# world：物理基础（Vec3、AABB）与实体移动

对照：`src/world/phys/Vec3.h`、`AABB.h`，`src/world/entity/Entity.cpp` 的 `move`，`ItemEntity::tick`，`Throwable::shoot`。2026-10 全量审核（第 2 批第一部分）。

## Vec3

**已修 W1**：以前是全 double 的改写版，与 C++ 有四处不同，整体重写：

1. C++ 的三个分量是 float，每一步运算都舍入；
2. C++ 的构造函数把 `-0` 变成 `+0`（`if (x == -0.0f) x = 0.0f;`），经由构造函数得到的结果（add、sub、multiply、normalized、cross、negated、lerp、fromPolarXY）都带这一步，`set` 与就地修改的方法不带；
3. 不带 `Mth::` 的 `sqrt`、`sin`、`cos` 是 C 库的 double 版本，结果存回 float；
4. 以前每个实例还带 9 个缓存三角函数的字段，去掉（Vec3 到处新建，多出的字段只增加内存）。

逐函数：构造、set、add / addSelf、sub / subSelf、multiply / multiplySelf（C++ 的 `*`、`*=`）、normalized（阈值 0.0001f）、dot、cross、negate / negated、distanceTo、distanceToSqr、length、clipX / Y / Z（阈值 0.0000001f）、toString（流的默认格式）、lerp、xRot / yRot / zRot、fromPolarXY——全部按 C++ 重写。

## AABB

**已修 W2**：以前全部按 double 计算。改为六个边界是 float、形参先转 float、每一步 f()：构造、set、expand、grow、cloneMove、clipX/Y/ZCollide、intersects、intersectsInner、move、contains、getSize、shrink、copy、toString。`clip` 改回 C++ 的写法：用 Vec3.clipX / Y / Z 求六个交点，按到起点的距离取最近的一个（以前是内联的 double 版本）；HitResult 里存的是交点的拷贝（不经过把 -0 变成 +0 的构造函数）。新增 `setFrom`（C++ 的 `set(const AABB&)`）与 `intersectsXYZ`（6 个参数的 `intersects` 重载）。

## Entity::move

**已修 W3**：

- 按 float 逐步运算（形参先转 float；位置、`ySlideOffset`、`walkDist` 都是 float）。
- **潜行分支的移植错误**：C++ 在三个 `while` 循环里都会把 `xaOrg` / `zaOrg` 更新成收缩后的值；TS 写成了 `const`，还在注释里说“C++ 没有重新赋值，这是原版的 bug”——是读错了。后果：潜行走到方块边缘时被误判为水平碰撞，水平速度被清零。

## ItemEntity::tick、Tile.friction

**已修 W4**：重力、岩浆里的弹跳、摩擦、落地反弹按 float 运算；`Tile.friction` 的默认值 0.6f 与冰的 0.98f 存成 float（C++ 是 float 字段）。

结果：**G12-2 碰撞与运动轨迹黄金样本从“误差小于 1e-4”收紧为逐位一致**，8 条轨迹（落到半砖、冰面滑行、撞墙、入水、上楼梯、撞栅栏、蜘蛛网、对角墙角）每一刻的位置、速度、着地与碰撞标志都与 C++ 逐位相同。

## Throwable::shoot、Arrow、HangingEntity

**已修 W5**：同一类错误——**加法的结合顺序**。C++ 的 `a + b + c` 从左到右算（先 `a + b`），float 下与 `a + (b + c)` 可能差末位。`Throwable::shoot` 的长度与随机散布、`Arrow` 的三处速度长度、`HangingEntity` 的两处判断以前写成右结合，已改正；`Throwable::shoot` 的形参也补上先转 float。全仓库已没有这种写法。
