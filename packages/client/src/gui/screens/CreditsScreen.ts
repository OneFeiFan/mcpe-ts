/**
 * 1:1 移植自 src/client/gui/screens/CreditsScreen.h 与 CreditsScreen.cpp（选项界面里的“制作人员”）：字幕自下往上滚动，
 * 按住鼠标加速；含网址的一行画下划线、点击时打开链接（AppPlatform.openURL）。返回按钮回到选项界面。
 * C++ 的 Gui::getColoredWidth / drawColoredString 是静态函数；TS 的 Gui 把它们写成了实例方法，经 minecraft.gui 调用（ADAPTED(Cpp)）。
 */
import { Mouse, MouseAction } from '@mcpe/platform';
import type { Button } from '../components/Button';
import { THeader } from '../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../components/ImageButton';
import { Screen } from '../Screen';
import { OptionsScreen } from './OptionsScreen';

const f = Math.fround;

export class CreditsScreen extends Screen {
  private bHeader: THeader | null = null;
  private btnBack: ImageButton | null = null;
  private _lines: string[] = [];
  private _scrollY = 0;
  private _scrollSpeed = 0;

  protected override initScreen(): void {
    this.bHeader = new THeader(0, 'Credits');
    this.btnBack = new ImageButton(1, '');
    {
      const def = new ImageDef();
      def.name = 'gui/touchgui.png';
      def.width = 34;
      def.height = 26;
      def.setSrc(new IntRectangle(150, 0, Math.trunc(def.width), Math.trunc(def.height)));
      this.btnBack.setImageDef(def, true);
    }
    this.buttons.push(this.bHeader);
    this.buttons.push(this.btnBack);
    this._lines = [
      'Minecraft: Pocket Edition',
      'Original game by Mojang',
      '',
      'Programmers:',
      'mschiller890',
      'InviseDivine',
      'Kolyah35',
      'karson',
      'deepfriedwaffles',
      'EpikIzCool',
      'fileshredder',
      '',
      'Join our Discord server: https://discord.gg/c58YesBxve',
    ];
    this._scrollSpeed = f(0.5);
    this._scrollY = this.height;
  }

  override setupPositions(): void {
    const btnBack = this.btnBack!;
    btnBack.x = this.width - btnBack.width;
    btnBack.y = 0;
    if (this.bHeader) {
      this.bHeader.x = 0;
      this.bHeader.y = 0;
      this.bHeader.width = this.width - btnBack.width;
      this.bHeader.height = btnBack.height;
    }
    this._scrollY = this.height;
  }

  override tick(): void {
    this._scrollY = f(this._scrollY - this._scrollSpeed);
    const totalHeight = f(this._lines.length * (this.minecraft.font!.lineHeight + 8));
    if (this._scrollY + totalHeight < 0) {
      this._scrollY = this.height;
    }
    if (Mouse.isButtonDown(MouseAction.ACTION_LEFT)) {
      this._scrollSpeed = f(1.5);
    } else {
      this._scrollSpeed = f(0.5);
    }
  }

  override render(xm: number, ym: number, a: number): void {
    this.renderBackground();
    const w = this.width;
    const font = this.minecraft.font!;
    const gui = this.minecraft.gui;
    let y = this._scrollY;
    const lineHeight = font.lineHeight + 8;
    for (const line of this._lines) {
      const lineWidth = f(gui.getColoredWidth(font, line));
      gui.drawColoredString(font, line, f(Math.trunc(w / 2) - f(lineWidth / 2)), Math.trunc(y), 255);
      if (line.includes('http') || line.includes('discord.gg')) {
        const x0 = f(Math.trunc(w / 2) - f(lineWidth / 2));
        const y0 = f(y + font.lineHeight - 1);
        this.fill(x0, y0, x0 + lineWidth, y0 + 1, 0xffffffff | 0);
      }
      y = f(y + lineHeight);
    }
    super.render(xm, ym, a);
  }

  protected override buttonClicked(button: Button): void {
    if (button.id === 1) {
      this.minecraft.setScreen(new OptionsScreen()); // 两个界面互相引用：只在运行时用到对方的类，ESM 循环导入没问题
    }
  }

  protected override mouseClicked(x: number, y: number, buttonNum: number): void {
    const lineHeight = this.minecraft.font!.lineHeight + 8;
    for (let i = 0; i < this._lines.length; ++i) {
      const lineY = f(this._scrollY + i * lineHeight);
      if (y >= lineY && y < lineY + lineHeight) {
        const line = this._lines[i]!;
        let start = line.indexOf('http');
        if (start < 0) start = line.indexOf('discord.gg');
        if (start >= 0) {
          const end = line.indexOf(' ', start);
          const url = line.substring(start, end < 0 ? undefined : end);
          this.minecraft.platform()!.openURL(url);
          return;
        }
      }
    }
    super.mouseClicked(x, y, buttonNum);
  }
}
