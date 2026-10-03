"""把 C++ 源文件里一段行号范围（通常是一个函数体）逐行转成 TS 草稿：类型声明 → let、-> → .、f 后缀、== → === 等。
用法：python tools/porting/cpp2ts.py <file.cpp> <起始行> <结束行>  （行号从 1 开始，含两端）
输出只是草稿：整数除法、指针、重载、成员前缀都要人工核对（见 .claude/skills/mcpe-porting/PITFALLS.md）。
"""
import re, sys
# 需要加 this. 的本类成员：默认是 TileRenderer 的；对别的类用环境变量 SELF_FIELDS、SELF_METHODS（逗号分隔）覆盖
import os
SELF_FIELDS=os.environ.get('SELF_FIELDS','fixedTexture,noCulling,xFlipTexture').split(',')
SELF_METHODS=os.environ.get('SELF_METHODS','renderFaceDown,renderFaceUp,renderNorth,renderSouth,renderWest,renderEast,tesselateBlockInWorld,getWaterHeight').split(',')
def conv_body(lines):
    out=[]
    for l in lines:
        s=l
        s=s.replace('Tesselator& t = Tesselator::instance;','const t = Tesselator.instance;')
        s=re.sub(r'\(\s*float\s*\)\s*\(', '(', s)
        s=re.sub(r'\bfloat\(', '(', s)
        s=re.sub(r'\(float\)\s*', '', s)
        s=re.sub(r'(\d+\.\d*|\d+)f\b', r'\1', s)
        s=s.replace('->','.').replace('::','.')
        s=re.sub(r'(?<![=!<>])==(?!=)','===',s); s=re.sub(r'!=(?!=)','!==',s)
        m=re.match(r'^(\s*)(?:const\s+)?(float|int|bool)\s+(.*);\s*$', s)
        if m:
            ind, typ, rest = m.groups()
            parts=[p.strip() for p in re.split(r',(?![^(]*\))', rest)]
            decl=[]
            for p in parts:
                decl.append(p if '=' in p else p+(' = false' if typ=='bool' else ' = 0'))
            s=f"{ind}let {', '.join(decl)};"
        for f in SELF_FIELDS: s=re.sub(r'(?<![\w.])'+f+r'\b', 'this.'+f, s)
        for f in SELF_METHODS: s=re.sub(r'(?<![\w.])'+f+r'\(', 'this.'+f+'(', s)
        s=re.sub(r'\(\s*\(\s*(x|y|z)\s*/\s*2\s*\+\s*(x|y|z)\s*/\s*2\s*\+\s*(x|y|z)\s*/\s*2\s*\)', r'((((\1 / 2) | 0) + ((\2 / 2) | 0) + ((\3 / 2) | 0))', s)
        out.append(s)
    return out
src=open(sys.argv[1],'rb').read().decode('utf-8','replace').replace('\r','')
L=src.split('\n')
a,b=int(sys.argv[2]),int(sys.argv[3])
body=[re.sub(r'\t','  ',x).rstrip() for x in L[a-1:b] if x.strip() and not x.strip().startswith('//')]
# 合并跨行语句（以 , 或 + 或 - 结尾的行）
merged=[]
for x in body:
    if merged and re.search(r'[,+\-(]\s*$', merged[-1]): merged[-1]=merged[-1].rstrip()+' '+x.strip()
    else: merged.append(x)
print('\n'.join(conv_body(merged[1:])))
