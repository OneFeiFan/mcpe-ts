import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EntityRenderDispatcher,
  GLES1,
  glSetContext,
  HumanoidMobRenderer,
  HumanoidModel,
  PlayerRenderer,
  Textures,
} from '@mcpe/client';
import { EntityRendererId, initItems, type Entity, type ItemInstance, type Mob } from '@mcpe/world';
import { createFlatLevel } from '../../helpers/headlessLevel';

// G11：PlayerRenderer —— 玩家的两套皮肤模型（64×32 默认 / 64×64 现代）、四件盔甲模型、
// 睡觉时位置与朝向交给床、名字标签，以及 EntityRenderDispatcher.setModernSkin 的转发。
// 这个文件钉：注册行的模型参数、构造末尾默认指向 32 皮肤、isModernPlayerSkin 四条分支、
// render 的"先切模型再调父类"顺序、四层护甲各自的可见性矩阵与贴图下标、睡觉分支的三段旋转。

const f = Math.fround;

/**
 * 记 GL 调用序列的假上下文。这边的被测代码只走 glRotatef2（setupRotations 睡觉分支），
 * gles.ts 的 glRotatef 直接调 `C().rotate(...)`，所以 override `rotate` 就能记到。
 * gl = null 时 GLES1 自己的矩阵操作静默空转（其他测试同款）。
 */
class SpyGL extends GLES1 {
  ops: string[] = [];
  constructor() {
    super(null);
  }
  override rotate(a: number, x: number, y: number, z: number): void {
    this.ops.push(`r:${a},${x},${y},${z}`);
    super.rotate(a, x, y, z);
  }
}

interface FakeTextures {
  loadTexture: ReturnType<typeof vi.fn>;
  getTemporaryTextureData: ReturnType<typeof vi.fn>;
}

/** 逐条可摆值的假贴图表：默认"有效 id + 64×64 数据"，即现代皮肤 */
function makeTextures(): FakeTextures {
  return {
    loadTexture: vi.fn(() => 3),
    getTemporaryTextureData: vi.fn(() => ({ w: 64, h: 64 })),
  };
}

/** private/protected 成员的访问口（只读断言用） */
interface Internals {
  model: HumanoidModel;
  humanoidModel: HumanoidModel;
  playerModel32: HumanoidModel;
  playerModel64: HumanoidModel;
  armorParts1: HumanoidModel;
  armorParts2: HumanoidModel;
  armor: HumanoidModel | null;
  bindTexture: (name: string) => void;
}
const inner = (r: PlayerRenderer): Internals => r as unknown as Internals;

/** 建渲染器并把静态的 entityRenderDispatcher 指过去（isModernPlayerSkin 要从它身上取 textures） */
function makeRenderer(textures: FakeTextures = makeTextures()): {
  r: PlayerRenderer;
  erd: { textures: FakeTextures; cameraEntity: Mob | null };
} {
  const erd = { textures, cameraEntity: null as Mob | null };
  const r = new PlayerRenderer(new HumanoidModel(0, 0, 64, 64), 0.5);
  r.init(erd as unknown as EntityRenderDispatcher);
  return { r, erd };
}

/** 假玩家：睡觉/护甲/名字/贴图名都能精确摆值 */
function fakePlayer(
  o: {
    alive?: boolean;
    sleeping?: boolean;
    bed?: [number, number, number];
    sleepRot?: number;
    armor?: (ItemInstance | null)[];
    name?: string;
    showNameTags?: boolean;
    texture?: string;
  } = {},
): Mob {
  const bed = o.bed ?? [0, 0, 0];
  return {
    isPlayer: () => true,
    isAlive: () => o.alive ?? true,
    isSleeping: () => o.sleeping ?? false,
    bedOffsetX: bed[0],
    bedOffsetY: bed[1],
    bedOffsetZ: bed[2],
    getSleepRotation: () => o.sleepRot ?? 0,
    getArmor: (slot: number) => o.armor?.[slot] ?? null,
    getTexture: () => o.texture ?? 'mob/char.png',
    name: o.name ?? '史蒂夫',
    entityRendererId: EntityRendererId.ER_PLAYER_RENDERER,
    level: { adventureSettings: { showNameTags: o.showNameTags ?? true } },
  } as unknown as Mob;
}

/** 假护甲实例：真 isArmorItem 会走到 `getItem().isArmor()` */
function fakeArmorItem(modelIndex: number, isArmor = true): ItemInstance {
  return { getItem: () => ({ isArmor: () => isArmor, modelIndex }) } as unknown as ItemInstance;
}

let gl: SpyGL;

beforeAll(() => {
  gl = new SpyGL();
  glSetContext(gl);
  createFlatLevel();
  initItems();
});

beforeEach(() => {
  gl.ops.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  EntityRenderDispatcher.destroy(); // 单例，别让用例之间互相污染
});

describe('PlayerRenderer（G11）', () => {
  it('ER_PLAYER_RENDERER 注册成 PlayerRenderer，注册用的就是 64×64 模型；相邻注册还在', () => {
    const erd = EntityRenderDispatcher.getInstance();
    const reg = erd.getRendererById(EntityRendererId.ER_PLAYER_RENDERER);
    expect(reg).toBeInstanceOf(PlayerRenderer);
    const passed = inner(reg as PlayerRenderer).playerModel64;
    expect(passed.texWidth).toBe(64);
    expect(passed.texHeight).toBe(64);
    // 注册行字面量 0.5 传进 float 形参 —— 按 PITFALLS 第 3 条包了 f()
    expect((reg as unknown as { shadowRadius: number }).shadowRadius).toBe(f(0.5));
    expect(erd.getRendererById(EntityRendererId.ER_TNT_RENDERER)).not.toBeNull();
    expect(erd.getRendererById(EntityRendererId.ER_CHICKEN_RENDERER)).not.toBeNull();
  });

  it('构造：model 与 humanoidModel 都默认指向 32 皮肤；playerModel64 就是传入的那个模型', () => {
    const passed = new HumanoidModel(0, 0, 64, 64);
    const r = new PlayerRenderer(passed, 0.5);
    const i = inner(r);
    expect(i.model).toBe(i.playerModel32);
    expect(i.humanoidModel).toBe(i.playerModel32);
    expect(i.playerModel64).toBe(passed);
    expect(i.playerModel32).not.toBe(passed);
    expect(i.playerModel32.texWidth).toBe(64);
    expect(i.playerModel32.texHeight).toBe(32);
    expect(i.armorParts1).not.toBe(i.armorParts2);
    expect(i.armorParts1.texHeight).toBe(32);
    expect(i.armorParts2.texHeight).toBe(32);
    // 两套盔甲只差外扩系数 g（1.0 / 0.5）—— 用头顶 cube 顶点里最小的 x 钉住它（-4 - g）
    const minX = (m: HumanoidModel): number =>
      Math.min(...m.head.cubes[0]!.polygons.flatMap((poly) => poly.vertices.map((v) => v.pos.x)));
    expect(minX(i.armorParts1)).toBe(-5); // -4 - 1.0
    expect(minX(i.armorParts2)).toBe(-4.5); // -4 - 0.5
  });

  it('shadowRadius 就是构造参数', () => {
    const { r } = makeRenderer();
    expect((r as unknown as { shadowRadius: number }).shadowRadius).toBe(0.5);
  });

  it('isModernPlayerSkin：贴图数据 64×64 → true；贴图名逐字传进 loadTexture', () => {
    const tex = makeTextures();
    const { r } = makeRenderer(tex);
    expect(r.isModernPlayerSkin(fakePlayer({ texture: 'mob/char.png' }))).toBe(true);
    expect(tex.loadTexture).toHaveBeenCalledWith('mob/char.png');
    expect(tex.getTemporaryTextureData).toHaveBeenCalledWith(3);
  });

  it('isModernPlayerSkin：64×32 / 拿不到数据 / 无效 id 都是 false；无效 id 不再取数据', () => {
    const tex = makeTextures();
    const { r } = makeRenderer(tex);
    const p = fakePlayer();

    tex.getTemporaryTextureData.mockReturnValue({ w: 64, h: 32 });
    expect(r.isModernPlayerSkin(p)).toBe(false);

    tex.getTemporaryTextureData.mockReturnValue(null);
    expect(r.isModernPlayerSkin(p)).toBe(false);

    tex.getTemporaryTextureData.mockClear();
    tex.loadTexture.mockReturnValue(Textures.InvalidId);
    expect(r.isModernPlayerSkin(p)).toBe(false);
    expect(tex.getTemporaryTextureData).not.toHaveBeenCalled();
  });

  it('setModernSkin：现代皮肤切到 playerModel64，旧皮肤切回 playerModel32，两边同步', () => {
    const tex = makeTextures();
    const { r } = makeRenderer(tex);
    const i = inner(r);
    const p = fakePlayer();

    r.setModernSkin(p);
    expect(i.model).toBe(i.playerModel64);
    expect(i.humanoidModel).toBe(i.playerModel64);

    tex.getTemporaryTextureData.mockReturnValue({ w: 64, h: 32 });
    r.setModernSkin(p);
    expect(i.model).toBe(i.playerModel32);
    expect(i.humanoidModel).toBe(i.playerModel32);
  });

  it('render：先 setModernSkin（拿实体当生物）再调父类，六个参数原样传', () => {
    const { r } = makeRenderer();
    const calls: string[] = [];
    let renderArgs: unknown[] = [];
    const skinSpy = vi.spyOn(r, 'setModernSkin').mockImplementation(() => {
      calls.push('skin');
    });
    vi.spyOn(HumanoidMobRenderer.prototype, 'render').mockImplementation((...args: unknown[]) => {
      calls.push('render');
      renderArgs = args;
    });

    const e = fakePlayer();
    r.render(e as Entity, 1, 2, 3, 4, 0.5);

    expect(calls).toEqual(['skin', 'render']);
    expect(skinSpy).toHaveBeenCalledWith(e);
    expect(renderArgs).toEqual([e, 1, 2, 3, 4, 0.5]);
  });

  it('prepareArmor：没穿护甲 → -1，不 bindTexture', () => {
    const { r } = makeRenderer();
    const bind = vi.spyOn(inner(r), 'bindTexture').mockImplementation(() => {});
    expect(r.prepareArmor(fakePlayer(), 0, 0)).toBe(-1);
    expect(bind).not.toHaveBeenCalled();
  });

  it('prepareArmor：穿着的不是护甲 → -1', () => {
    const { r } = makeRenderer();
    const notArmor = {
      getItem: () => ({ isArmor: () => false, modelIndex: 0 }),
    } as unknown as ItemInstance;
    const p = fakePlayer({ armor: [notArmor, null, null, null] });
    expect(r.prepareArmor(p, 0, 0)).toBe(-1);
  });

  it('prepareArmor layer=0/1：都走 armorParts1；文件名按 modelIndex+modelIndex 算', () => {
    const { r } = makeRenderer();
    const i = inner(r);
    const bind = vi.spyOn(i, 'bindTexture').mockImplementation(() => {});
    const p = fakePlayer({ armor: [fakeArmorItem(2), fakeArmorItem(2), null, null] });

    expect(r.prepareArmor(p, 0, 0)).toBe(1);
    expect(bind).toHaveBeenLastCalledWith('armor/iron_1.png'); // 2+2+0 = 4
    expect(i.armor).toBe(i.armorParts1);
    expect(i.armorParts1.head.visible).toBe(true);
    expect(i.armorParts1.body.visible).toBe(false);
    expect(i.armorParts1.arm0.visible).toBe(false);
    expect(i.armorParts1.arm1.visible).toBe(false);
    expect(i.armorParts1.leg0.visible).toBe(false);
    expect(i.armorParts1.leg1.visible).toBe(false);

    expect(r.prepareArmor(p, 1, 0)).toBe(1);
    expect(bind).toHaveBeenLastCalledWith('armor/iron_1.png'); // 2+2+0 = 4
    expect(i.armor).toBe(i.armorParts1);
    expect(i.armorParts1.head.visible).toBe(false);
    expect(i.armorParts1.body.visible).toBe(true);
    expect(i.armorParts1.arm0.visible).toBe(true);
    expect(i.armorParts1.arm1.visible).toBe(true);
    expect(i.armorParts1.leg0.visible).toBe(false);
    expect(i.armorParts1.leg1.visible).toBe(false);
  });

  it('prepareArmor layer=2/3：layer=2 走 armorParts2 + 下标 +1；layer=3 仍走 armorParts1', () => {
    const { r } = makeRenderer();
    const i = inner(r);
    const bind = vi.spyOn(i, 'bindTexture').mockImplementation(() => {});
    const p = fakePlayer({ armor: [null, null, fakeArmorItem(2), fakeArmorItem(2)] });

    expect(r.prepareArmor(p, 2, 0)).toBe(1);
    expect(bind).toHaveBeenLastCalledWith('armor/iron_2.png'); // 2+2+1 = 5
    expect(i.armor).toBe(i.armorParts2);
    expect(i.armorParts2.head.visible).toBe(false);
    expect(i.armorParts2.body.visible).toBe(true);
    expect(i.armorParts2.arm0.visible).toBe(false);
    expect(i.armorParts2.arm1.visible).toBe(false);
    expect(i.armorParts2.leg0.visible).toBe(true);
    expect(i.armorParts2.leg1.visible).toBe(true);

    expect(r.prepareArmor(p, 3, 0)).toBe(1);
    expect(bind).toHaveBeenLastCalledWith('armor/iron_1.png'); // 2+2+0 = 4
    expect(i.armor).toBe(i.armorParts1);
    expect(i.armorParts1.body.visible).toBe(false);
    expect(i.armorParts1.leg0.visible).toBe(true);
    expect(i.armorParts1.leg1.visible).toBe(true);
  });

  it('renderName：正常时把 Player.name 和 32 的距离传进 renderNameTag', () => {
    const { r } = makeRenderer();
    const tag = vi.spyOn(r, 'renderNameTag').mockImplementation(() => {});
    const p = fakePlayer({ name: '史蒂夫' });
    r.renderName(p, 1, 2, 3);
    expect(tag).toHaveBeenCalledWith(p, '史蒂夫', 1, 2, 3, 32);
  });

  it('renderName：相机实体是自己时不画', () => {
    const { r, erd } = makeRenderer();
    const tag = vi.spyOn(r, 'renderNameTag').mockImplementation(() => {});
    const p = fakePlayer();
    erd.cameraEntity = p;
    r.renderName(p, 1, 2, 3);
    expect(tag).not.toHaveBeenCalled();
  });

  it('renderName：showNameTags 关掉后不画', () => {
    const { r } = makeRenderer();
    const tag = vi.spyOn(r, 'renderNameTag').mockImplementation(() => {});
    r.renderName(fakePlayer({ showNameTags: false }), 1, 2, 3);
    expect(tag).not.toHaveBeenCalled();
  });

  it('setupPosition：不睡觉时原样转发给父类', () => {
    const { r } = makeRenderer();
    const sup = vi
      .spyOn(HumanoidMobRenderer.prototype, 'setupPosition')
      .mockImplementation(() => {});
    const p = fakePlayer();
    r.setupPosition(p, 0.1, 64, 0.3);
    expect(sup).toHaveBeenCalledWith(p, 0.1, 64, 0.3);
  });

  it('setupPosition：睡觉时位置加上床偏移（三处加法按 float 算）', () => {
    const { r } = makeRenderer();
    const sup = vi
      .spyOn(HumanoidMobRenderer.prototype, 'setupPosition')
      .mockImplementation(() => {});
    const p = fakePlayer({ sleeping: true, bed: [0.1, 0.2, 0.3] });
    r.setupPosition(p, 1, 64, 2);
    expect(sup).toHaveBeenCalledWith(p, f(1 + 0.1), f(64 + 0.2), f(2 + 0.3));
  });

  it('setupPosition：死了但还"在床上"不触发睡觉分支（isAlive 与 isSleeping 都要成立）', () => {
    const { r } = makeRenderer();
    const sup = vi
      .spyOn(HumanoidMobRenderer.prototype, 'setupPosition')
      .mockImplementation(() => {});
    const p = fakePlayer({ alive: false, sleeping: true, bed: [0.1, 0.2, 0.3] });
    r.setupPosition(p, 1, 64, 2);
    expect(sup).toHaveBeenCalledWith(p, 1, 64, 2);
  });

  it('setupRotations：睡觉时父类不被调 —— 转 sleepRotation、翻转 90°、再转 270°', () => {
    const { r } = makeRenderer();
    const sup = vi
      .spyOn(HumanoidMobRenderer.prototype, 'setupRotations')
      .mockImplementation(() => {});
    const p = fakePlayer({ sleeping: true, sleepRot: 180 });
    r.setupRotations(p, 0, 0, 0);
    expect(sup).not.toHaveBeenCalled();
    expect(gl.ops).toEqual(['r:180,0,1,0', 'r:90,0,0,1', 'r:270,0,1,0']);
  });

  it('setupRotations：不睡觉时原样转发给父类', () => {
    const { r } = makeRenderer();
    const sup = vi
      .spyOn(HumanoidMobRenderer.prototype, 'setupRotations')
      .mockImplementation(() => {});
    const p = fakePlayer();
    r.setupRotations(p, 0.5, 30, 1);
    expect(sup).toHaveBeenCalledWith(p, 0.5, 30, 1);
    expect(gl.ops).toEqual([]);
  });

  it('ERD.setModernSkin：转发到真注册实例，且按假贴图真的切到 64 模型', () => {
    // ⚠ 顺序有讲究：getInstance 构造时会挨个 r.init(this)（把静态指回真 dispatcher，textures 为 null），
    //   所以先构造单例，再把静态指到带假 textures 的 erd。
    const erdReal = EntityRenderDispatcher.getInstance();
    makeRenderer();
    const reg = erdReal.getRendererById(EntityRendererId.ER_PLAYER_RENDERER) as PlayerRenderer;
    const spy = vi.spyOn(reg, 'setModernSkin');
    const p = fakePlayer();
    erdReal.setModernSkin(p);
    expect(spy).toHaveBeenCalledWith(p);
    expect(inner(reg).model).toBe(inner(reg).playerModel64);
  });

  it('onGraphicsReset：四个模型都收到，再调父类', () => {
    const { r } = makeRenderer();
    const i = inner(r);
    const spies = [i.playerModel32, i.playerModel64, i.armorParts1, i.armorParts2].map((m) =>
      vi.spyOn(m, 'onGraphicsReset'),
    );
    const sup = vi
      .spyOn(HumanoidMobRenderer.prototype, 'onGraphicsReset')
      .mockImplementation(() => {});
    r.onGraphicsReset();
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
    expect(sup).toHaveBeenCalledTimes(1);
  });
});
