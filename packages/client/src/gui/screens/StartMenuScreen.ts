/**
 * 1:1 移植自 src/client/gui/screens/StartMenuScreen.h 与 StartMenuScreen.cpp：经典风格（菜单风格 1、2）的起始菜单。
 * 竖排 4 个按钮：开始游戏、加入游戏、选项、退出。风格 2（Java）用 200×20 的按钮和 Java 版的文字（Singleplayer、Multiplayer、Options...）。
 * 顶部居中画 title.png，左上用户名，左下 GitHub 图标与仓库地址（带下划线，点击打开链接），右下版本号。
 * 原样保留：
 *   - “Ouit Game” 的拼写（C++ 原文）；
 *   - 用户名为空时 init 提前 return，按钮都不加进界面（UsernameScreen 会先盖在上面）；
 *   - copyright 画在 height − 20、颜色 0xffffff（没有 alpha 字节）；
 *   - “加入游戏”：locateMultiplayer 与 SCREEN_JOINGAME 都是联机（DEFERRED(Network)）。
 * C++ 的无参 init() 是 initScreen（R10）。
 */
import { Common } from '@mcpe/core';
import { Mth } from '@mcpe/util';
import { OptionId } from '../../Options';
import {
  GL_BLEND,
  GL_ONE_MINUS_SRC_ALPHA,
  GL_SRC_ALPHA,
  glBlendFunc2,
  glColor4f2,
  glEnable2,
} from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import { Textures } from '../../renderer/Textures';
import { Button } from '../components/Button';
import { Screen } from '../Screen';
import { OptionsScreen } from './OptionsScreen';
import { ScreenId } from './ScreenChooser';

const f = Math.fround;
export class StartMenuScreen extends Screen {
  private bHost!: Button;
  private bJoin!: Button;
  private bOptions!: Button;
  private bQuit!: Button;
  private copyright = '';
  private version = '';
  private username = '';

  protected override initScreen(): void {
    if (this.minecraft.options.getIntValue(OptionId.OPTIONS_MENU_STYLE) === 2) {
      this.bHost = Button.sized(2, 0, 0, 200, 20, 'Singleplayer');
      this.bJoin = Button.sized(3, 0, 0, 200, 20, 'Multiplayer');
      this.bOptions = Button.sized(4, 0, 0, 200, 20, 'Options...');
      this.bQuit = Button.sized(5, 0, 0, 200, 20, 'Ouit Game');
    } else {
      this.bHost = Button.sized(2, 0, 0, 160, 24, 'Start Game');
      this.bJoin = Button.sized(3, 0, 0, 160, 24, 'Join Game');
      this.bOptions = Button.sized(4, 0, 0, 160, 24, 'Options');
      this.bQuit = Button.sized(5, 0, 0, 160, 24, 'Ouit Game');
    }
    this.bJoin.active = this.bHost.active = this.bOptions.active = true;
    if (this.minecraft.options.getStringValue(OptionId.OPTIONS_USERNAME).length === 0) {
      return;
    }
    this.buttons.push(this.bHost, this.bJoin, this.bQuit);
    this.tabButtons.push(this.bHost, this.bJoin, this.bQuit);
    this.buttons.push(this.bOptions);
    this.tabButtons.push(this.bOptions);
    this.copyright = '\xffMojang AB';
    const versionString = Common.getGameVersionString();
    let _username = this.minecraft.options.getStringValue(OptionId.OPTIONS_USERNAME);
    if (_username.length === 0) _username = 'unknown';
    this.username = 'Username: ' + _username;
    this.version = versionString;
  }

  override setupPositions(): void {
    if (this.minecraft.options.getIntValue(OptionId.OPTIONS_MENU_STYLE) === 2) {
      const yBase = Math.trunc(this.height / 2) - 20;
      this.bHost.y = yBase;
      this.bJoin.y = this.bHost.y + 24;
      this.bOptions.y = this.bJoin.y + 24;
      this.bQuit.y = this.bOptions.y + 24;
    } else {
      const yBase = Math.trunc(this.height / 2);
      this.bHost.y = yBase;
      this.bJoin.y = this.bHost.y + 24 + 4;
      this.bOptions.y = this.bJoin.y + 24 + 4;
      this.bQuit.y = this.bOptions.y + 24 + 4;
    }
    this.bHost.x = Math.trunc((this.width - this.bHost.width) / 2);
    this.bJoin.x = Math.trunc((this.width - this.bJoin.width) / 2);
    this.bOptions.x = Math.trunc((this.width - this.bOptions.width) / 2);
    this.bQuit.x = Math.trunc((this.width - this.bQuit.width) / 2);
  }

  override tick(): void {}

  protected override buttonClicked(button: Button): void {
    if (button.id === this.bHost.id) {
      this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_SELECTWORLD);
    }
    if (button.id === this.bJoin.id) {
      // DEFERRED(Network): minecraft->locateMultiplayer(); minecraft->screenChooser.setScreen(SCREEN_JOINGAME);
    }
    if (button.id === this.bOptions.id) {
      this.minecraft.setScreen(new OptionsScreen());
    }
    if (button.id === this.bQuit.id) {
      this.minecraft.quit();
    }
  }

  override isInGameScreen(): boolean {
    return false;
  }

  override render(xm: number, ym: number, a: number): void {
    this.renderBackground();
    const font = this.minecraft.font!;
    const textures = this.minecraft.textures!;
    this.drawString(font, this.username, 2, 2, 0xffffffff | 0);
    const id = textures.loadTexture('gui/title.png');
    const data = textures.getTemporaryTextureData(id);
    if (data) {
      textures.bind(id);
      const x = f(this.width / 2);
      const y = Math.trunc(this.height / 16);
      const wh = Mth.Min(f(this.width / 2.0), f(data.w / 2));
      const scale = f(f(2.0 * wh) / data.w);
      const h = f(scale * data.h);
      const t = Tesselator.instance;
      glColor4f2(1, 1, 1, 1);
      t.begin();
      t.vertexUV(x - wh, y + h, this.blitOffset, 0, 1);
      t.vertexUV(x + wh, y + h, this.blitOffset, 1, 1);
      t.vertexUV(x + wh, y + 0, this.blitOffset, 1, 0);
      t.vertexUV(x - wh, y + 0, this.blitOffset, 0, 0);
      t.draw();
    }
    this.drawString(
      font,
      this.version,
      this.width - font.width(this.version) - 2,
      this.height - 10,
      0xffcccccc | 0,
    );
    this.drawString(font, this.copyright, 2, this.height - 20, 0xffffff);
    glEnable2(GL_BLEND);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glColor4f2(1, 1, 1, 1);
    if (Textures.isTextureIdValid(textures.loadAndBindTexture('gui/logo/github.png')))
      this.blit(2, this.height - 10, 0, 0, 8, 8, 256, 256);
    {
      const txt = 'Kolyah35/minecraft-pe-0.6.1';
      const wtxt = font.width(txt);
      this.minecraft.gui.drawColoredString(font, txt, 12, this.height - 10, 255);
      const y0 = this.height - 10 + font.lineHeight - 1;
      this.fill(12, Math.trunc(y0), 12 + Math.trunc(wtxt), Math.trunc(y0 + 1), 0xffffffff | 0);
    }
    super.render(xm, ym, a);
  }

  protected override mouseClicked(x: number, y: number, buttonNum: number): void {
    const logoX = 2;
    const logoW = 8 + 2 + this.minecraft.font!.width('Kolyah35/minecraft-pe-0.6.1');
    const logoY = this.height - 10;
    const logoH = 10;
    if (x >= logoX && x <= logoX + logoW && y >= logoY && y <= logoY + logoH)
      this.minecraft.platform()!.openURL('https://gitea.sffempire.ru/Kolyah35/minecraft-pe-0.6.1');
    else super.mouseClicked(x, y, buttonNum);
  }

  override handleBackEvent(_isDown: boolean): boolean {
    this.minecraft.quit();
    return true;
  }
}
