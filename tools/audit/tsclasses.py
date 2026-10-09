"""用法：python tools/audit/tsclasses.py . /tmp/ts.json
从 TS 源码里提取类结构：extends、方法（名字、override、static、参数个数）、构造函数里调用的 this.方法()，以及每个方法体里调用的 this.方法()。"""
import os, re, json, sys
ROOT = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else 'ts.json'

def strip(s):
    s = re.sub(r'/\*.*?\*/', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), s, flags=re.S)
    s = re.sub(r'//[^\n]*', '', s)
    s = re.sub(r"'(?:\\.|[^'\\\n])*'|\"(?:\\.|[^\"\\\n])*\"|`(?:\\.|[^`\\])*`", "''", s)
    return s

def block_end(s, i):
    d = 0
    for j in range(i, len(s)):
        c = s[j]
        if c == '{': d += 1
        elif c == '}':
            d -= 1
            if d == 0: return j
    return len(s)

classes = {}
MRE = re.compile(r'^\s{2}((?:(?:public|private|protected|static|override|abstract|readonly|async|get|set)\s+)*)([A-Za-z_$][\w$]*)\s*(<[^>(]*>)?\s*\(', re.M)
for root, _, fs in os.walk(os.path.join(ROOT, 'packages')):
    if 'node_modules' in root or '/dist' in root: continue
    for f in fs:
        if not f.endswith('.ts'): continue
        path = os.path.join(root, f)
        raw = open(path, encoding='utf-8').read()
        s = strip(raw)
        for m in re.finditer(r'\bclass\s+(\w+)\s*(?:<[^{]*?>)?\s*(?:extends\s+([\w.]+)(?:\s*<[^{]*?>)?(?:\(([^)]*)\))?)?\s*(?:implements\s+[^{]+)?\{', s):
            name, base, mixarg = m.group(1), m.group(2), m.group(3)
            start = m.end() - 1; end = block_end(s, start); body = s[start + 1:end]
            methods = {}
            for mm in MRE.finditer(body):
                mods, mname = mm.group(1), mm.group(2)
                if mname in ('if', 'for', 'while', 'switch', 'return', 'catch', 'function'): continue
                # 参数列表与方法体
                p0 = body.index('(', mm.end() - 1); d = 0
                for q in range(p0, len(body)):
                    if body[q] == '(': d += 1
                    elif body[q] == ')':
                        d -= 1
                        if d == 0: break
                params = body[p0 + 1:q].strip()
                after = body[q + 1:q + 200]
                bstart = body.find('{', q)
                semi = body.find(';', q)
                if bstart < 0 or (0 <= semi < bstart and '=>' not in body[q:bstart]):
                    mbody = ''  # 重载签名或抽象声明
                    is_sig = True
                else:
                    be = block_end(body, bstart); mbody = body[bstart:be]; is_sig = False
                nparams = 0 if not params else len([x for x in re.split(r',(?![^<{(\[]*[>})\]])', params) if x.strip()])
                calls = sorted(set(re.findall(r'\bthis\.(\w+)\s*\(', mbody)))
                protocalls = sorted(set(re.findall(r'(\w+)\.prototype\.(\w+)\.call\(', mbody)))
                e = methods.setdefault(mname, {'override': False, 'static': False, 'sigs': 0, 'impl': False, 'nparams': [], 'calls': [], 'protocalls': []})
                e['override'] |= 'override' in mods; e['static'] |= 'static' in mods
                if is_sig: e['sigs'] += 1
                else:
                    e['impl'] = True; e['nparams'].append(nparams); e['calls'] = sorted(set(e['calls']) | set(calls)); e['protocalls'] = protocalls
            if mixarg and not base: pass
            entry = {'file': os.path.relpath(path, ROOT), 'base': (mixarg.strip().split(',')[0] if base and base.endswith('Mixin') and mixarg else base), 'mixin': base if base and base.endswith('Mixin') else None, 'methods': methods}
            prev = classes.get(name)
            # 同名类：优先文件名与类名相同的那个（例如 OldInventory.ts 里也有一个 Inventory）
            if prev is None or (os.path.basename(entry['file'])[:-3] == name and os.path.basename(prev['file'])[:-3] != name):
                if prev is not None: entry['dups'] = prev.get('dups', []) + [prev['file']]
                classes[name] = entry
            else:
                prev.setdefault('dups', []).append(entry['file'])
json.dump(classes, open(OUT, 'w'), ensure_ascii=False, indent=0)
print(len(classes), 'classes')
