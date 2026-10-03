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
import { LevelSettings, LevelStorageSource, levelSummaryLess } from '@mcpe/world';
import { Mth } from '@mcpe/util';
import { LOGI, Mouse, MouseAction } from '@mcpe/platform';
import type { Minecraft } from '../../Minecraft';
import { OptionId } from '../../Options';
import { Tesselator } from '../../renderer/Tesselator';
import { TweenData } from '../TweenData';
import { Button } from '../components/Button';
import { TButton, THeader } from '../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../components/ImageButton';
import { RolledSelectionListH } from '../components/RolledSelectionListH';
import { Screen } from '../Screen';
import { ConfirmScreen } from './ConfirmScreen';
import { ProgressScreen } from './ProgressScreen';
import { ScreenId } from './ScreenChooser';
import { SimpleChooseLevelScreen } from './SimpleChooseLevelScreen';

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

  /** C++ 是 protected + `friend class SelectWorldScreen`；TS 没有 friend，被外层屏用到的就放宽为 public */
  override getNumberOfItems(): number {
    return this.levels.length + 1; // +1 是那张 "Create new"
  }

  /** C++ 是 protected + `friend class SelectWorldScreen`；TS 没有 friend，被外层屏用到的就放宽为 public */
  override selectItem(item: number, _doubleClick: boolean): void {
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

  /** C++ 里是 public（外层屏和键盘左右键都要调它） */
  stepLeft(): void {
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

  /** C++ 里是 public（同 stepLeft） */
  stepRight(): void {
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

/**
 * C++ 的 `static char ILLEGAL_FILE_CHARACTERS[]`。
 *
 * 【声明了但没人用】唯一的使用点（把世界名里的非法字符过滤掉）在 `SelectWorldScreen::tick()`
 * 里一个 `#if 0` 块内 —— 整块不参与编译。留着是为了让结构看得见。值是 15 个字符，
 * 外加 C++ 数组隐式的终止符 `'\0'`，所以下面写 16 个。
 */
const ILLEGAL_FILE_CHARACTERS = [
  '/',
  '\n',
  '\r',
  '\t',
  '\0',
  '\f',
  '`',
  '?',
  '*',
  '\\',
  '<',
  '>',
  '|',
  '"',
  ':',
  '\0',
];

/**
 * C++ 的 `Touch::DeleteWorldScreen`：删世界前的确认框，直接继承 ConfirmScreen。
 * 它**不传 parent**（NULL），所以 ConfirmScreen::postResult 那条路走不到 —— 这里盖掉了。
 */
export class TouchDeleteWorldScreen extends ConfirmScreen {
  private _level: LevelSummary;

  constructor(level: LevelSummary) {
    // R10：ConfirmScreen 的 TS 版把 id 提到了第 4 位，按钮文字跟在后面（见那个文件头）
    super(
      null,
      'Are you sure you want to delete this world?',
      `'${level.name}' will be lost forever!`,
      0,
      'Delete',
      'Cancel',
    );
    this._level = level;
    this.tabButtonIndex = 1;
  }

  protected override postResult(isOk: boolean): void {
    if (isOk) {
      const storageSource = this.minecraft.getLevelSource()!;
      storageSource.deleteLevel(this._level.id);
    }
    this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_SELECTWORLD);
  }
}

export class SelectWorldScreen extends Screen {
  private bDelete = new ImageButton(1, '');
  private bCreate = new TButton(2, 'Create new');
  private bBack = new TButton(3, 'Back');
  private bHeader = new THeader(0, 'Select world');
  /** 只进 tabButtons、不进 buttons —— 它靠 tab 选中态决定列表吃不吃键盘 */
  private bWorldView = new Button(4, '');
  private worldsList: TouchWorldSelectionList | null = null;
  /** loadLevelSource() 灌进来的原始列表（还没剔掉临时世界），getUniqueLevelName 也用它 */
  private levels: LevelSummaryList = [];
  /** C++ 里没在构造函数里初始化（只有 init() 里才赋值）—— 按 PITFALLS 第 20 条给 false */
  private _mouseHasBeenUp = false;
  private _hasStartedLevel = false;

  constructor() {
    super();
    this.bDelete.active = false;
    const def = new ImageDef();
    def.name = 'gui/touchgui.png';
    def.width = 34;
    def.height = 26;
    def.setSrc(new IntRectangle(150, 0, Math.trunc(def.width), Math.trunc(def.height)));
    this.bDelete.setImageDef(def, true);
  }

  protected override initScreen(): void {
    this.worldsList = new TouchWorldSelectionList(this.minecraft, this.width, this.height);
    this.loadLevelSource();
    this.worldsList.commit();
    this.buttons.push(this.bDelete);
    this.buttons.push(this.bCreate);
    this.buttons.push(this.bBack);
    this.buttons.push(this.bHeader);
    this._mouseHasBeenUp = Mouse.getButtonState(MouseAction.ACTION_LEFT) === 0;
    this.tabButtons.push(this.bWorldView);
    this.tabButtons.push(this.bDelete);
    this.tabButtons.push(this.bCreate);
    this.tabButtons.push(this.bBack);
  }

  override setupPositions(): void {
    this.bCreate.y = 0;
    this.bBack.y = 0;
    this.bHeader.y = 0;
    this.bDelete.y = this.height - 30;
    this.bDelete.x = Math.trunc((this.width - this.bDelete.width) / 2);
    this.bCreate.x = this.width - this.bCreate.width;
    this.bBack.x = 0;
    this.bHeader.x = this.bBack.width;
    this.bHeader.width = this.width - (this.bBack.width + this.bCreate.width);
    this.bHeader.height = this.bCreate.height;
  }

  protected override buttonClicked(button: Button): void {
    if (button.id === this.bCreate.id) {
      if (!this._hasStartedLevel) {
        const name = this.getUniqueLevelName('World');
        this.minecraft.setScreen(new SimpleChooseLevelScreen(name));
      }
    }
    if (button.id === this.bDelete.id) {
      if (this.isIndexValid(this.worldsList!.selectedItem)) {
        const level = this.worldsList!.levels[this.worldsList!.selectedItem]!;
        LOGI(`level: ${level.id}, ${level.name}\n`);
        this.minecraft.setScreen(new TouchDeleteWorldScreen(level));
      }
    }
    if (button.id === this.bBack.id) {
      // DEFERRED(Network): minecraft->cancelLocateMultiplayer();
      this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_STARTMENU);
    }
    if (button.id === this.bWorldView.id) {
      this.worldsList!.selectItem(
        this.worldsList!.getItemAtPosition(Math.trunc(this.width / 2), Math.trunc(this.height / 2)),
        false,
      );
    }
  }

  override handleBackEvent(isDown: boolean): boolean {
    if (!isDown) {
      // DEFERRED(Network): minecraft->cancelLocateMultiplayer();
      this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_STARTMENU);
    }
    return true;
  }

  isIndexValid(index: number): boolean {
    return this.worldsList !== null && index >= 0 && index < this.worldsList.getNumberOfItems() - 1;
  }

  protected override mouseWheel(_dx: number, dy: number, _xm: number, _ym: number): void {
    if (!this.worldsList) return;
    if (dy === 0) return;
    const num = this.worldsList.getNumberOfItems();
    let idx = this.worldsList.selectedItem;
    if (dy > 0) {
      if (idx > 0) {
        idx--;
        this.worldsList.stepLeft();
      }
    } else {
      if (idx < num - 1) {
        idx++;
        this.worldsList.stepRight();
      }
    }
    this.worldsList.selectedItem = idx;
  }

  override tick(): void {
    this.worldsList!.tick();
    if (this.worldsList!.hasPickedLevel) {
      if (this.worldsList!.pickedIndex === this.worldsList!.levels.length) {
        // 点的是 "Create new" —— 去新建世界
        this.worldsList!.hasPickedLevel = false;
        const name = this.getUniqueLevelName('World');
        this.minecraft.setScreen(new SimpleChooseLevelScreen(name));
      } else {
        this.minecraft.selectLevel(
          this.worldsList!.pickedLevel!.id,
          this.worldsList!.pickedLevel!.name,
          LevelSettings.None(),
        );
        // DEFERRED(Network): minecraft->hostMultiplayer();
        this.minecraft.setScreen(new ProgressScreen());
        this._hasStartedLevel = true;
        return;
      }
    }
    this.bDelete.active = this.isIndexValid(this.worldsList!.selectedItem);
  }

  override render(xm: number, ym: number, a: number): void {
    this.renderBackground();
    this.worldsList!.setComponentSelected(this.bWorldView.selected);
    if (this._mouseHasBeenUp) {
      this.worldsList!.render(xm, ym, a);
    } else {
      // 【第一次渲染用 (0,0)】鼠标还没抬起来时不把当前指针位置喂给列表，免得一进来就当成拖动
      this.worldsList!.render(0, 0, a);
      this._mouseHasBeenUp = Mouse.getButtonState(MouseAction.ACTION_LEFT) === 0;
    }
    super.render(xm, ym, a);
  }

  private loadLevelSource(): void {
    const levelSource = this.minecraft.getLevelSource()!;
    levelSource.getLevelList(this.levels);
    // C++ 的 std::sort 不稳定（同 lastPlayed 的两个世界次序不保证）；JS 的 sort 是稳定的，
    // 顺序只会更确定，不影响结果。
    this.levels.sort((a, b) => (levelSummaryLess(a, b) ? -1 : levelSummaryLess(b, a) ? 1 : 0));
    for (let i = 0; i < this.levels.length; ++i) {
      // 临时世界（_LastJoinedServer）不进列表
      if (this.levels[i]!.id !== LevelStorageSource.TempLevelId) {
        this.worldsList!.levels.push(this.levels[i]!);
      }
    }
  }

  private getUniqueLevelName(level: string): string {
    const set = new Set<string>();
    for (let i = 0; i < this.levels.length; ++i) set.add(this.levels[i]!.id);
    let s = level;
    while (set.has(s)) s += '-';
    return s;
  }

  override isInGameScreen(): boolean {
    return true;
  }

  protected override keyPressed(eventKey: number): void {
    // bWorldView.selected 靠 Screen::updateTabButtonSelection 设，而那个函数整个在 #ifdef TABBING 里
    // —— 网页版构建没开，所以这里恒为假（照抄 C++ 的分支，不简化）。
    if (this.bWorldView.selected) {
      if (eventKey === this.minecraft.options.getIntValue(OptionId.OPTIONS_KEY_LEFT))
        this.worldsList!.stepLeft();
      if (eventKey === this.minecraft.options.getIntValue(OptionId.OPTIONS_KEY_RIGHT))
        this.worldsList!.stepRight();
    }
    super.keyPressed(eventKey);
  }
}
