/**
 * 1:1 移植自 src/client/gui/screens/SimpleChooseLevelScreen.h 与 .cpp（B8e）。
 *
 * 「新建世界」那一屏：顶栏一个标题加一个返回、两个输入框（世界名 / 种子）、
 * 两个切换按钮（游戏模式 / 作弊），底部一个「Create」。
 *
 * 【C-6b 起点「Create」真的能进世界了】它走 `minecraft.selectLevel()` → 普通维度 →
 * `Dimension.createRandomLevelSource()`，整条路 C-6a/C-6b 已经接通。
 * B8 那会儿这条路会抛（世界生成没移植，那时只做界面不做绕行），现在不用再绕。
 *
 * 部分：
 *   - `minecraft->hostMultiplayer()` 是联机（DEFERRED(Network)）。
 *
 * 【en_US.lang 里 `selectWorld.gameMode.survival` = "Survival"，`gameMode.survival` = "Survival Mode"，
 *   两个键都在】按钮初始显示的是前者（"Survival"），而**切换之后 C++ 换成了硬编码的
 *   "Survival mode"/"Creative mode"** —— 大小写都不一样，不是笔误，照抄。
 */
import { I18n } from '@mcpe/locale';
import { GameType, LevelSettings } from '@mcpe/world';
import { Util } from '@mcpe/util';
import { Keyboard, LOGI, MouseAction, getEpochTimeS } from '@mcpe/platform';
import { GL_BLEND, glDisable2, glEnable2 } from '../../renderer/gles';
import { OptionId } from '../../Options';
import { Font } from '../Font';
import { Button, TButton, THeader } from '../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../components/ImageButton';
import { TextBox } from '../components/TextBox';
import { ChooseLevelScreen } from './ChooseLevelScreen';
import { ProgressScreen } from './ProgressScreen';
import { ScreenId } from './ScreenChooser';

export class SimpleChooseLevelScreen extends ChooseLevelScreen {
  private bHeader: THeader | null = null;
  private bGamemode: Button | null = null;
  private bCheats: Button | null = null;
  private bBack: ImageButton | null = null;
  private bCreate: Button | null = null;
  private hasChosen = false;
  /** 【死字段，照抄】构造函数里存下来之后从没被读过 */
  private levelName: string;
  private gamemode: number;
  private cheatsEnabled: boolean;
  private tLevelName = new TextBox(0, 'World name');
  private tSeed = new TextBox(1, 'World seed');

  constructor(levelName: string) {
    super();
    this.levelName = levelName;
    this.gamemode = GameType.Survival;
    this.cheatsEnabled = false;
  }

  protected override initScreen(): void {
    super.initScreen();
    const bBack = new ImageButton(2, '');
    this.tLevelName.text = I18n.get('selectWorld.newWorld');
    this.bHeader = new THeader(0, I18n.get('selectWorld.create'));
    this.bBack = bBack;
    {
      const def = new ImageDef();
      def.name = 'gui/touchgui.png';
      def.width = 34;
      def.height = 26;
      def.setSrc(new IntRectangle(150, 0, Math.trunc(def.width), Math.trunc(def.height)));
      bBack.setImageDef(def, true);
    }
    // 菜单风格 2 才用经典按钮，其余（含默认的 0）都用触屏风格
    if (this.minecraft.options.getIntValue(OptionId.OPTIONS_MENU_STYLE) !== 2) {
      this.bGamemode = new TButton(1, I18n.get('selectWorld.gameMode.survival'));
      this.bCheats = new TButton(4, 'Cheats: Off');
      this.bCreate = new TButton(3, I18n.get('selectWorld.create'));
    } else {
      this.bGamemode = new Button(1, I18n.get('selectWorld.gameMode.survival'));
      this.bCheats = new Button(4, 'Cheats: Off');
      this.bCreate = new Button(3, I18n.get('Create'));
    }
    this.buttons.push(this.bHeader);
    this.buttons.push(this.bBack);
    this.buttons.push(this.bGamemode);
    this.buttons.push(this.bCheats);
    this.buttons.push(this.bCreate);
    this.tabButtons.push(this.bGamemode);
    this.tabButtons.push(this.bCheats);
    this.tabButtons.push(this.bBack);
    this.tabButtons.push(this.bCreate);
    this.textBoxes.push(this.tLevelName);
    this.textBoxes.push(this.tSeed);
  }

  override setupPositions(): void {
    const bBack = this.bBack!,
      bHeader = this.bHeader!,
      bGamemode = this.bGamemode!,
      bCheats = this.bCheats!,
      bCreate = this.bCreate!;
    const buttonHeight = bBack.height;
    bBack.x = this.width - bBack.width;
    bBack.y = 0;
    bHeader.x = 0;
    bHeader.y = 0;
    bHeader.width = this.width - bBack.width;
    bHeader.height = buttonHeight;

    const centerX = Math.trunc(this.width / 2);
    this.tLevelName.width = this.tSeed.width = 200;
    this.tLevelName.x = centerX - Math.trunc(this.tLevelName.width / 2);
    this.tLevelName.y = buttonHeight + 20;
    this.tSeed.x = this.tLevelName.x;
    this.tSeed.y = this.tLevelName.y + 30;

    const buttonWidth = 120;
    const buttonSpacing = 10;
    const totalButtonWidth = buttonWidth * 2 + buttonSpacing;
    bGamemode.width = buttonWidth;
    bCheats.width = buttonWidth;
    bGamemode.x = centerX - Math.trunc(totalButtonWidth / 2);
    bCheats.x = bGamemode.x + buttonWidth + buttonSpacing;
    {
      const bottomPad = 20;
      const availTop = buttonHeight + 20 + 30 + 10;
      const availBottom = this.height - bottomPad - bCreate.height - 10;
      let availHeight = availBottom - availTop;
      if (availHeight < 0) availHeight = 0;
      const y = availTop + Math.trunc((availHeight - bGamemode.height) / 2);
      bGamemode.y = y;
      bCheats.y = y;
    }
    bCreate.width = 100;
    bCreate.x = centerX - Math.trunc(bCreate.width / 2);
    const bottomPadding = 20;
    bCreate.y = this.height - bottomPadding - bCreate.height;
  }

  /** C++ 显式盖了一遍 tick，内容恰好和基类一样（只 tick 文本框）。照抄。 */
  override tick(): void {
    for (const tb of this.textBoxes) tb.tick(this.minecraft);
  }

  override render(xm: number, ym: number, a: number): void {
    this.renderDirtBackground(0);
    glEnable2(GL_BLEND);
    let modeDesc: string | null = null;
    if (this.gamemode === GameType.Survival) {
      modeDesc = 'Mobs, health and gather resources';
    } else if (this.gamemode === GameType.Creative) {
      modeDesc = 'Unlimited resources and flying';
    }
    if (modeDesc) {
      this.drawCenteredString(
        this.font!,
        modeDesc,
        Math.trunc(this.width / 2),
        this.bGamemode!.y + this.bGamemode!.height + 4,
        0xffcccccc,
      );
    }
    this.drawString(
      this.font!,
      'World name:',
      this.tLevelName.x,
      this.tLevelName.y - Font.DefaultLineHeight - 2,
      0xffcccccc,
    );
    this.drawString(
      this.font!,
      'World seed:',
      this.tSeed.x,
      this.tSeed.y - Font.DefaultLineHeight - 2,
      0xffcccccc,
    );
    super.render(xm, ym, a);
    glDisable2(GL_BLEND);
  }

  protected override mouseClicked(x: number, y: number, buttonNum: number): void {
    if (buttonNum === MouseAction.ACTION_LEFT) {
      // 输入框的命中区比它本身高一点（往上多算一行字高 + 4），含上面那行标签
      const lvlTop = this.tLevelName.y - (Font.DefaultLineHeight + 4);
      const lvlBottom = this.tLevelName.y + this.tLevelName.height;
      const lvlLeft = this.tLevelName.x;
      const lvlRight = this.tLevelName.x + this.tLevelName.width;
      const clickedLevel = x >= lvlLeft && x < lvlRight && y >= lvlTop && y < lvlBottom;
      const seedTop = this.tSeed.y - (Font.DefaultLineHeight + 4);
      const seedBottom = this.tSeed.y + this.tSeed.height;
      const seedLeft = this.tSeed.x;
      const seedRight = this.tSeed.x + this.tSeed.width;
      const clickedSeed = x >= seedLeft && x < seedRight && y >= seedTop && y < seedBottom;
      if (clickedLevel) {
        LOGI(`SimpleChooseLevelScreen: level textbox clicked (${x},${y})\n`);
        this.tLevelName.setFocus(this.minecraft);
        this.tSeed.loseFocus(this.minecraft);
      } else if (clickedSeed) {
        LOGI(`SimpleChooseLevelScreen: seed textbox clicked (${x},${y})\n`);
        this.tSeed.setFocus(this.minecraft);
        this.tLevelName.loseFocus(this.minecraft);
      } else {
        this.tLevelName.loseFocus(this.minecraft);
        this.tSeed.loseFocus(this.minecraft);
      }
    }
    super.mouseClicked(x, y, buttonNum);
  }

  protected override buttonClicked(button: Button): void {
    if (this.hasChosen) return;
    if (button === this.bGamemode) {
      // 0（Survival）↔ 1（Creative）。**注意这里的文字是硬编码的**，
      // 和 init 时那个 I18n 取的初始文字不是一回事。
      this.gamemode ^= 1;
      this.bGamemode!.msg = this.gamemode === GameType.Survival ? 'Survival mode' : 'Creative mode';
      return;
    }
    if (button === this.bCheats) {
      this.cheatsEnabled = !this.cheatsEnabled;
      this.bCheats!.msg = this.cheatsEnabled ? 'Cheats: On' : 'Cheats: Off';
      return;
    }
    if (button === this.bCreate && this.tLevelName.text.length > 0) {
      let seed = getEpochTimeS();
      if (this.tSeed.text.length > 0) {
        const seedString = Util.stringTrim(this.tSeed.text);
        // C++ 是 `sscanf(s, "%d", &tmpSeed) > 0`：只认**开头**那个十进制整数，
        // 后面跟着别的字符也不管；一个数都没有就走 hashCode 分支。
        const m = /^\s*([+-]?\d+)/.exec(seedString);
        if (m) seed = parseInt(m[1]!, 10) | 0;
        else seed = Util.hashCode(seedString);
      }
      const levelId = this.getUniqueLevelName(this.tLevelName.text);
      const settings = new LevelSettings(seed, this.gamemode, this.cheatsEnabled);
      this.minecraft.selectLevel(levelId, levelId, settings);
      // DEFERRED(Network): minecraft->hostMultiplayer();
      this.minecraft.setScreen(new ProgressScreen());
      this.hasChosen = true;
      return;
    }
    if (button === this.bBack) {
      this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_STARTMENU);
    }
  }

  protected override keyPressed(eventKey: number): void {
    if (eventKey === Keyboard.KEY_ESCAPE) {
      this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_STARTMENU);
      return;
    }
    super.keyPressed(eventKey);
  }

  override handleBackEvent(isDown: boolean): boolean {
    if (!isDown) this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_STARTMENU);
    return true;
  }
}
