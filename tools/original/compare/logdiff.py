"""比较原版日志与 TS 浏览器控制台日志（同一套操作步骤）：去掉耗时、随机值、路径前缀与平台噪声行后做 unified diff。
用法：python3 logdiff.py <原版 game.log> <TS console.log>"""
import re, sys, difflib
NOISE = r'fps|SoundSystemAL|Skin|SKIN|Cape|CAPE|HttpClient|NEW MAX|^C: |^This: |Vsize|^\[vite\]|Download the React|Unrecognized feature|was preloaded|^Created folder|seed textbox clicked'
def norm(lines, ts):
    out = []
    for l in lines:
        l = l.rstrip('\n')
        if ts: l = re.sub(r'^\[[IWEV]\] ', '', l)
        if not l.strip() or re.search(NOISE, l): continue
        l = re.sub(r'\d+\.\d+', 'N', l); l = re.sub(r'random\.get : -?\d+', 'random.get : X', l); l = re.sub(r'\./games', '/games', l)
        out.append(l.strip())
    return out
o = norm(open(sys.argv[1], errors='ignore'), False); t = norm(open(sys.argv[2], errors='ignore'), True)
for d in difflib.unified_diff(o, t, '原版', 'TS', lineterm='', n=1): print(d)
