"""把 C++ 源文件按网页版构建预处理（pp.py）后去掉注释、空行、#include，便于阅读和对照。
用法：python tools/porting/clean.py <参考源码里的文件> [更多文件...]
"""
import os, re, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
for f in sys.argv[1:]:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.cpp').name
    subprocess.run([sys.executable, os.path.join(here, 'pp.py'), f, tmp], check=True)
    s = open(tmp, encoding='utf-8').read()
    os.unlink(tmp)
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    s = re.sub(r'//[^\n]*', '', s)
    s = re.sub(r'\n\s*\n+', '\n', s).replace('\t', '  ')
    s = '\n'.join(l for l in s.split('\n') if not l.startswith(('#include', '#define', '#endif')))
    print('#####', os.path.basename(f))
    print(s)
