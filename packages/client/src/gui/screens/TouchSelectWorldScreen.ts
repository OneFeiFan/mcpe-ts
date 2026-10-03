/**
 * 1:1 移植 src/client/gui/screens/touch/TouchSelectWorldScreen.h 与 .cpp（B8d-2：只到 WorldSelectionList）。
 *
 * C++ 这一个文件里装了三个类：`Touch::WorldSelectionList`（横向"翻牌"的世界列表，本步）、
 * `Touch::DeleteWorldScreen`（删除确认）、`Touch::SelectWorldScreen`（外层屏）。
 * 后两个在 B8d-3 补上，文件结构照 C++ 保留在一起。
 *
 * 列表的每一"张牌"是一个世界：一张预览图 + 四行字（名字 / 上次游玩时间 / 目录名 / 游戏模式），
 * 左右滑动翻页、松手后有惯性并自动对齐到最近的牌。**最后多一张牌是"Create new"** ——
 * `getNumberOfItems()` 返回 `levels.size() + 1` 就是为它留的。
 *
 * 部分（都是本项目还没移植的东西）：
 *   - `platform()->getDateString()` 在 TS 里是基类空实现（ADAPTED(Web)，见 AppPlatform）；
 *   - 预览图那条路是**死的**（见 `commit()` 里的说明），永远用 `gui/default_world.png`。
 */
import type { LevelSummary, LevelSummaryList } from '@mcpe/world';
import { LevelSettings } from '@mcpe/world';
import { Mth } from '@mcpe/util';
import { Mouse, MouseAction } from '@mcpe/platform';
import type { Minecraft } from '../../Minecraft';
import { Tesselator } from '../../renderer/Tesselator';
import { TweenData } from '../TweenData';
import { RolledSelectionListH } from '../components/RolledSelectionListH';

/** C++ 里是这个 .cpp 内部的一个 static 函数（PITFALLS 第 14 条：提到模块级） */
function quadraticInOut(t: number, dur: number, start: number, stop: number): number {
  const delta = stop - start;
  const T = (t / dur) * 2.0;
  if (T < 1) return 0.5 * delta * T * T + start;
  return -0.5 * delta * ((T - 1) * (T - 3) - 1) + start;
}

/** C++ 的 `StringVector`（世界描述的四行字） */
type StringVector = string[];

export class TouchWorldSelectionList extends RolledSelectionListH {
  /** 当前选中的是第几张牌。**C++ 里没在构造函数里初始化** —— 只有 commit() 里有 >= 1 个世界时
   *  才被设成 0；一个世界都没有时它一直是未初始化的值（PITFALLS 第 20 条：不复刻未定义行为，给 0）。 */
  selectedItem = 0;
  private _newWorldSelected: boolean;
  /** 【死字段，照抄】只在构造函数里被赋过一次值，从没被读过 */
  private _height: number;
  /** 外部（SelectWorldScreen）往里塞的，commit() 再据此生成描述与图名 */
  levels: LevelSummaryList = [];
  private _descriptions: StringVector[] = [];
  private _imageNames: string[] = [];
  /** 有没有挑定一个世界（SelectWorldScreen::tick 靠它决定要不要真的进世界） */
  hasPickedLevel: boolean;
  /** 挑中的那个世界的摘要（`pickedIndex == levels.size()` 时没意义 —— 那是在点 "Create new"） */
  pickedLevel: LevelSummary | null = null;
  pickedIndex: number;
  /** 【死字段，照抄】只在构造函数里被赋过一次值，从没被读过 */
  private stoppedTick: number;
  private currentTick: number;
  /** 【死字段，照抄】头文件里声明了，.cpp 里一次都没出现过 */
  private accRatio = 0;
  /** 0 = 不在补间，1 = 正在补间（stepLeft/stepRight/松手对齐都走它） */
  private mode: number;
  private td = new TweenData();

  constructor(minecraft: Minecraft, width: number, height: number) {
    super(minecraft, width, height, 0, width, 24, height - 32, 120);
    this._height = height;
    this.hasPickedLevel = false;
    this.pickedIndex = -1;
    this.currentTick = 0;
    this.stoppedTick = -1;
    this.mode = 0;
    this._newWorldSelected = false;
    this._renderBottomBorder = false;
  }

  protected override getNumberOfItems(): number {
    return this.levels.length + 1; // +1 是那张 "Create new"
  }

  protected override selectItem(item: number, _doubleClick: boolean): void {
    if (this.selectedItem < 0) return;
    const delta = item - this.selectedItem;
    if (delta === -1) this.stepLeft();
    if (delta === +1) this.stepRight();
    if (delta === 0) {
      if (!this.hasPickedLevel) {
        this.hasPickedLevel = true;
        this.pickedIndex = item;
        if (item < this.levels.length) this.pickedLevel = this.levels[item]!;
      }
    }
  }

  protected override isSelectedItem(item: number): boolean {
    return item === this.selectedItem;
  }

  protected override renderBackground(): void {}

  protected override renderItem(i: number, x: number, y: number, _h: number, t: Tesselator): void {
    const centerx = x + Math.trunc(this.itemWidth / 2);
    // 离屏幕中心越远越暗，最近的是 1.1（下面再夹到 1），最暗 0.2
    let a0 = Mth.Max(1.1 - Math.abs(Math.trunc(this.width / 2) - centerx) * 0.0055, 0.2);
    if (a0 > 1) a0 = 1;
    const textColor = Math.trunc(255.0 * a0) * 0x010101;
    const textColor2 = Math.trunc(140.0 * a0) * 0x010101;
    const TX = centerx - Math.trunc(this.itemWidth / 2) + 5;
    const TY = y + 44;
    const font = this.minecraft.font!;
    if (i < this.levels.length) {
      const v = this._descriptions[i]!;
      this.drawString(font, v[0]!, TX, TY + 0, textColor);
      this.drawString(font, v[1]!, TX, TY + 10, textColor2);
      this.drawString(font, v[2]!, TX, TY + 20, textColor2);
      this.drawString(font, v[3]!, TX, TY + 30, textColor2);
      this.minecraft.textures!.loadAndBindTexture(this._imageNames[i]!);
      // 【这一句是废的】它在 t.begin() 之前，颜色马上被下面的 t.color() 覆盖掉。照抄。
      t.color(0.3, 1.0, 0.2);
      const IY = y - 8;
      t.begin();
      t.color(textColor);
      t.vertexUV(centerx - 32, IY, this.blitOffset, 0, 0.125);
      t.vertexUV(centerx - 32, IY + 48, this.blitOffset, 0, 0.875);
      t.vertexUV(centerx + 32, IY + 48, this.blitOffset, 1, 0.875);
      t.vertexUV(centerx + 32, IY, this.blitOffset, 1, 0.0);
      t.draw();
    } else {
      this.drawCenteredString(font, 'Create new', centerx, TY + 12, textColor);
      this.minecraft.textures!.loadAndBindTexture('gui/touchgui.png');
      const selected = this._newWorldSelected;
      const W = 54.0;
      const H = 54.0;
      const IY = y;
      const u0 = 168.0 / 256.0;
      const u1 = (168.0 + W) / 256.0;
      let v0 = 32.0 / 256.0;
      let v1 = (32.0 + H) / 256.0;
      // 按下时换成下面那半张图（"按下"的高亮态）
      if (selected) {
        v0 += H / 256.0;
        v1 += H / 256.0;
      }
      t.begin();
      t.color(textColor);
      t.vertexUV(centerx - W * 0.5, IY, this.blitOffset, u0, v0);
      t.vertexUV(centerx - W * 0.5, IY + H, this.blitOffset, u0, v1);
      t.vertexUV(centerx + W * 0.5, IY + H, this.blitOffset, u1, v1);
      t.vertexUV(centerx + W * 0.5, IY, this.blitOffset, u1, v0);
      t.draw();
    }
  }

  private stepLeft(): void {
    if (this.selectedItem > 0) {
      const xoffset = Math.trunc(
        this.xo - (this.selectedItem * this.itemWidth + (this.itemWidth - this.width) * 0.5),
      );
      this.td.start = this.xo;
      this.td.stop = this.xo - this.itemWidth - xoffset;
      this.td.cur = 0;
      this.td.dur = 8;
      this.mode = 1;
      this.tweenInited();
    }
  }

  private stepRight(): void {
    if (this.selectedItem >= 0 && this.selectedItem < this.getNumberOfItems() - 1) {
      const xoffset = Math.trunc(
        this.xo - (this.selectedItem * this.itemWidth + (this.itemWidth - this.width) * 0.5),
      );
      this.td.start = this.xo;
      this.td.stop = this.xo + this.itemWidth - xoffset;
      this.td.cur = 0;
      this.td.dur = 8;
      this.mode = 1;
      this.tweenInited();
    }
  }

  /** 把外部塞进来的 `levels` 变成"每张牌怎么画"的两份数据 */
  commit(): void {
    for (let i = 0; i < this.levels.length; ++i) {
      // 【死代码照抄】C++ 在这里先拼了一个 `level.name + "/preview.png"`，然后拿一个初值就是
      // InvalidId 的局部变量去判 `if (id != Textures::InvalidId)` —— 那个能把 id 变成有效值的
      // 调用压根没写，所以条件**永远为假**，永远走 else 用默认图。拼出来的名字没有任何副作用，
      // 不保留（别以为"这里该去加载预览图"）。
      this._imageNames.push('gui/default_world.png');
      const lines: StringVector = [];
      lines.push(this.levels[i]!.name);
      lines.push(this.minecraft.platform()!.getDateString(this.levels[i]!.lastPlayed));
      lines.push(this.levels[i]!.id);
      lines.push(LevelSettings.gameTypeToString(this.levels[i]!.gameType));
      this._descriptions.push(lines);
      this.selectedItem = 0;
    }
  }

  override tick(): void {
    super.tick();
    ++this.currentTick;
    // 手指还按着、或者刚刚按下（dragState == DRAG_NORMAL）就不做惯性/对齐
    if (Mouse.isButtonDown(MouseAction.ACTION_LEFT) || this.dragState === 0) return;
    this.selectedItem = -1;
    if (this.mode === 1) {
      if (++this.td.cur === this.td.dur) {
        this.mode = 0;
        this.xInertia = 0;
        this.xoo = this.xo = this.td.stop;
        this.selectedItem = this.getItemAtPosition(
          Math.trunc(this.width / 2),
          Math.trunc(this.height / 2),
        );
      } else {
        this.tweenInited();
      }
      return;
    }
    const speed = Math.abs(this.xInertia);
    const slowEnoughToBeBothered = speed < 5.0;
    if (!slowEnoughToBeBothered) {
      this.xInertia = this.xInertia * 0.9;
      return;
    }
    this.xInertia *= 0.8;
    if (speed < 1 && this.dragState < 0) {
      const offsetx = Math.trunc((this.width - this.itemWidth) / 2);
      const pxo = this.xo + offsetx;
      let index = this.getItemAtXPositionRaw(Math.trunc(pxo - 10 * this.xInertia));
      const indexPos = index * this.itemWidth;
      let diff = indexPos - pxo;
      // C++ 的 `-itemWidth/2` 是一元负号先结合、再做**整数**除法，所以写成 trunc(-w/2)
      if (diff < Math.trunc(-this.itemWidth / 2)) {
        diff += this.itemWidth;
        index++;
      }
      if (Math.abs(diff) < 1 && speed < 0.1) {
        this.selectedItem = this.getItemAtPosition(
          Math.trunc(this.width / 2),
          Math.trunc(this.height / 2),
        );
        return;
      }
      this.td.start = this.xo;
      this.td.stop = this.xo + diff;
      this.td.cur = 0;
      // 差得越远补间越长，最多 7 帧
      this.td.dur = Mth.Min(7, 1 + Math.trunc(Math.abs(diff) * 0.25));
      this.mode = 1;
      this.tweenInited();
    }
  }

  protected override getPos(alpha: number): number {
    if (this.mode !== 1) return super.getPos(alpha);
    const x0 = quadraticInOut(this.td.cur, this.td.dur, this.td.start, this.td.stop);
    const x1 = quadraticInOut(this.td.cur + 1, this.td.dur, this.td.start, this.td.stop);
    return x0 + (x1 - x0) * alpha;
  }

  protected override touched(): void {
    this.mode = 0;
  }

  override capXPosition(): boolean {
    const capped = super.capXPosition();
    if (capped) this.mode = 0;
    return capped;
  }

  private tweenInited(): void {
    const x0 = quadraticInOut(this.td.cur, this.td.dur, this.td.start, this.td.stop);
    const x1 = quadraticInOut(this.td.cur + 1, this.td.dur, this.td.start, this.td.stop);
    this._xinertia = 0;
    this.xInertia = x0 - x1;
  }

  protected override selectStart(item: number, _localX: number, _localY: number): void {
    // 只有按在最后那张 "Create new" 上才算
    if (this.selectedItem !== this.levels.length || item !== this.selectedItem) return;
    this._newWorldSelected = true;
  }

  protected override selectCancel(): void {
    this._newWorldSelected = false;
  }
}
