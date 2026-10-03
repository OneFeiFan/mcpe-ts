/**
 * 1:1 移植自 src/client/renderer/ItemInHandRenderer.h 与 ItemInHandRenderer.cpp（S13 阶段 C，部分移植）。
 * 构建取网页版分支（USE_VBO）。renderItem 把物品的网格缓存进每个物品一个 VBO（renderObjects），掉落物渲染（ItemRenderer）也用它。
 * 部分：空手时画玩家手臂要用玩家模型（HumanoidMobRenderer::renderHand、模型系统计划外）DEFERRED(Model)。
 */
import { Mth } from '@mcpe/util';
import {
  BowItem,
  Item,
  type ItemInstance,
  ItemInstance as ItemInstanceClass,
  LeafTile,
  Material,
  type Mob,
  Tile,
  UseAnim,
} from '@mcpe/world';
import type { Minecraft } from '../Minecraft';
import { OptionId } from '../Options';
import {
  drawArrayVTN_NoState,
  GL_ALPHA_TEST,
  GL_BLEND,
  GL_NORMAL_ARRAY,
  GL_ONE_MINUS_SRC_ALPHA,
  GL_RESCALE_NORMAL,
  GL_SRC_ALPHA,
  GL_TEXTURE_COORD_ARRAY,
  GL_VERTEX_ARRAY,
  glBlendFunc2,
  glColor4f2,
  glDisable2,
  glDisableClientState2,
  glEnable,
  glEnable2,
  glEnableClientState2,
  glGenBuffers2,
  glPopMatrix2,
  glPushMatrix2,
  glRotatef,
  glRotatef2,
  glScalef,
  glScalef2,
  glTranslatef,
  glTranslatef2,
} from './gles';
import { Lighting } from './Lighting';
import { RenderChunk } from './RenderChunk';
import { Tesselator } from './Tesselator';
import { TileRenderer } from './TileRenderer';

const f = Math.fround;

/** C++ 的 struct RenderCall */
class RenderCall {
  itemId = -1;
  chunk = new RenderChunk();
  texture = '';
  isFlat = false;
}

export class ItemInHandRenderer {
  private static readonly MaxNumRenderObjects = 512;

  private lastIconRendered = 0;
  private lastItemRendered = 0;
  private lastSlot = -1;
  private item = new ItemInstanceClass(0, 1, 0);
  private mc: Minecraft;
  private height = 0;
  private oHeight = 0;
  private tileRenderer = new TileRenderer();
  private renderObjects: RenderCall[] = Array.from(
    { length: ItemInHandRenderer.MaxNumRenderObjects },
    () => new RenderCall(),
  );

  constructor(mc: Minecraft) {
    this.mc = mc;
    this.genBuffers();
  }

  private genBuffers(): void {
    const ids: number[] = new Array<number>(ItemInHandRenderer.MaxNumRenderObjects).fill(0);
    glGenBuffers2(ItemInHandRenderer.MaxNumRenderObjects, ids);
    for (let i = 0; i < ItemInHandRenderer.MaxNumRenderObjects; ++i) {
      this.renderObjects[i]!.itemId = -1;
      this.renderObjects[i]!.chunk.vboId = ids[i]!;
    }
  }

  tick(): void {
    this.oHeight = this.height;
    const itemInHand = this.mc.player!.inventory.getSelected();
    let sameItem =
      itemInHand !== null &&
      this.item.id === itemInHand.id &&
      this.item.getAuxValue() === itemInHand.getAuxValue();
    if (this.mc.options.getBooleanValue(OptionId.OPTIONS_RESTORED_ANIMS)) {
      if (!itemInHand && this.item.id === 0) sameItem = true;
      const max = f(0.4);
      const tHeight = sameItem ? 1 : 0;
      let dd = f(tHeight - this.height);
      if (dd < -max) dd = -max;
      if (dd > max) dd = max;
      this.height = f(this.height + dd);
      if (this.height < 0.1) {
        if (itemInHand && itemInHand.count > 0) {
          this.item.id = itemInHand.id;
          this.item.setAuxValue(itemInHand.getAuxValue());
        } else {
          this.item.id = 0;
        }
      }
    } else {
      if (itemInHand && itemInHand.count > 0) {
        this.item.id = itemInHand.id;
        this.item.setAuxValue(itemInHand.getAuxValue());
      }
      const max = f(0.4);
      const tHeight = 1;
      let dd = f(tHeight - this.height);
      if (dd < -max) dd = -max;
      if (dd > max) dd = max;
      this.height = f(this.height + dd);
    }
  }

  renderItem(mob: Mob | null, item: ItemInstance): void {
    let itemId = item.id;
    if (itemId === Tile.cloth.id) {
      itemId = 200 + item.getAuxValue();
    } else if (itemId === Tile.treeTrunk.id) {
      itemId = 216 + item.getAuxValue();
    } else if (itemId === Tile.sapling.id) {
      itemId = 220 + item.getAuxValue();
    } else if (itemId === Tile.stoneSlabHalf.id) {
      itemId = 224 + item.getAuxValue();
    } else if (itemId === Tile.leaves.id) {
      itemId = 232 + (item.getAuxValue() & LeafTile.LEAF_TYPE_MASK);
    }
    const renderObject = this.renderObjects[itemId]!;
    let itemIcon = item.getIcon();
    if (mob !== null) {
      itemIcon = mob.getItemInHandIcon(item, 0);
    }
    let reTesselate = false;
    if (itemIcon !== this.lastIconRendered && this.lastItemRendered === itemId) reTesselate = true;
    this.lastItemRendered = itemId;
    this.lastIconRendered = itemIcon;
    if (renderObject.itemId === -1 || reTesselate) {
      if (item.id < 256 && TileRenderer.canRender(Tile.tiles[item.id]!.getRenderShape())) {
        const t = Tesselator.instance;
        t.beginOverride();
        let renderedItemId = item.id;
        if (renderedItemId === Tile.leaves.id) renderedItemId = Tile.leaves_carried.id;
        if (renderedItemId === Tile.grass.id) renderedItemId = Tile.grass_carried.id;
        this.tileRenderer.renderTile(Tile.tiles[renderedItemId]!, item.getAuxValue());
        renderObject.chunk = t.endOverride(renderObject.chunk.vboId);
        renderObject.texture = 'terrain.png';
        renderObject.itemId = itemId;
        renderObject.isFlat = false;
      } else {
        renderObject.itemId = itemId;
        renderObject.isFlat = true;
        renderObject.texture = item.id < 256 ? 'terrain.png' : 'gui/items.png';
        const t = Tesselator.instance;
        t.beginOverride();
        t.color(0xff, 0xff, 0xff);
        const up = itemIcon & 15;
        const vp = itemIcon >> 4;
        const u1 = f((up * 16 + 0.0) / 256.0);
        const u0 = f((up * 16 + f(15.99)) / 256.0);
        const v0 = f((vp * 16 + 0.0) / 256.0);
        const v1 = f((vp * 16 + f(15.99)) / 256.0);
        const r = 1.0;
        const dd = 1 / 16.0;
        let col = 1.0;
        const br = this.mc.player!.getBrightness(0);
        t.color(col * br, col * br, col * br, 1.0);
        t.normal(0.0, 0.0, 1.0);
        t.vertexUV(0, 0, 0, u0, v1);
        t.vertexUV(r, 0, 0, u1, v1);
        t.vertexUV(r, 1, 0, u1, v0);
        t.vertexUV(0, 1, 0, u0, v0);
        t.normal(0.0, 0.0, -1.0);
        t.vertexUV(0, 1, 0 - dd, u0, v0);
        t.vertexUV(r, 1, 0 - dd, u1, v0);
        t.vertexUV(r, 0, 0 - dd, u1, v1);
        t.vertexUV(0, 0, 0 - dd, u0, v1);
        col = 0.8;
        t.color(col * br, col * br, col * br, 1.0);
        t.normal(-1.0, 0.0, 0.0);
        for (let i = 0; i < 16; i++) {
          const p = i / 16.0;
          const uu = u0 + (u1 - u0) * p - 0.5 / 256.0;
          const xx = r * p;
          t.vertexUV(xx, 0, 0 - dd, uu, v1);
          t.vertexUV(xx, 0, 0, uu, v1);
          t.vertexUV(xx, 1, 0, uu, v0);
          t.vertexUV(xx, 1, 0 - dd, uu, v0);
        }
        t.normal(1.0, 0.0, 0.0);
        for (let i = 0; i < 16; i++) {
          const p = i / 16.0;
          const uu = u0 + (u1 - u0) * p - 0.5 / 256.0;
          const xx = r * p + 1 / 16.0;
          t.vertexUV(xx, 1, 0 - dd, uu, v0);
          t.vertexUV(xx, 1, 0, uu, v0);
          t.vertexUV(xx, 0, 0, uu, v1);
          t.vertexUV(xx, 0, 0 - dd, uu, v1);
        }
        col = 0.6;
        t.color(col * br, col * br, col * br, 1.0);
        t.normal(0.0, 1.0, 0.0);
        for (let i = 0; i < 16; i++) {
          const p = i / 16.0;
          const vv = v1 + (v0 - v1) * p - 0.5 / 256.0;
          const yy = r * p + 1 / 16.0;
          t.vertexUV(0, yy, 0, u0, vv);
          t.vertexUV(r, yy, 0, u1, vv);
          t.vertexUV(r, yy, 0 - dd, u1, vv);
          t.vertexUV(0, yy, 0 - dd, u0, vv);
        }
        t.normal(0.0, -1.0, 0.0);
        for (let i = 0; i < 16; i++) {
          const p = i / 16.0;
          const vv = v1 + (v0 - v1) * p - 0.5 / 256.0;
          const yy = r * p;
          t.vertexUV(r, yy, 0, u1, vv);
          t.vertexUV(0, yy, 0, u0, vv);
          t.vertexUV(0, yy, 0 - dd, u0, vv);
          t.vertexUV(r, yy, 0 - dd, u1, vv);
        }
        renderObject.chunk = t.endOverride(renderObject.chunk.vboId);
      }
    }
    if (renderObject.itemId >= 0) {
      if (renderObject.isFlat) {
        const xo = 0.0;
        const yo = 0.3;
        glPushMatrix2();
        glTranslatef2(-xo, -yo, 0);
        const s = 1.5;
        glScalef2(s, s, s);
        glRotatef2(50, 0, 1, 0);
        glRotatef2(45 + 290, 0, 0, 1);
        glTranslatef2(-15 / 16.0, -1 / 16.0, 0);
      }
      this.mc.textures!.loadAndBindTexture(renderObject.texture);
      drawArrayVTN_NoState(renderObject.chunk.vboId, renderObject.chunk.vertexCount);
      if (renderObject.isFlat) glPopMatrix2();
    }
  }

  render(a: number): void {
    const mc = this.mc;
    const h = this.oHeight + (this.height - this.oHeight) * a;
    const player = mc.player!;
    const localPlayer = player; // C++ 的 (LocalPlayer*) 强转
    const xr = player.xRotO + (player.xRot - player.xRotO) * a;
    glPushMatrix2();
    glRotatef2(player.xRotO + (player.xRot - player.xRotO) * a, 1, 0, 0);
    glRotatef2(player.yRotO + (player.yRot - player.yRotO) * a, 0, 1, 0);
    glEnable(GL_RESCALE_NORMAL);
    Lighting.turnOn(mc);
    glPopMatrix2();
    if (localPlayer) {
      const xrr = localPlayer.xBobO + (localPlayer.xBob - localPlayer.xBobO) * a;
      const yrr = localPlayer.yBobO + (localPlayer.yBob - localPlayer.yBobO) * a;
      const yr = player.yRotO + (player.yRot - player.yRotO) * a;
      glRotatef((xr - xrr) * 0.1, 1, 0, 0);
      glRotatef((yr - yrr) * 0.1, 0, 1, 0);
    }
    const br = mc.level!.getBrightness(
      Mth.floor(player.x),
      Mth.floor(player.y),
      Mth.floor(player.z),
    );
    const item: ItemInstance | null = this.item.id > 0 ? this.item : null;
    if (item !== null) {
      glColor4f2(br, br, br, 1);
      const isUsing = player.getUseItemDuration() > 0;
      const isBow = item.id === Item.bow.id;
      const noSwingAnimation = isUsing && (isBow || item.getUseAnimation() !== UseAnim.none);
      const swing = noSwingAnimation ? 0 : player.getAttackAnim(a);
      const sqrtSwing = Mth.sqrt(swing);
      const swing3 = Mth.sin(swing * swing * Mth.PI);
      const swing1 = Mth.sin(swing * Mth.PI);
      const swing2 = Mth.sin(sqrtSwing * Mth.PI);
      const d = 0.8;
      glPushMatrix2();
      if (isUsing) {
        const anim = item.getUseAnimation();
        if (anim === UseAnim.eat || anim === UseAnim.drink) {
          const t = player.getUseItemDuration() - a + 1;
          const useProgress = 1 - t / item.getUseDuration();
          const swingU = useProgress;
          let is = 1 - swingU;
          is = is * is * is;
          is = is * is * is;
          is = is * is * is;
          const iss = 1 - is;
          glTranslatef(0, Mth.abs(Mth.cos((t / 4) * Mth.PI) * 0.1) * (swingU > 0.2 ? 1 : 0), 0);
          glTranslatef(iss * 0.6, -iss * 0.5, 0);
          glRotatef(iss * 90, 0, 1, 0);
          glRotatef(iss * 10, 1, 0, 0);
          glRotatef(iss * 30, 0, 0, 1);
        }
      } else {
        glTranslatef2(-swing2 * 0.4, Mth.sin(sqrtSwing * Mth.PI * 2) * 0.2, -swing1 * 0.2);
      }
      glTranslatef2(0.7 * d, -0.65 * d - (1 - h) * 0.6, -0.9 * d);
      glRotatef2(45, 0, 1, 0);
      glEnable2(GL_RESCALE_NORMAL);
      glRotatef2(-swing3 * 20, 0, 1, 0);
      glRotatef2(-swing2 * 20, 0, 0, 1);
      glRotatef2(-swing2 * 80, 1, 0, 0);
      const ss = 0.4;
      glScalef2(ss, ss, ss);
      if (player.getUseItemDuration() > 0) {
        const anim = item.getUseAnimation();
        if (anim === UseAnim.bow) {
          glRotatef(-18, 0, 0, 1);
          glRotatef(-12, 0, 1, 0);
          glRotatef(-8, 1, 0, 0);
          glTranslatef(-0.9, 0.2, 0.0);
          const timeHeld = item.getUseDuration() - (player.getUseItemDuration() - a + 1);
          let pow = timeHeld / BowItem.MAX_DRAW_DURATION;
          pow = (pow * pow + pow * 2) / 3;
          if (pow > 1) pow = 1;
          if (pow > 0.1) {
            glTranslatef(0, Mth.sin((timeHeld - 0.1) * 1.3) * 0.01 * (pow - 0.1), 0);
          }
          glTranslatef(0, 0, pow * 0.1);
          glRotatef(-45 - 290, 0, 0, 1);
          glRotatef(-50, 0, 1, 0);
          glTranslatef(0, 0.5, 0);
          const ys = 1 + pow * 0.2;
          glScalef(1, 1, ys);
          glTranslatef(0, -0.5, 0);
          glRotatef(50, 0, 1, 0);
          glRotatef(45 + 290, 0, 0, 1);
        }
      }
      if (item.getItem()!.isMirroredArt()) {
        glRotatef2(180, 0, 1, 0);
      }
      glEnableClientState2(GL_VERTEX_ARRAY);
      glEnableClientState2(GL_TEXTURE_COORD_ARRAY);
      glEnableClientState2(GL_NORMAL_ARRAY);
      this.renderItem(player, item);
      glDisableClientState2(GL_NORMAL_ARRAY);
      glDisableClientState2(GL_VERTEX_ARRAY);
      glDisableClientState2(GL_TEXTURE_COORD_ARRAY);
      glPopMatrix2();
    } else {
      // DEFERRED(Model)：空手时画玩家手臂（HumanoidMobRenderer::renderHand，要用玩家模型）
    }
    glDisable2(GL_RESCALE_NORMAL);
    Lighting.turnOff();
  }

  renderScreenEffect(a: number): void {
    const mc = this.mc;
    const player = mc.player!;
    glDisable2(GL_ALPHA_TEST);
    if (player.isOnFire()) {
      mc.textures!.loadAndBindTexture('terrain.png');
      this.renderFire(a);
    }
    if (player.isInWall()) {
      const x = Mth.floor(player.x);
      const y = Mth.floor(player.y);
      const z = Mth.floor(player.z);
      mc.textures!.loadAndBindTexture('terrain.png');
      const tile = mc.level!.getTile(x, y, z);
      if (Tile.tiles[tile] != null) {
        this.renderTex(a, Tile.tiles[tile]!.getTexture(2));
      }
    }
    if (player.isUnderLiquid(Material.water)) {
      mc.textures!.loadAndBindTexture('misc/water.png');
      this.renderWater(a);
    }
    glEnable2(GL_ALPHA_TEST);
  }

  itemPlaced(): void {
    this.height = 0;
  }

  itemUsed(): void {
    this.height = 0;
  }

  onGraphicsReset(): void {
    this.genBuffers();
  }

  private renderTex(_a: number, tex: number): void {
    const t = Tesselator.instance;
    const br = 0.1;
    glColor4f2(br, br, br, 0.5);
    glPushMatrix2();
    const x0 = -1,
      x1 = +1,
      y0 = -1,
      y1 = +1,
      z0 = -0.5;
    const r = 2 / 256.0;
    const u0 = (tex % 16) / 256.0 - r;
    const u1 = ((tex % 16) + 15.99) / 256.0 + r;
    const v0 = Math.trunc(tex / 16) / 256.0 - r;
    const v1 = (Math.trunc(tex / 16) + 15.99) / 256.0 + r;
    t.begin();
    t.vertexUV(x0, y0, z0, u1, v1);
    t.vertexUV(x1, y0, z0, u0, v1);
    t.vertexUV(x1, y1, z0, u0, v0);
    t.vertexUV(x0, y1, z0, u1, v0);
    t.draw();
    glPopMatrix2();
    glColor4f2(1, 1, 1, 1);
  }

  private renderWater(a: number): void {
    const t = Tesselator.instance;
    const player = this.mc.player!;
    const br = player.getBrightness(a);
    glColor4f2(br, br, br, 0.5);
    glEnable2(GL_BLEND);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glPushMatrix2();
    const size = 4;
    const x0 = -1,
      x1 = +1,
      y0 = -1,
      y1 = +1,
      z0 = -0.5;
    const uo = -player.yRot / 64.0;
    const vo = +player.xRot / 64.0;
    t.begin();
    t.vertexUV(x0, y0, z0, size + uo, size + vo);
    t.vertexUV(x1, y0, z0, 0 + uo, size + vo);
    t.vertexUV(x1, y1, z0, 0 + uo, 0 + vo);
    t.vertexUV(x0, y1, z0, size + uo, 0 + vo);
    t.draw();
    glPopMatrix2();
    glColor4f2(1, 1, 1, 1);
    glDisable2(GL_BLEND);
  }

  private renderFire(_a: number): void {
    const t = Tesselator.instance;
    glColor4f2(1, 1, 1, 0.9);
    glEnable2(GL_BLEND);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    const size = 1;
    for (let i = 0; i < 2; i++) {
      glPushMatrix2();
      const tex = Tile.fire.tex + i * 16;
      const xt = (tex & 0xf) << 4;
      const yt = tex & 0xf0;
      const u0 = xt / 256.0;
      const u1 = (xt + 15.99) / 256.0;
      const v0 = yt / 256.0;
      const v1 = (yt + 15.99) / 256.0;
      const x0 = (0 - size) / 2;
      const x1 = x0 + size;
      const y0 = 0 - size / 2;
      const y1 = y0 + size;
      const z0 = -0.5;
      glTranslatef2(-(i * 2 - 1) * 0.24, -0.3, 0);
      glRotatef2((i * 2 - 1) * 10.0, 0, 1, 0);
      t.begin();
      t.vertexUV(x0, y0, z0, u1, v1);
      t.vertexUV(x1, y0, z0, u0, v1);
      t.vertexUV(x1, y1, z0, u0, v0);
      t.vertexUV(x0, y1, z0, u1, v0);
      t.draw();
      glPopMatrix2();
    }
    glColor4f2(1, 1, 1, 1);
    glDisable2(GL_BLEND);
  }
}
