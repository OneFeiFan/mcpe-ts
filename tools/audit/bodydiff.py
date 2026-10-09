"""逐函数对照 C++ 与 TS 的函数体，按“归一化后的词法相似度”排序，低分的优先人工看。
用法：python tools/audit/bodydiff.py $REF <TS 文件或目录> [阈值，默认 0.6]
归一化：去注释与字符串；去掉类型、修饰词、this. / -> / :: / f()、Math.trunc 等 TS 写法；数字字面量去掉 f 后缀与 .0。
只是候选清单：低分不一定是错（R10 改名、按值复制、注入写法都会拉低分数），高分也不保证对。"""
import os, re, sys, difflib, subprocess
REF, TARGET = sys.argv[1], sys.argv[2]
TH = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6
HERE = os.path.dirname(os.path.abspath(__file__))

def cpp_funcs(cpp_path, cls):
    src = subprocess.run(['python3', os.path.join(HERE, '..', 'porting', 'clean.py'), cpp_path], capture_output=True, text=True).stdout
    out = {}
    for m in re.finditer(r'\b' + re.escape(cls) + r'::(~?\w+)\s*\(([^)]*)\)[^{;]*\{', src):
        i = m.end() - 1; d = 0
        for j in range(i, len(src)):
            if src[j] == '{': d += 1
            elif src[j] == '}':
                d -= 1
                if d == 0: break
        out.setdefault(m.group(1), []).append(src[i:j + 1])
    return out

def ts_funcs(ts_src):
    out = {}
    for m in re.finditer(r'\n\s{2}(?:(?:public|private|protected|static|override|abstract|async)\s+)*(\w+)\s*\(([^()]|\([^()]*\))*\)\s*(?::\s*[^{=;]+)?\{', ts_src):
        name = m.group(1)
        if name in ('if', 'for', 'while', 'switch', 'catch', 'function'): continue
        i = m.end() - 1; d = 0
        for j in range(i, len(ts_src)):
            if ts_src[j] == '{': d += 1
            elif ts_src[j] == '}':
                d -= 1
                if d == 0: break
        out.setdefault(name, []).append(ts_src[i:j + 1])
    return out

KW = r'\b(const|let|var|auto|int|float|double|bool|boolean|number|string|void|unsigned|short|char|long|static|final|override|readonly|new|as|null|NULL|nullptr|undefined)\b'
def norm(s, lang):
    s = re.sub(r'/\*.*?\*/', ' ', s, flags=re.S); s = re.sub(r'//[^\n]*', ' ', s)
    s = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|`[^`]*`', 'S', s)
    if lang == 'ts':
        s = re.sub(r'\bf\(', '(', s); s = re.sub(r'Math\.(trunc|fround|imul)\(', '(', s)
        s = re.sub(r':\s*[\w<>\[\]|. ]+(?=[,)=;])', '', s)  # 类型注解
        s = s.replace('this.', '').replace('!', '').replace('===', '==').replace('!==', '!=')
    else:
        s = s.replace('->', '.').replace('::', '.').replace('this.', '')
        s = re.sub(r'\((int|float|double|short|char|bool)\)', '', s)
    s = re.sub(r'(\d+\.\d*|\d*\.\d+|\d+)[fF]?\b', lambda m: str(float(m.group(1))) if '.' in m.group(1) else m.group(1), s)
    s = re.sub(KW, '', s)
    return re.findall(r'[A-Za-z_]\w*|\d+(?:\.\d+)?|[^\s\w]', s)

def ts_files(t):
    if os.path.isfile(t): yield t; return
    for root, _, fs in os.walk(t):
        for f in fs:
            if f.endswith('.ts'): yield os.path.join(root, f)

rows = []
for tsp in ts_files(TARGET):
    s = open(tsp, encoding='utf-8').read()
    # 按 TS 路径镜像出 C++ 路径（R1）：packages/<包>/src/<相对路径>.ts → src/<包对应目录>/<相对路径>.cpp
    parts = os.path.normpath(tsp).split(os.sep)
    if 'packages' not in parts: continue
    k = parts.index('packages'); pkg = parts[k + 1]; rel = os.path.join(*parts[k + 3:])[:-3]
    base = {'world': 'src/world', 'client': 'src/client', 'util': 'src/util', 'platform': 'src/platform', 'nbt': 'src/nbt', 'core': 'src'}.get(pkg)
    if not base: continue
    cpp = os.path.join(REF, base, rel + '.cpp')
    if not os.path.exists(cpp): continue
    cls = os.path.basename(rel)
    cf = cpp_funcs(cpp, cls); tf = ts_funcs(s)
    for name, bodies in cf.items():
        if name.startswith('~') or name == cls: continue
        # C++ 的重载与 R10 改名后的实现方法（同名前缀）都算进来，取最相似的一对
        cand = [b for k, v in tf.items() if k == name or (k.startswith(name) and k[len(name):len(name) + 1].isupper()) for b in v]
        if not cand: continue
        best = (0.0, 0)
        for cb in bodies:
            a = norm(cb, 'cpp')
            if len(a) < 12: continue
            for tb in cand:
                r = difflib.SequenceMatcher(None, a, norm(tb, 'ts'), autojunk=False).ratio()
                if r > best[0]: best = (r, len(a))
        if best[1]: rows.append((best[0], best[1], f'{cls}::{name}', tsp))
rows.sort()
print(f'对照了 {len(rows)} 个函数；相似度 < {TH} 的 {sum(1 for r in rows if r[0] < TH)} 个：')
for r, n, nm, p in rows:
    if r < TH: print(f'  {r:.2f}  {n:4d} 词  {nm}  ({p})')
