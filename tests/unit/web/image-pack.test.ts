import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRELOAD } from '../../../apps/web/src/assets';
import { IMAGE_MANIFEST, IMAGE_NAMES } from '../../../apps/web/src/imageManifest';

// 材质包：清单与 public/images 下的文件一一对应，尺寸与 PNG 头一致；预加载的名字都在包里
const dir = new URL('../../../apps/web/public/images/', import.meta.url);

describe('材质包', () => {
  it('清单里的每张图都存在，PNG 头里的宽高与清单一致', () => {
    expect(IMAGE_MANIFEST.length).toBe(54);
    for (const [name, w, h] of IMAGE_MANIFEST) {
      const file = new URL(name, dir);
      expect(existsSync(file), name).toBe(true);
      const b = readFileSync(file);
      expect([b.readUInt32BE(16), b.readUInt32BE(20)], name).toEqual([w, h]);
    }
  });

  it('PRELOAD 的名字都在材质包里；terrain.png 是 256×256、每格 16×16', () => {
    for (const n of PRELOAD) expect(IMAGE_NAMES.has(n), n).toBe(true);
    expect(IMAGE_MANIFEST.find(([n]) => n === 'terrain.png')).toEqual(['terrain.png', 256, 256]);
  });

  it('GrassColor、FoliageColor 要求的 256×256 颜色表', () => {
    for (const n of ['misc/grasscolor.png', 'misc/foliagecolor.png']) {
      expect(IMAGE_MANIFEST.find(([m]) => m === n)!.slice(1)).toEqual([256, 256]);
    }
  });
});
