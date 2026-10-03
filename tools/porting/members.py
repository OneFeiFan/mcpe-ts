"""从 TS 类文件里收集类一级的成员名（字段与方法），写成一行一个的文本，供 cls2ts.py 判断哪些标识符要加 this.。
用法：python tools/porting/members.py <out.txt> <基类.ts> [更多基类.ts ...]
"""
import re, sys
def members_from_ts(path):
    s=open(path,encoding='utf-8').read()
    names=set()
    for line in s.split('\n'):
        if not re.match(r'^  \S', line): continue  # 只看类体第一层
        for m in re.finditer(r'(?:^|;)\s*(?:(?:public|protected|private|static|readonly|override|abstract|declare)\s+)*(\w+)\s*[?!]?\s*[:=(<;]', line):
            names.add(m.group(1))
    return names - {'constructor','if','for','while','return','switch','const','let','else'}
out=set()
for p in sys.argv[2:]: out|=members_from_ts(p)
open(sys.argv[1],'w').write('\n'.join(sorted(out)))
print(len(out), 'y' in out, 'xd' in out, 'level' in out)
