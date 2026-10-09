"""用法：python tools/audit/cppclasses.py $REF /tmp/cpp.json
从参考 C++ 头文件里提取类结构：基类、方法（名字、是否 virtual、参数个数、是否 static / 纯虚 / 有默认参数）。
近似解析（够做对照清单用，不是完整的 C++ 解析器）。输出 JSON：{类名: {file, bases, methods: [{name, virtual, static, pure, nparams, ndefaults, sig}]}}"""
import os, re, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
REF = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else 'cpp.json'
DEFINED = {'PLATFORM_WEB', 'OPENGL_ES', 'USE_VBO'}
exec(open(os.path.join(HERE, '..', 'porting', 'pp.py')).read().split('src = open(sys.argv[1]')[0])  # 只取 expand()

def strip(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    s = re.sub(r'//[^\n]*', '', s)
    return s

def find_block(s, i):
    """从 s[i]=='{' 开始找配对的 '}'"""
    d = 0
    for j in range(i, len(s)):
        if s[j] == '{': d += 1
        elif s[j] == '}':
            d -= 1
            if d == 0: return j
    return len(s)

def split_params(p):
    p = p.strip()
    if p in ('', 'void'): return []
    out, d, cur = [], 0, ''
    for ch in p:
        if ch in '<([': d += 1
        elif ch in '>)]': d -= 1
        if ch == ',' and d == 0: out.append(cur); cur = ''
        else: cur += ch
    out.append(cur)
    return [x.strip() for x in out if x.strip()]

classes = {}
for root, _, fs in os.walk(os.path.join(REF, 'src')):
    if '/raknet' in root or '/server' in root and False: pass
    for f in fs:
        if not f.endswith('.h'): continue
        path = os.path.join(root, f)
        s = open(path, 'rb').read().decode('utf-8', 'replace').replace('\r', '')
        s = strip(expand(s))
        for m in re.finditer(r'\b(class|struct)\s+(\w+)\s*(?:final\s*)?(:\s*([^{;]+))?\{', s):
            name = m.group(2)
            bases = []
            if m.group(4):
                for b in m.group(4).split(','):
                    b = re.sub(r'\b(public|protected|private|virtual)\b', '', b).strip()
                    b = re.sub(r'<.*', '', b).strip()
                    if b: bases.append(b.split('::')[-1])
            start = s.index('{', m.end() - 1)
            end = find_block(s, start)
            body = s[start + 1:end]
            # 去掉内联函数体与嵌套类型，只留声明
            flat, k = '', 0
            while k < len(body):
                ch = body[k]
                if ch == '{':
                    e = find_block(body, k); flat += ';'; k = e + 1; continue
                flat += ch; k += 1
            methods = []
            for decl in re.split(r';', flat):
                d = ' '.join(decl.split())
                d = re.sub(r'^(public|protected|private)\s*:\s*', '', d)
                d = re.sub(r'\b(public|protected|private)\s*:\s*', '', d)
                mm = re.search(r'(?:^|[\s*&~])(~?\w+|operator\s*[^\s(]+)\s*\((.*)\)\s*(const)?\s*(override|final)?\s*(=\s*0)?\s*(:.*)?$', d)
                if not mm or d.startswith(('typedef', 'friend', 'using', 'return')): continue
                mname = mm.group(1)
                if mname in ('if', 'for', 'while', 'switch', 'sizeof', 'static_assert'): continue
                params = split_params(mm.group(2))
                methods.append({
                    'name': mname, 'virtual': bool(re.search(r'\bvirtual\b', d)) or bool(mm.group(4)),
                    'static': bool(re.search(r'\bstatic\b', d)), 'pure': bool(mm.group(5)),
                    'nparams': len(params), 'ndefaults': sum(1 for p in params if '=' in p),
                    'ctor': mname == name, 'dtor': mname.startswith('~'), 'sig': d[:160],
                })
            if name not in classes or len(methods) > len(classes[name]['methods']):
                classes[name] = {'file': os.path.relpath(path, REF), 'bases': bases, 'methods': methods}
json.dump(classes, open(OUT, 'w'), ensure_ascii=False, indent=0)
print(len(classes), 'classes')
