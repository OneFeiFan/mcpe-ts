"""全量审核工作表：给一个 TS 文件生成“逐函数对照清单”，审核时逐项填写，保证不漏函数。
用法：python tools/audit/worksheet.py $REF packages/world/src/entity/Mob.ts > /tmp/Mob.worksheet.md
输出（Markdown）：
  1. 对应的 C++ 文件（按 TS 路径镜像）；
  2. C++ 里每个成员函数（含各个重载）一行：名字、C++ 行号、TS 里的对应方法（同名或 R10 改名）与行号、函数体相似度；
  3. C++ 有、TS 里既没有实现也没有在文件里提到的函数（必须逐个交代：补上 / OMIT 登记 / 说明没有定义或没有调用者）；
  4. TS 里有、C++ 没有的方法（NEW / ADAPTED，需要说明理由）。
相似度只是提示：低的要特别仔细，高的也必须逐行看。"""
import os, re, sys, difflib, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REF, TS = sys.argv[1], sys.argv[2]

def mirror(tsp):
    parts = os.path.normpath(tsp).split(os.sep)
    k = parts.index('packages'); pkg = parts[k + 1]; rel = os.path.join(*parts[k + 3:])[:-3]
    base = {'world': 'src/world', 'client': 'src/client', 'util': 'src/util', 'platform': 'src/platform', 'nbt': 'src/nbt', 'core': 'src'}.get(pkg, 'src')
    return os.path.join(REF, base, rel)

def cpp_funcs(stem, cls):
    out = []
    for ext in ('.cpp', '.h'):
        p = stem + ext
        if not os.path.exists(p): continue
        raw = open(p, encoding='utf-8', errors='replace').read().split('\n')
        src = subprocess.run(['python3', os.path.join(HERE, '..', 'porting', 'clean.py'), p], capture_output=True, text=True).stdout
        if ext == '.cpp':
            pat = re.compile(r'\b' + re.escape(cls) + r'::(~?\w+)\s*\(([^)]*)\)[^{;]*\{')
        else:
            pat = re.compile(r'^\s*(?:virtual\s+|static\s+|inline\s+|__inline\s+|explicit\s+)*[\w:<>,\s\*&]*?\b(~?\w+)\s*\(([^;{)]*)\)\s*(?:const)?\s*(?:override)?\s*\{', re.M)
        for m in pat.finditer(src):
            name = m.group(1)
            if name in ('if', 'for', 'while', 'switch', 'return', 'sizeof'): continue
            i = m.end() - 1; d = 0
            for j in range(i, len(src)):
                if src[j] == '{': d += 1
                elif src[j] == '}':
                    d -= 1
                    if d == 0: break
            # 在原文件里找行号
            line = next((n + 1 for n, l in enumerate(raw) if re.search(r'\b' + re.escape(name) + r'\s*\(', l) and ('::' + name in l or ext == '.h')), 0)
            out.append((name, m.group(2).strip()[:60], os.path.relpath(p, REF), line, src[i:j + 1]))
    return out

def ts_funcs(src):
    out = {}
    lines = src.split('\n')
    for m in re.finditer(r'\n(\s{2}(?:(?:public|private|protected|static|override|abstract|async|get|set)\s+)*(\w+)\s*\(([^()]|\([^()]*\))*\)\s*(?::\s*[^{=;]+)?\{)', src):
        name = m.group(2)
        if name in ('if', 'for', 'while', 'switch', 'catch', 'function'): continue
        i = m.end() - 1; d = 0
        for j in range(i, len(src)):
            if src[j] == '{': d += 1
            elif src[j] == '}':
                d -= 1
                if d == 0: break
        out.setdefault(name, []).append((src[:m.start()].count('\n') + 2, src[i:j + 1]))
    return out

from bodydiff import norm  # 复用归一化
stem = mirror(TS); cls = os.path.basename(stem)
tsrc = open(TS, encoding='utf-8').read()
cf = cpp_funcs(stem, cls); tf = ts_funcs(tsrc)
print(f'# 审核工作表：`{TS}`\n')
print(f'对应 C++：`{os.path.relpath(stem, REF)}.h / .cpp`（类 `{cls}`）。逐行填写“结论”列：一致 / 怪癖保留 / 已修（编号）/ 原版 bug / ADAPTED（理由）/ OMIT（理由）。\n')
print('| # | C++ 函数 | C++ 位置 | TS 方法 | TS 行 | 相似度 | 结论 |\n| --- | --- | --- | --- | --- | --- | --- |')
seen_ts = set(); missing = []
for n, (name, params, f, line, body) in enumerate(cf, 1):
    cand = [(k, v) for k, v in tf.items() if k == name or (k.startswith(name) and k[len(name):len(name) + 1].isupper())]
    if name == cls: cand = [(k, v) for k, v in tf.items() if k == 'constructor']
    if not cand:
        mentioned = re.search(r'\b' + re.escape(name.lstrip('~')) + r'\b', tsrc) is not None
        missing.append((name, params, f, line, mentioned))
        print(f'| {n} | `{name}({params})` | {f}:{line} | **（无）** | | | |')
        continue
    best = (0.0, '', 0)
    a = norm(body, 'cpp')
    for k, v in cand:
        seen_ts.add(k)
        for ln, tb in v:
            r = difflib.SequenceMatcher(None, a, norm(tb, 'ts'), autojunk=False).ratio() if len(a) > 3 else 1.0
            if r >= best[0]: best = (r, k, ln)
    print(f'| {n} | `{name}({params})` | {f}:{line} | `{best[1]}` | {best[2]} | {best[0]:.2f} | |')
print('\n## C++ 有、TS 里没有对应方法的\n')
if not missing: print('无。')
for name, params, f, line, mentioned in missing:
    print(f'- `{name}({params})`（{f}:{line}）：{"TS 文件里有提到（检查是否已登记 OMIT / DEFERRED，或按 R10 改了名）" if mentioned else "**TS 文件里完全没有提到——必须交代**"}')
extra = [k for k in tf if k not in seen_ts and k != 'constructor']
print('\n## TS 里有、C++ 没有的方法（需要说明是 NEW、ADAPTED 还是 R10 拆出来的实现方法）\n')
print('无。' if not extra else '\n'.join(f'- `{k}`（行 {tf[k][0][0]}）' for k in extra))
