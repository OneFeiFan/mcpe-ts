/**
 * 1:1 移植自 src/client/gui/screens/OptionsScreen.h 与 OptionsScreen.cpp（选项界面）。
 * 左边 5 个分类按钮（通用、游戏、控制、画面、调整），右边是当前分类的 OptionsGroup；右上角关闭（保存选项），右下角“制作人员”。
 * 原样保留的 C++ 写法：
 *   - render 里 `xmm = xm * width / minecraft->width`：xm 已经是界面坐标，这里又按屏幕→界面换算了一次（整数除法）；
 *   - charPressed 把字符交给 OptionsGroup 之后调用的是 `super::keyPressed(inputChar)`（不是 charPressed）——
 *     字符的编码被当成按键码；
 *   - 关闭时 `minecraft->screen != NULL` 恒为真（自己就是当前界面），所以总是 setScreen(NULL)；else 分支（回起始菜单）走不到。
 * C++ 的无参 init() 在 TS 里是 initScreen（R10）。
 */
import { Keyboard } from '@mcpe/platform';
import { OptionId } from '../../Options';
import type { Button } from '../components/Button';
import { TButton, THeader } from '../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../components/ImageButton';
import { OptionsGroup } from '../components/OptionsGroup';
import { Screen } from '../Screen';
import { CreditsScreen } from './CreditsScreen';
import { ScreenId } from './ScreenChooser';

export class OptionsScreen extends Screen {
  private bHeader: THeader | null = null;
  private btnClose: ImageButton | null = null;
  private btnCredits: Button | null = null;
  private categoryButtons: TButton[] = [];
  private optionPanes: OptionsGroup[] = [];
  private currentOptionsGroup: OptionsGroup | null = null;
  private selectedCategory = 0;

  protected override initScreen(): void {
    this.bHeader = new THeader(0, 'Options');
    this.btnClose = new ImageButton(1, '');
    const def = new ImageDef();
    def.name = 'gui/touchgui.png';
    def.width = 34;
    def.height = 26;
    def.setSrc(new IntRectangle(150, 0, Math.trunc(def.width), Math.trunc(def.height)));
    this.btnClose.setImageDef(def, true);
    this.categoryButtons.push(new TButton(2, 'General'));
    this.categoryButtons.push(new TButton(3, 'Game'));
    this.categoryButtons.push(new TButton(4, 'Controls'));
    this.categoryButtons.push(new TButton(5, 'Graphics'));
    this.categoryButtons.push(new TButton(6, 'Tweaks'));
    this.btnCredits = new TButton(11, 'Credits');
    this.buttons.push(this.bHeader);
    this.buttons.push(this.btnClose);
    this.buttons.push(this.btnCredits);
    for (const b of this.categoryButtons) {
      this.buttons.push(b);
      this.tabButtons.push(b);
    }
    this.generateOptionScreens();
    this.selectCategory(0);
  }

  override setupPositions(): void {
    const btnClose = this.btnClose!;
    const bHeader = this.bHeader!;
    const buttonHeight = btnClose.height;
    btnClose.x = this.width - btnClose.width;
    btnClose.y = 0;
    let offsetNum = 1;
    for (const b of this.categoryButtons) {
      b.x = 0;
      b.y = offsetNum * buttonHeight;
      b.selected = false;
      offsetNum++;
    }
    bHeader.x = 0;
    bHeader.y = 0;
    bHeader.width = this.width - btnClose.width;
    bHeader.height = btnClose.height;
    if (this.btnCredits !== null) {
      this.btnCredits.x = this.width - this.btnCredits.width;
      this.btnCredits.y = this.height - this.btnCredits.height;
    }
    for (const pane of this.optionPanes) {
      if (this.categoryButtons.length > 0 && this.categoryButtons[0] !== null) {
        pane.x = this.categoryButtons[0]!.width;
        pane.y = bHeader.height;
        pane.width = this.width - this.categoryButtons[0]!.width;
        pane.height = this.height - bHeader.height;
        pane.setupPositions();
      }
    }
  }

  override render(xm: number, ym: number, a: number): void {
    this.renderBackground();
    const xmm = Math.trunc((xm * this.width) / this.minecraft.width);
    const ymm = Math.trunc((ym * this.height) / this.minecraft.height) - 1;
    if (this.currentOptionsGroup !== null) this.currentOptionsGroup.render(this.minecraft, xmm, ymm);
    super.render(xm, ym, a);
  }

  override removed(): void {}

  protected override buttonClicked(button: Button): void {
    if (button === this.btnClose) {
      this.minecraft.options.save();
      if (this.minecraft.screen !== null) {
        this.minecraft.setScreen(null);
      } else {
        this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_STARTMENU);
      }
    } else if (button.id > 1 && button.id < 7) {
      const categoryButton = button.id - this.categoryButtons[0]!.id;
      this.selectCategory(categoryButton);
    } else if (button === this.btnCredits) {
      this.minecraft.setScreen(new CreditsScreen());
    }
  }

  selectCategory(index: number): void {
    let currentIndex = 0;
    for (const b of this.categoryButtons) {
      b.selected = index === currentIndex;
      currentIndex++;
    }
    if (index < this.optionPanes.length) this.currentOptionsGroup = this.optionPanes[index]!;
    this.selectedCategory = index;
  }

  private generateOptionScreens(): void {
    const mc = this.minecraft;
    this.optionPanes.push(new OptionsGroup('options.group.general'));
    this.optionPanes.push(new OptionsGroup('options.group.game'));
    this.optionPanes.push(new OptionsGroup('options.group.controls'));
    this.optionPanes.push(new OptionsGroup('options.group.graphics'));
    this.optionPanes.push(new OptionsGroup('options.group.tweaks'));
    const P = this.optionPanes;
    P[0]!.addOptionItem(OptionId.OPTIONS_USERNAME, mc).addOptionItem(OptionId.OPTIONS_SENSITIVITY, mc);
    P[1]!
      .addOptionItem(OptionId.OPTIONS_DIFFICULTY, mc)
      .addOptionItem(OptionId.OPTIONS_SERVER_VISIBLE, mc)
      .addOptionItem(OptionId.OPTIONS_THIRD_PERSON_VIEW, mc)
      .addOptionItem(OptionId.OPTIONS_WINDOW_SCALE, mc)
      .addOptionItem(OptionId.OPTIONS_GUI_SCALE, mc)
      .addOptionItem(OptionId.OPTIONS_SENSITIVITY, mc)
      .addOptionItem(OptionId.OPTIONS_MUSIC_VOLUME, mc)
      .addOptionItem(OptionId.OPTIONS_SOUND_VOLUME, mc)
      .addOptionItem(OptionId.OPTIONS_SMOOTH_CAMERA, mc)
      .addOptionItem(OptionId.OPTIONS_DESTROY_VIBRATION, mc)
      .addOptionItem(OptionId.OPTIONS_IS_LEFT_HANDED, mc);
    P[2]!
      .addOptionItem(OptionId.OPTIONS_INVERT_Y_MOUSE, mc)
      .addOptionItem(OptionId.OPTIONS_USE_TOUCHSCREEN, mc)
      .addOptionItem(OptionId.OPTIONS_AUTOJUMP, mc)
      .addOptionItem(OptionId.OPTIONS_BLOCK_OUTLINE, mc)
      .addOptionItem(OptionId.OPTIONS_IS_JOY_TOUCH_AREA, mc);
    for (let i = OptionId.OPTIONS_KEY_FORWARD; i <= OptionId.OPTIONS_KEY_USE; i++) {
      P[2]!.addOptionItem(i as OptionId, mc);
    }
    P[3]!
      .addOptionItem(OptionId.OPTIONS_FANCY_GRAPHICS, mc)
      .addOptionItem(OptionId.OPTIONS_LIMIT_FRAMERATE, mc)
      .addOptionItem(OptionId.OPTIONS_VSYNC, mc)
      .addOptionItem(OptionId.OPTIONS_VIEW_DISTANCE, mc)
      .addOptionItem(OptionId.OPTIONS_RENDER_DEBUG, mc)
      .addOptionItem(OptionId.OPTIONS_ANAGLYPH_3D, mc)
      .addOptionItem(OptionId.OPTIONS_VIEW_BOBBING, mc)
      .addOptionItem(OptionId.OPTIONS_AMBIENT_OCCLUSION, mc)
      .addOptionItem(OptionId.OPTIONS_NORMAL_LIGHTING, mc)
      .addOptionItem(OptionId.OPTIONS_BEAUTIFUL_SKY, mc)
      .addOptionItem(OptionId.OPTIONS_VIGNETTE, mc);
    P[4]!
      .addOptionItem(OptionId.OPTIONS_ALLOW_SPRINT, mc)
      .addOptionItem(OptionId.OPTIONS_BAR_ON_TOP, mc)
      .addOptionItem(OptionId.OPTIONS_MENU_STYLE, mc)
      .addOptionItem(OptionId.OPTIONS_RPI_CURSOR, mc)
      .addOptionItem(OptionId.OPTIONS_FOLIAGE_TINT, mc)
      .addOptionItem(OptionId.OPTIONS_TINTED_SIDE, mc)
      .addOptionItem(OptionId.OPTIONS_JAVA_HUD, mc)
      .addOptionItem(OptionId.OPTIONS_FOG_TYPE, mc)
      .addOptionItem(OptionId.OPTIONS_BETA_SKY, mc)
      .addOptionItem(OptionId.OPTIONS_RESTORED_ANIMS, mc)
      .addOptionItem(OptionId.OPTIONS_DEBUG_STYLE, mc);
  }

  protected override mouseClicked(x: number, y: number, buttonNum: number): void {
    if (this.currentOptionsGroup !== null) this.currentOptionsGroup.mouseClicked(this.minecraft, x, y, buttonNum);
    super.mouseClicked(x, y, buttonNum);
  }

  protected override mouseReleased(x: number, y: number, buttonNum: number): void {
    if (this.currentOptionsGroup !== null) this.currentOptionsGroup.mouseReleased(this.minecraft, x, y, buttonNum);
    super.mouseReleased(x, y, buttonNum);
  }

  protected override mouseWheel(_dx: number, dy: number, xm: number, ym: number): void {
    if (this.currentOptionsGroup !== null && this.currentOptionsGroup.pointInside(xm, ym) && dy !== 0) {
      this.currentOptionsGroup.scrollByPixels(Math.fround(dy * 18.0));
    }
  }

  protected override keyPressed(eventKey: number): void {
    if (this.currentOptionsGroup !== null) this.currentOptionsGroup.keyPressed(this.minecraft, eventKey);
    if (eventKey === Keyboard.KEY_ESCAPE) this.minecraft.options.save();
    super.keyPressed(eventKey);
  }

  protected override charPressed(inputChar: string): void {
    if (this.currentOptionsGroup !== null) this.currentOptionsGroup.charPressed(this.minecraft, inputChar);
    super.keyPressed(inputChar.charCodeAt(0) << 24 >> 24); // 原样：C++ 调的是 super::keyPressed((char) 字符)
  }

  override tick(): void {
    if (this.currentOptionsGroup !== null) this.currentOptionsGroup.tick(this.minecraft);
    super.tick();
  }
}
