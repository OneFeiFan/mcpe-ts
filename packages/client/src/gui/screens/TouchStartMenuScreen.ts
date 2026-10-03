/**
 * 1:1 移植自 src/client/gui/screens/touch/TouchStartMenuScreen.h 与 .cpp（B8c）。
 * C++ 的 Touch::StartMenuScreen —— 默认菜单风格（OPTIONS_MENU_STYLE = 0）下的起始菜单。
 *
 * 三个大图标按钮（开始游戏 / 加入游戏 / 选项）在 init() 时按 touchgui.png 里竖排的三块 75×75
 * 取图，右上角一个 34×26 的关闭按钮；标题图 title.png 画在中间靠上，下面是版本号、版权、
 * 右下角一个 github 图标加仓库地址。
 *
 * 部分（都是本项目尚未移植的东西，一行一个）：
 *   - “加入游戏”：`minecraft->locateMultiplayer()` 与 SCREEN_JOINGAME 都是联机（OMIT(Network)）；
 *   - “选项”：OptionsScreen 未移植（DEFERRED(Gui)）。
 *   两处都点了没反应，按钮照画。
 */
import { Common } from '@mcpe/core';
import { Mth } from '@mcpe/util';
import type { Minecraft } from '../../Minecraft';
import { OptionId } from '../../Options';
import { GL_BLEND, glColor4f2, glDisable2, glEnable2 } from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import { Textures } from '../../renderer/Textures';
import type { Button } from '../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../components/ImageButton';
import { LargeImageButton } from '../components/LargeImageButton';
import { Screen } from '../Screen';
import { ScreenId } from './ScreenChooser';

export class TouchStartMenuScreen extends Screen {
  private bHost = new LargeImageButton(2, 'Start Game');
  private bJoin = new LargeImageButton(3, 'Join Game');
  private bOptions = new LargeImageButton(4, 'Options');
  private bQuit = new ImageButton(5, '');

  private copyright: string;
  /** 由 setupPositions 算出来；C++ 里是未初始化的 int（PITFALLS 第 20 条：给 0） */
  private copyrightPosX = 0;
  private version: string;
  private versionPosX = 0;
  private username: string;

  constructor() {
    super();
    // 【这段是在原地改一个 ImageDef 的 src.y 再复用】C++ 拿到 def.getSrc() 返回的引用后
    // 每用完一次就把 y 往下挪一整块（defSrc.y += defSrc.h），于是三个按钮分别取到竖排的
    // 第 1/2/3 块。setImageDef 内部是**拷贝**，所以先后顺序不能乱。
    this.bJoin.width = 75;
    const def = new ImageDef();
    def.width = def.height = this.bJoin.width;
    def.setSrc(new IntRectangle(0, 26, Math.trunc(def.width), Math.trunc(def.width)));
    def.name = 'gui/touchgui.png';
    const defSrc = def.getSrc()!;
    this.bOptions.setImageDef(def, true); // src.y = 26
    defSrc.y += defSrc.h; // 101
    this.bHost.setImageDef(def, true);
    defSrc.y += defSrc.h; // 176
    this.bJoin.setImageDef(def, true);
    this.copyright = '';
    this.version = '';
    this.username = '';
  }

  protected override initScreen(): void {
    this.buttons.push(this.bHost);
    this.buttons.push(this.bJoin);
    this.buttons.push(this.bOptions);
    {
      const def = new ImageDef();
      def.name = 'gui/touchgui.png';
      def.width = 34;
      def.height = 26;
      def.setSrc(new IntRectangle(150, 0, Math.trunc(def.width), Math.trunc(def.height)));
      this.bQuit.setImageDef(def, true);
      this.bQuit.scaleWhenPressed = false;
      this.buttons.push(this.bQuit);
    }
    this.tabButtons.push(this.bHost);
    this.tabButtons.push(this.bJoin);
    this.tabButtons.push(this.bOptions);

    // C++ 里这个字符串首字节是 0xFF（不是 UTF-8 编码的某个字符，就是一个裸字节）
    this.copyright = '\xffMojang AB';
    const versionString = Common.getGameVersionString();
    let _username = this.minecraft.options.getStringValue(OptionId.OPTIONS_USERNAME);
    if (_username.length === 0) _username = 'unknown';
    this.username = 'Username: ' + _username;
    this.version = versionString;
    this.bJoin.active = this.bHost.active = this.bOptions.active = true;
  }

  override setupPositions(): void {
    const yBase = 2 + Math.trunc(this.height / 3);
    const buttonWidth = this.bHost.width;
    const spacing = (this.width - 3.0 * buttonWidth) / 4;
    this.bHost.y = yBase;
    this.bJoin.y = yBase;
    this.bOptions.y = yBase;
    this.bJoin.x = 0 * buttonWidth + Math.trunc(1 * spacing);
    this.bHost.x = 1 * buttonWidth + Math.trunc(2 * spacing);
    this.bOptions.x = 2 * buttonWidth + Math.trunc(3 * spacing);
    this.bQuit.x = this.width - this.bQuit.width;
    this.bQuit.y = 0;
    this.copyrightPosX = this.width - this.minecraft.font!.width(this.copyright) - 1;
    this.versionPosX = Math.trunc((this.width - this.minecraft.font!.width(this.version)) / 2);
  }

  protected override buttonClicked(button: Button): void {
    if (button.id === this.bHost.id) {
      this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_SELECTWORLD);
    }
    if (button.id === this.bJoin.id) {
      // DEFERRED(Network): minecraft->locateMultiplayer();
      // DEFERRED(Gui): minecraft->screenChooser.setScreen(SCREEN_JOINGAME);（加入游戏界面未移植）
    }
    if (button.id === this.bOptions.id) {
      // DEFERRED(Gui): minecraft->setScreen(new OptionsScreen());（选项界面未移植）
    }
    if (button === this.bQuit) {
      this.minecraft.quit();
    }
  }

  override isInGameScreen(): boolean {
    return false;
  }

  override render(xm: number, ym: number, a: number): void {
    this.renderBackground();
    this.drawString(this.font!, this.username, 2, 2, 0xffffffff | 0);
    glEnable2(GL_BLEND);
    const id = this.minecraft.textures!.loadTexture('gui/title.png');
    const data = this.minecraft.textures!.getTemporaryTextureData(id);
    // 【版本号 / 版权 / github 那几行都在这层 if 里面】标题图取不到就一块都不画 ——
    // 所以 title.png 必须进 apps/web/src/assets.ts 的预加载表。
    if (data) {
      this.minecraft.textures!.bind(id);
      const x = this.width / 2;
      const y = 4;
      const wh = 0.5 * Mth.Min(this.width / 2.0, data.w / 2);
      const scale = (2.0 * wh) / data.w;
      const h = scale * data.h;
      const t = Tesselator.instance;
      glColor4f2(1, 1, 1, 1);
      t.begin();
      t.vertexUV(x - wh, y + h, this.blitOffset, 0, 1);
      t.vertexUV(x + wh, y + h, this.blitOffset, 1, 1);
      t.vertexUV(x + wh, y + 0, this.blitOffset, 1, 0);
      t.vertexUV(x - wh, y + 0, this.blitOffset, 0, 0);
      t.draw();
      this.drawString(
        this.font!,
        this.version,
        this.versionPosX,
        Math.trunc(y + h) + 2,
        0xffcccccc,
      );
      this.drawString(this.font!, this.copyright, this.copyrightPosX, this.height - 10, 0xffffff);
      glColor4f2(1, 1, 1, 1);
      if (
        Textures.isTextureIdValid(
          this.minecraft.textures!.loadAndBindTexture('gui/logo/github.png'),
        )
      ) {
        this.blit(2, this.height - 10, 0, 0, 8, 8, 256, 256);
      }
      this.drawString(this.font!, 'Kolyah35/minecraft-pe-0.6.1', 12, this.height - 10, 0xffcccccc);
    }
    super.render(xm, ym, a);
    glDisable2(GL_BLEND);
  }

  protected override mouseClicked(x: number, y: number, buttonNum: number): void {
    const logoX = 2;
    const logoW = 8 + 2 + this.font!.width('Kolyah35/minecraft-pe-0.6.1');
    const logoY = this.height - 10;
    const logoH = 10;
    if (x >= logoX && x <= logoX + logoW && y >= logoY && y <= logoY + logoH) {
      this.minecraft.platform()!.openURL('https://gitea.sffempire.ru/Kolyah35/minecraft-pe-0.6.1');
    } else {
      super.mouseClicked(x, y, buttonNum);
    }
  }

  /** 【不看 isDown】C++ 收到这个事件就直接退出，按下抬起都一样 */
  override handleBackEvent(_isDown: boolean): boolean {
    this.minecraft.quit();
    return true;
  }
}
