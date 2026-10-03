"""对 cls2ts 的输出做第二轮机械修正。用法：post.py <file.ts> <基类方法名文件>"""
import re, sys
p, basefile = sys.argv[1], sys.argv[2]
base = set(open(basefile).read().split())
s = open(p, encoding='utf-8').read()
# 参数里的 | null 去掉（C++ 指针参数在调用处几乎都非空；确实可能为空的再手工加回）
def fix_params(m):
    return m.group(1) + re.sub(r'(\w+): ([\w.]+) \| null', r'\1: \2', m.group(2)) + m.group(3)
s = re.sub(r'^(  (?:public |protected |private |static |override )*\w+\()([^)]*)(\):)', fix_params, s, flags=re.M)
# override
def add_override(m):
    name = m.group(3)
    if name in base and 'override' not in m.group(2) and name != 'constructor':
        return m.group(1) + m.group(2) + 'override ' + name + '('
    return m.group(0)
s = re.sub(r'^(  )((?:public |protected |private )?)(\w+)\(', add_override, s, flags=re.M)
# 容器与数学
s = s.replace('.size()', '.length').replace('.push_back(', '.push(').replace('.empty()', '.length === 0')
for f in ['atan2', 'sqrt', 'sin', 'cos', 'fabs', 'floor', 'ceil', 'pow', 'abs', 'exp', 'log']:
    s = re.sub(r'(?<![\w.])' + f + r'\(', ('Math.abs(' if f == 'fabs' else 'Math.' + f + '('), s)
s = re.sub(r'PARTICLETYPE\((\w+)\)', r'ParticleType.\1', s)
s = s.replace('std.', '')
def int_cast(t):
    out = ''; i = 0
    while True:
        j = t.find('(int)', i)
        if j < 0: out += t[i:]; break
        out += t[i:j]; k = j + 5
        while k < len(t) and t[k] == ' ': k += 1
        if k < len(t) and t[k] == '(':
            d = 0; e = k
            while True:
                if t[e] == '(': d += 1
                elif t[e] == ')':
                    d -= 1
                    if d == 0: break
                e += 1
            out += 'Math.trunc' + t[k:e+1]; i = e + 1
        else:
            out += '(int)'; i = j + 5
    return out
s = int_cast(s)
s = re.sub(r'\(int\)\s*([\w.]+(?:\([^()]*\))?)', r'Math.trunc(\1)', s)
open(p, 'w', encoding='utf-8').write(s)
