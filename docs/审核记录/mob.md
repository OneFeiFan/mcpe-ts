# world/entity：Mob（第 1 组）

对照：`src/world/entity/Mob.h / .cpp` ↔ `packages/world/src/entity/Mob.ts`（1294 行，102 个函数）。
文件大，按函数组分几次提交。本组覆盖：构造函数、`_init`/`reset`、存档、头文件里的
inline getter/setter（工作表第 1、2、33、34、40、41、66/67、87–101 行）。

## 结论表

| 函数                                        | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mob(Level*)`                               | **已修 W12**：`runSpeed=0.7f`、`walkingSpeed=0.1f`、`flyingSpeed=0.02f`、`footSize=0.5f` 补 `f()`；`rotA = (float)(Mth::random()+1) * 0.01f`、`timeOffs = (float)Mth::random()*12398`、`yRot = (float)(Mth::random()*Mth::PI*2)` 按 C++ 分步舍入；构造期的 `setPos` 改为 `Entity.prototype.setPos.call`（C++ 虚函数在 Mob 构造期间只到 Entity 版本）。其余初始化顺序、`defineByte/defineShort`、`health = getMaxHealth()`、cape 字段赋值一致 |
| `~Mob()`                                    | **OMIT(Mob)**：C++ 函数体只有一行被注释掉的 LOGI；JS 由 GC 接管（本轮补登记）                                                                                                                                                                                                                                                                                                                                                                |
| `_init()`                                   | 一致（13 个 float 清零、`xxa/yya/yRotA`、`health=10`、`lastHealth=20`）                                                                                                                                                                                                                                                                                                                                                                      |
| `reset()`                                   | 一致（`super.reset()` 后静态调 `Mob.prototype._init`，C++ 的 `_init` 非虚）                                                                                                                                                                                                                                                                                                                                                                  |
| `addAdditonalSaveData(CompoundTag*)`        | 一致（Health/HurtTime/DeathTime/AttackTime 四个 short，`(short)` 截断用 `<<16>>16`）                                                                                                                                                                                                                                                                                                                                                         |
| `readAdditionalSaveData(CompoundTag*)`      | 一致（四个 `getShort`）                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `getEntityData()`（const / 非 const）       | 一致（TS 合并成一个，返回 `entityData`；基类签名允许 null）                                                                                                                                                                                                                                                                                                                                                                                  |
| `getItemInHandIcon(ItemInstance*, int)`     | 一致（`item.getIcon()`，layer 未用）                                                                                                                                                                                                                                                                                                                                                                                                         |
| `getMaxHealth()`                            | 一致（返回 10）                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `isMob()` / `isBaby()`                      | 一致（true / false）                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `getCarriedItem()` / `getUseItemDuration()` | 一致（null / 0）                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `hasDied()`                                 | 一致（`health <= 0`）                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `setxxa(float)` / `setyya(float)`           | **已修 W12**：形参先转 float（C++ 在调用边界就舍入）                                                                                                                                                                                                                                                                                                                                                                                         |
| `getCapeX/Y/Z()`、`getCapePrevX/Y/Z()`      | 一致（C++ double 字段 → TS number）                                                                                                                                                                                                                                                                                                                                                                                                          |

第 1–4 组已覆盖工作表的全部 101 行；Mob 审核完成（W12–W15）。

# 第 2 组（W13：tick / baseTick / AI 调度）

## 结论表

| 函数                                 | 结论                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getVoicePitch()`                    | **已修 W13**：`(rand - rand) * 0.2f + 1.0f/1.5f` 按 float 分步舍入（含幼年体分支）                                                                                                                                                                                                                                                                                                      |
| `getAmbientSoundInterval()`          | 一致（`8 * TicksPerSecond`）                                                                                                                                                                                                                                                                                                                                                            |
| `playAmbientSound()`                 | 一致（NULL 时不播）                                                                                                                                                                                                                                                                                                                                                                     |
| `baseTick()`                         | **已修 W13**：水下气泡的 `xo/yo/zo` 与三个坐标、死亡爆炸的 `xa/ya/za` 与粒子坐标、位置同步的 `0.1f/0.05f` 阈值、速度同步的 `max=0.02f` 与 `diff` 全部按 float 分步。其余（计时器、ONFIRE、环境音、hurt 调用顺序、`deathTime > 20`）一致                                                                                                                                                 |
| `spawnAnim()`                        | 一致（C++ 函数体整体被注释，空实现）                                                                                                                                                                                                                                                                                                                                                    |
| `lerpTo(...)`                        | **已修 W13**：`lx/ly/lz/lyr/lxr` 五个赋值先转 float（`ly` 的 `y + heightOffset` 也先算再舍入）                                                                                                                                                                                                                                                                                          |
| `superTick()`                        | 一致（纯委托 `super.tick()`）                                                                                                                                                                                                                                                                                                                                                           |
| `tick()`                             | **已修 W13**：lSteps 插值的 `xt/yt/zt`、`yrd` 归一化与 `yRot/xRot` 增量、`xd/zd`、`sideDist` 与 0.05f 比较、`walkSpeed = sideDist*3`、`yBodyRotT = atan2*RADDEG - 90`、`run` 的 0.3f、`yBodyRot(D)`、`headDiff` 及其平方比较/0.2f 修正、O 字段归一化的 float 差值、`animStep` 累加都逐步舍入；cape 的插值保持 double（C++ 是 double）。arrow 计数、`aiStep/updateWalkAnim` 调用顺序一致 |
| `setSize(float, float)`              | 一致（纯委托，C++ 也是空壳）                                                                                                                                                                                                                                                                                                                                                            |
| `getSoundVolume()`                   | 一致（返回 1）                                                                                                                                                                                                                                                                                                                                                                          |
| `getAmbientSound()`                  | 一致（NULL）                                                                                                                                                                                                                                                                                                                                                                            |
| `getHurtSound()` / `getDeathSound()` | 一致（都返回 `"random.hurt"`）                                                                                                                                                                                                                                                                                                                                                          |
| `updateWalkAnim()`                   | **已修 W13**：`xxd/zzd`、`wst = sqrt(...)*4`、`walkAnimSpeed += (wst-speed)*0.4f`、`walkAnimPos += speed` 全部按 float                                                                                                                                                                                                                                                                  |
| `aiStep()`                           | **已修 W13**：水中/岩浆的 `yd += 0.04f`、`xxa/yya *= 0.98f`、`yRotA *= 0.9f`、`walkingSpeed/flyingSpeed *= getWalkingSpeedModifier()` 按 float；AI 分派、travel 前后恢复、push 循环一致                                                                                                                                                                                                 |
| `updateAi()`                         | 一致（G16-2 已按 float 修过，本轮复核无新增）                                                                                                                                                                                                                                                                                                                                           |
| `newServerAiStep()`                  | 一致（checkDespawn/sensing/每 5 tick 选择器/navigation/controls 顺序与条件）                                                                                                                                                                                                                                                                                                            |
| `isImmobile()`                       | 一致（`hasDied()`）                                                                                                                                                                                                                                                                                                                                                                     |
| `jumpFromGround()`                   | **已修 W13**：`yd = 0.42f`                                                                                                                                                                                                                                                                                                                                                              |
| `removeWhenFarAway()`                | 一致（true）                                                                                                                                                                                                                                                                                                                                                                            |
| `getMaxHeadXRot()`                   | 一致（10）                                                                                                                                                                                                                                                                                                                                                                              |

## W13 的测试

`tests/unit/world/mob-audit-2.test.ts` 10 条，修复前 10 条全红：

1. `tick` 的 lSteps 插值/朝向（隔离 baseTick/aiStep/updateWalkAnim，截获 `setPos/setRot` 实参）。
2. `tick` 的 `run/animStep/yBodyRot`。
3. `updateWalkAnim`。
4. `aiStep` 的加速度、输入衰减、速度倍率（截获 travel 时的速度）。
5. `lerpTo`。
6. `jumpFromGround`。
7. `getVoicePitch`（含幼年体）。
8. `baseTick` 气泡坐标（假 Level 捕获 `addParticle`）。
9. `baseTick` 死亡粒子坐标与初速。
10. `baseTick` 位置同步阈值：`abs(x - sentX)` 恰好等于 `0.1f` 时不发送。

## 验证

- `pnpm check`：类型 ✓、测试 **132 文件 / 1409 条** ✓、台账 **153** ✓。
- 台账无变化：本组没有新增/删除 DEFERRED/OMIT/ADAPTED 注释。
- 首次全量跑 `tests/unit/client/tallgrass-offset.test.ts` 超时（既有的并发抖动，单跑约 2s），
  重跑通过；未改该测试。
- prettier ✓。

# 第 3 组（W14：移动 / 伤害 / 护甲）

## 结论表

| 函数                                                                              | 结论                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getWalkingSpeedModifier()`                                                       | **已修 W14**：`float speed = 0.7f`（旧 TS 是 double 0.7）                                                                                                                                                                              |
| `canSee(Entity*)`                                                                 | **已修 W14**：两个视点高度 `y + getHeadHeight()` 先按 float 相加再传给 `Vec3`（`Vec3` 构造自身也会舍入）                                                                                                                               |
| `getTexture()` / `setTextureName()` / `getCapeTexture()` / `setCapeTextureName()` | 一致                                                                                                                                                                                                                                   |
| `isPickable()` / `isPushable()`                                                   | 一致（`!removed`）                                                                                                                                                                                                                     |
| `getHeadHeight()`                                                                 | **已修 W14**：`bbHeight * 0.85f` 按 float                                                                                                                                                                                              |
| `isOnFire()`                                                                      | 一致（`onFire > 0                                                                                                                                                                                                                      |     | sharedFlag`） |
| `heal(int)`                                                                       | **已修 W14**：`invulnerableTime = invulnerableDuration / 2` 是 C++ int 除法，TS 用 `Math.trunc`（旧实现会存 3.5）                                                                                                                      |
| `hurt(Entity*, int)`                                                              | **已修 W14**：`xd/zd`、重随机循环的 `0.0001f/0.01f`、`hurtDir = (float)(atan2*RADDEG) - yRot`、无来源分支的 180f 都按 float。其余（`walkAnimSpeed=1.5f`、`invulnerableDuration/2.0f`、`lastHurt`、声音/死亡顺序）一致                  |
| `actuallyHurt(int)`                                                               | 一致（`bypassArmor` 分支 + int 扣血）                                                                                                                                                                                                  |
| `knockback(Entity*, int, float, float)`                                           | **已修 W14**：形参先转 float；`invSqrt` 的内层乘加、`pow=0.4f`、三轴减半、击退增量与 `yd` 上限都逐步 float                                                                                                                             |
| `die(Entity*)`                                                                    | 一致（`deathScore`、非客户端、非幼年体掉落、DEATH 事件）                                                                                                                                                                               |
| `dropDeathLoot()` / `getDeathLoot()`                                              | 一致（`nextInt(3)` 次、每次 1 个；基类返回 0）                                                                                                                                                                                         |
| `causeFallDamage(float)`                                                          | **已修 W14**：形参先转 float；`ceil(distance - 3)`、落点 `y - 0.2f - heightOffset`、`0.5f/0.75f` 音量音高按 float                                                                                                                      |
| `travel(float, float)`                                                            | **已修 W14**：形参转 float；水中/岩浆的 0.02f、0.8f/0.5f 阻尼、上浮判定的 `yd+0.6f-y+yo`、0.3f；地面摩擦 `0.6f*0.91f`、`friction2` 的六因子分子与三次分母、`walkingSpeed*friction2`、梯子 -0.15f/0.2f、末尾 0.08f/0.98f 全部逐步 float |
| `onLadder()`                                                                      | 一致（两格梯子判定，`Mth.floor` 已含 float）                                                                                                                                                                                           |
| `isShootable()`                                                                   | 一致（true）                                                                                                                                                                                                                           |
| `animateHurt()`                                                                   | 一致（`hurtTime = hurtDuration = 10`、`hurtDir = 0`）                                                                                                                                                                                  |
| `isAlive()`                                                                       | 一致（`!removed && health > 0`）                                                                                                                                                                                                       |
| `isWaterMob()`                                                                    | 一致（false）                                                                                                                                                                                                                          |
| `getDamageAfterArmorAbsorb(int)`                                                  | **已修 W14**：`v / 25` 是 C++ int 除法，TS 用 `Math.trunc`（旧实现返回 10.28）                                                                                                                                                         |
| `getArmorValue()`                                                                 | 一致（C++ 函数体整段被注释，返回 0）                                                                                                                                                                                                   |
| `hurtArmor(int)`                                                                  | 一致（空实现）                                                                                                                                                                                                                         |

## W14 的测试

`tests/unit/world/mob-audit-3.test.ts` 10 条，修复前 10 条全红：速度修正/头高、heal 与护甲吸收的整数除法、
knockback、hurt 的 hurtDir、causeFallDamage 的 float 形参、travel 地面/水中、canSee 视点高度。

另外更新了 `tests/unit/world/pathfindermob.test.ts` 的既有断言：原注释已注明它断的是
“TS 裸字面量 0.7 的 double”，属于审核方案 §6 允许的“期望值来自 TS 而非 C++”情形；现改为 `f(0.7)`。

## 验证

- `pnpm check`：类型 ✓、测试 **133 文件 / 1419 条** ✓、台账 **153** ✓。
- 台账无变化：本组没有新增/删除 DEFERRED/OMIT/ADAPTED 注释。
- 全量跑再次遇到 `tallgrass-offset` 并发超时，重跑通过；未改该测试。
- prettier ✓。

# 第 4 组（W15：视角 / 拾取 / 巡查 / getter）

## 结论表

| 函数                                                  | 结论                                                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lookAt(Entity*, float, float)`                       | **已修 W15**：形参转 float；`xd/zd`、`yd = (bb.y0+bb.y1)/2 - (y+headHeight)`、`sd`、`(float)(atan2*180/PI)-90` 与 `(float)(atan2*180/PI)` 全部逐步 float |
| `isLookingAtAnEntity()`                               | 一致（`lookingAtId != 0`）                                                                                                                               |
| `rotlerp(float, float, float)`                        | **已修 W15**：形参/差值/±360 归一化/返回都按 float                                                                                                       |
| `beforeRemove()`                                      | 一致（空实现）                                                                                                                                           |
| `canSpawn()`                                          | 一致（`isUnobstructed && getCubes==0 && !containsAnyLiquid`）                                                                                            |
| `outOfWorld()`                                        | 一致（`hurt(4)` 后若血没变再 `actuallyHurt(4)`）                                                                                                         |
| `getAttackAnim(float)`                                | **已修 W15**：`diff`、`+1`、`oAttackAnim + diff*a` 按 float                                                                                              |
| `getPos(float)`                                       | **已修 W15**：`a==1` 直接返回；否则三轴 `xo + (x-xo)*a` 逐步 float                                                                                       |
| `getLookAngle()`                                      | 一致（`getViewVector(1)`）                                                                                                                               |
| `getViewVector(float)`                                | **已修 W15**：`a` 转 float；插值三轴逐步 float；`-yRot*DEGRAD-PI`、`-xRot*DEGRAD` 先按 float 算再交给查表 `Mth.cos/sin`                                  |
| `pick(float, float)`                                  | **已修 W15**：`range/a` 转 float；终点 `from + view * range` 的乘、加分别 float                                                                          |
| `getMaxSpawnClusterSize()`                            | 一致（4）                                                                                                                                                |
| `interpolateOnly()`                                   | 一致（`level.isClientSide`）                                                                                                                             |
| `handleEntityEvent(char)`                             | 一致（HURT/DEATH 分支与 `super` 委托；`1.5f` 可精确表示）                                                                                                |
| `getMoveControl()` / `getJumpControl()`               | 一致（直接返回字段）                                                                                                                                     |
| `setYya(float)`                                       | **已修 W15**：形参先转 float                                                                                                                             |
| `getSpeed()`                                          | 一致                                                                                                                                                     |
| `setSpeed(float)`                                     | **已修 W15**：形参转 float，同时写 `speed` 与 `yya`                                                                                                      |
| `setJumping(bool)`                                    | 一致                                                                                                                                                     |
| `useNewAi()`                                          | 一致（false）                                                                                                                                            |
| `checkDespawn()`                                      | 一致（取最近玩家后转调）                                                                                                                                 |
| `checkDespawn(Mob*)`                                  | **已修 W15**：`xd/yd/zd` 与距离平方 `sd` 按 float；96²/32² 阈值比较随之精确                                                                              |
| `getSharedFlag(int)` / `setSharedFlag(int, bool)`     | 一致（SynchedEntityData 的 set/clear/get）                                                                                                               |
| `updateAttackAnim()`                                  | 一致（`swingTime` 只有 0..7，`/8` 可被 float 精确表示，无舍入差异）                                                                                      |
| `swing()`                                             | 一致（`!swinging                                                                                                                                         |     | swingTime>=3 |     | swingTime<0` 时置 -1） |
| `isSneaking()` / `isSleeping()` / `setSneaking(bool)` | 一致（共享标志 / false / 设置标志）                                                                                                                      |

## W15 的测试

`tests/unit/world/mob-audit-4.test.ts` 8 条。用 `git stash` 临时撤掉 Mob.ts 的修复后 **8 条全红**，
恢复修复后全绿。其中：

- `pick` 选了一组能让“先乘后加”和“double 一次算完”结果不同的 range；
- `checkDespawn` 用 `y = 1e-4` 让距离平方在 double 里略大于 96²/32²、在 float 里恰好等于阈值；
- `getViewVector` 选了一组让 float 分步夹角与 double 夹角落在不同查表项的角度；
- 测试文件里调用 `Mth.initMth()`（应用启动时会调，单测默认是零表）。

## 验证

- `pnpm check`：类型 ✓、测试 **134 文件 / 1427 条** ✓、台账 **153** ✓。
- 台账无变化：本组没有新增/删除 DEFERRED/OMIT/ADAPTED 注释。
- prettier ✓。
