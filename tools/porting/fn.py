"""打印 C++ 源文件里某个类的指定成员函数（完整函数体）。
用法：python tools/porting/fn.py <file.cpp> <ClassName> <name1,name2,...>
"""
import re, sys
path, cls = sys.argv[1], sys.argv[2]; names = sys.argv[3].split(',')
src=open(path,'rb').read().decode('utf-8','replace').replace('\r','')
for n in names:
    for m in re.finditer(r'^[^\n;]*?\b'+cls+r'::'+n+r'\s*\(', src, re.M):
        i=src.index('{',m.start()); d=1; k=i+1
        while d: d+={'{':1,'}':-1}.get(src[k],0); k+=1
        body='\n'.join(re.sub(r'\t','  ',l).rstrip()[:170] for l in src[m.start():k].split('\n') if l.strip() and not l.strip().startswith('//'))
        print(body); print()
