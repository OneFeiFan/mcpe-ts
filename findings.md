# Findings: B1a — VirtualFS 与 CFile

## C++ 调用现场（实测，作为接口设计依据）

### 文件 mode

存档代码里实际用到的 `fopen` 模式只有这四种（`ab` 一次都没出现）：

| mode | 次数 | 出处 |
|---|---|---|
| `rb` | 5 | ExternalFileLevelStorage.cpp:224,229,325,591、FolderMethods.cpp:56 |
| `wb` | 2 | ExternalFileLevelStorage.cpp:289,573 |
| `w+b` | 1 | RegionFile.cpp:71 |
| `r+b` | 1 | RegionFile.cpp:43 |

### `fread` / `fwrite` 返回元素个数，不是字节数

C 标准库语义，证据：

```cpp
logAssert(fread(offsets, sizeof(int), SECTOR_INTS, file), SECTOR_INTS);   // 比 SECTOR_INTS，不是 *4
logAssert(fwrite(offsets, sizeof(int), SECTOR_INTS, file), SECTOR_INTS);
if (fread(&version, sizeof(version), 1, file) != 1)
if (fread(data, 1, size, file) != size)        // size=1、count=size 时元素数恰好等于字节数
```

注意：C 的 fread 在读到末尾时，**不足一个完整元素的那些字节会被消费、写入缓冲区、但不计入返回值**。

### fseek / ftell

- 只用 `SEEK_SET`(4 次) 和 `SEEK_END`(3 次)，**没有 `SEEK_CUR`**（但仍按 C 实现三个）
- `ftell` 只在 FolderMethods.cpp 里取文件大小：`fseek(fp, 0, SEEK_END); int size = ftell(fp);`

### 目录语义（FolderMethods.cpp）

```cpp
bool exists(name) { return access(name, 0) == 0; }   // 文件或目录都算
bool createFolderIfNotExists(name) { if (exists(name)) return true; return mkdir(name, 0755) == 0; }
bool createTree(base, tree[], n) { /* 逐级拼路径调用 createFolderIfNotExists */ }
```

`createTree` 逐级建目录 → 说明 **`mkdir` 不自动创建父目录**。

### rename 要支持目录子树

`ExternalFileLevelStorageSource.cpp:162` 用 `rename()` 重命名**整个世界目录**；`ExternalFileLevelStorage.cpp:137,144` 用 `rename(tmp, dat)` 做「写临时文件再原子改名」。

## 项目约定（Explore 调查结果）

- **测试惯例**：显式 `import { describe, expect, it } from 'vitest'`；describe 名形如 `platform/vfs`；it 描述用中文；数字用 `60_000` 风格下划线分隔
- **没有现成的防抖/节流工具**；`packages/platform/src/time.ts` 里有 `sleepMs`
- **平台差异的三种既有范式**：AppPlatform（基类在 client、子类在 apps/web）、AssetSource（结构接口在包内、靠鸭子类型满足）、PointerLockHooks（包内定义接口 + 静态注入点）
- **`window.__app` 惯例**：`as unknown as { __app: X }` 强转，无全局类型声明文件
- **`packages/world/src/level/storage/` 里已有 LevelStorage/MemoryLevelStorage/LevelData/PlayerData** —— 那是 Level/Player 语义的存档抽象，**不是文件系统**，别往里放
- **代码风格**：prettier 单引号 / 分号 / printWidth 100
- **ADAPTED 头注释惯例**：JSDoc 说明改了什么、为什么，标 `ADAPTED(Web)` 等

## 关键约束

- `packages/platform` 的 tsconfig 是 `lib: ["ESNext"]`，**没有 DOM**；只有 `client` 和 `apps/web` 有。所以平台的 fs 代码不能引用 `indexedDB`、`window` 等
- `packages/util/src/DataIO.ts` 的 `MemoryDataOutput` 是**分块累加**的，不支持随机写，CFile **不能复用它**
