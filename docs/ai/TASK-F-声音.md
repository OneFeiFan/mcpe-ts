# 任务单 F：声音系统

把 `src/client/sound/` 搬过来并接上线：走路有脚步声、挖方块有敲击声、受伤有叫声、
点按钮"咔"一声。

> **这一份和任务单 D/E 有一个根本区别：参考 C++ 的网页版构建里根本没有音频后端。**
> `SoundEngine.h` 的三分支（`#if ANDROID…SL / #elif __APPLE__||DESKTOP…AL / #else SoundSystem`）
> 在网页版落到 `#else` —— 就是那个 8 个虚函数全空、**放不出任何声音**的基类。
> 所以没有"原版网页版听感"可对照，判据只能是：
> **照 `SoundEngine.cpp` 的逻辑复刻 + 照 `SoundSystemAL.cpp`（Android/iOS/桌面那条路）复刻后端语义 + 浏览器实测**。

---

## F0 范围（用户 2026-10-04 拍板）

### 三个已定的事

1. **音源走 `.pcm`**（不是 108 个 `.m4a`）—— 逐字节等于 C++ 手里那份数据，绕开浏览器对 AAC 的解码差异。
2. **距离衰减两层都复刻** —— 手算 `SoundEngine` 那层，再用 `PannerNode` 复刻 OpenAL 那层。
3. **二进制打成一个包** —— `sounds.bin` + `sounds.json` 索引，一次请求拿全。

### 做什么

- `SoundDesc` / `SoundRepository` / `SoundEngine`（含 100 条名字表）
- `SoundSystem` 抽象（8 个方法）+ Web Audio 后端
- `.pcm` → 二进制的转换脚本与产物
- 接线：`Minecraft`、`GameMode`、`SurvivalMode`、`Screen`、`TouchIngameBlockSelectionScreen`

### 不做什么（明确留下，不是忘了）

| 不做 | 为什么 |
|---|---|
| **背景音乐** | C++ 里没有 BGM 播放器（`Options` 有 `OPTIONS_MUSIC_VOLUME`，但没有一处读它来放歌）。`init()` 里读 music volume 只为判断"要不要 `loadLibrary()`" |
| `SoundSystemSL`（Android OpenSL ES 后端） | 平台特有，浏览器上没有对应物 |
| `SoundSystemAL` 的文字移植 | 只作为**语义参考**（距离模型常数照抄），不逐行搬 |
| 3 个死素材 `chicken1` / `chickenplop` / `skeletondeath` | 名字表里没有它们（见下）—— **但仍会一起打进包**，因为"全搬"比"挑着搬"更省心，也只多 105 KB |
| `SoundEngine::_pp(文件名)` 那套 | 那是 `SoundEngine.mm`（iOS）用文件名**运行时加载**的写法。网页版走 `.cpp`，用的是编译进二进制的 `SA_*` 全局。两者名字表**基本一致但不完全相同**（`.cpp` 100 条 / 42 名字，`.mm` 98 条 / 41 名字）—— 以 `.cpp` 为准 |

---

## F0.5 依赖清单（实测，不是估的）

### 素材：`.pcm` 的真实格式（⚠ 和计划里写的**不一样**）

计划里写的是"裸 PCM16 + 16 字节头"。**错了**：

```
$ head -c 32 $REF/src/client/sound/data/bow.pcm
unsigned char PCM_bow[40156] = {
1,0,0,0,2,0,0,0,68,172,0,0,102,78,0,0,3,0,2,0,2,0,2,0,2,0,3,0,2,0,2,0,
```

**磁盘上是 C 源码数组**，要先"编译"（解析）才能拿到字节。实测：

| 项 | 实测值 |
|---|---|
| 文件数 | **103** |
| 磁盘体积 | 23,068,218 B ≈ **23.07 MB**（是文本，每个字节平均写 3.6 个字符） |
| 解码后载荷 | **6,090,080 B = 6.09 MB**（这就是"进仓库 6.1 MB"那个数） |
| 载荷格式 | 16 字节**小端 int32 × 4** 头 + PCM16 数据 |
| 头的四个字段 | `channels` / `byteWidth` / `frameRate` / `numFrames`，正好是 `SoundDesc(char*)` 构造函数要的 |
| **全部自洽** | **103 / 103 逐个校验通过**：声明长度 = 数值个数 = `16 + channels×byteWidth×numFrames` |
| 数值写法 | **17 个十六进制**（`0x1,0x0,…`）、**86 个十进制**（`1,0,0,…`）—— 解析器两种都要认 |
| 脏数据 | `pop2.pcm` 的 `};` **后面还粘着一行 `SoundDesc SA_pop2((char*)PCM_pop2);`** —— 解析器只能取花括号**内**的内容 |
| 采样率分布 | 101 个 `(1ch, 2B, 44100)`；`click.pcm` 是 **2ch**；`splash.pcm` 是 **11025 Hz** |

### 名字表（`SoundEngine.cpp` 的 `init`）

| 项 | 实测值 |
|---|---|
| `sounds.add` 条数 | **100** |
| 不同的游戏内名字 | **42**（`step.stone` / `random.glass` / `mob.zombie` 这种一个名字挂多个变体） |
| 用到的 `.pcm` 文件 | **100** 个 |
| **没有任何一条用到的文件** | `chicken1`、`chickenplop`、`skeletondeath`（磁盘 379 KB，解码后约 105 KB）—— 死素材 |
| `Sound.h` 里 `extern` 的 `SA_*` | 102 条；`Sound.cpp` 里定义了 101 条 |
| `Sound.cpp` 的 `#include` | 103 条（`Sound.h` + 102 个 `data/*.pcm`） |

### 已经在等着的接线点

| 位置 | 现状 |
|---|---|
| `packages/client/src/Minecraft.ts:111-112` | `soundEngine: unknown = null`（`FORWARD-DECL(SoundEngine)`） |
| `Minecraft.ts:165` | `// DEFERRED(Sound): soundEngine = new SoundEngine(20.0f); soundEngine->init(this, &options);` |
| `Minecraft.ts:516` | `// DEFERRED(Sound): soundEngine->update(player, timer.a);` |
| `GameMode.ts:55` / `SurvivalMode.ts:60` / `Screen.ts:191` / `TouchIngameBlockSelectionScreen.ts:154` | 四条真调用点的 `DEFERRED(Sound)` |
| `Minecraft.ts:165` / `:516` | `new SoundEngine(20.0f)` + `init`、`update(player, timer.a)` |
| **`Minecraft.ts:933-934`** | `OMIT(Sound): audioEngineOn()` / `audioEngineOff()`（`Minecraft.cpp:1622/1627`）—— **F6 要接上** |
| **`LevelRenderer.ts:928-929`** | `OMIT(Sound): playSound(name, x, y, z, volume, pitch)` ×2（`LevelRenderer.cpp:1453`）—— **F6 要接上**，见坑六 |
| **`LevelRenderer.ts:1050`** | `OMIT(Sound): levelEvent(player, type, x, y, z, data)`（`LevelRenderer.cpp:1669`） |
| `packages/world` | `Level.playSound` 已经是**真实现**（转发给 listener），只是客户端没人接 |
| `packages/client/src/Options.ts:271` | `getProgressValue(OptionId.OPTIONS_SOUND_VOLUME)` **已有** |

标记条数（**按台账那条严格正则数的**：`//\s*(DEFERRED|OMIT|…)\(系统\):`）：
**`DEFERRED(Sound)` 6 条 + `OMIT(Sound)` 5 条 = 11 条**。
⚠ 宽松 `grep "DEFERRED(Sound)\|OMIT(Sound)"` 会数出 15 —— 多出来的 4 条是正文里提到这些标记的说明文字。

### 网页端素材怎么服务（照图片那套）

图片在 `apps/web/public/images/`，由 `tools/sync-images.mjs` 生成 `apps/web/src/imageManifest.ts`；
启动只预加载 `apps/web/src/assets.ts` 里的 `PRELOAD` 那几十张。
**声音照这个模式**：`apps/web/public/sounds/sounds.bin` + `sounds.json`，由 `tools/sound/build.mjs` 生成。
`public/` 不在 `.gitignore` 里，产物会进仓库。

---

## 规划时实测出来的六个坑（决定了怎么写）

### 一、`.pcm` 是**C 源码**，得写解析器（三件事都要处理）

- 认两种数值写法（十进制 / 十六进制）；
- 只取**第一个 `{` 到第一个 `}`**（`pop2.pcm` 尾巴上有脏数据）；
- 解析完必须**自校验**：数值个数 == 声明长度 == `16 + ch×bw×nf`，任一不成立就报错退出。
  这条自校验是整个 F2 的判据 —— 103 个文件全过才算数（我已经用一版原型脚本验过一次，103/103 通过）。

### 二、⚠ listener 永远在原点，`playAt` 收的是**相对坐标**

`SoundEngine::update()` 里只有一句：

```cpp
soundSystem.setListenerAngle(_yRot);
```

**从来没有 `setListenerPos`**。而 `play()` 传给后端的是 `x-_x, y-_y, z-_z`（相对玩家）。
OpenAL 那边 `alListener` 的初始位置就是 `(0,0,0)`，所以两边**刚好自洽**。

**浏览器里必须复刻这个语义**：`PannerNode` / `AudioListener` 都放在原点，
声源 `positionX/Y/Z` 设成传进来的相对坐标，`AudioListener` 只更新朝向（`_yRot`）。
如果"顺手"把 listener 挪到玩家世界坐标，声音会全部错位。

### 三、距离衰减是**两层叠乘**，第二层的常数在另一个文件里

第一层（`SoundEngine::_getVolumeMult`，`maxDistance = 20.0f` 来自 `Minecraft.cpp:199`）：

```cpp
const float out = Mth::clamp(1.1f - dist * _invMaxDistance, -1.0f, 1.0f);   // _invMaxDistance = 1/20
```

第二层（`SoundSystemAL.cpp:65,71-73`，OpenAL 的 `AL_LINEAR_DISTANCE_CLAMPED`）：

```cpp
alSourcef(sourceID, AL_REFERENCE_DISTANCE, 5.0f);
alSourcef(sourceID, AL_MAX_DISTANCE,       16.0f);
alSourcef(sourceID, AL_ROLLOFF_FACTOR,      6.0f);
```

`AL_LINEAR_DISTANCE_CLAMPED` 的公式是
`gain = clamp(1 - rolloff × (d - ref) / (max - ref), 0, 1)`，所以第二层是
`clamp(1 - 6×(d-5)/11, 0, 1)`：**d ≤ 5 不衰减，d ≥ 16 之后归零**。

两层叠乘之后：世界坐标距离超过约 16 格就听不见了（第一层还留了 1.1 - 16/20 = 0.3，
第二层已经归零）。**只有近处的声音才有方向感** —— 这是原版就有的效果，别"修"。

### 四、`play()` 里有一段**算完从不使用**的死代码

```cpp
float dist = SOUND_DISTANCE;      // SOUND_DISTANCE = 16
if (volume > 1) dist *= volume;   // volume 上一行才被 clamp 到 [0,1]，所以这个 if 永远为假
soundSystem.playAt(sound, x-_x, y-_y, z-_z, volume, pitch);
```

`dist` 声明之后**再也没被读过**（`playAt` 收的是 x/y/z，不是 dist）。
而且 `volume` 在上一行刚被 `clamp(…, 0.0f, 1.0f)`，`volume > 1` 恒为假。
**照抄这两句 + 注释说明它是死代码**，不要"顺手删"。

### 五、`SOUND_DISTANCE = 16` 那道剔除在 **`LevelRenderer`**，不在 `SoundEngine`

坑四那两句是**残骸**，真正生效的是同一个文件另一处：

```cpp
// LevelRenderer.cpp:1453
void LevelRenderer::playSound(const std::string& name, float x, float y, float z, float volume, float pitch) {
	// @todo: deny sounds here if sound is off (rather than waiting 'til SoundEngine)
	float dd = 16;
    if (volume > 1) dd *= volume;
    if (mc->cameraTargetPlayer != NULL && mc->cameraTargetPlayer->distanceToSqr(x, y, z) < dd * dd) {
        mc->soundEngine->play(name, x, y, z, volume, pitch);
    }
}
```

**这里 `dd` 才真的被用到**（`distanceToSqr` 是平方距离，所以门槛是 `dd²`）。
作者显然是从这里复制到 `SoundEngine::play` 的，在那边忘了删。

**整条链是**：`Level.playSound`（world，已实现）→ `LevelListener.playSound` → **`LevelRenderer.playSound`（16 格剔除，待移植）**
→ `SoundEngine.play`（音量两层衰减）→ `SoundSystem.playAt` → 后端。

⚠ 也就是说 **16 格的"硬剔除"和 `SoundEngine` 的"软衰减"是两道不同的闸**：前者过不去就**根本不调**，
后者只是把音量压小。F6 两道都要接，F7 的"远处没记录"断言测的是**前一道**。

### 六、声音没法截图 —— 验收手段必须换

粒子那套"截图打开看"对声音完全没用。而且：

1. 无头浏览器里 `AudioContext` 初始是 `suspended`（自动播放策略），**没有用户手势就不出声**；
2. 就算出声了，截图也证明不了。

**F7 的验收办法**：给后端加一份**可读的播放调用记录**（`plays: [{name, x, y, z, volume, pitch}]`），
浏览器场景里断言这条记录 —— 断言的判据是"**调用了、参数对**"，不是"我听见了"。
解锁那条路（第一次 pointerdown → `resume()`）另外单测：直接调 `resume` 并断言
`audioContext.state === 'running'`。

---

## 拆分（九小步）

| 步 | 交付 | 文件 | 判据 |
|---|---|---|---|
| **F0** | 任务单落盘（本文件）+ `task_plan.md` 指向它 | 2 个 md | 无代码 |
| **F1** | `SoundDesc` + `SoundRepository` | 新建 2 文件 + 单测 | 单测 |
| **F2** | `.pcm` → `sounds.bin` + `sounds.json` 的转换脚本 + 产物 | `tools/sound/build.mjs` + `apps/web/public/sounds/*` | **脚本自校验 103/103** + 单测 |
| **F3** | `SoundSystem` 抽象（8 个方法） | 新建 1 文件 | 单测 |
| **F4** | Web Audio 后端（两层衰减 + 自动播放解锁 + 播放记录） | `apps/web/src/WebAudioSoundSystem.ts` + 单测 | 单测 + 场景 |
| **F5** | `SoundEngine`（含 100 条名字表） | 新建 1 文件 + 单测 | 单测 |
| **F6** | 接线（6 个文件 15 处 `DEFERRED(Sound)`） | `Minecraft.ts` 等 | 场景 |
| **F7** | 浏览器场景 `tools/verify/scenarios/sound.mjs` | 新建 1 文件 | **播放记录断言** |
| **F8** | 收尾：手册、台账、完成章节 | 文档 | `pnpm ledger` |

依赖顺序：F2 的产物是 F4 的输入（要先有 `sounds.json` 才知道有哪些声音）；
F5 的 `SoundEngine` 要 F1 + F3 都在；F6 要 F5 和 F4 都能跑。

**里程碑**：F7 做完就是一个可交付的节点 —— 挖方块、走路、受伤、点按钮都有声音，
且距离/方向感按真机语义工作。

---

## 每一步的详细验收

### F1 — `SoundDesc` + `SoundRepository`

`packages/client/src/sound/SoundDesc.ts` + `SoundRepository.ts`。

- `SoundDesc` 有两个构造：一个直接收 `(data, size, channels, width, rate)`，
  一个**从 16 字节头解析**（`channels = *(int*)&data[0]` 这种写法要忠实转成
  `new DataView(bytes.buffer).getInt32(0, true)` —— 小端）。
  `frames = buffer + 16`（TS 里就是 `bytes.subarray(16)`），`numFrames = size/(channels*byteWidth)`。
- `isValid()` 判的是 `buffer != 0`。TS 里用一个明确的"空 desc"表示，别用 `null` 散落各处。
- `length() = numFrames / frameRate`（float 除法）。
- `SoundRepository.get(name, sound)`：找不到就 `LOGI("Couldn't find a sound with id: %s\n")` 并返回 false；
  找到就 **`Mth::random(size)` 随机挑一个变体**（C++ 用的是 `Mth::random`，不是 `sharedRandom`）。
- `add` 有两个重载（R10 情形 B）：一个收 const 引用，一个收非 const 引用并**回写 `sound.name`**。
- **`SoundRepository.h` 是纯头文件**（全部内联），TS 一个文件装下。

### F2 — `.pcm` → 二进制

`tools/sound/build.mjs`：

1. 逐个读 `$REF/src/client/sound/data/*.pcm`（**只读**）；
2. 解析：抓 `unsigned char PCM_xxx[N] = {`，取**第一个 `{` 到第一个 `}`**，认十进制与十六进制；
3. **自校验**：数值个数 == N == `16 + ch×bw×nf`；值都在 `[0,255]`；任一不成立 → 报错退出（非 0）；
4. 输出 `apps/web/public/sounds/sounds.bin`（所有文件顺序拼接）+ `sounds.json`
   （`[{ name, offset, size, channels, byteWidth, frameRate, numFrames }, …]`）；
5. 打印汇总：文件数、总字节数、十六进制写法有几个、死素材是哪几个。

产物必须 `git add`（6.09 MB）。

### F3 — `SoundSystem` 抽象

`packages/client/src/sound/SoundSystem.ts`，8 个方法照 `platform/audio/SoundSystem.h`：
`isAvailable` / `enable` / `setListenerPos` / `setListenerAngle` / `load` / `play` / `pause` / `stop`
+ `playAt(desc, x, y, z, volume, pitch)`。

⚠ **放 client 而不是 `packages/platform`**（`ADAPTED(Layout)`）：C++ 里 `SoundSystem.h` 靠
`class SoundDesc;` 前向声明躲开了依赖，TS 没有前向声明，而 `platform` 是被 `client` 依赖的下层 ——
放 platform 就成环了。理由写进文件头注释。

### F4 — Web Audio 后端

`apps/web/src/WebAudioSoundSystem.ts`，`implements SoundSystem`：

- 懒加载：第一次 `playAt` 某个 name 时才 `fetch` + `decodeAudioData`，之后缓存 `AudioBuffer`。
  （C++ 是进程启动就有数据；浏览器里按需加载是 `ADAPTED(Web)`。）
- `playAt`：`BufferSource` + `GainNode`（= 传进来的 `volume`）+ `PannerNode` 复刻 OpenAL 那层；
  `AudioListener` 固定在原点，`setListenerAngle(deg)` 换算成朝向向量。
- **自动播放解锁**：`AudioContext` 一开始是 `suspended`；挂一次性 `pointerdown`/`keydown` 监听调 `resume()`。
- **播放记录**：每次 `playAt` 往一个数组里推一条 `{name, x, y, z, volume, pitch}`，
  挂到 `window.__audio` 给场景脚本读（**这是 F7 的唯一判据来源**）。
- `enable(false)` 时 `suspend()`、`enable(true)` 时 `resume()`（`ADAPTED(Web)`：C++ 的
  `SoundEngine::enable` 是空函数、`SoundSystem::enable` 也是空的，但浏览器切后台会自动挂起，
  前端补一句更稳）。

### F5 — `SoundEngine`

`packages/client/src/sound/SoundEngine.ts`。三处要小心：

- `update()` 里**只调 `setListenerAngle`**（见坑二），`_x/_y/_z` 的插值写全但只用在自己算距离上；
- `play()` 里那两句死代码照抄并注明（见坑四）；
- `init()` 的 100 条 `sounds.add` **逐条照抄**（42 个名字），`Mth::random` 挑变体的行为在 F1 里。

`enable` / `updateOptions` / `destroy` 在 C++ 里都是**空函数体**，照抄。

### F6 — 接线

| 文件 | 处 | 说明 |
|---|---|---|
| `Minecraft.ts:112` | 字段 | `soundEngine: unknown = null` → `SoundEngine \| null`（把 `FORWARD-DECL(SoundEngine)` 换成真类） |
| `Minecraft.ts:165` | 构造 | `soundEngine = new SoundEngine(20.0f); soundEngine->init(this, &options);` |
| `Minecraft.ts:516` | 每帧 | `soundEngine->update(player, timer.a)` |
| `Minecraft.ts:933-934` | 暂停菜单 | `audioEngineOn()` / `audioEngineOff()` → `soundEngine->enable(true/false)`（`Minecraft.cpp:1622/1627`） |
| **`LevelRenderer.ts:928-929`** | **主链路** | `playSound(name, x, y, z, volume, pitch)` —— `Level.playSound` 的客户端这一端，**坑五那道 16 格剔除在这里** |
| `GameMode.ts:55` | 破坏方块 | `play(tile.soundType.getBreakSound(), x+.5, y+.5, z+.5, (getVolume()+1)/2, getPitch()*0.8f)` |
| `SurvivalMode.ts:60` | 走路的脚步声 | `play(tile.soundType.getStepSound(), …)` |
| `Screen.ts:191` | 按钮点击 | `playUI("random.click", 1, 1)` |
| `TouchIngameBlockSelectionScreen.ts:154` | 选格子 | `playUI("random.pop2", 1.0f, 0.3f)` |
| `LevelRenderer.ts:1050` | 事件 | `levelEvent(player, type, x, y, z, data)`（`LevelRenderer.cpp:1669`）—— 看它是"顺带"还是本步的活 |

⚠ 前 4 条 `Minecraft` 的、加 `LevelRenderer` 那 2 条，做完后要按**台账口径**重数一遍：
`DEFERRED(Sound)` 6 → 应该归零，`OMIT(Sound)` 5 → 剩下几条要逐条说明为什么还是死的。

### F7 — 浏览器场景

`tools/verify/scenarios/sound.mjs`：进世界 → 挖一个方块 → 断言播放记录里出现了
`step.*` 或 `random.*` 且 `volume > 0`；远处（>16 格）的事件断言 **没有**记录；
点界面按钮 → 断言出现 `random.click`。

### F8 — 收尾

手册、台账、任务单 F 的「完成」章节。

---

## 怎么验证（三层里这批用两层）

1. **单测**：`SoundDesc` 的头解析（含 `click` 的立体声、`splash` 的 11025）、
   `SoundRepository` 的随机挑变体、`SoundEngine` 的 `_getVolumeMult` 与 `play` 的早退条件、
   转换脚本的解析器（喂几个构造出来的畸形输入，确认它会报错）。
2. **浏览器场景**：`node tools/verify/smoke.mjs tools/verify/scenarios/sound.mjs`。
   **判据是播放记录，不是截图**（声音截不了图）。
3. **没有黄金样本**：参考 C++ 的网页版根本不出声，没有"标准答案"可比。

---

## 每一步提交前的自检

- [ ] `pnpm typecheck` 与 `pnpm test` 全过
- [ ] 没移植的语句留了 `DEFERRED(Sound)` / `OMIT(Sound)` 标记（不删）
- [ ] 反向验证：扰动**源码**（不是测试），确认新测试会变红；证明不了的写成「记录」测试
- [ ] 涉及画面的（F7 的界面按钮）截图打开看
- [ ] `pnpm ledger` 记下条数变化

---

## 已知缺口（本任务单不做，留给后面）

- **背景音乐**：C++ 没有 BGM 播放器，不做。
- **`SoundSystemSL`（Android）**：不移植。
- **3 个死素材**（`chicken1` / `chickenplop` / `skeletondeath`）：会打进包，但名字表里没有它们，
  所以永远播不到 —— 和 C++ 一致。
- **`SoundEngine.mm` 的 `_pp(文件名)` 那版**：不移植（那是 iOS 的运行时加载路径）。

---

## 任务单 F 完成（2026-10-04）

**声音在浏览器里响了。** 从 `26e65c5`（F0 任务单）到 `9d9789c`（F3~F7），一共 **4 个提交**。

### 台账（每一步的数字都是刚才用临时 worktree 逐个 checkout 实测的）

| 步 | 提交 | 台账 | 一句话 |
| --- | --- | --- | --- |
| 基线 | `61dd1e5` | **231** | 任务单 E 收官后的数 |
| F0 | `26e65c5` | 231 | 任务单落盘（纯文档） |
| F1 | `9785ea5` | 231 | `SoundDesc` + `SoundRepository` |
| F2 | `8200e41` | 231 | `.pcm` → `sounds.bin` + `sounds.json` |
| F3~F7 | `9d9789c` | **222** | 引擎 / 后端 / 接线 / 场景 |
| F8 | 本次 | 222 | 完成章节（纯文档） |

**净变化：231 → 222。** 拆开看正好对得上：

- **删掉 6 条 `DEFERRED(Sound)`**（全部换成真调用）；
- **删掉 4 条 `OMIT(Sound)`**（`audioEngineOn/Off` 两条 + `LevelRenderer.playSound` 两条重复记录）；
- **新增 1 条 `ADAPTED(Web)`** —— `WebAudioSoundSystem::enable` 是加宽的
  （C++ 的 `SoundSystem::enable` 是空的；浏览器切后台会自己挂起，这里顺着手动同步）；
- 剩下 **1 条 `OMIT(Sound)`**：`LevelRenderer.levelEvent(player, type, x, y, z, data)`
  （`LevelRenderer.cpp:1669`）—— 本来就不在这批范围。

`−10 + 1 = −9` ✓（第一次算只对上了"10"，差 1 条就是这么来的 —— 用 `git diff | grep '^+'`
按 `// MARKER(x)` 的格式逐条数出来的，不是估的）。

### 每一步的验证方式

- **单测**：任务单 F 新增 **4 个文件 / 59 条**
  （`sound` 14、`sound-pack` 16、`sound-engine` 24、`web-audio` 5）。全仓库 **95 文件 / 1060 条全过**。
- **反向验证（扰动源码）**：一共 **34 个变异**，32 个变红、2 个记为等价变异：
  - F1 11 个全红；F2 9 个全红；F3~F7 14 个里 12 个红；
  - 两个等价变异：`_invMaxDistance` 那个 fround（`f(1/20)` 和 `1/20` 的相对差
    1.49e-8 < float32 相对精度 5.96e-8，乘 5/10/15/19 之后都会被舍回同一个数）；
    `play()` 里第一个 `volume <= 0` 早退（后面还有第二道同款守卫，和 D2 的
    `tid===0` + `tile` 判空一个性质）。两条都写成了「记录」测试。
- **被反向验证抓出来的测试空白**（补了断言才变红）：
  - **变体数**：只数"有多少个不同的名字"抓不住"表里某个文件名写错了" —— 那个名字照样存在，
    只是少一个变体。补了 `step.cloth` 挂 4 个、`random.glass` 挂 3 个这类断言；
  - **`SoundBank` 用 `slice` 还是 `subarray`**：原来只断言了值，没断言**共享内存**。
    补了"改 bin 能通过 `desc.frames` 看到"。
- **浏览器场景**：`tools/verify/scenarios/sound.mjs`，**19 条断言全过** / 页面错误 0。
  断言的是**播放调用记录**（声音截不了图）：挖方块出 `step.*`、40 格外被剔除、
  `playUI` 坐标是 `(0,0,0)`、5 格处音量 = `1.1 - 5×(1/20)`、`AudioContext` 实测 `state=running`。
- **没有黄金样本** —— 参考 C++ 的网页版根本不出声，没有标准答案可比。

### F0 没算到的三件事

1. **`.pcm` 是 C 源码**，不是二进制（计划里写的是"裸 PCM16 + 16 字节头"）。
   要写解析器，还要处理十六进制写法（17 个文件）和 `pop2.pcm` 尾巴上的脏数据。
2. **`SOUND_DISTANCE = 16` 那道硬剔除在 `LevelRenderer::playSound`**，不在 `SoundEngine` ——
   `SoundEngine::play` 里那两句是复制粘贴的残骸。也就是说「16 格剔除」和「音量衰减」是**两道不同的闸**。
3. **数据是裸 PCM16、不是容器格式**，`decodeAudioData` 解不了 —— 得自己 `createBuffer` +
   把交错样本铺成各声道 Float32。顺带完全绕开了各浏览器解码器的差异。

### 录音室里没有的东西（本任务单不做）

- **背景音乐**：C++ 里没有 BGM 播放器（`OPTIONS_MUSIC_VOLUME` 只在 `init` 里被读来
  判断要不要 `loadLibrary()`）。
- **`SoundSystemSL`（Android OpenSL ES 后端）**：不移植。
- **`SoundEngine.mm` 的 `_pp(文件名)`**：那是 iOS 的运行时加载路径，网页版走 `.cpp` 的全局表。
- **3 个死素材**（`chicken1` / `chickenplop` / `skeletondeath`）：打进包了，但名字表里没有它们，
  永远播不到 —— 和 C++ 一致。
- **`LevelRenderer.levelEvent`**：仍是 `OMIT(Sound)`，请看它是不是要单独开一步。

### 一处留给后面注意的

`WebAudioSoundSystem` 的 `playAt` / `AudioContext` 那段**没法单测**（Node 里没有 Web Audio），
只有 F7 场景能验。所以后端里凡是**纯计算**的部分（`pcm16ToFloatPerChannel`、
那三个 OpenAL 常数）都单独抽出来测了 —— 以后再加后端逻辑，也照这个办法拆。
