/**
 * 1:1 移植自 src/client/renderer/tileentity/SignRenderer.h 与 SignRenderer.cpp。
 * 告示牌方块的渲染形状是 SHAPE_INVISIBLE（SignTile.h:60），世界里看到的告示牌全靠这里画：牌子模型 + 四行字。
 * 立着的告示牌（Tile.sign）按数据值 0..15 旋转、显示立杆；墙上的（wallSign）按朝向 2..5 旋转并贴到墙面、不显示立杆。
 * 数值：`getData() * 360 / 16.0f` 是 int*int 再除以 float；`(float)-font->width(s) / 2` 是浮点除法（强转先作用在取负后的宽度上）。
 * 文字颜色 0（黑色）：Font 在 alpha 为 0 时按 0xff 处理（Font.drawSlow），与 C++ 一致。
 */
import { type SignTileEntity, Tile, type TileEntity } from '@mcpe/world';
import { SignModel } from '../../model/SignModel';
import {
  glColor4f,
  glDepthMask,
  glNormal3f,
  glPopMatrix,
  glPushMatrix,
  glRotatef,
  glScalef,
  glTranslatef,
} from '../gles';
import { TileEntityRenderer } from './TileEntityRenderer';

const f = Math.fround;

export class SignRenderer extends TileEntityRenderer {
  private signModel = new SignModel();

  render(te: TileEntity, x: number, y: number, z: number, _a: number): void {
    const sign = te as SignTileEntity;
    const tile = sign.getTile();
    glPushMatrix();
    const size = f(16 / 24.0);
    if (tile === Tile.sign) {
      glTranslatef(x + 0.5, y + f(0.75 * size), z + 0.5);
      const rot = f((sign.getData() * 360) / 16.0);
      glRotatef(-rot, 0, 1, 0);
      this.signModel.cube2.visible = true;
    } else {
      const face = sign.getData();
      let rot = 0;
      if (face === 2) rot = 180;
      if (face === 4) rot = 90;
      if (face === 5) rot = -90;
      glTranslatef(x + 0.5, y + f(0.75 * size), z + 0.5);
      glRotatef(-rot, 0, 1, 0);
      glTranslatef(0, f(-5 / 16.0), f(-7 / 16.0));
      this.signModel.cube2.visible = false;
    }
    this.bindTexture('item/sign.png');
    glPushMatrix();
    glScalef(size, -size, -size);
    this.signModel.render();
    glPopMatrix();
    const font = this.getFont()!;
    const s = f(f(1 / 60.0) * size);
    glTranslatef(0, f(0.5 * size), f(0.07 * size));
    glScalef(s, -s, s);
    glNormal3f(0, 0, f(-1 * s));
    glDepthMask(false);
    const col = 0;
    let yy = SignTileEntity_NUM_LINES * -5;
    for (let i = 0; i < SignTileEntity_NUM_LINES; i++) {
      const msg = sign.messages[i]!;
      if (i === sign.selectedLine) {
        const str = '> ' + msg + ' <';
        font.draw(str, -font.width(str) / 2, yy, col);
      } else {
        font.draw(msg, -font.width(msg) / 2, yy, col);
      }
      yy += 10;
    }
    glDepthMask(true);
    glColor4f(1, 1, 1, 1);
    glPopMatrix();
  }

  override onGraphicsReset(): void {
    this.signModel.onGraphicsReset();
  }
}

/** SignTileEntity::NUM_LINES（只读一个常量，不为它引入值导入） */
const SignTileEntity_NUM_LINES = 4;
