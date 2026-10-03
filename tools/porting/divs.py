"""列出 TS 文件里所有除法，供逐处判断“C++ 两边都是整数时要写 Math.trunc”。
用法：python tools/porting/divs.py <file.ts>
已经包在 Math.trunc / Math.floor 里的行不列出。
"""
import re, sys
for i, l in enumerate(open(sys.argv[1], encoding='utf-8').read().split('\n'), 1):
    t = l.strip()
    if t.startswith(('import', '*', '/*', '//')) or ' from ' in t:
        continue
    code = re.sub(r"'[^']*'|\"[^\"]*\"|`[^`]*`", '""', l).split('//')[0]
    if re.search(r'[\w)\]]\s*/\s*[\w(]', code) and 'Math.trunc' not in code and 'Math.floor' not in code:
        print(f'{i}: {l.strip()[:150]}')
