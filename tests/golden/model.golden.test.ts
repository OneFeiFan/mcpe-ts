import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { GLES1, ModelPart, glSetContext } from '@mcpe/client';

// 真值来自 tools/golden/harness_model.cpp（参考 C++ 源码 client/model/geom/*.cpp，x86-64 上生成）。
//
// 【这一份夹具怎么读】`fixtures/golden/model.json` 里是 C++ 按 `%.9g` 打印的十进制。
// 9 位有效数字正好是 float32 的往返精度，所以读回来**先 `fround`** 就还原成原来那个 float32。
// 比对是**逐位相等**：`expect(actual).toBe(f(expected))`。
// 直接写 `toBe(0.375031263)` 会红 —— 那个字面量是 double，和 float32 差一点点。
//
// 【两层内容，分两步用】
//   - `shapes`：6 个**合成形状**，专门打全 `Cube` 的分支（外扩 / mirror / 非立方体 / 非零 texOffs /
//     64×64 贴图）。**G3 覆盖的就是这一节。**
//   - `models`：`HumanoidModel`（64×32 与 64×64）与 `ChickenModel` 的每个部件。
//     这一节要等 G7 / G9 把这两个模型类写出来之后才比得上（那时候测试直接 `new HumanoidModel(...)`
//     再逐部件对夹具，不需要夹具里存 addBox 的原始参数）—— **别把这一节忘了**。
const G = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/model.json', import.meta.url), 'utf8'),
) as Golden;

const f = Math.fround;

type GoldenVertex = number[]; // [x, y, z, u, v]
type GoldenPolygon = { flip: boolean; vertices: GoldenVertex[] };
type GoldenCube = { bounds: number[]; vertices: GoldenVertex[]; polygons: GoldenPolygon[] };
type GoldenShape = {
  label: string;
  box: number[]; // [x0, y0, z0, w, h, d, g]
  texOffs: number[];
  mirror: boolean;
  texSize: number[];
  cubes: GoldenCube[];
};
type GoldenModel = { model: string; texWidth: number; texHeight: number; parts: unknown[] };
type Golden = {
  shapes: GoldenShape[];
  models: GoldenModel[];
  totalCubes: number;
};

/** `Cube` 的私有成员（C++ 里是 `private` + `friend class ModelPart`），测试里掏出来看 */
type CubeInternals = {
  vertices: { pos: { x: number; y: number; z: number }; u: number; v: number }[];
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
};
type PartInternals = { cubes: unknown[] };

const cubeOf = (p: ModelPart, i: number): CubeInternals =>
  (p as unknown as PartInternals).cubes[i] as unknown as CubeInternals;

/** 逐位比一串浮点 */
function expectFloats(actual: number[], expected: number[], what: string): void {
  expect(actual.length, `${what} 的个数`).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i], `${what}[${i}]`).toBe(f(expected[i]!));
  }
}

const vertexTuple = (v: { pos: { x: number; y: number; z: number }; u: number; v: number }): number[] => [
  v.pos.x,
  v.pos.y,
  v.pos.z,
  v.u,
  v.v,
];

beforeAll(() => glSetContext(new GLES1(null))); // 无头：ModelPart 构造时会 glGenBuffers2

describe('结构自检（先确认夹具本身没读歪）', () => {
  it('夹具的规模：shapes 6 个、models 3 个、cube 33 个', () => {
    expect(G.shapes.length).toBe(6);
    expect(G.models.length).toBe(3);
    expect(G.totalCubes).toBe(33);
  });
});

describe('合成形状：与 C++ 逐位一致（G3 的判据）', () => {
  for (const shape of G.shapes) {
    it(`${shape.label}`, () => {
      const [xo, yo] = shape.texOffs as [number, number];
      const [tw, th] = shape.texSize as [number, number];
      const [x0, y0, z0, w, h, d, g] = shape.box as [number, number, number, number, number, number, number];

      const mp = new ModelPart(xo, yo);
      mp.setTexSize(tw, th);
      mp.mirror = shape.mirror;
      mp.addBox(x0, y0, z0, w, h, d, g);

      expect((mp as unknown as PartInternals).cubes.length, '这个形状只有一个 cube').toBe(1);
      const want = shape.cubes[0]!;
      const got = cubeOf(mp, 0);

      // 1) 成员 x0..z1：**没外扩**的那一组（C++ 里被形参遮蔽，写在里面之后没人读）
      expectFloats([got.x0, got.y0, got.z0, got.x1, got.y1, got.z1], want.bounds, 'bounds');

      // 2) 8 个顶点
      expectFloats(got.vertices.flatMap(vertexTuple), want.vertices.flat(), 'vertices');

      // 3) 6 个面 × 4 个角
      const cube = (mp as unknown as { cubes: { polygons: { vertices: unknown[]; }[] }[] }).cubes[0]!;
      expect(cube.polygons.length, '6 个面').toBe(6);
      for (let j = 0; j < 6; j++) {
        const gp = cube.polygons[j] as unknown as {
          vertices: { pos: { x: number; y: number; z: number }; u: number; v: number }[];
        };
        expectFloats(
          gp.vertices.map(vertexTuple).flat(),
          want.polygons[j]!.vertices.flat(),
          `polygons[${j}]`,
        );
      }
    });
  }
});
