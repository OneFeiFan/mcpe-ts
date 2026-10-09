"""读原版存档 level.dat 里的世界时间（Time）。MCPE 0.6.1 的 level.dat：8 字节头（版本 + 长度，小端），后面是小端 NBT。
用法：python3 leveltime.py <level.dat>"""
import struct, sys
d = open(sys.argv[1], 'rb').read()[8:]
pos = 0
def rd(fmt):
    global pos
    v = struct.unpack_from('<' + fmt, d, pos); pos += struct.calcsize('<' + fmt); return v[0]
def name():
    n = rd('H'); global pos; s = d[pos:pos + n].decode('utf-8', 'replace'); pos += n; return s
def payload(t):
    global pos
    if t == 1: return rd('b')
    if t == 2: return rd('h')
    if t == 3: return rd('i')
    if t == 4: return rd('q')
    if t == 5: return rd('f')
    if t == 6: return rd('d')
    if t == 7: n = rd('i'); pos += n; return None
    if t == 8: return name()
    if t == 9:
        et = rd('b'); n = rd('i'); return [payload(et) for _ in range(n)]
    if t == 10:
        out = {}
        while True:
            tt = rd('b')
            if tt == 0: return out
            k = name(); out[k] = payload(tt)
    if t == 11: n = rd('i'); pos += 4 * n; return None
    raise ValueError(t)
t = rd('b'); name(); root = payload(t)
print(root.get('Time'))
