"""用法：python tools/audit/compare.py /tmp/cpp.json /tmp/ts.json . /tmp/findings.json
对照 C++ 与 TS 的类结构，列出继承、虚函数、重载、构造期间虚调用方面的可疑点（候选清单，要人工逐条确认）。"""
import sys
import json, re, os, collections
cpp = json.load(open(sys.argv[1])); ts = json.load(open(sys.argv[2]))
ROOT = sys.argv[3]
SKIP = {'operator'}
def cpp_anc(n, seen=None):
    out = []; seen = seen or set()
    for b in cpp.get(n, {}).get('bases', []):
        if b in cpp and b not in seen: seen.add(b); out.append(b); out += cpp_anc(b, seen)
    return out
def ts_anc(n):
    out = []; c = ts.get(n)
    while c and c.get('base') and c['base'] in ts and c['base'] not in out:
        out.append(c['base']); c = ts[c['base']]
    return out
children = collections.defaultdict(list)
for n, c in ts.items():
    if c.get('base'): children[c['base']].append(n)
def ts_desc(n):
    out = []; st = list(children.get(n, []))
    while st:
        x = st.pop()
        if x not in out: out.append(x); st += children.get(x, [])
    return out
def eff_virtual(cls, name):
    for c in [cls] + cpp_anc(cls):
        for m in cpp.get(c, {}).get('methods', []):
            if m['name'] == name and m['virtual']: return True
    return False
both = [n for n in ts if n in cpp]
F = collections.defaultdict(list)
src_cache = {}
def tsrc(n):
    p = os.path.join(ROOT, ts[n]['file'])
    if p not in src_cache: src_cache[p] = open(p, encoding='utf-8').read()
    return src_cache[p]
for n in both:
    c, t = cpp[n], ts[n]
    # 1 基类
    cb = c['bases'][0] if c['bases'] else None
    tb = t.get('base')
    if (cb or tb) and cb != tb and not (cb and t.get('mixin')):
        F['基类不一致'].append(f"{n}: C++ {':'.join(c['bases']) or '无'} / TS {tb or '无'}{' + ' + t['mixin'] if t.get('mixin') else ''}  ({t['file']})")
    names = collections.Counter(m['name'] for m in c['methods'] if not m['ctor'] and not m['dtor'])
    for m in c['methods']:
        nm = m['name']
        if m['ctor'] or m['dtor'] or m['static'] or nm.startswith('operator'): continue
        # 2 非虚函数在 TS 子类里被重写
        if not eff_virtual(n, nm):
            hit = [d for d in ts_desc(n) if nm in ts[d]['methods'] and not ts[d]['methods'][nm]['static']]
            if hit:
                callers = [k for k, v in t['methods'].items() if nm in v.get('calls', [])]
                protos = any(f'{n}.prototype.{nm}.call' in tsrc(x) for x in [n] + hit)
                sev = '高' if callers and not protos else '中'
                F['非虚函数在 TS 子类里被同名方法“重写”'].append(f"[{sev}] {n}.{nm} ← 子类 {', '.join(hit[:4])}；TS 基类里调用它的方法：{', '.join(callers[:4]) or '无'}{'（已用 prototype.call）' if protos else ''}  ({t['file']})")
    # 4 C++ 重写了、TS 没有同名方法
    for nm, cnt in names.items():
        if nm.startswith('operator') or nm.startswith('~'): continue
        decl = [m for m in c['methods'] if m['name'] == nm]
        if any(m['static'] for m in decl): continue
        in_base = any(nm in [mm['name'] for mm in cpp.get(a, {}).get('methods', [])] for a in cpp_anc(n))
        if in_base and eff_virtual(n, nm) and nm not in t['methods'] and not any(k.startswith(nm) and k != nm for k in t['methods']):
            txt = tsrc(n)
            if re.search(r'OMIT\([^)]*\):[^\n]*\b' + re.escape(nm) + r'\b', txt) or re.search(r'\b' + re.escape(nm) + r'\b', txt) is None and False: continue
            if re.search(r'OMIT\([^)]*\):[^\n]*\b' + re.escape(nm) + r'\b', txt): continue
            F['C++ 子类重写了虚函数，TS 子类里没有'].append(f"{n}.{nm}（C++ {c['file']}；TS {t['file']}）")
        # 5 重载组
        if cnt >= 2:
            ps = sorted(set(m['nparams'] for m in decl))
            tm = t['methods'].get(nm)
            alt = [k for k in t['methods'] if k != nm and k.startswith(nm)]
            F['C++ 重载组（核对 TS 的处理）'].append(f"{n}.{nm} ×{cnt}（参数个数 {ps}）→ TS：{('同名 ' + str(tm['sigs']) + ' 个签名') if tm else '无同名'}{'；改名 ' + ', '.join(alt[:4]) if alt else ''}")
    # 3 构造函数里的虚调用
    ctor = t['methods'].get('constructor')
    if ctor:
        for cl in ctor.get('calls', []):
            od = [d for d in ts_desc(n) if cl in ts[d]['methods'] and ts[d]['methods'][cl].get('impl')]
            if od:
                F['构造函数里调用了被子类重写的方法'].append(f"{n}.constructor → this.{cl}()，子类重写：{', '.join(od[:5])}  ({t['file']})")
# 6 只在 TS 有、C++ 没有的类（NEW / 拆出的辅助类），只计数
F_only_ts = [n for n in ts if n not in cpp]
json.dump(F, open(sys.argv[4], 'w'), ensure_ascii=False, indent=1)
for k, v in F.items(): print(f'{len(v):4d}  {k}')
print('TS 独有的类', len(F_only_ts), '；两边都有', len(both), '；C++ 有 TS 无', len([n for n in cpp if n not in ts]))
