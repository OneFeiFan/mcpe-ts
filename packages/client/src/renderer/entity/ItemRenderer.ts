/**
 * 1:1 移植自 src/client/renderer/entity/ItemRenderer.h 与 ItemRenderer.cpp（S13 阶段 A，部分移植：只有物品栏用的静态绘制函数）。
 * 物品栏的静态绘制在 S13 阶段 A，画掉落物的 render（继承 EntityRenderer）在阶段 C。
 * R10：renderGuiItem 的两个重载——短的以 w = h = 16 转调长的，但参数位置不同（fancy 在最后），按情形 B：
 *   renderGuiItem(font, textures, item, x, y, fancy)  →  分派入口 renderGuiItem
 *   renderGuiItem(font, textures, item, x, y, w, h, fancy)  →  renderGuiItemSized
 *   renderGuiItemDecorations 的两个重载：(font, textures, item, x, y) 保留原名；(item, x, y) → renderGuiItemDamage（它只画耐久条）。
 */
import { type Entity, Item, type ItemEntity, type ItemInstance, Tile } from '@mcpe/world';
import { Mth, Random } from '@mcpe/util';
import type { Font } from '../../gui/Font';
import { GL_RESCALE_NORMAL, glColor4f, glColor4f2, glDisable2, glEnable2, glPopMatrix2, glPushMatrix2, glRotatef2, glScalef2, glTranslatef2 } from '../gles';
import { EntityRenderer } from './EntityRenderer';
import { Tesselator } from '../Tesselator';
import type { Textures } from '../Textures';
import { TileRenderer } from '../TileRenderer';

/** ItemRenderer.cpp 的 _mapper：物品 id → gui_blocks.png 里的图块序号；-1 没有图块，-2 按数据值查下面的表 */
const _mapper: readonly number[] = [-1, 7, 9, 8, 0, 5, -2, -1, -1, -1, -1, -1, 14, 15, 39, 38, 37, -2, -2, -1, 49, 41, 46, -1, -2, -1, -1, -1, -1, -1, 235, -1, -1, -1, -1, -2, -1, 134, 135, 136, 137, 43, 44, -1, -2, 6, 76, 71, 4, 47, 129, -1, -1, 22, 74, -1, 40, 45, 72, -1, -1, 75, -1, -1, -1, 128, -1, 21, -1, -1, -1, -1, -1, 42, -1, -1, -1, -1, -1, -1, 48, 77, 10, 236, -1, 69, -1, 20, -1, 50, -1, -1, -1, -1, -1, -1, 68, -1, -2, -1, -1, -1, 130, 78, -1, -1, -1, 70, 23, 25, -1, -1, 19, -1, 26, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 24, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -2, 27, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 73, -1, 51, -1, -1, -1, -1, -1, 82, -1, -1, 174, 173, 175, 231, 234, 147, 190, -2, 153, 150, 149, 146, 185, 166, 164, 167, 186, 170, 169, 171, 187, 177, 176, 178, 165, 195, 194, 188, 181, 180, 182, 189, 191, 228, 168, 172, 145, 179, 183, 142, 233, 232, 198, 200, 201, 202, -1, -1, -1, -1, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 192, 156, 157, 133, -1, 148, 131, -1, -1, -1, -1, -1, -1, -1, 226, -1, 199, -1, 159, 158, 138, 224, 225, -1, -1, -1, -1, -1, -1, -1, 227, -1, -1, -2, 223, 229, -1, 132, -1, -1, -1, 184, 196, -1, 143, 160, 161, 162, 163, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 155, 197];

/** _6、_17 … _351：按 getAuxValue() & 15 查图块序号（IRMAPCASE 宏） */
const _byAux: Readonly<Record<number, readonly number[]>> = {
  6: [139, 140, 141, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  17: [16, 17, 18, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  18: [79, 80, 81, -1, 79, 80, 81, -1, 79, 80, 81, -1, 79, 80, 81, -1],
  24: [11, 12, 13, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  35: [52, 59, 58, 57, 56, 55, 54, 53, 67, 66, 65, 64, 63, 62, 61, 60],
  44: [28, 32, 30, 29, 31, 33, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  98: [1, 2, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  155: [34, 36, 35, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  263: [230, 151, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  351: [-1, 152, 154, -1, 193, 215, 216, -1, -1, 217, 218, 219, 220, 221, 222, 144],
};

/** C++ 的 static float ff、gg（renderGuiItemCorrect 里的局部静态变量，注释掉了自增） */
const ff = 0;
const gg = 0;

export class ItemRenderer extends EntityRenderer {
  private random = new Random();

  constructor() {
    super();
    this.shadowRadius = 0.15;
    this.shadowStrength = 0.75;
  }

  render(itemEntity_: Entity, x: number, y: number, z: number, _rot: number, a: number): void {
    const itemEntity = itemEntity_ as ItemEntity;
    this.random.setSeed(187);
    const item = itemEntity.item;
    glPushMatrix2();
    const bob = Math.fround(Mth.sin((itemEntity.age + a) / 10.0 + itemEntity.bobOffs) * 0.1 + 0.1);
    const spin = Math.fround(((itemEntity.age + a) / 20.0 + itemEntity.bobOffs) * Mth.RADDEG);
    let count = 1;
    if (item.count > 20) count = 4;
    else if (item.count > 5) count = 3;
    else if (item.count > 1) count = 2;
    glTranslatef2(x, y + bob, z);
    glEnable2(GL_RESCALE_NORMAL);
    const erd = EntityRenderer.entityRenderDispatcher!;
    if (item.id < 256 && TileRenderer.canRender(Tile.tiles[item.id]!.getRenderShape())) {
      glRotatef2(spin, 0, 1, 0);
      let br = itemEntity.getBrightness(a);
      if (item.id === Tile.sand.id || item.id === Tile.sandStone.id) br *= 0.8;
      glColor4f2(br, br, br, 1.0);
      this.bindTexture('terrain.png');
      let s = 1 / 4.0;
      const shape = Tile.tiles[item.id]!.getRenderShape();
      if (shape === Tile.SHAPE_CROSS_TEXTURE || shape === Tile.SHAPE_TORCH) s = 0.5;
      glScalef2(s, s, s);
      for (let i = 0; i < count; i++) {
        if (i > 0) {
          glPushMatrix2();
          const xo = ((this.random.nextFloat() * 2 - 1) * 0.2) / s;
          const yo = ((this.random.nextFloat() * 2 - 1) * 0.2) / s;
          const zo = ((this.random.nextFloat() * 2 - 1) * 0.2) / s;
          glTranslatef2(xo, yo, zo);
        }
        erd.itemInHandRenderer!.renderItem(null, item);
        if (i > 0) glPopMatrix2();
      }
    } else {
      glScalef2(1 / 2.0, 1 / 2.0, 1 / 2.0);
      const icon = item.getIcon();
      if (item.id < 256) this.bindTexture('terrain.png');
      else this.bindTexture('gui/items.png');
      const t = Tesselator.instance;
      const u0 = ((icon % 16) * 16 + 0) / 256.0;
      const u1 = ((icon % 16) * 16 + 16) / 256.0;
      const v0 = (Math.trunc(icon / 16) * 16 + 0) / 256.0;
      const v1 = (Math.trunc(icon / 16) * 16 + 16) / 256.0;
      const r = 1.0;
      const xo = 0.5;
      const yo = 0.25;
      for (let i = 0; i < count; i++) {
        glPushMatrix2();
        if (i > 0) {
          const _xo = (this.random.nextFloat() * 2 - 1) * 0.3;
          const _yo = (this.random.nextFloat() * 2 - 1) * 0.3;
          const _zo = (this.random.nextFloat() * 2 - 1) * 0.3;
          glTranslatef2(_xo, _yo, _zo);
        }
        glRotatef2(180 - erd.playerRotY, 0, 1, 0);
        t.begin();
        t.normal(0, 1, 0);
        t.vertexUV(0 - xo, 0 - yo, 0, u0, v1);
        t.vertexUV(r - xo, 0 - yo, 0, u1, v1);
        t.vertexUV(r - xo, 1 - yo, 0, u1, v0);
        t.vertexUV(0 - xo, 1 - yo, 0, u0, v0);
        t.draw();
        glPopMatrix2();
      }
    }
    glDisable2(GL_RESCALE_NORMAL);
    glPopMatrix2();
  }

  /** C++ 的 static TileRenderer* tileRenderer = new TileRenderer();（没有 level 的 TileRenderer） */
  private static tileRenderer: TileRenderer | null = new TileRenderer();

  /** C++ 的两个重载（见文件头） */
  static renderGuiItem(font: Font | null, textures: Textures, item: ItemInstance | null, x: number, y: number, fancy: boolean): void {
    ItemRenderer.renderGuiItemSized(font, textures, item, x, y, 16, 16, fancy);
  }

  static renderGuiItemSized(font: Font | null, textures: Textures, item: ItemInstance | null, x: number, y: number, w: number, h: number, _fancy: boolean): void {
    if (item === null) {
      return;
    }
    const id = item.id;
    if (!Item.items[id]) return;
    let i = ItemRenderer.getAtlasPos(item);
    if (i < 0) {
      const t = Tesselator.instance;
      if (!t.isOverridden()) ItemRenderer.renderGuiItemCorrect(font, textures, item, Math.trunc(x), Math.trunc(y));
      else {
        t.endOverrideAndDraw();
        ItemRenderer.renderGuiItemCorrect(font, textures, item, Math.trunc(x), Math.trunc(y));
        t.beginOverride();
      }
      return;
    }
    textures.loadAndBindTexture('gui/gui_blocks.png');
    let u0: number, u1: number, v0: number, v1: number;
    if (i < 128) {
      const P = 48.0 / 512.0;
      u0 = (i % 10) * P;
      v0 = Math.trunc(i / 10) * P;
      u1 = u0 + P;
      v1 = v0 + P;
    } else {
      i -= 128;
      const P = 16.0 / 512.0;
      u0 = (i & 31) * P;
      v0 = 27 * P + (i >> 5) * P; // 27 "icon" rows down
      u1 = u0 + P;
      v1 = v0 + P;
    }
    const blitOffset = 0;
    const t = Tesselator.instance;
    t.begin();
    t.colorABGR(item.count > 0 ? 0xffffffff : 0x60ffffff);
    t.vertexUV(x, y + h, blitOffset, u0, v1);
    t.vertexUV(x + w, y + h, blitOffset, u1, v1);
    t.vertexUV(x + w, y, blitOffset, u1, v0);
    t.vertexUV(x, y, blitOffset, u0, v0);
    t.draw();
  }

  static renderGuiItemCorrect(_font: Font | null, textures: Textures, item: ItemInstance | null, x: number, y: number): void {
    if (item === null) return;
    if (item.id < 256 && TileRenderer.canRender(Tile.tiles[item.id]!.getRenderShape())) {
      const paint = item.id;
      textures.loadAndBindTexture('terrain.png');
      const tile = Tile.tiles[paint]!;
      glPushMatrix2();
      glTranslatef2(x - 2, y + 3, -8);
      glScalef2(10.0, 10.0, 10.0);
      glTranslatef2(1.0, 0.5, 0.0);
      glRotatef2(ff + 180.0 + 30.0, 1, 0, 0);
      glRotatef2(gg + 45.0, 0, 1, 0);
      glScalef2(1, 1, 1);
      ItemRenderer.tileRenderer!.renderGuiTile(tile, item.getAuxValue());
      glPopMatrix2();
    } else if (item.getIcon() >= 0) {
      if (item.id < 256) {
        textures.loadAndBindTexture('terrain.png');
      } else {
        textures.loadAndBindTexture('gui/items.png');
      }
      ItemRenderer.blit(x, y, (item.getIcon() % 16) * 16, Math.trunc(item.getIcon() / 16) * 16, 16, 16);
    }
  }

  static renderGuiItemDecorations(font: Font, _textures: Textures, item: ItemInstance | null, x: number, y: number): void {
    if (item !== null) {
      if (item.count > 1) {
        const countStr = String(item.count);
        font.drawShadow(countStr, x + 19 - 2 - font.width(countStr), y + 6 + 3, 0xffffff);
      }
      if (item.isDamaged()) {
        const p = Math.floor(Math.fround(13.5 - Math.fround((item.getDamageValue() * 13.0) / item.getMaxDamage())) + 0.5);
        const cc = Math.trunc(Math.floor(Math.fround(255.5 - Math.fround((item.getDamageValue() * 255.0) / item.getMaxDamage())) + 0.5));
        const t = Tesselator.instance;
        const ca = ((255 - cc) << 16) | (cc << 8);
        const cb = (Math.trunc((255 - cc) / 4) << 16) | 16128;
        ItemRenderer.fillRect(t, x + 2, y + 13, 13, 2, 0);
        ItemRenderer.fillRect(t, x + 2, y + 13, 12, 1, cb);
        ItemRenderer.fillRect(t, x + 2, y + 13, p, 1, ca);
        glColor4f(1.0, 1.0, 1.0, 1.0);
      }
    }
  }

  /** C++ 的 renderGuiItemDecorations(const ItemInstance*, float, float)：只画耐久条（R10 情形 B） */
  static renderGuiItemDamage(item: ItemInstance | null, x: number, y: number): void {
    if (!item) return;
    if (item.count > 0 && item.isDamaged()) {
      const p = Math.floor(Math.fround(13.5 - Math.fround((item.getDamageValue() * 13.0) / item.getMaxDamage())));
      const cc = Math.trunc(Math.floor(Math.fround(255.5 - Math.fround((item.getDamageValue() * 255.0) / item.getMaxDamage()))));
      const t = Tesselator.instance;
      const ca = ((255 - cc) << 16) | (cc << 8);
      const cb = (Math.trunc((255 - cc) / 4) << 16) | (Math.trunc(255 / 4) << 8);
      ItemRenderer.fillRect(t, x + 2, y + 13, 13, 1, 0x000000);
      ItemRenderer.fillRect(t, x + 2, y + 13, 12, 1, cb);
      ItemRenderer.fillRect(t, x + 2, y + 13, p, 1, ca);
      glColor4f2(1, 1, 1, 1);
    }
  }

  static blit(x: number, y: number, sx: number, sy: number, w: number, h: number): void {
    const blitOffset = 0;
    const us = 1 / 256.0;
    const vs = 1 / 256.0;
    const t = Tesselator.instance;
    t.begin();
    t.vertexUV(x, y + h, blitOffset, sx * us, (sy + h) * vs);
    t.vertexUV(x + w, y + h, blitOffset, (sx + w) * us, (sy + h) * vs);
    t.vertexUV(x + w, y, blitOffset, (sx + w) * us, sy * vs);
    t.vertexUV(x, y, blitOffset, sx * us, sy * vs);
    t.draw();
  }

  static getAtlasPos(item: ItemInstance): number {
    const id = item.id;
    if (id < 0 || id >= _mapper.length) return -1;
    const texId = _mapper[id]!;
    if (texId !== -2) return texId;
    const table = _byAux[id];
    if (table) return table[item.getAuxValue() & 15]!; // IRMAPCASE(x)
    return -1;
  }

  static teardown_static(): void {
    if (ItemRenderer.tileRenderer) {
      ItemRenderer.tileRenderer = null; // delete tileRenderer
    }
  }

  private static fillRect(t: Tesselator, x: number, y: number, w: number, h: number, c: number): void {
    t.begin();
    t.color(c);
    t.vertex(x + 0, y + 0, 0);
    t.vertex(x + 0, y + h, 0);
    t.vertex(x + w, y + h, 0);
    t.vertex(x + w, y + 0, 0);
    t.draw();
  }

}
