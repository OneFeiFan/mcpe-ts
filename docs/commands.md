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

完整 CI（format:check → typecheck → test → build）：

```powershell
pnpm run ci
```

注意**不能写成 `pnpm ci`** —— 那是 pnpm 自带的子命令（等于 `install --frozen-lockfile`），
会盖过 package.json 里的同名脚本，结果只装一遍依赖、什么都不检查。

Web：

```powershell
pnpm dev:web
```

Server：

```powershell
pnpm dev:server
```
