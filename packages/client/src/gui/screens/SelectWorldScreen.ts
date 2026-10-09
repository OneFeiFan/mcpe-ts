/**
 * 1:1 移植自 src/client/gui/screens/SelectWorldScreen.h 与 SelectWorldScreen.cpp：经典风格（菜单风格 1、2）的选世界界面。
 * 横向滑动的世界卡片（WorldSelectionList，基于 RolledSelectionListH），下方“删除 / 新建 / 返回”三个按钮；
 * 点中间那张卡片进入世界；滚轮、左右键（世界视图获得焦点时）切换卡片。
 * 与触屏版（TouchSelectWorldScreen.ts）的区别：没有“新建”卡片、卡片间距 120、标题 “Select world”、新世界默认名 “world”。
 * TS 命名：触屏版占用了 SelectWorldScreen 这个导出名，这里的经典版导出为 ClassicSelectWorldScreen、
 *   ClassicWorldSelectionList、ClassicDeleteWorldScreen（ADAPTED(Name)）。
 * 原样保留：
 *   - selectedItem 在 C++ 构造函数里没有初始化（只有 commit 在有世界时设 0）；这里给 0（PITFALLS 第 20 条）；
 *   - commit 里拼了 "<名字>/preview.png" 却拿一个恒为 InvalidId 的变量判断，永远用默认图；
 *   - renderItem 里 t.color(0.3, 1.0, 0.2) 在 t.begin() 之前（被 begin 后的 t.color 覆盖）；
 *   - tick 里算了 selectedWorld 却不用；
 *   - 联机的 cancelLocateMultiplayer / hostMultiplayer：DEFERRED(Network)。
 */
import type { LevelSummary, LevelSummaryList } from '@mcpe/world';
import { LevelSettings, LevelStorageSource, levelSummaryLess } from '@mcpe/world';
import { LOGI, Mouse, MouseAction } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import type { StringVector } from '../../AppPlatform';
import type { Minecraft } from '../../Minecraft';
import { OptionId } from '../../Options';
import type { Tesselator } from '../../renderer/Tesselator';
import { TweenData } from '../TweenData';
import { Button } from '../components/Button';
import { RolledSelectionListH } from '../components/RolledSelectionListH';
import { Screen } from '../Screen';
import { ConfirmScreen } from './ConfirmScreen';
import { ProgressScreen } from './ProgressScreen';
import { ScreenId } from './ScreenChooser';
import { SimpleChooseLevelScreen } from './SimpleChooseLevelScreen';

const f = Math.fround;

function quadraticInOut(t: number, dur: number, start: number, stop: number): number {
  const delta = f(stop - start);
  const T = f(f(t / dur) * 2.0);
  if (T < 1) return f(f(f(f(0.5 * delta) * T) * T) + start);
  return f(f(f(-0.5 * delta) * f(f(f(T - 1) * f(T - 3)) - 1)) + start);
}

export class ClassicWorldSelectionList extends RolledSelectionListH {
  selectedItem = 0;
  protected _height: number;
  levels: LevelSummaryList = [];
  private _descriptions: StringVector[] = [];
  private _imageNames: string[] = [];
  hasPickedLevel = false;
  pickedLevel: LevelSummary | null = null;
  protected stoppedTick = -1;
  private currentTick = 0;
  protected accRatio = 0;
  private mode = 0;
  private td = new TweenData();

  constructor(minecraft: Minecraft, width: number, height: number) {
    super(minecraft, width, height, 0, width, 26, height - 32, 120);
    this._height = height;
  }

  protected getNumberOfItems(): number {
    return this.levels.length;
  }

  protected selectItem(item: number, _doubleClick: boolean): void {
    if (this.selectedItem < 0 || this.selectedItem !== item) return;
    if (!this.hasPickedLevel) {
      this.hasPickedLevel = true;
      this.pickedLevel = this.levels[item]!;
    }
  }

  protected isSelectedItem(item: number): boolean {
    return item === this.selectedItem;
  }

  protected renderBackground(): void {}

  protected renderItem(i: number, x: number, y: number, _h: number, t: Tesselator): void {
    const centerx = x + Math.trunc(this.itemWidth / 2);
    let a0 = Mth.Max(
      f(1.1 - f(Math.abs(Math.trunc(this.width / 2) - centerx) * f(0.0055))),
      f(0.2),
    );
    if (a0 > 1) a0 = 1;
    const textColor = Math.trunc(f(255.0 * a0)) * 0x010101;
    const textColor2 = Math.trunc(f(140.0 * a0)) * 0x010101;
    const TY = y + 42;
    const TX = centerx - Math.trunc(this.itemWidth / 2) + 5;
    const v = this._descriptions[i]!;
    const font = this.minecraft.font!;
    this.drawString(font, v[0]!, TX, TY + 0, textColor);
    this.drawString(font, v[1]!, TX, TY + 10, textColor2);
    this.drawString(font, v[2]!, TX, TY + 20, textColor2);
    this.drawString(font, v[3]!, TX, TY + 30, textColor2);
    this.minecraft.textures!.loadAndBindTexture(this._imageNames[i]!);
    t.color(f(0.3), 1.0, f(0.2));
    const IY = y - 8;
    t.begin();
    t.color(textColor);
    t.vertexUV(centerx - 32, IY, this.blitOffset, 0, 0);
    t.vertexUV(centerx - 32, IY + 48, this.blitOffset, 0, 1);
    t.vertexUV(centerx + 32, IY + 48, this.blitOffset, 1, 1);
    t.vertexUV(centerx + 32, IY, this.blitOffset, 1, 0);
    t.draw();
  }

  stepLeft(): void {
    if (this.selectedItem > 0) {
      this.td.start = this.xo;
      this.td.stop = f(this.xo - this.itemWidth);
      this.td.cur = 0;
      this.td.dur = 8;
      this.mode = 1;
      this.tweenInited();
    }
  }

  stepRight(): void {
    if (this.selectedItem >= 0 && this.selectedItem < this.getNumberOfItems() - 1) {
      this.td.start = this.xo;
      this.td.stop = f(this.xo + this.itemWidth);
      this.td.cur = 0;
      this.td.dur = 8;
      this.mode = 1;
      this.tweenInited();
    }
  }

  commit(): void {
    for (let i = 0; i < this.levels.length; ++i) {
      const level = this.levels[i]!;
      this._imageNames.push('gui/default_world.png'); // 见文件头：预览图的判断永远为假
      const lines: StringVector = [];
      lines.push(level.name);
      lines.push(this.minecraft.platform()!.getDateString(level.lastPlayed));
      lines.push(level.id);
      lines.push(LevelSettings.gameTypeToString(level.gameType));
      this._descriptions.push(lines);
      this.selectedItem = 0;
    }
  }

  override tick(): void {
    super.tick();
    ++this.currentTick;
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
    const speed = Mth.abs(this.xInertia);
    const slowEnoughToBeBothered = speed < 5.0;
    if (!slowEnoughToBeBothered) {
      this.xInertia = f(this.xInertia * f(0.9));
      return;
    }
    this.xInertia = f(this.xInertia * f(0.8));
    if (speed < 1 && this.dragState < 0) {
      const offsetx = Math.trunc((this.width - this.itemWidth) / 2);
      const pxo = f(this.xo + offsetx);
      let index = this.getItemAtXPositionRaw(Math.trunc(f(pxo - f(10 * this.xInertia))));
      const indexPos = index * this.itemWidth;
      let diff = f(indexPos - pxo);
      if (diff < Math.trunc(-this.itemWidth / 2)) {
        diff = f(diff + this.itemWidth);
        index++;
      }
      if (Mth.abs(diff) < 1 && speed < f(0.1)) {
        this.selectedItem = this.getItemAtPosition(
          Math.trunc(this.width / 2),
          Math.trunc(this.height / 2),
        );
        return;
      }
      this.td.start = this.xo;
      this.td.stop = f(this.xo + diff);
      this.td.cur = 0;
      this.td.dur = Mth.Min(7, 1 + Math.trunc(f(Mth.abs(diff) * f(0.25))));
      this.mode = 1;
      this.tweenInited();
    }
  }

  protected override getPos(alpha: number): number {
    if (this.mode !== 1) return super.getPos(alpha);
    const x0 = quadraticInOut(this.td.cur, this.td.dur, this.td.start, this.td.stop);
    const x1 = quadraticInOut(this.td.cur + 1, this.td.dur, this.td.start, this.td.stop);
    return f(x0 + f(f(x1 - x0) * alpha));
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
    this.xInertia = f(x0 - x1);
  }
}

export class ClassicDeleteWorldScreen extends ConfirmScreen {
  private _level: LevelSummary;

  constructor(level: LevelSummary) {
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
      this.minecraft.getLevelSource()!.deleteLevel(this._level.id);
    }
    this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_SELECTWORLD);
  }
}

export class ClassicSelectWorldScreen extends Screen {
  private bDelete = new Button(1, 'Delete');
  private bCreate = new Button(2, 'Create new');
  private bBack = new Button(3, 'Back');
  private bWorldView = new Button(4, '');
  private worldsList: ClassicWorldSelectionList | null = null;
  private levels: LevelSummaryList = [];
  private _mouseHasBeenUp = false;
  private _hasStartedLevel = false;

  constructor() {
    super();
    this.bDelete.active = false;
  }

  protected override buttonClicked(button: Button): void {
    if (button.id === this.bCreate.id) {
      if (!this._hasStartedLevel) {
        const name = this.getUniqueLevelName('world');
        this.minecraft.setScreen(new SimpleChooseLevelScreen(name));
      }
    }
    if (button.id === this.bDelete.id) {
      if (this.isIndexValid(this.worldsList!.selectedItem)) {
        const level = this.worldsList!.levels[this.worldsList!.selectedItem]!;
        LOGI(`level: ${level.id}, ${level.name}\n`);
        this.minecraft.setScreen(new ClassicDeleteWorldScreen(level));
      }
    }
    if (button.id === this.bBack.id) {
      // DEFERRED(Network): minecraft->cancelLocateMultiplayer();
      this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_STARTMENU);
    }
    if (button.id === this.bWorldView.id) {
      const wl = this.worldsList as unknown as { selectItem(i: number, d: boolean): void };
      wl.selectItem(
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
    return this.worldsList !== null && index >= 0 && index < this.worldsList.levels.length;
  }

  override tick(): void {
    const wl = this.worldsList!;
    wl.tick();
    if (wl.hasPickedLevel) {
      this.minecraft.selectLevel(wl.pickedLevel!.id, wl.pickedLevel!.name, LevelSettings.None());
      // DEFERRED(Network): minecraft->hostMultiplayer();
      this.minecraft.setScreen(new ProgressScreen());
      this._hasStartedLevel = true;
      return;
    }
    if (this.isIndexValid(wl.selectedItem)) {
      void wl.levels[wl.selectedItem]; // C++ 的 selectedWorld 算了不用
    }
    this.bDelete.active = this.isIndexValid(wl.selectedItem);
  }

  protected override initScreen(): void {
    this.worldsList = new ClassicWorldSelectionList(this.minecraft, this.width, this.height);
    this.loadLevelSource();
    this.worldsList.commit();
    this.buttons.push(this.bDelete, this.bCreate, this.bBack);
    this._mouseHasBeenUp = !Mouse.getButtonState(MouseAction.ACTION_LEFT);
    this.tabButtons.push(this.bWorldView, this.bDelete, this.bCreate, this.bBack);
  }

  override setupPositions(): void {
    const yBase = this.height - 28;
    this.bCreate.y = yBase;
    this.bBack.y = yBase;
    this.bDelete.y = yBase;
    this.bBack.width = this.bDelete.width = this.bCreate.width = 84;
    this.bDelete.x =
      Math.trunc(this.width / 2) - 4 - this.bDelete.width - Math.trunc(this.bDelete.width / 2);
    this.bCreate.x = Math.trunc(this.width / 2) - Math.trunc(this.bCreate.width / 2);
    this.bBack.x =
      Math.trunc(this.width / 2) + 4 + this.bCreate.width - Math.trunc(this.bBack.width / 2);
  }

  override render(xm: number, ym: number, a: number): void {
    this.renderBackground();
    const wl = this.worldsList!;
    wl.setComponentSelected(this.bWorldView.selected);
    if (this._mouseHasBeenUp) wl.render(xm, ym, a);
    else {
      wl.render(0, 0, a);
      this._mouseHasBeenUp = !Mouse.getButtonState(MouseAction.ACTION_LEFT);
    }
    super.render(xm, ym, a);
    this.drawCenteredString(
      this.minecraft.font!,
      'Select world',
      Math.trunc(this.width / 2),
      8,
      0xffffffff | 0,
    );
  }

  private loadLevelSource(): void {
    const levelSource = this.minecraft.getLevelSource()!;
    levelSource.getLevelList(this.levels);
    this.levels.sort((a, b) => (levelSummaryLess(a, b) ? -1 : levelSummaryLess(b, a) ? 1 : 0));
    for (const l of this.levels) {
      if (l.id !== LevelStorageSource.TempLevelId) this.worldsList!.levels.push(l);
    }
  }

  private getUniqueLevelName(level: string): string {
    const set = new Set<string>(this.levels.map((l) => l.id));
    let s = level;
    while (set.has(s)) s += '-';
    return s;
  }

  override isInGameScreen(): boolean {
    return true;
  }

  protected override mouseWheel(_dx: number, dy: number, _xm: number, _ym: number): void {
    const wl = this.worldsList;
    if (!wl) return;
    if (dy === 0) return;
    const num = wl.levels.length;
    let idx = wl.selectedItem;
    if (dy > 0) {
      if (idx > 0) {
        idx--;
        wl.stepLeft();
      }
    } else {
      if (idx < num - 1) {
        idx++;
        wl.stepRight();
      }
    }
    wl.selectedItem = idx;
  }

  protected override keyPressed(eventKey: number): void {
    if (this.bWorldView.selected) {
      if (eventKey === this.minecraft.options.getIntValue(OptionId.OPTIONS_KEY_RIGHT))
        this.worldsList!.stepLeft();
      if (eventKey === this.minecraft.options.getIntValue(OptionId.OPTIONS_KEY_LEFT))
        this.worldsList!.stepRight();
    }
    super.keyPressed(eventKey);
  }
}
