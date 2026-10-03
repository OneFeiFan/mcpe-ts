"""C++ 类 → TS 类的辅助转写（输出需人工审阅；只做机械部分）。
用法：python3 cls2ts.py <out.ts> <ClassName> <header.h> <impl.cpp|-> <extra-member-names-file>
"""
import re, sys
out_path, cls, hpath, cpath, extra = sys.argv[1:6]
def rd(p): return open(p,'rb').read().decode('utf-8','replace').replace('\r','')
H = re.sub(r'/\*.*?\*/', '', rd(hpath), flags=re.S)
C = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', rd(cpath), flags=re.S)) if cpath != '-' else ''
def strip_line_comments(s): return re.sub(r'//[^\n]*', '', s)
PRIM = {'int','short','char','long','float','double','unsigned','bool','signed','void','size_t'}
def ts_type(t):
    t = t.strip().replace('const ', '').replace('virtual ', '').replace('static ', '').replace('inline ','').strip()
    t = re.sub(r'\s+', ' ', t)
    ptr = t.endswith('*'); ref = t.endswith('&')
    t = t.rstrip('*& ').strip()
    m = re.match(r'std::vector<\s*(.+?)\s*\*?\s*>$', t)
    if m: return ts_type(m.group(1)) + '[]'
    base = t.split()[-1] if t else t
    if t in ('bool',): r = 'boolean'
    elif any(w in PRIM for w in t.split()): r = 'number' if t != 'void' else 'void'
    elif t in ('std::string','string'): r = 'string'
    else: r = base.replace('::', '.')
    if ptr and r not in ('number','boolean','string'): r += ' | null'
    return r
# ---- 头文件：找到类体
m = re.search(r'class\s+' + cls + r'\b[^{;]*\{', H)
i = m.end(); d = 1; k = i
while d: d += {'{':1,'}':-1}.get(H[k],0); k += 1
body = H[i:k-1]
members = set(); fields = []; inline_methods = []; decls = []
access = 'private'
pos = 0
while pos < len(body):
    mm = re.match(r'\s*(public|protected|private)\s*:', body[pos:])
    if mm: access = mm.group(1); pos += mm.end(); continue
    # 下一条：到 ';' 或 '{...}'
    j = pos; depth = 0
    while j < len(body):
        c = body[j]
        if c == '{': depth += 1
        elif c == '}': depth -= 1;
        if depth == 0 and c in ';}' :
            j += 1; break
        j += 1
    stmt = body[pos:j].strip(); pos = j
    st = strip_line_comments(stmt).strip()
    if not st or st.startswith('typedef') or st.startswith('friend') or st.startswith('#'): continue
    if '(' in st.split('{')[0] and not re.match(r'^(static\s+const|const\s+static)', st):
        sig = st.split('{')[0].strip().rstrip(';').strip()
        mm2 = re.match(r'^(.*?)\b(~?\w+)\s*\((.*)\)\s*(const)?\s*(=\s*0)?\s*$', sig, re.S)
        if mm2:
            name = mm2.group(2)
            if name.startswith('~'): continue
            members.add(name)
            if '{' in st:
                inline_methods.append((access, mm2.group(1), name, mm2.group(3), st[st.index('{'):], bool(mm2.group(5))))
            else:
                decls.append((access, mm2.group(1), name, mm2.group(3), bool(mm2.group(5))))
        continue
    # 字段
    st = st.rstrip(';')
    sm = re.match(r'^(static\s+const|const\s+static|static)?\s*(.+?)\s+([\w\s,=\*\-\+\.\(\)]+)$', st)
    if not sm: continue
    isstatic = bool(sm.group(1)); t = sm.group(2); names = sm.group(3)
    for part in names.split(','):
        part = part.strip(); init = None
        if '=' in part: part, init = [x.strip() for x in part.split('=', 1)]
        ptr = part.startswith('*'); part = part.lstrip('*').strip()
        arr = re.match(r'(\w+)\s*\[(.*)\]', part)
        nm = arr.group(1) if arr else part
        if not re.match(r'^\w+$', nm): continue
        members.add(nm)
        fields.append((access, isstatic, ts_type(t + ('*' if ptr else '')) + ('[]' if arr else ''), nm, init))
extra_names = set(open(extra).read().split()) if extra != '-' else set()
ALL = members | extra_names
# ---- cpp 方法
impls = {}
for mm in re.finditer(r'^(?![ \t])(?!return)[^\n;#=]*?\b' + cls + r'::(~?\w+)\s*\(', C, re.M):
    name = mm.group(1)
    if name.startswith('~'): continue
    pstart = mm.end() - 1; dd = 0; q = pstart
    while True:
        if C[q] == '(': dd += 1
        elif C[q] == ')':
            dd -= 1
            if dd == 0: break
        q += 1
    params = C[pstart+1:q]
    b = C.index('{', q); dd = 1; e = b + 1
    while dd: dd += {'{':1,'}':-1}.get(C[e],0); e += 1
    ret = C[C.rfind('\n', 0, mm.start())+1:mm.start()].strip()
    init_list = C[q+1:b].strip()
    impls.setdefault(name, []).append((ret, params, C[b:e], init_list))
TYPES_DECL = r'(?:const\s+)?(?:unsigned\s+|signed\s+)?(?:int|short|char|long|float|double|bool|size_t|auto|std::string|[A-Z]\w*(?:::\w+)?)(?:\s*[\*&])?'
def conv_params(ps):
    out = []; names = []
    ps = ps.strip()
    if not ps or ps == 'void': return '', names
    depth = 0; cur = ''; parts = []
    for ch in ps:
        if ch in '<(': depth += 1
        if ch in '>)': depth -= 1
        if ch == ',' and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    for p in parts:
        p = p.strip(); dflt = None
        if '=' in p: p, dflt = [x.strip() for x in p.split('=', 1)]
        mm = re.match(r'^(.*?)([\*&\s]+)?(\w+)$', p)
        if not mm: out.append('/*?' + p + '*/'); continue
        t = (mm.group(1) + (mm.group(2) or '')).strip(); n = mm.group(3)
        names.append(n)
        tt = ts_type(t)
        if dflt is not None:
            dflt = re.sub(r'(\d+\.?\d*)f\b', r'\1', dflt).replace('NULL', 'null').replace('::', '.')
            out.append(f'{n}: {tt} = {dflt}')
        else: out.append(f'{n}: {tt}')
    return ', '.join(out), names
KW = set('if else for while do return switch case break continue new delete true false null this super typeof const let var function class default sizeof'.split())
def conv_body(b, params):
    s = strip_line_comments(b)
    s = s.replace('super::', 'super.').replace(cls + '::', 'this.')
    s = s.replace('->', '.').replace('::', '.').replace('NULL', 'null')
    s = re.sub(r'(?<![\w.])(\d+\.\d*|\d+)f\b', r'\1', s)
    s = re.sub(r'(?<![=!<>])==(?!=)', '===', s); s = re.sub(r'!=(?!=)', '!==', s)
    s = re.sub(r'\(\s*(?:const\s+)?[A-Z]\w*\s*\*\s*\)\s*', '', s)  # (Foo*) 指针强转去掉
    s = re.sub(r'\(\s*(?:float|double)\s*\)\s*', '', s)
    s = re.sub(r'(^|[;{}\n]\s*)(?:const\s+)?([A-Z]\w*)\s+(\w+)\s*\(([^;]*)\)\s*;', r'\1let \3 = new \2(\4);', s)
    s = re.sub(r'(?<![\w.])(?<!new )\b(Vec3|AABB|ItemInstance|HitResult|TilePos|Pos)\(', r'new \1(', s)
    # 局部变量声明
    locals_ = set(params)
    def decl(m):
        names = m.group(2)
        for n in re.findall(r'(?:^|,)\s*\**\s*(\w+)', names): locals_.add(n)
        return m.group(1) + 'let ' + re.sub(r'(^|,)\s*\*', r'\1 ', names)
    s = re.sub(r'(^|[;{}\n(]\s*)' + TYPES_DECL + r'\s+((?:\*?\s*\w+(?:\s*=[^;,]+)?\s*,\s*)*\*?\s*\w+)(?=\s*[=;:])', decl, s)
    # 成员前缀 this.
    def mem(m):
        n = m.group(1)
        if n in locals_ or n in KW: return n
        return 'this.' + n
    s = re.sub(r'(?<![\w.\'"])\b(' + '|'.join(sorted(ALL, key=len, reverse=True)) + r')\b(?!\s*:)', mem, s) if ALL else s
    return s
lines = [f'// 由 cls2ts.py 从 {hpath} 与 {cpath} 转写，待人工审阅', f'export class {cls} {{']
for acc, st, t, n, init in fields:
    vis = '' if acc == 'public' else acc + ' '
    if st:
        init2 = re.sub(r'(\d+\.?\d*)f\b', r'\1', init or '0').replace('::','.')
        lines.append(f'  {vis}static readonly {n} = {init2};')
    else:
        dflt = 'null' if t.endswith('| null') else ('false' if t == 'boolean' else ("''" if t == 'string' else ('[]' if t.endswith('[]') else ('0' if t == 'number' else '/*?*/ null!'))))
        lines.append(f'  {vis}{n}: {t} = {dflt};')
done = set()
emitted = set()
BASE = sys.argv[6] if len(sys.argv) > 6 else 'super'
def emit(acc, ret, name, params, body, init_list=''):
    p, pn = conv_params(params)
    r = ts_type(ret) if ret and name not in (cls,) else ''
    vis = '' if acc == 'public' else acc + ' '
    head = f'  constructor({p})' if name == cls else f'  {vis}{name}({p}): {r or "void"}'
    key = (name, params.strip())
    if key in emitted: return
    emitted.add(key)
    lines.append('')
    b = conv_body(body, pn)
    if init_list:
        il = init_list.lstrip(':').strip()
        items = []; depth = 0; cur = ''
        for ch in il:
            if ch == '(': depth += 1
            if ch == ')': depth -= 1
            if ch == ',' and depth == 0: items.append(cur.strip()); cur = ''
            else: cur += ch
        if cur.strip(): items.append(cur.strip())
        pre = []
        for it in items:
            mm3 = re.match(r'^(\w+)\s*\((.*)\)$', it, re.S)
            if not mm3: continue
            n0, ex = mm3.group(1), conv_body('{'+mm3.group(2)+'}', pn)[1:-1].strip()
            if n0 in ('super', BASE): pre.insert(0, f'super({ex});')
            else: pre.append(f'this.{n0} = {ex};')
        b = '{\n    ' + '\n    '.join(pre) + b[1:]
    lines.append(head + ' ' + b.replace('\n', '\n  '))
for acc, ret, name, params, body, pure in inline_methods:
    emit(acc, ret, name, params, body); done.add(name)
for acc, ret, name, params, pure in decls:
    for (r, ps, bd, il) in impls.get(name, []):
        emit(acc, ret or r, name, ps, bd, il); done.add(name)
    if name not in impls and pure: lines.append(f'  // 纯虚：{name}({params})')
for name, lst in impls.items():
    if name not in done:
        for (r, ps, bd, il) in lst: emit('public', r, name, ps, bd, il)
lines.append('}')
open(out_path, 'w').write('\n'.join(lines) + '\n')
print('字段', len(fields), '内联方法', len(inline_methods), '声明', len(decls), '实现', sum(len(v) for v in impls.values()))
