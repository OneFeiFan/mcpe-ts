#requires -Version 5.1
<#
    MCPE TypeScript 工程地基一键初始化脚本

    使用：
      1. 进入 implementation\mcpe-ts
      2. powershell -ExecutionPolicy Bypass -File .\bootstrap-engineering.ps1

    作用：
      - 建立完整 Monorepo
      - 建立 5 个核心 package
      - 建立 Web / Node Server 应用
      - 建立 TypeScript / ESLint / Prettier / Vitest / Vite 配置
      - 建立确定性 Clock / Random / Event 基础
      - 建立 Headless Simulation 最小骨架
      - 建立第一批测试
      - 建立 CI
      - 执行 pnpm install / typecheck / test / build

    不会触碰：
      analysis/
      reference/
      external-reference/

    会覆盖工程地基相关配置文件；如果文件已存在，会先复制到
      .bootstrap-backup\<timestamp>\
    再覆盖。
#>

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Text {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [Parameter(Mandatory=$true)][string]$Content
    )

    $parent = Split-Path -Parent $Path
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }

    [System.IO.File]::WriteAllText(
        $Path,
        ($Content.Trim() + [Environment]::NewLine),
        [System.Text.UTF8Encoding]::new($false)
    )
}

function Backup-IfExists {
    param([string]$Path)

    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        $relative = [System.IO.Path]::GetRelativePath($Root, $Path)
        $target = Join-Path $BackupRoot $relative
        $targetParent = Split-Path -Parent $target
        New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
        Copy-Item -LiteralPath $Path -Destination $target -Force
    }
}

function Write-Managed {
    param(
        [string]$RelativePath,
        [string]$Content
    )

    $path = Join-Path $Root $RelativePath
    Backup-IfExists $path
    Write-Text -Path $path -Content $Content
}

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "找不到命令 '$Name'。请先安装并确保它位于 PATH 中。"
    }
}

$Root = (Get-Location).Path
$BackupRoot = Join-Path $Root (".bootstrap-backup\" + (Get-Date -Format "yyyyMMdd-HHmmss"))

Require-Command "node"
Require-Command "pnpm"

if (-not (Test-Path (Join-Path $Root "package.json"))) {
    Write-Host "当前目录没有 package.json，将创建新的工程根目录。"
}

Write-Host "工程根目录: $Root"
Write-Host "备份目录:   $BackupRoot"

# ---------- directories ----------
$directories = @(
    "packages\math\src",
    "packages\core\src\time",
    "packages\core\src\random",
    "packages\core\src\events",
    "packages\simulation\src",
    "packages\renderer-core\src",
    "packages\input-core\src",
    "apps\web\src",
    "apps\server\src",
    "tests\unit\core",
    "tests\unit\simulation",
    "tools",
    "fixtures",
    "specs",
    "docs",
    ".github\workflows"
)

foreach ($dir in $directories) {
    New-Item -ItemType Directory -Force -Path (Join-Path $Root $dir) | Out-Null
}

# ---------- root ----------
Write-Managed "package.json" @'
{
  "name": "mcpe-ts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Minecraft PE 0.6.1 behavioral reimplementation in pure TypeScript",
  "scripts": {
    "dev:web": "pnpm --filter @mcpe/web dev",
    "dev:server": "pnpm --filter @mcpe/server dev",
    "build": "pnpm -r --if-present build",
    "typecheck": "pnpm -r --if-present typecheck",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "ci": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  },
  "devDependencies": {
    "@eslint/js": "latest",
    "@types/node": "latest",
    "eslint": "latest",
    "eslint-config-prettier": "latest",
    "prettier": "latest",
    "tsx": "latest",
    "typescript": "6.0.3",
    "typescript-eslint": "latest",
    "vite": "latest",
    "vitest": "latest"
  }
}
'@

Write-Managed "pnpm-workspace.yaml" @'
packages:
  - "packages/*"
  - "apps/*"
'@

Write-Managed "tsconfig.base.json" @'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "useDefineForClassFields": true,
    "declaration": true,
    "sourceMap": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  }
}
'@

Write-Managed "tsconfig.json" @'
{
  "files": []
}
'@

Write-Managed ".editorconfig" @'
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false
'@

Write-Managed ".gitignore" @'
node_modules/
dist/
coverage/
.vite/
.cache/
*.log
.DS_Store
Thumbs.db

.bootstrap-backup/

.env
.env.*
!.env.example
'@

Write-Managed ".gitattributes" @'
* text=auto eol=lf
*.ps1 text eol=crlf
*.bat text eol=crlf
'@

Write-Managed "prettier.config.js" @'
/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
};
'@

Write-Managed "eslint.config.js" @'
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      'node_modules/**',
      '.bootstrap-backup/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
'@

Write-Managed "vitest.config.ts" @'
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mcpe/math': `${root}/packages/math/src/index.ts`,
      '@mcpe/core': `${root}/packages/core/src/index.ts`,
      '@mcpe/simulation': `${root}/packages/simulation/src/index.ts`,
      '@mcpe/renderer-core': `${root}/packages/renderer-core/src/index.ts`,
      '@mcpe/input-core': `${root}/packages/input-core/src/index.ts`
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
'@

# ---------- package helper ----------
$packageTsConfig = @'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*.ts"]
}
'@

$packageBuildTsConfig = @'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false
  }
}
'@

# ---------- math ----------
Write-Managed "packages\math\package.json" @'
{
  "name": "@mcpe/math",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
'@

Write-Managed "packages\math\tsconfig.json" $packageTsConfig
Write-Managed "packages\math\tsconfig.build.json" $packageBuildTsConfig

Write-Managed "packages\math\src\index.ts" @'
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export interface AABB {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}
'@

# ---------- core ----------
Write-Managed "packages\core\package.json" @'
{
  "name": "@mcpe/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
'@

Write-Managed "packages\core\tsconfig.json" $packageTsConfig
Write-Managed "packages\core\tsconfig.build.json" $packageBuildTsConfig

Write-Managed "packages\core\src\time\game-clock.ts" @'
export interface GameClock {
  readonly tick: number;
  readonly tickRate: number;
  advance(): void;
}

export class FixedGameClock implements GameClock {
  private _tick = 0;

  public constructor(
    public readonly tickRate = 20,
  ) {}

  public get tick(): number {
    return this._tick;
  }

  public advance(): void {
    this._tick += 1;
  }
}
'@

Write-Managed "packages\core\src\random\random-source.ts" @'
export interface RandomSource {
  nextInt(maxExclusive: number): number;
  nextFloat(): number;
}

export class SeededRandom implements RandomSource {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public nextInt(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError('maxExclusive must be a positive integer');
    }

    return Math.floor(this.nextFloat() * maxExclusive);
  }

  public nextFloat(): number {
    // 小型 deterministic PRNG，仅作为工程地基占位。
    // 最终 MCPE 行为对齐时必须替换为 Reference 所需的精确随机算法。
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;

    return this.state / 0x100000000;
  }
}
'@

Write-Managed "packages\core\src\events\event-bus.ts" @'
export type EventHandler<T> = (event: T) => void;

export interface EventBus<TEvents extends Record<string, unknown>> {
  emit<TKey extends keyof TEvents>(
    type: TKey,
    event: TEvents[TKey],
  ): void;

  on<TKey extends keyof TEvents>(
    type: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): () => void;
}

export class SimpleEventBus<TEvents extends Record<string, unknown>>
  implements EventBus<TEvents>
{
  private readonly handlers = new Map<
    keyof TEvents,
    Set<EventHandler<never>>
  >();

  public on<TKey extends keyof TEvents>(
    type: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): () => void {
    let handlers = this.handlers.get(type);

    if (!handlers) {
      handlers = new Set<EventHandler<never>>();
      this.handlers.set(type, handlers);
    }

    handlers.add(handler as EventHandler<never>);

    return () => {
      handlers?.delete(handler as EventHandler<never>);
    };
  }

  public emit<TKey extends keyof TEvents>(
    type: TKey,
    event: TEvents[TKey],
  ): void {
    const handlers = this.handlers.get(type);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      (handler as EventHandler<TEvents[TKey]>)(event);
    }
  }
}
'@

Write-Managed "packages\core\src\index.ts" @'
export * from './time/game-clock.js';
export * from './random/random-source.js';
export * from './events/event-bus.js';
'@

# ---------- simulation ----------
Write-Managed "packages\simulation\package.json" @'
{
  "name": "@mcpe/simulation",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "dependencies": {
    "@mcpe/core": "workspace:*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
'@

Write-Managed "packages\simulation\tsconfig.json" @'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*.ts"]
}
'@

Write-Managed "packages\simulation\tsconfig.build.json" @'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false
  }
}
'@

Write-Managed "packages\simulation\src\game-simulation.ts" @'
import { FixedGameClock, type RandomSource, SeededRandom } from '@mcpe/core';

export interface SimulationConfig {
  readonly seed: number;
  readonly tickRate?: number;
}

export class GameSimulation {
  public readonly clock: FixedGameClock;
  public readonly random: RandomSource;

  public constructor(config: SimulationConfig) {
    this.clock = new FixedGameClock(config.tickRate ?? 20);
    this.random = new SeededRandom(config.seed);
  }

  public start(): void {
    // 当前仅初始化状态。
    // 后续这里会接入 WorldSimulation。
  }

  public tick(): void {
    this.clock.advance();
  }

  public runTicks(count: number): void {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('count must be a non-negative integer');
    }

    for (let i = 0; i < count; i += 1) {
      this.tick();
    }
  }
}
'@

Write-Managed "packages\simulation\src\index.ts" @'
export * from './game-simulation.js';
'@

# ---------- renderer core ----------
Write-Managed "packages\renderer-core\package.json" @'
{
  "name": "@mcpe/renderer-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@mcpe/math": "workspace:*"
  },
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
'@

Write-Managed "packages\renderer-core\tsconfig.json" @'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*.ts"]
}
'@

Write-Managed "packages\renderer-core\tsconfig.build.json" @'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false
  }
}
'@

Write-Managed "packages\renderer-core\src\index.ts" @'
import type { Vec3 } from '@mcpe/math';

export interface CameraState {
  readonly position: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
}

export interface MeshData {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
}

export interface RenderWorldSnapshot {
  readonly tick: number;
}

export interface Renderer {
  render(
    snapshot: RenderWorldSnapshot,
    camera: CameraState,
  ): void;
}
'@

# ---------- input core ----------
Write-Managed "packages\input-core\package.json" @'
{
  "name": "@mcpe/input-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
'@

Write-Managed "packages\input-core\tsconfig.json" @'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true
  },
  "include": ["src/**/*.ts"]
}
'@

Write-Managed "packages\input-core\tsconfig.build.json" @'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false
  }
}
'@

Write-Managed "packages\input-core\src\index.ts" @'
export interface GameInputState {
  readonly forward: boolean;
  readonly backward: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly jump: boolean;
  readonly attack: boolean;
  readonly use: boolean;
}

export interface InputSource {
  sample(): GameInputState;
}
'@

# ---------- web app ----------
Write-Managed "apps\web\package.json" @'
{
  "name": "@mcpe/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@mcpe/core": "workspace:*",
    "@mcpe/input-core": "workspace:*",
    "@mcpe/renderer-core": "workspace:*",
    "@mcpe/simulation": "workspace:*"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
'@

Write-Managed "apps\web\tsconfig.json" @'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts"]
}
'@

Write-Managed "apps\web\vite.config.ts" @'
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mcpe/core': `${root}/packages/core/src/index.ts`,
      '@mcpe/input-core': `${root}/packages/input-core/src/index.ts`,
      '@mcpe/renderer-core': `${root}/packages/renderer-core/src/index.ts`,
      '@mcpe/simulation': `${root}/packages/simulation/src/index.ts`,
      '@mcpe/math': `${root}/packages/math/src/index.ts`,
    },
  },
});
'@

Write-Managed "apps\web\index.html" @'
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MCPE TS Runtime</title>
  </head>
  <body>
    <main>
      <h1>MCPE TypeScript Runtime</h1>
      <p id="status">正在初始化...</p>
      <button id="tick">执行 1 Tick</button>
      <button id="ticks20">执行 20 Tick</button>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
'@

Write-Managed "apps\web\src\main.ts" @'
import { GameSimulation } from '@mcpe/simulation';

const simulation = new GameSimulation({ seed: 12345 });
const status = document.querySelector<HTMLParagraphElement>('#status');
const tickButton = document.querySelector<HTMLButtonElement>('#tick');
const ticks20Button = document.querySelector<HTMLButtonElement>('#ticks20');

function updateStatus(): void {
  if (status) {
    status.textContent = `Runtime OK · tick=${simulation.clock.tick}`;
  }
}

tickButton?.addEventListener('click', () => {
  simulation.tick();
  updateStatus();
});

ticks20Button?.addEventListener('click', () => {
  simulation.runTicks(20);
  updateStatus();
});

updateStatus();
'@

# ---------- server ----------
Write-Managed "apps\server\package.json" @'
{
  "name": "@mcpe/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@mcpe/core": "workspace:*",
    "@mcpe/simulation": "workspace:*"
  },
  "scripts": {
    "dev": "tsx src/main.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
'@

Write-Managed "apps\server\tsconfig.json" @'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": false,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
'@

Write-Managed "apps\server\src\main.ts" @'
import { GameSimulation } from '@mcpe/simulation';

const simulation = new GameSimulation({ seed: 12345 });
simulation.start();

console.log('MCPE TS server runtime started');

let lastLoggedTick = 0;

const interval = setInterval(() => {
  simulation.tick();

  if (simulation.clock.tick - lastLoggedTick >= 20) {
    lastLoggedTick = simulation.clock.tick;
    console.log(`tick=${simulation.clock.tick}`);
  }
}, 1000 / simulation.clock.tickRate);

process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('server runtime stopped');
  process.exit(0);
});
'@

# ---------- tests ----------
Write-Managed "tests\unit\core\game-clock.test.ts" @'
import { describe, expect, it } from 'vitest';
import { FixedGameClock } from '@mcpe/core';

describe('FixedGameClock', () => {
  it('每次 advance 增加一个 tick', () => {
    const clock = new FixedGameClock();

    expect(clock.tick).toBe(0);

    clock.advance();

    expect(clock.tick).toBe(1);

    clock.advance();

    expect(clock.tick).toBe(2);
  });

  it('tickRate 保持构造时的值', () => {
    const clock = new FixedGameClock(20);

    expect(clock.tickRate).toBe(20);
  });
});
'@

Write-Managed "tests\unit\core\deterministic-random.test.ts" @'
import { describe, expect, it } from 'vitest';
import { SeededRandom } from '@mcpe/core';

describe('SeededRandom', () => {
  it('相同 seed 产生相同序列', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);

    const valuesA = [
      a.nextInt(100),
      a.nextInt(100),
      a.nextInt(100),
      a.nextInt(100),
    ];

    const valuesB = [
      b.nextInt(100),
      b.nextInt(100),
      b.nextInt(100),
      b.nextInt(100),
    ];

    expect(valuesA).toEqual(valuesB);
  });

  it('非法范围会被拒绝', () => {
    const random = new SeededRandom(12345);

    expect(() => random.nextInt(0)).toThrow(RangeError);
  });
});
'@

Write-Managed "tests\unit\simulation\game-simulation.test.ts" @'
import { describe, expect, it } from 'vitest';
import { GameSimulation } from '@mcpe/simulation';

describe('GameSimulation', () => {
  it('可以无头运行固定数量的 tick', () => {
    const simulation = new GameSimulation({ seed: 12345 });

    simulation.runTicks(100);

    expect(simulation.clock.tick).toBe(100);
  });

  it('相同 seed 的初始随机序列一致', () => {
    const a = new GameSimulation({ seed: 42 });
    const b = new GameSimulation({ seed: 42 });

    expect(a.random.nextInt(1000)).toBe(b.random.nextInt(1000));
    expect(a.random.nextInt(1000)).toBe(b.random.nextInt(1000));
  });
});
'@

# ---------- docs ----------
Write-Managed "docs\engineering-foundation.md" @'
# 工程地基

当前工程的职责边界：

```text
analysis/
    Reference 研究结果

reference/
    原项目源码

packages/
    与运行环境无关的 TypeScript 核心

apps/web/
    浏览器运行时

apps/server/
    Node.js 运行时

tests/
    跨 package 的验证

fixtures/
    Reference 黄金样本

tools/
    辅助工具
```

依赖方向：

```text
math
 ↓
core
 ↓
simulation
 ↓
apps

renderer-core / input-core
 ↓
apps/web
```

Simulation 不依赖 DOM、WebGL、WebAudio、Node fs。

当前 `SeededRandom` 只是工程地基的确定性占位实现，
真正开始 WorldGen 行为对齐时必须替换成 Reference 所要求的精确随机算法。

当前 `GameSimulation` 只负责验证：
- deterministic clock；
- deterministic random；
- headless tick execution。

它不是 Minecraft World 的实现。
'@

Write-Managed "docs\commands.md" @'
# 常用工程命令

安装：

```powershell
pnpm install
```

检查：

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

构建：

```powershell
pnpm build
```

完整 CI：

```powershell
pnpm ci
```

Web：

```powershell
pnpm dev:web
```

Server：

```powershell
pnpm dev:server
```
'@

Write-Managed ".github\workflows\ci.yml" @'
name: CI

on:
  push:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Verify
        run: pnpm ci
'@

# ---------- install ----------
Write-Host ""
Write-Host "开始安装依赖..."
& pnpm install
if ($LASTEXITCODE -ne 0) {
    throw "pnpm install 失败。"
}

Write-Host ""
Write-Host "运行格式检查..."
& pnpm exec prettier --write .
& pnpm format:check
if ($LASTEXITCODE -ne 0) {
    throw "format:check 失败。"
}

Write-Host ""
Write-Host "运行 ESLint..."
& pnpm lint
if ($LASTEXITCODE -ne 0) {
    throw "lint 失败。"
}

Write-Host ""
Write-Host "运行首次构建（先生成 workspace package dist，供跨 package 类型检查使用）..."
& pnpm build
if ($LASTEXITCODE -ne 0) {
    throw "build 失败。"
}

Write-Host ""
Write-Host "运行 TypeScript 类型检查..."
& pnpm typecheck
if ($LASTEXITCODE -ne 0) {
    throw "typecheck 失败。"
}

Write-Host ""
Write-Host "运行测试..."
& pnpm test
if ($LASTEXITCODE -ne 0) {
    throw "test 失败。"
}

Write-Host ""
Write-Host "工程地基初始化完成。"
Write-Host ""
Write-Host "下一步："
Write-Host "  pnpm dev:web       # 启动 Web"
Write-Host "  pnpm dev:server    # 启动 Node Server"
Write-Host "  pnpm test          # 运行测试"
Write-Host ""
