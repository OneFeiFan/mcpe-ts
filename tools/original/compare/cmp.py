"""逐张比较两组截图：像素差 ≤8 的比例，并拼成并排图。用法：python3 cmp.py origdir tsdir outdir"""
import sys, os
from PIL import Image, ImageChops
a_dir, b_dir, out = sys.argv[1:4]; os.makedirs(out, exist_ok=True)
for f in sorted(os.listdir(a_dir)):
    if not f.endswith('.png') or not os.path.exists(os.path.join(b_dir, f)): continue
    a = Image.open(os.path.join(a_dir, f)).convert('RGB'); b = Image.open(os.path.join(b_dir, f)).convert('RGB').resize(a.size)
    h = ImageChops.difference(a, b).convert('L').histogram(); r = sum(h[:9]) / sum(h) * 100
    w = Image.new('RGB', (a.width * 2, a.height)); w.paste(a, (0, 0)); w.paste(b, (a.width, 0)); w.save(os.path.join(out, f))
    print(f'{f}: 一致 {r:.2f}%')
