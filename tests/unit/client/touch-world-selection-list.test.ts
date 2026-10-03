import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GLES1, glSetContext } from '@mcpe/client';
import { Mouse, MouseAction } from '@mcpe/platform';
import type { LevelSummary } from '@mcpe/world';
import type { Minecraft } from '../../../packages/client/src/Minecraft';
import { TouchWorldSelectionList } from '../../../packages/client/src/gui/screens/TouchSelectWorldScreen';

// Touch::WorldSelectionList（B8d-2）：选世界界面那个横向翻牌列表。
//
// 三条要点：
//   ① 项数 = 世界数 + 1，最后那一张是 "Create new"；
//   ② 从构造函数到 commit() 之间 selectedItem **没有初值**（C++ 就是未初始化的，
//      这里照 PITFALLS 第 20 条给了 0）；
//   ③ 只有"当前选中的正好是 Create new 那一张"时按下才算选中它（selectStart）。

const WIDTH = 854;
const HEIGHT = 480;
const ITEM_W = 120;
/** 基类构造：x0=0, x1=width, y0=24, y1=height-32, itemWidth=120 → 初始 xo 居中 */
const CENTERED = (ITEM_W - WIDTH) * 0.5; // -367

function makeLevel(id: string, name: string, lastPlayed = 0, gameType = 0): LevelSummary {
  return { id, name, lastPlayed, gameType, sizeOnDisk: 0 };
}

const fakeMinecraft = {
  width: WIDTH,
  height: HEIGHT,
  font: { width: (s: string) => s.length * 6, height: () => 10, drawShadow: () => {} },
  platform: () => ({ getDateString: (s: number) => `date(${s})` }),
  textures: { loadAndBindTexture: () => 7 },
  useTouchscreen: () => true,
} as unknown as Minecraft;

function makeList(levels: LevelSummary[] = []): TouchWorldSelectionList {
  const l = new TouchWorldSelectionList(fakeMinecraft, WIDTH, HEIGHT);
  l.levels = levels;
  l.commit();
  return l;
}

/** 掀开 protected / private 看一眼 */
function raw(l: TouchWorldSelectionList): {
  xo: number;
  xInertia: number;
  dragState: number;
  mode: number;
  td: { cur: number; dur: number; start: number; stop: number };
  _descriptions: string[][];
  _imageNames: string[];
} {
  return l as unknown as never;
}

function select(l: TouchWorldSelectionList, item: number): void {
  (l as unknown as { selectItem: (i: number, d: boolean) => void }).selectItem.call(l, item, false);
}

beforeAll(() => {
  glSetContext(new GLES1(null)); // 无头模式：只维护状态与矩阵
});

beforeEach(() => {
  Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_UP, 0, 0); // 保证是"没按"的状态
  Mouse.reset();
});

describe('client/TouchWorldSelectionList', () => {
  it('项数 = 世界数 + 1（多出来的那张是 "Create new"）', () => {
    expect((makeList() as unknown as { getNumberOfItems(): number }).getNumberOfItems()).toBe(1);
    expect(
      (
        makeList([makeLevel('a', 'A'), makeLevel('b', 'B')]) as unknown as {
          getNumberOfItems(): number;
        }
      ).getNumberOfItems(),
    ).toBe(3);
  });

  it('constructor 之后 selectedItem 是 0（C++ 里没初值；给了 0）', () => {
    expect(makeList().selectedItem).toBe(0);
  });

  describe('commit', () => {
    it('每个世界生成四行描述与一个图名，并把 selectedItem 归 0', () => {
      const l = makeList([
        makeLevel('world-1', 'My World', 1234, 1),
        makeLevel('world-2', 'Other', 99, 0),
      ]);
      l.selectedItem = 99;
      // 再 commit 一次会往后追加（C++ 也是这样，没有清空）
      const fresh = makeList([makeLevel('w1', 'W1', 1234, 1), makeLevel('w2', 'W2', 99, 0)]);
      expect(raw(fresh)._descriptions.length).toBe(2);
      expect(raw(fresh)._descriptions[0]).toEqual([
        'W1',
        'date(1234)',
        'w1',
        'Creative', // gameType 1 = Creative
      ]);
      expect(raw(fresh)._descriptions[1]![3]).toBe('Survival'); // gameType 0
    });

    /** C++ 里那段 `if (id != Textures::InvalidId)` 用的是恒为 InvalidId 的局部变量 —— 永远是假 */
    it('预览图那条路是死的，永远用 gui/default_world.png', () => {
      const l = makeList([makeLevel('a', 'A'), makeLevel('b', 'B')]);
      expect(raw(l)._imageNames).toEqual(['gui/default_world.png', 'gui/default_world.png']);
    });

    it('一个世界都没有时什么都不生成', () => {
      const l = makeList();
      expect(raw(l)._imageNames).toEqual([]);
      expect(raw(l)._descriptions).toEqual([]);
    });
  });

  describe('selectItem', () => {
    it('往右一张：起一段 8 帧的补间', () => {
      const l = makeList([makeLevel('a', 'A')]);
      select(l, 1); // selectedItem 是 0，delta = +1
      expect(raw(l).mode).toBe(1);
      expect(raw(l).td.dur).toBe(8);
      expect(raw(l).td.cur).toBe(0);
      expect(raw(l).td.start).toBe(CENTERED);
      // width=854 时偏移正好抵消，所以 stop = 起点 + 一张牌宽
      expect(raw(l).td.stop).toBe(CENTERED + ITEM_W);
      expect(raw(l).xInertia, 'tweenInited 把惯性设成了 x0-x1（负数）').toBeLessThan(0);
    });

    it('往左一张：第一张上不动', () => {
      const l = makeList([makeLevel('a', 'A')]);
      l.selectedItem = 0;
      select(l, -1); // delta = -1 → stepLeft，但 selectedItem 已经是 0
      expect(raw(l).mode, 'stepLeft 里那句 if (selectedItem > 0) 拦住了').toBe(0);
    });

    it('点同一张：把世界记下来，而且只记第一次', () => {
      const levels = [makeLevel('a', 'A'), makeLevel('b', 'B')];
      const l = makeList(levels);
      select(l, 0);
      expect(l.hasPickedLevel).toBe(true);
      expect(l.pickedIndex).toBe(0);
      expect(l.pickedLevel).toEqual(levels[0]);

      l.selectedItem = 1;
      select(l, 1);
      expect(l.pickedIndex, '已经挑过一次就不再改').toBe(0);
    });

    it('选中的是最后那张 "Create new" 时不记世界', () => {
      const levels = [makeLevel('a', 'A')];
      const l = makeList(levels);
      l.selectedItem = levels.length; // 1，也就是 Create new
      select(l, 1);
      expect(l.hasPickedLevel).toBe(true);
      expect(l.pickedIndex).toBe(1);
      expect(l.pickedLevel, 'Create new 没有对应的世界').toBeNull();
    });

    it('selectedItem 是 -1 时什么都不做', () => {
      const l = makeList([makeLevel('a', 'A')]);
      l.selectedItem = -1;
      select(l, 0);
      expect(l.hasPickedLevel).toBe(false);
      expect(raw(l).mode).toBe(0);
    });
  });

  it('isSelectedItem 就是比编号', () => {
    const l = makeList([makeLevel('a', 'A')]);
    l.selectedItem = 1;
    const isSel = (i: number) =>
      (l as unknown as { isSelectedItem(i: number): boolean }).isSelectedItem.call(l, i);
    expect(isSel(1)).toBe(true);
    expect(isSel(0)).toBe(false);
  });

  describe('touched / capXPosition 会把补间掐掉', () => {
    it('touched 把 mode 归 0', () => {
      const l = makeList([makeLevel('a', 'A')]);
      select(l, 1);
      expect(raw(l).mode).toBe(1);
      (l as unknown as { touched: () => void }).touched.call(l);
      expect(raw(l).mode).toBe(0);
    });

    it('被夹到边界时把 mode 归 0', () => {
      const l = makeList([makeLevel('a', 'A')]);
      select(l, 1);
      expect(raw(l).mode).toBe(1);
      (l as unknown as { xo: number }).xo = CENTERED - 9999; // 拖到很左
      expect(l.capXPosition()).toBe(true);
      expect(raw(l).mode).toBe(0);
    });
  });

  describe('tick', () => {
    it('没在补间、惯性也小的时候，把选中的牌吸附到正中间', () => {
      const l = makeList([makeLevel('a', 'A'), makeLevel('b', 'B')]);
      l.selectedItem = -1;
      l.tick();
      // xo 居中、惯性 0 → 对齐后中间那张就是 0 号
      expect(l.selectedItem).toBe(0);
    });

    it('手指还按着就直接返回，不做吸附', () => {
      const l = makeList([makeLevel('a', 'A'), makeLevel('b', 'B')]);
      l.selectedItem = -1;
      Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_DOWN, 10, 10);
      l.tick();
      expect(l.selectedItem, '按着的时候不动').toBe(-1);
      Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_UP, 10, 10);
    });

    it('补间跑满 dur 帧就停住，并把位置定在 td.stop', () => {
      const l = makeList([makeLevel('a', 'A'), makeLevel('b', 'B')]);
      select(l, 1); // mode = 1, dur = 8
      const stop = raw(l).td.stop;
      for (let i = 0; i < 8; i++) l.tick();
      expect(raw(l).mode).toBe(0);
      expect(raw(l).xo).toBe(stop);
      expect(raw(l).xInertia).toBe(0);
    });
  });

  describe('selectStart / selectCancel', () => {
    const start = (l: TouchWorldSelectionList, item: number) =>
      (l as unknown as { selectStart(i: number, x: number, y: number): void }).selectStart.call(
        l,
        item,
        0,
        0,
      );
    const cancel = (l: TouchWorldSelectionList) =>
      (l as unknown as { selectCancel(): void }).selectCancel.call(l);
    const isNewSelected = (l: TouchWorldSelectionList) =>
      (l as unknown as { _newWorldSelected: boolean })._newWorldSelected;

    it('当前选中的正好是 "Create new" 时，按下才算选中它', () => {
      const levels = [makeLevel('a', 'A')];
      const l = makeList(levels);
      l.selectedItem = levels.length;
      start(l, levels.length);
      expect(isNewSelected(l)).toBe(true);

      // 【置位和清零是两件事】selectStart 只管置 true，清 true 是 selectCancel 的活 ——
      // 中间不 cancel 一下的话，上一次的 true 会一直留着。
      cancel(l);

      select(l, 0); // 换成第一个世界
      expect(l.selectedItem, 'selectItem 不改 selectedItem').toBe(levels.length);
      l.selectedItem = 0;
      start(l, 0);
      expect(isNewSelected(l), '选中的不是 Create new，不该置位').toBe(false);
    });

    it('selectCancel 把它清掉', () => {
      const levels = [makeLevel('a', 'A')];
      const l = makeList(levels);
      l.selectedItem = levels.length;
      start(l, levels.length);
      expect(isNewSelected(l)).toBe(true);
      cancel(l);
      expect(isNewSelected(l)).toBe(false);
    });
  });

  it('renderItem 跑得通：世界里那张牌和 "Create new" 那张都画一遍', () => {
    const l = makeList([makeLevel('a', 'A', 1, 0)]);
    const t = {
      color: () => {},
      begin: () => {},
      vertexUV: () => {},
      draw: () => {},
    };
    const renderItem = (
      l as unknown as {
        renderItem(i: number, x: number, y: number, h: number, tk: unknown): void;
      }
    ).renderItem;
    // i = 0 是世界那张（走 _descriptions[0]），i = 1 是 "Create new" 那张（走 touchgui.png）
    expect(() => {
      renderItem.call(l, 0, 0, 24, 116, t);
      renderItem.call(l, 1, 120, 24, 116, t);
    }).not.toThrow();
  });
});
