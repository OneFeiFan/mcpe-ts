// 浏览器实测：起 vite dev server → 用 Playwright 打开网页版 → 跑场景脚本 → 读游戏状态、截图 → 输出 JSON 报告。
//
// 用法：
//   node tools/verify/smoke.mjs                                     # 默认场景 tools/verify/scenarios/default.mjs
//   node tools/verify/smoke.mjs tools/verify/scenarios/<场景>.mjs
//
// 退出码：0 = 没出问题；1 = 有页面错误 / expect 失败 / 场景抛异常。
// 截图写到 tools/verify/out/<场景名>/。跑完自己用图片查看工具把每张截图看一遍——
// 脚本通过不等于画面对（“画错了图”只有看图才能发现）。
//
// 场景脚本长这样：
//   export default async function (h) {
//     await h.wait(1500);
//     const s = await h.state('名字', (a) => ({ x: a.player.x }));
//     h.expect(s.x > 0, 'x 是正的');
//     await h.shot('01-画面');
//   }
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.SMOKE_PORT ?? 5173);
const URL_ = `http://127.0.0.1:${PORT}/`;
// 画布尺寸由 viewport × devicePixelRatio 决定。GuiScale = 3 时，界面坐标 × 3 = 页面像素（见 browser-verify skill）。
const VIEWPORT = { width: 960, height: 540 };
// 设备像素比。**默认 1，但这会掩盖一整类 bug**：画布是按 devicePixelRatio 放大的
// （main.ts 里 canvas.width = clientWidth * dpr），而浏览器给的鼠标坐标是 CSS 像素 ——
// dpr 不是 1 时两者就不是一个坐标系了。要测这类问题就跑 SMOKE_DPR=1.5。
const DEVICE_SCALE = Number(process.env.SMOKE_DPR ?? 1);

const scenarioPath = resolve(process.argv[2] ?? join(ROOT, 'tools/verify/scenarios/default.mjs'));
if (!existsSync(scenarioPath)) {
  console.error(`找不到场景文件：${scenarioPath}`);
  process.exit(1);
}
const scenarioName = basename(scenarioPath, '.mjs');
const outDir = join(ROOT, 'tools/verify/out', scenarioName);
mkdirSync(outDir, { recursive: true });

// ---- 起 dev server（已经有人在跑就直接用） ----
async function serverUp() {
  try {
    await fetch(URL_, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  if (await serverUp()) return null; // 复用已经在跑的，不动它
  const vite = join(ROOT, 'node_modules/vite/bin/vite.js');
  if (!existsSync(vite)) throw new Error(`找不到 vite：${vite}（先在仓库根目录跑 pnpm install）`);
  // 显式 --host 127.0.0.1：vite 默认只绑 localhost，在 Windows 上常解析成 IPv6 的 ::1，
  // 那样下面探 127.0.0.1 会一直探不到。
  const child = spawn(
    process.execPath,
    [vite, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: join(ROOT, 'apps/web'),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite 退出了（code ${child.exitCode}）：\n${log}`);
    if (await serverUp()) return child;
    await sleep(250);
  }
  killTree(child);
  throw new Error(`等了 60 秒 dev server 还没起来：\n${log}`);
}

// vite 是 pnpm 拉起来的子进程，只 kill 它自己会留下孤儿进程占着端口，所以整棵树一起杀。
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32')
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

// ---- 顺手把场景模块 load 进来 ----
const { default: scenario } = await import(pathToFileURL(scenarioPath).href);
if (typeof scenario !== 'function') {
  console.error(`场景文件必须 default export 一个 async 函数：${scenarioPath}`);
  process.exit(1);
}

const { chromium } = await import('playwright');

const report = {
  scenario: scenarioName,
  url: URL_,
  pageErrors: [],
  consoleErrors: [],
  requestErrors: [],
  states: [],
  expects: [],
  shots: [],
  allowedConsole: [],
  unexpectedConsole: [],
  failure: null,
};

let server = null;
let browser = null;
try {
  server = await startServer();
  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : undefined); // 环境变量：指定本机已有的 Chromium（如 CI、无网络环境）
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE });

  page.on('pageerror', (e) => report.pageErrors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(m.text());
  });
  page.on('requestfailed', (r) =>
    report.requestErrors.push(`${r.url()} —— ${r.failure()?.errorText ?? '未知原因'}`),
  );

  await page.goto(URL_, { waitUntil: 'load' });
  // __app 是 main.ts 最后一行挂上去的；init 抛异常时会挂不上，那时 #status 里写着“启动失败：…”。
  try {
    await page.waitForFunction(() => globalThis.__app !== undefined, null, { timeout: 60_000 });
  } catch {
    const status = await page.textContent('#status').catch(() => null);
    throw new Error(`等不到 window.__app。页面状态栏：${status ?? '(读不到)'}`);
  }

  const h = {
    page,
    /** 等 ms 毫秒（给游戏几帧时间把状态稳定下来） */
    wait: (ms) => page.waitForTimeout(ms),
    /** 在页面里执行 fn(window.__app)，把返回值记进报告。fn 必须是纯函数、返回值能 JSON 序列化。 */
    async state(name, fn) {
      const src = fn.toString();
      const value = await page.evaluate(
        ([s]) => {
          const a = globalThis.__app;
          // 场景函数写在 Node 侧，要过桥就得在页面里重新求值一次（参数 a = window.__app）
          return new Function(`return (${s})`)()(a);
        },
        [src],
      );
      report.states.push({ name, value });
      return value;
    },
    /** 记一条断言。不抛异常——全部收集起来最后一起报，免得看见第一个失败就看不到后面的。 */
    expect(ok, msg) {
      report.expects.push({ msg, ok: !!ok });
    },
    /**
     * 声明“原版 C++ 自己就会打的”控制台错误（正则或字符串），这些不算失败。
     * 用法要克制：只在你已经拿黄金样本/参考源码证明过原版同样会打的时候才加，
     * 并且把依据写进注释。真正的移植问题不许用它盖过去。
     */
    allowConsole(pattern) {
      report.allowedConsole.push(String(pattern));
    },
    /** 截图到 tools/verify/out/<场景名>/<name>.png */
    async shot(name) {
      const file = join(outDir, `${name}.png`);
      await page.screenshot({ path: file });
      report.shots.push(file);
      return file;
    },
  };

  await scenario(h);
} catch (e) {
  report.failure = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
} finally {
  if (browser) await browser.close().catch(() => {});
  killTree(server);
}

const failed = report.expects.filter((e) => !e.ok);
// allowConsole 收的是字面串，按“包含”比较——不用正则，免得一个写宽了的正则把真问题也放过去。
report.unexpectedConsole = report.consoleErrors.filter(
  (t) => !report.allowedConsole.some((p) => t.includes(p)),
);
report.ok =
  report.failure === null &&
  failed.length === 0 &&
  report.pageErrors.length === 0 &&
  report.unexpectedConsole.length === 0;

console.log(JSON.stringify(report, null, 2));
console.log(
  `\n[${report.scenario}] 状态 ${report.states.length} 条 / 断言 ${report.expects.length} 条（失败 ${failed.length}）` +
    ` / 页面错误 ${report.pageErrors.length} / 控制台错误 ${report.consoleErrors.length}（已声明原版行为 ${report.allowedConsole.length} 条）` +
    ` / 截图 ${report.shots.length} 张 → ${outDir}`,
);
if (!report.ok) {
  if (failed.length) console.error('断言失败：\n- ' + failed.map((f) => f.msg).join('\n- '));
  process.exit(1);
}
console.log('没发现问题。注意：脚本通过不等于画面对，去把截图逐张看一遍。');
