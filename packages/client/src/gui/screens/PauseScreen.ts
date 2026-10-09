/**
 * 1:1 移植自 src/client/gui/screens/PauseScreen.h 与 PauseScreen.cpp（S13 阶段 C）。
 * 部分：“选项”（OptionsScreen）、服务器可见性（网络）DEFERRED。
 *   raknetInstance 在网页单机版为 null，所以“退出并复制地图”“服务器可见”两个按钮与 C++ 一样不加入。
 * “回到标题”（Minecraft::leaveGame）B8f 接上了。
 */
import { OptionsScreen } from './OptionsScreen';
import { OptionId } from '../../Options';
import { Button, TButton } from '../components/Button';
import { ImageDef, IntRectangle, OptionButton } from '../components/ImageButton';
import { Screen } from '../Screen';

const f = Math.fround;
export class PauseScreen extends Screen {
  private saveStep = 0;
  private visibleTime = 0;
  private wasBackPaused: boolean;
  private bContinue: Button | null = null;
  private bQuit: Button | null = null;
  private bQuitAndSaveLocally: Button | null = null;
  private bServerVisibility: Button | null = null;
  private bOptions: Button | null = null;
  private bThirdPerson = new OptionButton(OptionId.OPTIONS_THIRD_PERSON_VIEW);
  private bHideGui = new OptionButton(OptionId.OPTIONS_HIDEGUI);

  constructor(wasBackPaused: boolean) {
    super();
    this.wasBackPaused = wasBackPaused;
    const def = new ImageDef();
    def.setSrc(new IntRectangle(160, 144, 39, 31));
    def.name = 'gui/touchgui.png';
    const defSrc = def.getSrc()!;
    def.width = defSrc.w * f(0.666667);
    def.height = defSrc.h * f(0.666667);
    defSrc.y += defSrc.h;
    this.bThirdPerson.setImageDef(def, true);
    this.bHideGui.setImageDef(def, true);
  }

  protected override initScreen(): void {
    const style = this.minecraft.options.getIntValue(OptionId.OPTIONS_MENU_STYLE);
    if (style === 0) {
      this.bContinue = new TButton(1, 'Back to game');
      this.bOptions = new TButton(5, 'Options');
      this.bQuit = new TButton(2, 'Quit to title');
      this.bQuitAndSaveLocally = new TButton(3, 'Quit and copy map');
      this.bServerVisibility = new TButton(4, '');
    } else if (style === 1) {
      this.bContinue = new Button(1, 'Back to game');
      this.bOptions = new Button(5, 'Options');
      this.bQuit = new Button(2, 'Quit to title');
      this.bQuitAndSaveLocally = new Button(3, 'Quit and copy map');
      this.bServerVisibility = new Button(4, '');
    } else {
      this.bContinue = Button.sized(1, 0, 0, 200, 20, 'Back to game');
      this.bServerVisibility = Button.sized(4, 0, 0, 200, 20, '');
      this.bOptions = Button.sized(5, 0, 0, 200, 20, 'Options...');
      this.bQuit = Button.sized(2, 0, 0, 200, 20, 'Save and quit to title');
      this.bQuitAndSaveLocally = Button.sized(3, 0, 0, 200, 20, 'Copy and quit map');
    }
    this.buttons.push(this.bContinue);
    this.buttons.push(this.bQuit);
    this.buttons.push(this.bOptions);
    this.bThirdPerson.updateImage(this.minecraft.options);
    this.bHideGui.updateImage(this.minecraft.options);
    this.buttons.push(this.bThirdPerson);
    if (true || !this.wasBackPaused) {
      if (this.minecraft.raknetInstance) {
        // DEFERRED(Network): isServer() ? (updateServerVisibilityText(); bServerVisibility) : bQuitAndSaveLocally
      }
    }
    for (const b of this.buttons) {
      if (b === this.bThirdPerson) continue;
      if (b === this.bHideGui) continue;
      this.tabButtons.push(b);
    }
  }

  override setupPositions(): void {
    this.saveStep = 0;
    let yBase = 16;
    const c = this.bContinue!,
      o = this.bOptions!,
      q = this.bQuit!,
      ql = this.bQuitAndSaveLocally!,
      sv = this.bServerVisibility!;
    const w = this.width;
    if (this.minecraft.options.getIntValue(OptionId.OPTIONS_MENU_STYLE) === 2) {
      yBase = 50;
      c.width = o.width = q.width = 200;
      ql.width = sv.width = 200;
      c.x = Math.trunc((w - c.width) / 2);
      c.y = yBase + 24 * 1;
      ql.x = sv.x = Math.trunc((w - ql.width) / 2);
      ql.y = sv.y = yBase + 24 * 2;
      o.x = Math.trunc((w - o.width) / 2);
      o.y = yBase + 24 * 3 + 24;
      q.x = Math.trunc((w - q.width) / 2);
      q.y = yBase + 24 * 4 + 24;
    } else {
      c.width = o.width = q.width = 160;
      ql.width = sv.width = 160;
      c.x = Math.trunc((w - c.width) / 2);
      c.y = yBase + 32 * 1;
      o.x = Math.trunc((w - o.width) / 2);
      o.y = yBase + 32 * 2;
      q.x = Math.trunc((w - q.width) / 2);
      q.y = yBase + 32 * 3;
      ql.x = sv.x = Math.trunc((w - ql.width) / 2);
      ql.y = sv.y = yBase + 32 * 4;
    }
  }

  override tick(): void {
    super.tick();
    this.visibleTime++;
  }

  override render(xm: number, ym: number, a: number): void {
    this.renderBackground();
    this.drawCenteredString(this.font!, 'Game menu', Math.trunc(this.width / 2), 24, 0xffffff);
    super.render(xm, ym, a);
  }

  protected override buttonClicked(button: Button): void {
    if (button.id === this.bContinue!.id) {
      this.minecraft.setScreen(null);
    }
    if (button.id === this.bQuit!.id) {
      this.minecraft.leaveGame();
    }
    if (button.id === this.bQuitAndSaveLocally!.id) {
      // 【单机点不到】这个按钮只在 raknetInstance && !isServer() 时才 push 进 buttons
      // （见 initScreen），而网页单机版的 raknetInstance 恒为 null —— 保留原句。
      // 它落到 leaveGame 的 renameLevel 分支，那条路要 RenameMPLevelScreen（未移植）。
      this.minecraft.leaveGame(true);
    }
    if (button.id === this.bOptions!.id) {
      this.minecraft.setScreen(new OptionsScreen());
    }
    if (button.id === this.bServerVisibility!.id) {
      // DEFERRED(Network): 切换服务器是否接受连接
    }
    if (button.id === OptionButton.ButtonId) {
      (button as OptionButton).toggle(this.minecraft.options);
    }
  }
}
void PauseScreen;
