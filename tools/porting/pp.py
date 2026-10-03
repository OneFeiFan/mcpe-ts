"""极简预处理（网页版构建）：把指定文件里的 #ifdef / #if defined / #else / #endif 按“这些宏都未定义”展开（PLATFORM_WEB 视为已定义）。"""
import re, sys
DEFINED = {'PLATFORM_WEB', 'OPENGL_ES', 'USE_VBO'}
def expand(text):
    out = []; stack = []
    for line in text.split('\n'):
        t = line.strip()
        m = re.match(r'#\s*(ifdef|ifndef|if|elif|else|endif)\b(.*)', t)
        if m:
            kw, cond = m.group(1), m.group(2).strip()
            active = all(stack) if stack else True
            def ev(c):
                c = re.sub(r'defined\s*\(\s*(\w+)\s*\)', lambda mm: 'True' if mm.group(1) in DEFINED else 'False', c)
                c = re.sub(r'defined\s+(\w+)', lambda mm: 'True' if mm.group(1) in DEFINED else 'False', c)
                c = c.replace('||', ' or ').replace('&&', ' and ').replace('!', ' not ')
                c = re.sub(r'\b([A-Z_][A-Z0-9_]*)\b', lambda mm: 'True' if mm.group(1) in DEFINED else ('0' if mm.group(1) not in ('True','False') else mm.group(1)), c)
                try: return bool(eval(c))
                except Exception: return False
            if kw == 'ifdef': stack.append(cond in DEFINED)
            elif kw == 'ifndef': stack.append(cond not in DEFINED)
            elif kw == 'if': stack.append(ev(cond))
            elif kw == 'elif': stack[-1] = (not stack[-1]) and ev(cond)
            elif kw == 'else': stack[-1] = not stack[-1]
            elif kw == 'endif': stack.pop()
            continue
        if all(stack): out.append(line)
    return '\n'.join(out)
src = open(sys.argv[1], 'rb').read().decode('utf-8', 'replace').replace('\r', '')
open(sys.argv[2], 'w').write(expand(src))
