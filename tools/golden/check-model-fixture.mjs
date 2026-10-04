// 一次性自检：model.json 的结构是否合预期（不进测试套件，只用来人工看一眼）。
// 用法：node tools/golden/check-model-fixture.mjs
import { readFileSync } from 'node:fs';

const j = JSON.parse(readFileSync(new URL('../../fixtures/golden/model.json', import.meta.url), 'utf8'));

const problems = [];
const isNums = (a, n) => Array.isArray(a) && a.length === n && a.every((x) => typeof x === 'number');

for (const s of j.shapes) {
  if (!isNums(s.box, 7)) problems.push(`shape ${s.label}: box 不是 7 个数`);
  for (const c of s.cubes) {
    if (!isNums(c.bounds, 6)) problems.push(`${s.label}: bounds`);
    if (c.vertices.length !== 8) problems.push(`${s.label}: 顶点不是 8 个`);
    if (c.polygons.length !== 6) problems.push(`${s.label}: 面不是 6 个`);
    for (const p of c.polygons) if (p.vertices.length !== 4) problems.push(`${s.label}: 面不是 4 个角`);
  }
}
for (const m of j.models) {
  for (const p of m.parts) {
    if (!isNums(p.pos, 3)) problems.push(`${m.model}.${p.name}: pos`);
    if (!isNums(p.texSize, 2)) problems.push(`${m.model}.${p.name}: texSize`);
    for (const c of p.cubes) if (!isNums(c.bounds, 6)) problems.push(`${m.model}.${p.name}: bounds`);
  }
}

console.log('结构问题：', problems.length ? problems.join('; ') : '（无）');
console.log('shapes:', j.shapes.length, 'models:', j.models.length, 'totalCubes:', j.totalCubes);

const head = j.shapes[0].cubes[0];
const inflated = j.shapes[1].cubes[0];
const mirror = j.shapes[2].cubes[0];
console.log('head.box            =', JSON.stringify(j.shapes[0].box));
console.log('head.bounds         =', JSON.stringify(head.bounds), '← 成员：没外扩（g=0 所以看不出差别）');
console.log('arm_inflated.bounds =', JSON.stringify(inflated.bounds), '← 成员：没外扩');
console.log('arm_inflated.v[0]   =', JSON.stringify(inflated.vertices[0]), '← 顶点：外扩过');
console.log('arm_mirror.v[0]     =', JSON.stringify(mirror.vertices[0]), '← mirror 交换后（x 从 3 开始）');
console.log('arm_inflated.v[0]   =', JSON.stringify(inflated.vertices[0]), '← 同一个盒子不镜像（x 从 -3.5 开始）');

// 现代皮肤那套：body/arm0/arm1/leg0/leg1 各有两个 cube（外壳那层）
const m64 = j.models.find((m) => m.model === 'HumanoidModel64');
console.log('HumanoidModel64 各部件的 cube 数：', m64.parts.map((p) => `${p.name}=${p.cubes.length}`).join(' '));
console.log('arm1.texSize        =', JSON.stringify(m64.parts.find((p) => p.name === 'arm1').texSize));
