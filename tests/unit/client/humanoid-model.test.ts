/**
 * G7 `HumanoidModel` 单测 —— 对应 packages/client/src/model/HumanoidModel.ts。
 *
 * 【验收（任务单 G 的原话）】`setupAnim` 在给定输入下的 7 个部件的角度/位置，逐位比。
 *
 * 【期望值怎么来】
 * - 能写死的地方写死（0 / 12 / ±5 / 0.5 …）。⚠ `bcos` 在 bob=0 时是
 *   `cos(0)*0.05f + 0.05f`，是 **0.1f 不是 0.05f**（那个 `+ 0.05f` 是抬手的基础偏移）。
 * - 要过 `Mth.sin/cos` 查表的地方（表值没法手算）用**关系式**钉，比如
 *   `leg0.xRot === f(arm1.xRot * 1.4f)` —— 这正好能钉住"左右交叉"这个最容易抄错的点。
 * - 查表里只有几个点是干净的：`cos(0) = 1`、`sin(f(0.5π)) = 1`（索引正好落在
 *   `65536/4 = 16384` 这个整数格上），所以挥击块那条用例挑 `attackTime = 0.5`。
 *
 * 【两个观察手段】
 * 1. `setupAnim` 是纯算术 —— 直接读 7 个部件的 `x/y/z` 与 `xRot/yRot/zRot`。
 * 2. 盒子几何靠 `ModelPart.cubes[*].polygons[*].vertices[*].pos` 反推包围盒
 *    （`cubes` / `polygons` / `pos` 都是 public）；贴图偏移只能穿过私有字段读。
 *
 * 【⚠ 必须先 `Mth.initMth()`】`Mth.sin/cos` 查的 65536 项表在模块加载时**全是 0**
 * （见 tests/unit/util/mth-preinit.test.ts —— 那正是它要钉的事），必须显式初始化，
 * 也就是 `NinecraftApp::init` 的第一行。忘了调的话所有三角函数一律返回 0：
 * 这个文件第一版就是这么挂的（5 条不过，`-cos(0)*5` 变成 -0）。
 *
 * 【不需要 createFlatLevel / initItems】这个类不碰实体注册表也不碰物品注册表 ——
 * 它只对传进来的 Mob 调 `isMob` / `getCarriedItem` / `getUseItemDuration`，
 * 所以假 Mob / 假 ItemInstance 直接 `as unknown as` 就够了。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GLES1, HumanoidModel, glSetContext } from '@mcpe/client';
import type { ModelPart } from '@mcpe/client';
import { UseAnim, type ItemInstance, type Mob } from '@mcpe/world';
import { Mth } from '@mcpe/util';

const f = Math.fround;

/** 一个部件的全部盒子顶点的包围盒 —— 用来间接看 addBox 的 x0/w/h/d 和膨胀量 g。 */
function bounds(part: ModelPart): number[][] {
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (const cube of part.cubes) {
    for (const poly of cube.polygons) {
      for (const v of poly.vertices) {
        xs.push(v.pos.x);
        ys.push(v.pos.y);
        zs.push(v.pos.z);
      }
    }
  }
  return [
    [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
    [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
  ];
}

/** 读私有的贴图偏移（对应 C++ 的 texOffs）。 */
function texOffs(part: ModelPart): number[] {
  const p = part as unknown as { xTexOffs: number; yTexOffs: number };
  return [p.xTexOffs, p.yTexOffs];
}

/** HumanoidModel.render 只问这三个方法 —— 不用真 Mob。 */
function fakeMob(opts: { carried?: ItemInstance | null; useDuration?: number } = {}): Mob {
  return {
    isMob: () => true,
    getCarriedItem: () => opts.carried ?? null,
    getUseItemDuration: () => opts.useDuration ?? 0,
  } as unknown as Mob;
}

const fakeBow = (): ItemInstance =>
  ({ getUseAnimation: () => UseAnim.bow }) as unknown as ItemInstance;
const fakeSword = (): ItemInstance =>
  ({ getUseAnimation: () => UseAnim.none }) as unknown as ItemInstance;

const PART_NAMES = ['head', 'hair', 'body', 'arm0', 'arm1', 'leg0', 'leg1'] as const;

/** 按名字取部件（顺序就是构造函数里的顺序）。 */
const parts = (m: HumanoidModel): ModelPart[] => PART_NAMES.map((n) => m[n]);

/** 把 7 个部件的某个方法都换成只记名字的桩，返回记录数组。 */
function recordCalls(m: HumanoidModel, method: 'render' | 'renderHorrible' | 'onGraphicsReset'): string[] {
  const seen: string[] = [];
  for (const name of PART_NAMES) {
    vi.spyOn(m[name], method).mockImplementation(() => {
      seen.push(name);
    });
  }
  return seen;
}

beforeAll(() => {
  Mth.initMth(); // ⚠ 不调这个，sin/cos 全是 0（见文件头）
});

beforeEach(() => {
  glSetContext(new GLES1(null)); // ModelPart 构造要 glGenBuffers2，必须有个上下文
  vi.restoreAllMocks();
});

describe('G7 构造函数：7 个部件、盒子、贴图偏移', () => {
  it('7 个部件按 C++ 初始化列表的顺序登记进 Model.cubes', () => {
    const m = new HumanoidModel();
    expect(m.cubes).toEqual(parts(m));
  });

  it('arm1 / leg1 带 mirror，其余不带', () => {
    const m = new HumanoidModel();
    expect(parts(m).map((p) => p.mirror)).toEqual([false, false, false, false, true, false, true]);
  });

  it('位置来自构造：手臂 y=2、腿 y=12，yOffset 叠在每一个部件上', () => {
    const m = new HumanoidModel();
    expect([m.head.x, m.head.y, m.head.z]).toEqual([0, 0, 0]);
    expect([m.body.x, m.body.y, m.body.z]).toEqual([0, 0, 0]);
    expect([m.arm0.x, m.arm0.y, m.arm0.z]).toEqual([-5, 2, 0]);
    expect([m.arm1.x, m.arm1.y, m.arm1.z]).toEqual([5, 2, 0]);
    expect([m.leg0.x, m.leg0.y, m.leg0.z]).toEqual([-2, 12, 0]);
    expect([m.leg1.x, m.leg1.y, m.leg1.z]).toEqual([2, 12, 0]);

    const o = new HumanoidModel(0, 3);
    expect([o.head.y, o.arm0.y, o.arm1.y, o.leg0.y, o.leg1.y]).toEqual([3, 5, 5, 15, 15]);
  });

  it('贴图偏移：arm0/arm1 是那个 `24 + 16` 的写法（= 40,16）', () => {
    const m = new HumanoidModel();
    expect(parts(m).map(texOffs)).toEqual([
      [0, 0],
      [32, 0],
      [16, 16],
      [40, 16],
      [40, 16],
      [0, 16],
      [0, 16],
    ]);
  });

  it('盒子尺寸：只有 hair 比 head 大一圈（`g + 0.5f` 是单给 hair 的）', () => {
    const m = new HumanoidModel();
    expect(bounds(m.head)).toEqual([
      [-4, -8, -4],
      [4, 0, 4],
    ]);
    expect(bounds(m.hair)).toEqual([
      [-4.5, -8.5, -4.5],
      [4.5, 0.5, 4.5],
    ]);
    expect(bounds(m.body)).toEqual([
      [-4, 0, -2],
      [4, 12, 2],
    ]);
    expect(bounds(m.arm0)).toEqual([
      [-3, -2, -2],
      [1, 10, 2],
    ]);
    expect(bounds(m.arm1)).toEqual([
      [-1, -2, -2],
      [3, 10, 2],
    ]);
    expect(bounds(m.leg0)).toEqual([
      [-2, 0, -2],
      [2, 12, 2],
    ]);
  });

  it('膨胀量 g 对每个盒子都生效（g=1 时 head 变成 ±5）', () => {
    expect(bounds(new HumanoidModel(1).head)).toEqual([
      [-5, -9, -5],
      [5, 1, 5],
    ]);
  });
});

describe('G7 构造函数：64×64 现代皮肤那一支', () => {
  it('外层再套一层 0.5 的壳（head/hair 不在那份清单里，还是一个盒子）', () => {
    const m = new HumanoidModel(0, 0, 64, 64);
    expect(m.head.cubes.length).toBe(1);
    expect(m.hair.cubes.length).toBe(1);
    expect(m.body.cubes.length).toBe(2);
    expect(bounds(m.body)).toEqual([
      [-4.5, -0.5, -2.5],
      [4.5, 12.5, 2.5],
    ]);
    expect(bounds(m.arm0)).toEqual([
      [-3.5, -2.5, -2.5],
      [1.5, 10.5, 2.5],
    ]);
    expect(bounds(m.leg1)).toEqual([
      [-2.5, -0.5, -2.5],
      [2.5, 12.5, 2.5],
    ]);
  });

  it('⚠ 两处 texOffs：前面先指 arm1→(32,48) / leg1→(16,48)，后面又被整组覆盖成 (48,48) / (0,48)', () => {
    const m = new HumanoidModel(0, 0, 64, 64);
    expect(parts(m).map(texOffs)).toEqual([
      [0, 0],
      [32, 0],
      [16, 32],
      [40, 32],
      [48, 48],
      [0, 32],
      [0, 48],
    ]);
  });

  it('默认的 64×32 不走进那一支', () => {
    const m = new HumanoidModel(0, 0, 64, 32);
    expect(m.body.cubes.length).toBe(1);
    expect(texOffs(m.arm1)).toEqual([40, 16]);
  });
});

describe('G7 setupAnim：基础姿态与两个开关', () => {
  it('头/脖子：45° 转成 π/4 弧度（C++ 的 `180 / Mth::PI`）', () => {
    const m = new HumanoidModel();
    m.attackTime = -10000; // 跳过挥击块，只看基础姿态
    m.setupAnim(0, 0, 0, 45, 30, 1);
    expect(m.head.yRot).toBe(f(45 / Mth.RADDEG));
    expect(m.head.xRot).toBe(f(30 / Mth.RADDEG));
    expect(m.head.yRot).toBeCloseTo(Math.PI / 4, 6);
  });

  it('⚠ 手腿交叉：arm1 拿 tcos0、arm0 拿 tcos1，leg0 跟着 arm1、leg1 跟着 arm0', () => {
    const m = new HumanoidModel();
    m.attackTime = -10000;
    m.setupAnim(1, 0.5, 0, 0, 0, 1);
    expect(m.arm1.xRot).not.toBe(0);
    expect(m.leg0.xRot).toBe(f(m.arm1.xRot * f(1.4)));
    expect(m.leg1.xRot).toBe(f(m.arm0.xRot * f(1.4)));
  });

  it('全零输入：bcos = cos(0)*0.05 + 0.05 = 0.1f，左右手臂对称地 ±0.1', () => {
    const m = new HumanoidModel();
    m.setupAnim(0, 0, 0, 0, 0, 1);
    expect(m.arm0.zRot).toBe(f(0.1));
    expect(m.arm1.zRot).toBe(-f(0.1));
    expect([m.arm0.xRot, m.arm1.xRot]).toEqual([0, 0]); // tcos/bsin/挥击项全为 0
    expect([m.leg0.y, m.leg1.y]).toEqual([12, 12]);
    expect([m.leg0.z, m.leg1.z]).toEqual([0, 0]);
    expect(m.head.y).toBe(0);
  });

  it('骑乘：腿被放平到 -π/2*0.8（yRot 一正一负）、手臂各叠 -π/2*0.4', () => {
    const m = new HumanoidModel();
    m.attackTime = -10000;
    m.riding = true;
    m.setupAnim(0, 0, 0, 0, 0, 1);
    expect(m.leg0.xRot).toBe(f((-Mth.PI / 2) * f(0.8)));
    expect(m.leg1.xRot).toBe(f((-Mth.PI / 2) * f(0.8)));
    expect(m.leg0.xRot).toBeCloseTo((-Math.PI / 2) * 0.8, 5);
    expect(m.leg0.yRot).toBe(f((Mth.PI / 2) * f(0.2)));
    expect(m.leg1.yRot).toBe(f((-Mth.PI / 2) * f(0.2)));
    expect(m.arm0.xRot).toBe(f((-Mth.PI / 2) * f(0.4))); // tcos1 = 0，只剩叠加项
  });

  it('⚠ 左右手是两个独立开关：holdingLeftHand 只压 arm1、holdingRightHand 只压 arm0', () => {
    const c = f((Mth.PI / 2.0) * f(0.2));

    const left = new HumanoidModel();
    left.attackTime = -10000;
    left.holdingLeftHand = true;
    left.setupAnim(0, 0, 0, 0, 0, 1);
    expect(left.arm1.xRot).toBe(-c);
    expect(left.arm0.xRot).toBe(0);

    const right = new HumanoidModel();
    right.attackTime = -10000;
    right.holdingRightHand = true;
    right.setupAnim(0, 0, 0, 0, 0, 1);
    expect(right.arm0.xRot).toBe(-c);
    expect(right.arm1.xRot).toBe(0);
  });

  it('潜行：body 前倾 0.5、腿抬高（y 12→9）前移（z 0→4）、头降到 1；松开全部还原', () => {
    const m = new HumanoidModel();
    m.attackTime = -10000;
    m.sneaking = true;
    m.setupAnim(0, 0, 0, 0, 0, 1);
    expect(m.body.xRot).toBe(f(0.5));
    expect([m.leg0.y, m.leg1.y]).toEqual([9, 9]);
    expect([m.leg0.z, m.leg1.z]).toEqual([4, 4]);
    expect(m.head.y).toBe(1);

    m.sneaking = false;
    m.setupAnim(0, 0, 0, 0, 0, 1);
    expect(m.body.xRot).toBe(0);
    expect([m.leg0.y, m.leg1.y]).toEqual([12, 12]);
    expect([m.leg0.z, m.leg1.z]).toEqual([0, 0]);
    expect(m.head.y).toBe(0);
  });
});

describe('G7 setupAnim：挥击块（attackTime > -9990）', () => {
  it('attackTime = 0（默认）：挥击块把手臂的 x/z 重写成 ∓5 / 0（正对前方）', () => {
    const m = new HumanoidModel();
    // 先塞几个假值 —— 不然这条用例分辨不出"块跑没跑"（构造函数给的正好也是 ∓5 / 0）
    m.arm0.x = 99;
    m.arm1.x = 99;
    m.arm0.z = 99;
    m.arm1.z = 99;
    m.setupAnim(0, 0, 0, 0, 0, 1);
    expect(m.body.yRot).toBe(0);
    expect([m.arm0.x, m.arm1.x]).toEqual([-5, 5]); // -cos(0)*5 / cos(0)*5
    expect(m.arm0.z).toBe(0);
    expect(Math.abs(m.arm1.z)).toBe(0);
  });

  it('attackTime = 0.5（挥到一半）：arm0.zRot 被挥击项压到 -0.4f 再叠 bcos', () => {
    const m = new HumanoidModel();
    m.attackTime = 0.5; // sin(f(0.5π)) 正好是干净的 1.0
    m.setupAnim(0, 0, 0, 0, 0, 1);
    expect(m.arm0.zRot).toBe(f(f(-0.4) + f(0.1)));
  });

  it('⚠ 边界是「大于」：attackTime = -9990 整块跳过（跑进去的话 sqrt(-9990) 会把 body.yRot 污染成 NaN）', () => {
    const m = new HumanoidModel();
    m.arm0.x = 99;
    m.attackTime = -9990;
    m.setupAnim(0, 0, 0, 0, 0, 1);
    expect(m.arm0.x).toBe(99); // 没被动过
    expect(Number.isNaN(m.body.yRot)).toBe(false);
    expect(m.arm0.zRot).toBe(f(0.1)); // 只剩 bcos
  });
});

describe('G7 setupAnim 与 render：bowAndArrow', () => {
  it('拉弓姿态：双臂被 -π/2 接管，且用 bcos 把挥击留下的 zRot 抹掉再叠呼吸', () => {
    const noBow = new HumanoidModel();
    noBow.attackTime = 0.5; // sin(attackTime*π) = 1 → 挥击给 arm0.zRot 留下 -0.4f
    noBow.setupAnim(0, 0, 0, 0, 0, 1);
    expect(noBow.arm0.zRot).toBe(f(f(-0.4) + f(0.1)));

    const bow = new HumanoidModel();
    bow.attackTime = 0.5;
    bow.bowAndArrow = true;
    bow.setupAnim(0, 0, 0, 0, 0, 1);
    expect(bow.arm0.xRot).toBe(f(-Mth.PI / 2.0));
    expect(bow.arm1.xRot).toBe(f(-Mth.PI / 2.0));
    expect(bow.arm0.zRot).toBe(f(0.1)); // 只剩 bcos —— 挥击那 -0.4f 被抹掉了
    expect(bow.arm1.zRot).toBe(-f(0.1));
    expect(bow.arm0.yRot).toBe(-f(0.1)); // -(0.1f - 0) + head.yRot(0)
    expect(bow.arm1.yRot).toBe(f(f(0.1) + f(0.4))); // 右手多 0.4f
  });

  it('⚠ render 的三道门：手里有东西 + useItemDuration > 0 + 动画是 bow，缺一不点', () => {
    const bowFlagDuringSetup = (mob: Mob): boolean => {
      const m = new HumanoidModel();
      let seen = false;
      vi.spyOn(m, 'setupAnim').mockImplementation(() => {
        seen = m.bowAndArrow;
      });
      parts(m).forEach((p) => vi.spyOn(p, 'render').mockImplementation(() => {}));
      m.render(mob, 0, 0, 0, 0, 0, 1);
      return seen;
    };
    expect(bowFlagDuringSetup(fakeMob({ carried: fakeBow(), useDuration: 10 }))).toBe(true);
    expect(bowFlagDuringSetup(fakeMob({ carried: fakeBow(), useDuration: 0 }))).toBe(false);
    expect(bowFlagDuringSetup(fakeMob({ carried: fakeSword(), useDuration: 10 }))).toBe(false);
    expect(bowFlagDuringSetup(fakeMob())).toBe(false);
  });

  it('帧末无条件清回 false —— 而且对 null 实体也走同一条路', () => {
    const m = new HumanoidModel();
    parts(m).forEach((p) => vi.spyOn(p, 'render').mockImplementation(() => {}));
    m.bowAndArrow = true;
    m.render(null, 0, 0, 0, 0, 0, 1);
    expect(m.bowAndArrow).toBe(false);
    expect(m.setupAnim).toBeDefined();
  });
});

describe('G7 render / renderHorrible / renderHumanoid / onGraphicsReset 的调用顺序', () => {
  it('render：先画 head 再画 hair（旋转和高度是先抄后画），顺序 head→hair→body→arm0→arm1→leg0→leg1', () => {
    const m = new HumanoidModel();
    const seen = recordCalls(m, 'render');
    m.sneaking = true; // head.y 在 setupAnim 里变成 1
    m.render(null, 0, 0, 0, 0, 0, 1);
    expect(seen).toEqual([...PART_NAMES]);
    expect(m.hair.y).toBe(1);
    expect([m.hair.xRot, m.hair.yRot, m.hair.zRot]).toEqual([
      m.head.xRot,
      m.head.yRot,
      m.head.zRot,
    ]);
  });

  it('⚠ renderHorrible 画 6 个部件、不画 hair（C++ 那一行本来就是注释掉的）', () => {
    const m = new HumanoidModel();
    const seen = recordCalls(m, 'renderHorrible');
    m.renderHorrible(0, 0, 0, 0, 0, 1);
    expect(seen).toEqual(['head', 'body', 'arm0', 'arm1', 'leg0', 'leg1']);
  });

  it('⚠ renderHumanoid（C++ 的死代码重载，R10 改名）：只抄角度、不抄 head.zRot；hair 只在 64×64 画', () => {
    const src = new HumanoidModel();
    src.head.yRot = 1;
    src.head.xRot = 2;
    src.head.zRot = 3;
    src.head.y = 4;
    src.arm0.xRot = 5;
    src.arm0.zRot = 6;
    src.arm1.xRot = 7;
    src.arm1.zRot = 8;
    src.leg0.xRot = 9;
    src.leg1.xRot = 10;

    const narrow = new HumanoidModel();
    const seenNarrow = recordCalls(narrow, 'render');
    narrow.renderHumanoid(src, 1);
    expect([narrow.head.yRot, narrow.head.xRot, narrow.head.y, narrow.head.zRot]).toEqual([
      1, 2, 4, 0,
    ]);
    expect([narrow.hair.yRot, narrow.hair.xRot, narrow.hair.zRot, narrow.hair.y]).toEqual([
      1, 2, 0, 4,
    ]);
    expect([narrow.arm0.xRot, narrow.arm0.zRot, narrow.arm1.xRot, narrow.arm1.zRot]).toEqual([
      5, 6, 7, 8,
    ]);
    expect([narrow.leg0.xRot, narrow.leg1.xRot]).toEqual([9, 10]);
    expect(seenNarrow).toEqual(['head', 'body', 'arm0', 'arm1', 'leg0', 'leg1']);

    const wide = new HumanoidModel(0, 0, 64, 64);
    const seenWide = recordCalls(wide, 'render');
    wide.renderHumanoid(src, 1);
    expect(seenWide).toEqual([...PART_NAMES]);
  });

  it('⚠ onGraphicsReset 里 hair 排在最后（和构造顺序不一样）', () => {
    const m = new HumanoidModel();
    const seen = recordCalls(m, 'onGraphicsReset');
    m.onGraphicsReset();
    expect(seen).toEqual(['head', 'body', 'arm0', 'arm1', 'leg0', 'leg1', 'hair']);
  });
});
