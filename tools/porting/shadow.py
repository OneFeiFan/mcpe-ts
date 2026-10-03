"""检查转写结果里“局部变量与成员同名、却在声明前就被使用”的地方（转写脚本最容易在这里漏加 this.）。
用法：python tools/porting/shadow.py <file.ts> <成员名清单.txt>
"""
import re, sys
p, memfile = sys.argv[1], sys.argv[2]
members = set(open(memfile).read().split())
s = open(p, encoding='utf-8').read()
src = s
# 本类成员
members |= set(re.findall(r'^  (?:(?:public|protected|private|static|readonly|override|abstract)\s+)*(\w+)\s*[:=(]', s, re.M))
for m in re.finditer(r'^  (?:(?:public|protected|private|static|override)\s+)*(\w+)\(([^)]*)\)[^{]*\{', s, re.M):
    i = s.index('{', m.start()); d = 1; k = i + 1
    while d: d += {'{':1,'}':-1}.get(s[k],0); k += 1
    body = s[i:k]
    params = set(re.findall(r'(\w+)\s*:', m.group(2)))
    for lm in re.finditer(r'\blet\s+(\w+)', body):
        n = lm.group(1)
        if n in members and n not in params:
            before = body[:lm.start()]
            uses = [u.start() for u in re.finditer(r'(?<![\w.])' + n + r'\b', before)]
            if uses:
                print(f'{m.group(1)}: 局部变量 {n} 与成员同名，声明前有 {len(uses)} 处未加 this.')
