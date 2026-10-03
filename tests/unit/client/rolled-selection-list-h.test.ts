import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GLES1, glSetContext, Tesselator } from '@mcpe/client';
import { Mouse, MouseAction } from '@mcpe/platform';
import type { Minecraft } from '../../../packages/client/src/Minecraft';
import { RolledSelectionListH } from '../../../packages/client/src/gui/components/RolledSelectionListH';

// RolledSelectionListH（B8a）：选世界界面那个横向"翻牌"列表的基类。
//
// 这里能直接跑真的 render()，靠的是 S6/S7 那套无头 GL：`new GLES1(null)` 之后所有 gl 调用都是空转，
// Tesselator 照样攒顶点。于是拖动、点选这些**藏在 render() 里的状态机**能在这儿测，不用等浏览器。
//
// 布局沿用 Touch::WorldSelectionList 的真实参数：屏宽 640、每项 120。

const WIDTH = 640;
const HEIGHT = 480;
const Y0 = 24;
const Y1 = 448;
const ITEM_W = 120;
const ITEM_COUNT = 3;

/** xo 的居中值与左右边界，都由 (itemWidth - width) 推出来 */
const CENTERED = (ITEM_W - WIDTH) * 0.5; // -260
const MIN_X = (ITEM_W - WIDTH) / 2; // -260
const MAX_X = MIN_X + (ITEM_COUNT - 1) * ITEM_W; // -20

/** 列表只用到 minecraft.textures，其余一概不碰 */
const fakeMinecraft = {
  textures: { loadAndBindTexture: () => 0 },
} as unknown as Minecraft;

class TestList extends RolledSelectionListH {
  private itemCount: number;
  /** 记录基类回调了谁 */
  readonly selected: number[] = [];
  readonly started: number[] = [];
  cancelCount = 0;

  constructor(itemCount = ITEM_COUNT) {
    super(fakeMinecraft, WIDTH, HEIGHT, 0, WIDTH, Y0, Y1, ITEM_W);
    this.itemCount = itemCount;
  }

  protected override getNumberOfItems(): number {
    return this.itemCount;
  }
  protected override selectItem(item: number, _doubleClick: boolean): void {
    this.selected.push(item);
  }
  protected override isSelectedItem(item: number): boolean {
    return item === this.selected[this.selected.length - 1];
  }
  protected override renderItem(_i: number, _x: number, _y: number, _h: number, _t: Tesselator) {}
  protected override renderBackground(): void {}
  protected override selectStart(item: number, _localX: number, _localY: number): void {
    this.started.push(item);
  }
  protected override selectCancel(): void {
    this.cancelCount++;
  }

  // ---- 把 protected 状态开个口子给断言用 ----
  get pos(): { xo: number; xoo: number; inertia: number; drag: number } {
    return { xo: this.xo, xoo: this.xoo, inertia: this.xInertia, drag: this.dragState };
  }
  setPos(xo: number): void {
    this.xo = xo;
  }
  setHeader(render: boolean, height: number): void {
    this.setRenderHeader(render, height);
  }
  maxPos(): number {
    return this.getMaxPosition();
  }
  posAt(alpha: number): number {
    return this.getPos(alpha);
  }
  atRaw(x: number): number {
    return this.getItemAtXPositionRaw(x);
  }
}

/** 按下 / 抬起左键。B8a 只读按钮状态，鼠标位置由 render 的参数给。 */
function pressLeft(x: number, y: number): void {
  Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_DOWN, x, y);
}
function releaseLeft(x: number, y: number): void {
  Mouse.feed(MouseAction.ACTION_LEFT, MouseAction.DATA_UP, x, y);
}

beforeAll(() => {
  glSetContext(new GLES1(null)); // 无头模式：只维护状态与矩阵
});

// 鼠标状态是全局的，跨用例会串。注意 `Mouse.reset()` 只清滚轮那一位（照抄的 C++ 行为），
// 左键得自己抬起来。
beforeEach(() => {
  releaseLeft(0, 0);
});

describe('client/RolledSelectionListH', () => {
  it('构造时把内容居中，拖拽状态是 DRAG_OUTSIDE', () => {
    const l = new TestList();
    expect(l.pos.xo).toBe(CENTERED);
    expect(l.pos.xoo).toBe(CENTERED);
    expect(l.pos.drag).toBe(-2); // DRAG_OUTSIDE
    expect(l.pos.inertia).toBe(0);
  });

  describe('取项', () => {
    it('按 x 定位项，负数与越界都返回 -1', () => {
      const l = new TestList();
      expect(l.atRaw(0)).toBe(0);
      expect(l.atRaw(ITEM_W - 1)).toBe(0);
      expect(l.atRaw(ITEM_W)).toBe(1);
      expect(l.atRaw(ITEM_W * 2)).toBe(2);
      expect(l.atRaw(ITEM_W * ITEM_COUNT), '超出项数').toBe(-1);
      expect(l.atRaw(-1), '负数').toBe(-1);
    });

    it('getItemAtPosition 先看 y 在不在列表区间里，再看 x', () => {
      const l = new TestList();
      const midY = Math.trunc(HEIGHT / 2);
      // xo 居中(-260) 时，屏幕上的 x 要减掉 264 才落进内容坐标
      expect(l.getItemAtPosition(264, midY)).toBe(0);
      expect(l.getItemAtPosition(264 + ITEM_W, midY)).toBe(1);
      expect(l.getItemAtPosition(264, Y0 - 1), 'y 在列表上方').toBe(-1);
      expect(l.getItemAtPosition(264, Y1 + 1), 'y 在列表下方').toBe(-1);
      expect(l.getItemAtPosition(0, midY), 'x 太靠左').toBe(-1);
    });

    it('getMaxPosition = 项数 × 项宽 + 表头留白', () => {
      const l = new TestList();
      expect(l.maxPos()).toBe(ITEM_COUNT * ITEM_W);
      l.setHeader(true, 25);
      expect(l.maxPos()).toBe(ITEM_COUNT * ITEM_W + 25);
    });

    /**
     * 【参数叫 headerHeight，赋给的却是 headerWidth】C++ 的 `setRenderHeader(bool, int)` 里写的是
     * `headerWidth = _headerHeight;` —— 横向版把它当"横向留白"用；关掉时还要归零。
     * 这两条只能从 getMaxPosition 间接看出来（headerWidth 是 private）。
     */
    it('setRenderHeader 的留白走"宽度"字段，关掉时归零', () => {
      const l = new TestList();
      l.setHeader(false, 25);
      expect(l.maxPos(), '关掉时留白被清 0').toBe(ITEM_COUNT * ITEM_W);
    });
  });

  describe('capXPosition 夹边界', () => {
    it('拖出左边界就夹在最左，并把惯性清零', () => {
      const l = new TestList();
      l.setPos(MIN_X - 500);
      expect(l.capXPosition()).toBe(true);
      expect(l.pos.xo).toBe(MIN_X);
      expect(l.pos.inertia).toBe(0);
    });

    it('拖出右边界就夹在最右', () => {
      const l = new TestList();
      l.setPos(MAX_X + 500);
      expect(l.capXPosition()).toBe(true);
      expect(l.pos.xo).toBe(MAX_X);
    });

    it('在范围内不动、返回 false', () => {
      const l = new TestList();
      l.setPos((MIN_X + MAX_X) / 2);
      expect(l.capXPosition()).toBe(false);
      expect(l.pos.xo).toBe((MIN_X + MAX_X) / 2);
    });
  });

  describe('tick / getPos 的惯性积分', () => {
    it('没动过时原地不动', () => {
      const l = new TestList();
      l.tick();
      expect(l.posAt(0.5)).toBe(CENTERED);
    });

    it('拖动之后 tick 把这段位移记下来', () => {
      const l = new TestList();
      l.setPos(CENTERED + 100); // 假装被拖了 100
      expect(l.pos.inertia, '拖动本身不改 xInertia').toBe(0);
      l.tick();
      expect(l.posAt(0), 'xInertia 还是 0，位置就是 xoo').toBe(CENTERED + 100);
      expect(l.posAt(1)).toBe(CENTERED + 100);
    });
  });

  describe('render 里的输入状态机', () => {
    it('按下时不在任何拖拽分支，只是把状态推成 DRAG_NORMAL', () => {
      const l = new TestList();
      pressLeft(WIDTH / 2, 100);
      l.render(WIDTH / 2, 100, 1);
      expect(l.pos.drag).toBe(0); // DRAG_NORMAL
      expect(l.pos.xo, '还没动过，位置不变').toBe(CENTERED);
      expect(l.started, '这一下不算"按在某一项上"').toEqual([]);
      releaseLeft(WIDTH / 2, 100);
    });

    it('【第一次点击会被吃掉】从 DRAG_OUTSIDE 直接过到 DRAG_NORMAL，不触发选择', () => {
      const l = new TestList();
      pressLeft(WIDTH / 2, 100);
      l.render(WIDTH / 2, 100, 1); // 按下
      releaseLeft(WIDTH / 2, 100);
      l.render(WIDTH / 2, 100, 1); // 抬起
      expect(l.pos.drag, '抬起后落到 NO_DRAG').toBe(-1);
      expect(l.selected, '第一次点击不选中任何东西').toEqual([]);
    });

    it('松开之后再点同一处才算选中', () => {
      const l = new TestList();
      // 第一次：只是把状态从 DRAG_OUTSIDE 推到 NO_DRAG
      pressLeft(WIDTH / 2, 100);
      l.render(WIDTH / 2, 100, 1);
      releaseLeft(WIDTH / 2, 100);
      l.render(WIDTH / 2, 100, 1);

      // 第二次：这一下才走"按在某一项上"的分支
      pressLeft(WIDTH / 2, 100);
      l.render(WIDTH / 2, 100, 1);
      expect(l.started, '按下时告诉子类按住了哪一项').toEqual([0]);

      releaseLeft(WIDTH / 2, 100);
      l.render(WIDTH / 2, 100, 1);
      expect(l.selected, '抬起时选中它').toEqual([0]);
    });

    it('拖过之后松手不算点击（惯性太大），走 selectCancel', () => {
      const l = new TestList();
      pressLeft(WIDTH / 2, 100);
      l.render(WIDTH / 2, 100, 1); // 按下 → DRAG_NORMAL

      pressLeft(WIDTH / 2 - 180, 100); // 还按着，往左拖 180
      l.render(WIDTH / 2 - 180, 100, 1);
      expect(l.pos.xo, '往左拖，内容跟着往左走').toBe(CENTERED + 180);

      l.tick(); // 让这段位移变成惯性

      releaseLeft(WIDTH / 2 - 180, 100);
      l.render(WIDTH / 2 - 180, 100, 1);
      expect(l.selected, '拖拽不是点击').toEqual([]);
      expect(l.cancelCount).toBe(1);
    });

    it('拖出边界会被夹住，位置不会跑到内容外面', () => {
      const l = new TestList();
      pressLeft(WIDTH / 2, 100);
      l.render(WIDTH / 2, 100, 1);

      pressLeft(0, 100); // 往右狠拖
      l.render(0, 100, 1);
      expect(l.pos.xo).toBe(MAX_X);

      releaseLeft(0, 100);
      l.render(0, 100, 1);
    });

    it('y 在列表区间外时按下不改拖拽状态', () => {
      const l = new TestList();
      pressLeft(WIDTH / 2, Y0 - 10);
      l.render(WIDTH / 2, Y0 - 10, 1);
      expect(l.pos.drag, '还停在 DRAG_OUTSIDE').toBe(-2);
      releaseLeft(WIDTH / 2, Y0 - 10);
    });
  });

  it('没有项时 xo 被按回 0', () => {
    const l = new TestList(0);
    expect(l.pos.xo).toBe(CENTERED);
    l.render(WIDTH / 2, 100, 1);
    expect(l.pos.xo, 'render 里那句 if (getNumberOfItems() == 0) xo = 0').toBe(0);
  });
});
