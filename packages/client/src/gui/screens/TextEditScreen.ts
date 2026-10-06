/**
 * 1:1 移植自 src/client/gui/screens/TextEditScreen.h 与 TextEditScreen.cpp（放下告示牌后编辑四行字的界面）。
 * 由 LocalPlayer::openTextEdit 打开（SignItem 放下告示牌时调用）。
 * 部分：关闭时发送 SignUpdatePacket（网络）DEFERRED(Network)；单机下 setChanged 照常调用，存档时文字随方块实体保存。
 * 数值：`((minecraft->height / 2) / 32) * 0.9f` 是两次**整数**除法再乘 float（PITFALLS 第 1 条）；
 *   `-(float)font->width(s) / 2.0f` 是浮点除法；文字颜色 0xFF000000（不透明黑）。
 * C++ 的无参 init() 在 TS 里是 initScreen（R10，见 Screen.ts）。
 */
import { Keyboard, LOGW } from '@mcpe/platform';
import type { SignTileEntity } from '@mcpe/world';
import {
  GL_CULL_FACE, GL_MODELVIEW, GL_PROJECTION, GL_QUADS, glColor4f2, glDepthMask, glDisable, glEnable, glLoadIdentity, glMatrixMode, glOrthof,
  glPopMatrix, glPushMatrix, glScalef2, glTranslatef,
} from '../../renderer/gles';
import { Tesselator } from '../../renderer/Tesselator';
import type { Button } from '../components/Button';
import { ImageButton, ImageDef, IntRectangle } from '../components/ImageButton';
import { Screen } from '../Screen';

const f = Math.fround;
/** C++ 的 static float minUV[]、maxUV[]（render 里的局部静态数组） */
const minUV = [f(0.03126), f(0.06249)];
const maxUV = [f(0.39063), f(0.4374)];

export class TextEditScreen extends Screen {
  protected isShowingKeyboard = false;
  protected sign: SignTileEntity;
  protected frame = 0;
  protected line = 0;
  private btnClose = new ImageButton(1, '');

  constructor(signEntity: SignTileEntity) {
    super();
    this.sign = signEntity;
  }

  protected override initScreen(): void {
    super.initScreen();
    this.minecraft.platform()!.showKeyboard();
    this.isShowingKeyboard = true;
    const def = new ImageDef();
    def.name = 'gui/spritesheet.png';
    def.x = 0;
    def.y = 1;
    def.width = def.height = 18;
    def.setSrc(new IntRectangle(60, 0, 18, 18));
    this.btnClose.setImageDef(def, true);
    this.btnClose.scaleWhenPressed = false;
    this.buttons.push(this.btnClose);
  }

  override setupPositions(): void {
    this.btnClose.width = this.btnClose.height = 19;
    this.btnClose.x = this.width - this.btnClose.width;
    this.btnClose.y = 0;
  }

  override handleBackEvent(_isDown: boolean): boolean {
    this.sign.setChanged();
    // DEFERRED(Network): Packet* signUpdatePacket = sign->getUpdatePacket(); minecraft->raknetInstance->send(signUpdatePacket);
    this.minecraft.platform()!.hideKeyboard();
    this.minecraft.setScreen(null);
    return true;
  }

  override render(xm: number, ym: number, a: number): void {
    const mc = this.minecraft;
    const font = this.font!;
    glDepthMask(false);
    this.renderBackground();
    glPushMatrix();
    glDepthMask(true);
    glDisable(GL_CULL_FACE);
    glLoadIdentity();
    const t = Tesselator.instance;
    glMatrixMode(GL_PROJECTION);
    glPushMatrix();
    glLoadIdentity();
    glOrthof(0.0, mc.width, mc.height, 0, -1, 1);
    glMatrixMode(GL_MODELVIEW);
    mc.textures!.loadAndBindTexture('item/sign.png');
    glColor4f2(1, 1, 1, 1);
    const scale = f(Math.trunc(Math.trunc(mc.height / 2) / 32) * f(0.9));
    glTranslatef(mc.width / 2.0, 5.0, 0.0);
    glScalef2(scale, scale, 1);
    t.begin(GL_QUADS);
    t.vertexUV(-32, 0, 0.0, minUV[0]!, minUV[1]!);
    t.vertexUV(32, 0, 0.0, maxUV[0]!, minUV[1]!);
    t.vertexUV(32, 0 + 32, 0.0, maxUV[0]!, maxUV[1]!);
    t.vertexUV(-32, 0 + 32, 0.0, minUV[0]!, maxUV[1]!);
    t.draw();
    this.sign.selectedLine = this.line;
    const textScale = f(8.0 / 11.0);
    glTranslatef(0, 2, 0);
    glScalef2(textScale, textScale, 1);
    for (let i = 0; i < 4; ++i) {
      const msg = this.sign.messages[i]!;
      if (i === this.sign.selectedLine && msg.length < 14) {
        const s = '> ' + msg + ' <';
        font.draw(s, -font.width(s) / 2.0, 10.0 * i, 0xff000000 | 0, false);
      } else {
        font.draw(msg, -font.width(msg) / 2.0, 10.0 * i, 0xff000000 | 0, false);
      }
    }
    this.sign.selectedLine = -1;
    glPopMatrix();
    glEnable(GL_CULL_FACE);
    glMatrixMode(GL_PROJECTION);
    glPopMatrix();
    glMatrixMode(GL_MODELVIEW);
    super.render(xm, ym, a);
  }

  override lostFocus(): void {}

  override tick(): void {
    this.frame++;
  }

  protected override keyPressed(eventKey: number): void {
    LOGW(`Key pressed! [${eventKey}]`);
    if (eventKey === Keyboard.KEY_BACKSPACE) {
      if (this.sign.messages[this.line]!.length > 0) {
        const m = this.sign.messages[this.line]!;
        this.sign.messages[this.line] = m.substring(0, m.length - 1); // erase(size() - 1, 1)
      } else {
        this.line--;
        if (this.line < 0) {
          this.line = 3;
        }
      }
    } else if (eventKey === Keyboard.KEY_RETURN) {
      this.line = (this.line + 1) % 4;
    } else {
      super.keyPressed(eventKey);
    }
  }

  protected override charPressed(inputChar: string): void {
    const fullstring = this.sign.messages[this.line]! + inputChar;
    if (fullstring.length < 16) {
      this.sign.messages[this.line] = fullstring;
    }
  }

  protected override buttonClicked(button: Button): void {
    if (button === this.btnClose) this.handleBackEvent(true);
  }
}
