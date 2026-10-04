/**
 * 1:1 移植自 src/client/gui/Gui.h 与 Gui.cpp（S13 阶段 C，部分移植）。替换前向声明。
 * 构建取网页版的分支：USE_VBO 已定义；不是 RPI、不是 WIN32。参考了转写脚本的初稿与你的草稿，逐函数对照 C++ 手工完成，
 * 整数除法（int / int）一律写成 Math.trunc。
 * 部分：
 *   - 聊天、控制台界面（ChatScreen、ConsoleScreen）未移植：isChatting 恒为 false。
 *   - 粒子统计（gatherStats3 的粒子数）—— E7 起是真的（`particleEngine.countParticles()`）。
 * R10：getSlotPos(int slot, int& posX, int& posY) 的引用参数改为返回 [posX, posY]（ADAPTED(Cpp)）。
 */
import { SharedConstants } from '@mcpe/core';
import { getTimeS, Keyboard, Mouse, MouseAction } from '@mcpe/platform';
import { Mth, Random } from '@mcpe/util';
import {
  HitResultType,
  Inventory,
  Item,
  type ItemInstance,
  Level,
  Material,
  Player,
  Tile,
} from '@mcpe/world';
import type { Config, IConfigListener } from '../IConfigListener';
import type { Minecraft } from '../Minecraft';
import { OptionId } from '../Options';
import { Chunk } from '../renderer/Chunk';
import { ItemRenderer } from '../renderer/entity/ItemRenderer';
import {
  GL_ALPHA_TEST,
  GL_BLEND,
  GL_DEPTH_TEST,
  GL_LINEAR,
  GL_ONE_MINUS_SRC_ALPHA,
  GL_ONE_MINUS_SRC_COLOR,
  GL_SRC_ALPHA,
  GL_TEXTURE_2D,
  GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER,
  GL_TRIANGLE_FAN,
  GL_ONE_MINUS_DST_COLOR,
  GL_ZERO,
  drawArrayVT,
  glTranslatef2,
  glBlendFunc,
  glBlendFunc2,
  glColor4f2,
  glDepthMask,
  glDisable,
  glDisable2,
  glEnable,
  glEnable2,
  glGenBuffers2,
  glPopMatrix2,
  glPushMatrix2,
  glScalef2,
  glTexParameteri2,
} from '../renderer/gles';
import { RenderChunk } from '../renderer/RenderChunk';
import { Tesselator } from '../renderer/Tesselator';
import type { Textures } from '../renderer/Textures';
import { Font } from './Font';
import { GuiComponent } from './GuiComponent';
import { ScreenId } from './screens/ScreenChooser';

const f = Math.fround;

/** C++ 的 struct GuiMessage */
export class GuiMessage {
  message = '';
  ticks = 0;
}

/** C++ 的 RectangleArea（client/gui/…；这里只需要四个边） */
export class RectangleArea {
  constructor(
    public x0: number,
    public y0: number,
    public x1: number,
    public y1: number,
  ) {}
}

export class Gui extends GuiComponent implements IConfigListener {
  static InvGuiScale = f(1.0 / 3.0);
  static GuiScale = f(1.0 / Gui.InvGuiScale);
  static readonly DropTicks = 40.0;

  progress = 0;
  selectedName = '';
  private MAX_MESSAGE_WIDTH = 240;
  private guiMessages: GuiMessage[] = [];
  private chatScrollOffset = 0;
  private minecraft: Minecraft;
  private tickCount = 0;
  private itemNameOverlayTime = 2;
  private overlayMessageString = '';
  private overlayMessageTime = 0;
  private animateOverlayMessageColor = false;
  private tbr = 1;
  private _inventoryRc = new RenderChunk();
  private _inventoryNeedsUpdate = true;
  private _flashSlotId = -1;
  private _flashSlotStartTime = -1;
  private _slotFont: Font | null = null;
  private _numSlots = 4;
  private rcFeedbackOuter = new RenderChunk();
  private rcFeedbackInner = new RenderChunk();
  private _currentDropTicks = -1;
  private _currentDropSlot = -1;
  private _openInventorySlot: boolean;

  constructor(minecraft: Minecraft) {
    super();
    this.minecraft = minecraft;
    this._openInventorySlot = minecraft.useTouchscreen();
    const ids: number[] = [0];
    glGenBuffers2(1, ids);
    this._inventoryRc.vboId = ids[0]!;
    glGenBuffers2(1, ids);
    this.rcFeedbackInner.vboId = ids[0]!;
    glGenBuffers2(1, ids);
    this.rcFeedbackOuter.vboId = ids[0]!;
  }

  render(a: number, _mouseFree: boolean, _xMouse: number, _yMouse: number): void {
    const mc = this.minecraft;
    if (!mc.level || !mc.player) return;
    const font = mc.font!;
    const isTouchInterface = mc.useTouchscreen();
    const screenWidth = Math.trunc(mc.width * Gui.InvGuiScale);
    const screenHeight = Math.trunc(mc.height * Gui.InvGuiScale);
    this.blitOffset = -90;
    this.renderProgressIndicator(isTouchInterface, screenWidth, screenHeight, a);
    glColor4f2(1, 1, 1, 1);
    const ySlot = screenHeight - 16 - 3;
    if (!mc.options.getBooleanValue(OptionId.OPTIONS_HIDEGUI)) {
      if (mc.gameMode!.canHurtPlayer()) {
        mc.textures!.loadAndBindTexture('gui/icons.png');
        const t = Tesselator.instance;
        t.beginOverride();
        t.colorABGR(0xffffffff);
        this.renderHearts();
        this.renderBubbles();
        t.endOverrideAndDraw();
      }
    }
    if (
      mc.options.getBooleanValue(OptionId.OPTIONS_FANCY_GRAPHICS) &&
      mc.options.getBooleanValue(OptionId.OPTIONS_VIGNETTE)
    ) {
      this.renderVignette(mc.player.getBrightness(a), screenWidth, screenHeight);
    }
    if (mc.player.getSleepTimer() > 0) {
      glDisable(GL_DEPTH_TEST);
      glDisable(GL_ALPHA_TEST);
      this.renderSleepAnimation(screenWidth, screenHeight);
      glEnable(GL_ALPHA_TEST);
      glEnable(GL_DEPTH_TEST);
    }
    if (!mc.options.getBooleanValue(OptionId.OPTIONS_HIDEGUI)) {
      this.renderToolBar(a, ySlot, screenWidth);
      glEnable(GL_BLEND);
      const isChatting = this.isChatting();
      let max = 10;
      if (isChatting) {
        const lineHeight = 9;
        max = Math.trunc((screenHeight - 48) / lineHeight);
        if (max < 1) max = 1;
        let maxScroll = this.guiMessages.length - max;
        if (maxScroll < 0) maxScroll = 0;
        if (this.chatScrollOffset > maxScroll) this.chatScrollOffset = maxScroll;
      } else {
        this.chatScrollOffset = 0;
      }
      this.renderChatMessages(screenHeight, max, isChatting, font);
      this.renderOnSelectItemNameText(screenWidth, font, ySlot);
      if (Keyboard.isKeyDown(Keyboard.KEY_TAB)) {
        this.renderPlayerList(font, screenWidth, screenHeight);
      }
      if (mc.options.getBooleanValue(OptionId.OPTIONS_RENDER_DEBUG)) this.renderDebugInfo();
    }
    glDisable(GL_BLEND);
    glEnable2(GL_ALPHA_TEST);
  }

  /** C++ 里是 (minecraft->screen && (dynamic_cast<ChatScreen*> || dynamic_cast<ConsoleScreen*>))：这两个界面计划外，恒为 false */
  private isChatting(): boolean {
    return false; // DEFERRED(Gui)
  }

  getSlotIdAt(x: number, y: number): number {
    const screenWidth = Math.trunc(this.minecraft.width * Gui.InvGuiScale);
    const screenHeight = Math.trunc(this.minecraft.height * Gui.InvGuiScale);
    x = Math.trunc(x * Gui.InvGuiScale);
    y = Math.trunc(y * Gui.InvGuiScale);
    if (y < screenHeight - 16 - 3 || y > screenHeight) return -1;
    const xBase = 2 + Math.trunc(screenWidth / 2) - this.getNumSlots() * 10;
    const xRel = x - xBase;
    if (xRel < 0) return -1;
    const slot = Math.trunc(xRel / 20);
    return slot >= 0 && slot < this.getNumSlots() ? slot : -1;
  }

  isInside(x: number, y: number): boolean {
    return this.getSlotIdAt(x, y) !== -1;
  }

  getNumSlots(): number {
    return this._numSlots;
  }

  flashSlot(slotId: number): void {
    this._flashSlotId = slotId;
    this._flashSlotStartTime = getTimeS();
  }

  /** C++ getSlotPos(int slot, int& posX, int& posY) */
  getSlotPos(slot: number): [number, number] {
    const screenWidth = Math.trunc(this.minecraft.width * Gui.InvGuiScale);
    const screenHeight = Math.trunc(this.minecraft.height * Gui.InvGuiScale);
    return [Math.trunc(screenWidth / 2) - this.getNumSlots() * 10 + slot * 20, screenHeight - 22];
  }

  getRectangleArea(extendSide: number): RectangleArea {
    const mc = this.minecraft;
    const Spacing = 3;
    const pCenterX = f(2.0 + Math.trunc(mc.width / 2));
    const pHalfWidth = f(f(1.0 + (this.getNumSlots() * 10 + Spacing)) * Gui.GuiScale);
    const pHeight = f((22 + Spacing) * Gui.GuiScale);
    if (extendSide < 0)
      return new RectangleArea(0, mc.height - pHeight, pCenterX + pHalfWidth + 2, mc.height);
    if (extendSide > 0)
      return new RectangleArea(pCenterX - pHalfWidth, mc.height - pHeight, mc.width, mc.height);
    return new RectangleArea(
      pCenterX - pHalfWidth,
      mc.height - pHeight,
      pCenterX + pHalfWidth + 2,
      mc.height,
    );
  }

  handleClick(button: number, x: number, y: number): void {
    if (button !== MouseAction.ACTION_LEFT) return;
    const slot = this.getSlotIdAt(x, y);
    if (slot !== -1) {
      if (this._openInventorySlot && slot === this.getNumSlots() - 1) {
        this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_BLOCKSELECTION);
      } else {
        this.minecraft.player!.inventory.selectSlot(slot);
        this.itemNameOverlayTime = 0;
      }
    }
  }

  handleKeyPressed(key: number): void {
    const mc = this.minecraft;
    const isChatting = this.isChatting();
    if (isChatting) {
      if (key === 38) {
        this.scrollChat(1);
        return;
      } else if (key === 40) {
        this.scrollChat(-1);
        return;
      } else if (key === 33) {
        const screenHeight = Math.trunc(mc.height * Gui.InvGuiScale);
        const maxVisible = Math.trunc((screenHeight - 48) / 9);
        this.scrollChat(maxVisible);
        return;
      } else if (key === 34) {
        const screenHeight = Math.trunc(mc.height * Gui.InvGuiScale);
        const maxVisible = Math.trunc((screenHeight - 48) / 9);
        this.scrollChat(-maxVisible);
        return;
      }
    }
    if (key === Keyboard.KEY_F1) {
      mc.options.toggle(OptionId.OPTIONS_HIDEGUI);
    }
    const inv = mc.player!.inventory;
    if (key === 99) {
      if (inv.selected > 0) {
        inv.selected--;
      }
    } else if (key === 4) {
      if (inv.selected < this.getNumSlots() - 2) {
        inv.selected++;
      }
    } else if (key === 100) {
      this.minecraft.screenChooser.setScreen(ScreenId.SCREEN_BLOCKSELECTION);
    } else if (key === mc.options.getIntValue(OptionId.OPTIONS_KEY_DROP)) {
      inv.dropSlot(inv.selected, false);
    }
  }

  scrollChat(delta: number): void {
    if (delta === 0) return;
    const screenHeight = Math.trunc(this.minecraft.height * Gui.InvGuiScale);
    const maxVisible = Math.trunc((screenHeight - 48) / 9);
    if (maxVisible <= 0) return;
    let maxScroll = this.guiMessages.length - maxVisible;
    if (maxScroll < 0) maxScroll = 0;
    let desired = this.chatScrollOffset + delta;
    if (desired < 0) desired = 0;
    if (desired > maxScroll) desired = maxScroll;
    this.chatScrollOffset = desired;
  }

  tick(): void {
    if (this.overlayMessageTime > 0) this.overlayMessageTime--;
    this.tickCount++;
    if (this.itemNameOverlayTime < 2)
      this.itemNameOverlayTime = f(
        this.itemNameOverlayTime + f(1.0 / SharedConstants.TicksPerSecond),
      );
    for (let i = 0; i < this.guiMessages.length; i++) {
      this.guiMessages[i]!.ticks++;
    }
    if (!this.minecraft.isCreativeMode()) this.tickItemDrop();
  }

  addMessage(_string: string): void {
    const font = this.minecraft.font;
    if (!font) return;
    let string = _string;
    while (font.width(string) > this.MAX_MESSAGE_WIDTH) {
      let i = 1;
      while (
        i < string.length &&
        font.width(string.substring(0, i + 1)) <= this.MAX_MESSAGE_WIDTH
      ) {
        i++;
      }
      this.addMessage(string.substring(0, i));
      string = string.substring(i);
    }
    const message = new GuiMessage();
    message.message = string;
    message.ticks = 0;
    this.guiMessages.unshift(message);
    const MaxHistoryLines = 200;
    while (this.guiMessages.length > MaxHistoryLines) {
      this.guiMessages.pop();
    }
    if (this.chatScrollOffset > 0) {
      this.chatScrollOffset++;
    }
  }

  clearMessages(): void {
    this.guiMessages.length = 0;
    this.chatScrollOffset = 0;
  }

  setNowPlaying(string: string): void {
    this.overlayMessageString = 'Now playing: ' + string;
    this.overlayMessageTime = 20 * 3;
    this.animateOverlayMessageColor = true;
  }

  displayClientMessage(messageId: string): void {
    this.addMessage(messageId);
  }

  renderVignette(br: number, w: number, h: number): void {
    br = 1 - br;
    if (br < 0) br = 0;
    if (br > 1) br = 1;
    this.tbr = f(this.tbr + f((br - this.tbr) * f(0.01)));
    glDisable(GL_DEPTH_TEST);
    glDepthMask(false);
    glEnable(GL_BLEND);
    glBlendFunc2(GL_ZERO, GL_ONE_MINUS_SRC_COLOR);
    glColor4f2(this.tbr, this.tbr, this.tbr, 1);
    this.minecraft.textures!.loadAndBindTexture('misc/vignette.png');
    glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri2(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    const t = Tesselator.instance;
    t.begin();
    t.vertexUV(0, h, -90, 0, 1);
    t.vertexUV(w, h, -90, 1, 1);
    t.vertexUV(w, 0, -90, 1, 0);
    t.vertexUV(0, 0, -90, 0, 0);
    t.draw();
    glDepthMask(true);
    glEnable(GL_DEPTH_TEST);
    glDisable(GL_BLEND);
    glColor4f2(1, 1, 1, 1);
    glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
  }

  renderSlot(slot: number, x: number, y: number, _a: number): void {
    const item = this.minecraft.player!.inventory.getItem(slot);
    if (!item) {
      return;
    }
    const fancy = true;
    ItemRenderer.renderGuiItem(this.minecraft.font, this.minecraft.textures!, item, x, y, fancy);
  }

  renderSlotText(
    item: ItemInstance,
    x: number,
    y: number,
    hasFinite: boolean,
    shadow: boolean,
  ): void {
    if (item.count <= 1) {
      return;
    }
    const c = item.count;
    let buffer = '';
    if (hasFinite) buffer = Gui.itemCountItoa(c);
    else buffer = String.fromCharCode(157); // (char)157
    const font = this.minecraft.font!;
    const color = item.count > 0 ? 0xffcccccc | 0 : 0x60cccccc;
    if (shadow) font.drawShadow(buffer, x, y, color);
    else font.draw(buffer, x, y, color);
  }

  inventoryUpdated(): void {
    this._inventoryNeedsUpdate = true;
  }

  onGraphicsReset(): void {
    this.inventoryUpdated();
  }

  texturesLoaded(_textures: Textures): void {}

  onConfigChanged(c: Config): void {
    const t = Tesselator.instance;
    t.begin();
    const mm = 50;
    const maxRadius = this.minecraft.pixelCalcUi.millimetersToPixels(mm);
    const radius = Mth.Min(80.0 / 2, maxRadius);
    const radiusInner = f(radius * f(0.95));
    const steps = 24;
    const fstep = f(Mth.TWO_PI / steps);
    for (let i = 0; i < steps; ++i) {
      const a = f(i * fstep);
      const b = f(a + fstep);
      const aCos = Mth.cos(a);
      const bCos = Mth.cos(b);
      const aSin = Mth.sin(a);
      const bSin = Mth.sin(b);
      const x00 = radius * aCos;
      const x01 = radiusInner * aCos;
      const x10 = radius * bCos;
      const x11 = radiusInner * bCos;
      const y00 = radius * aSin;
      const y01 = radiusInner * aSin;
      const y10 = radius * bSin;
      const y11 = radiusInner * bSin;
      t.vertexUV(x01, y01, 0, 0, 1);
      t.vertexUV(x11, y11, 0, 1, 1);
      t.vertexUV(x10, y10, 0, 1, 0);
      t.vertexUV(x00, y00, 0, 0, 0);
    }
    this.rcFeedbackOuter = t.end(true, this.rcFeedbackOuter.vboId);
    t.begin(GL_TRIANGLE_FAN);
    t.vertex(0, 0, 0);
    for (let i = 0; i < steps + 1; ++i) {
      const a = f(-i * fstep);
      const xx = radiusInner * Mth.cos(a);
      const yy = radiusInner * Mth.sin(a);
      t.vertex(xx, yy, 0);
    }
    this.rcFeedbackInner = t.end(true, this.rcFeedbackInner.vboId);
    if (c.minecraft!.useTouchscreen()) {
      let num = 6;
      if (
        !c.minecraft!.options.getBooleanValue(OptionId.OPTIONS_IS_JOY_TOUCH_AREA) &&
        c.width > 480
      ) {
        while (num < Inventory_MAX_SELECTION_SIZE - 1) {
          const [x0] = this.getSlotPos(0);
          const [x1] = this.getSlotPos(num);
          const width = x1 - x0;
          const leftoverPixels = c.width - c.guiScale * width;
          if (c.pixelCalc.pixelsToMillimeters(leftoverPixels) < 80) break;
          num++;
        }
      }
      this._numSlots = num;
    } else {
      this._numSlots = Inventory_MAX_SELECTION_SIZE;
    }
    this.MAX_MESSAGE_WIDTH = c.guiWidth;
  }

  static floorAlignToScreenPixel(v: number): number {
    return f(Math.trunc(v * Gui.GuiScale) * Gui.InvGuiScale);
  }

  /** C++ itemCountItoa(char* buffer, int count)：返回写入的字符串（C++ 的返回值是长度） */
  static itemCountItoa(count: number): string {
    if (count < 0) return '';
    if (count < 10) {
      return String.fromCharCode(0x30 + count);
    } else if (count < 100) {
      const digit = Math.trunc(count / 10);
      return String.fromCharCode(0x30 + digit, 0x30 + count - digit * 10);
    } else {
      return '99+';
    }
  }

  tickItemDrop(): void {
    tickItemDropStatics.isCurrentlyActive = false;
    const slots = this.getNumSlots() - (this._openInventorySlot ? 1 : 0);
    if (Mouse.isButtonDown(MouseAction.ACTION_LEFT)) {
      const slot = this.getSlotIdAt(Mouse.getX(), Mouse.getY());
      if (slot >= 0 && slot < slots) {
        if (slot !== this._currentDropSlot) {
          this._currentDropTicks = 0;
          this._currentDropSlot = slot;
        }
        tickItemDropStatics.isCurrentlyActive = true;
        if ((this._currentDropTicks += 1.0) >= Gui.DropTicks) {
          this.minecraft.player!.inventory.dropSlot(slot, false);
          this.minecraft.level!.playSound(this.minecraft.player!, 'random.pop', 0.3, 1);
          tickItemDropStatics.isCurrentlyActive = false;
        }
      }
    }
    if (!tickItemDropStatics.isCurrentlyActive) {
      this._currentDropSlot = -1;
      this._currentDropTicks = -1;
    }
  }

  postError(errCode: number): void {
    if (postedErrors.has(errCode)) return;
    postedErrors.add(errCode);
    this.addMessage(`Something went wrong! (errcode ${errCode})\n`);
  }

  // OMIT(Gui): setScissorRect(bbox)  Gui.cpp（只被界面类使用）

  static cubeSmoothStep(percentage: number, _min: number, _max: number): number {
    return percentage * percentage * (3 - 2 * percentage);
  }

  renderProgressIndicator(
    isTouchInterface: boolean,
    screenWidth: number,
    screenHeight: number,
    a: number,
  ): void {
    const mc = this.minecraft;
    const player = mc.player!;
    const currentItem = player.inventory.getSelected();
    const bowEquipped = currentItem !== null ? currentItem.getItem() === Item.bow : false;
    const itemInUse =
      currentItem !== null ? currentItem.getItem() === player.getUseItem()!.getItem() : false;
    if (
      (!isTouchInterface ||
        mc.options.getBooleanValue(OptionId.OPTIONS_IS_JOY_TOUCH_AREA) ||
        (bowEquipped && itemInUse)) &&
      !mc.options.getBooleanValue(OptionId.OPTIONS_HIDEGUI)
    ) {
      mc.textures!.loadAndBindTexture('gui/icons.png');
      glEnable(GL_BLEND);
      glBlendFunc2(GL_ONE_MINUS_DST_COLOR, GL_ONE_MINUS_SRC_COLOR);
      this.blit(Math.trunc(screenWidth / 2) - 8, Math.trunc(screenHeight / 2) - 8, 0, 0, 16, 16);
      glDisable(GL_BLEND);
    } else if (!bowEquipped) {
      const ih = mc.inputHolder!;
      const tprogress = mc.gameMode!.destroyProgress;
      const alpha = Mth.clamp(ih.alpha, 0.0, 1.0);
      if (tprogress <= 0 && ih.alpha >= 0) {
        glDisable2(GL_TEXTURE_2D);
        glEnable2(GL_BLEND);
        glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        if (mc.hitResult.isHit()) glColor4f2(1, 1, 1, 0.8 * alpha);
        else glColor4f2(1, 1, 1, Mth.Min(0.4, alpha * 0.4));
        const x = Gui.InvGuiScale * ih.mousex;
        const y = Gui.InvGuiScale * ih.mousey;
        glTranslatef2(x, y, 0);
        drawArrayVT(this.rcFeedbackOuter.vboId, this.rcFeedbackOuter.vertexCount, 36);
        glTranslatef2(-x, -y, 0);
        glEnable2(GL_TEXTURE_2D);
        glDisable(GL_BLEND);
      } else if (tprogress > 0) {
        const oProgress = mc.gameMode!.oDestroyProgress;
        const progress = 0.5 * (oProgress + (tprogress - oProgress) * a);
        glDisable2(GL_TEXTURE_2D);
        glColor4f2(1, 1, 1, 0.8 * alpha);
        glEnable(GL_BLEND);
        glBlendFunc2(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
        const x = Gui.InvGuiScale * ih.mousex;
        const y = Gui.InvGuiScale * ih.mousey;
        glPushMatrix2();
        glTranslatef2(x, y, 0);
        drawArrayVT(this.rcFeedbackOuter.vboId, this.rcFeedbackOuter.vertexCount, 36);
        glScalef2(0.5 + progress, 0.5 + progress, 1);
        glColor4f2(1, 1, 1, 1);
        glBlendFunc2(GL_ONE_MINUS_DST_COLOR, GL_ONE_MINUS_SRC_COLOR);
        drawArrayVT(
          this.rcFeedbackInner.vboId,
          this.rcFeedbackInner.vertexCount,
          36,
          GL_TRIANGLE_FAN,
        );
        glPopMatrix2();
        glDisable(GL_BLEND);
        glEnable2(GL_TEXTURE_2D);
      }
    }
  }

  renderHearts(): void {
    const mc = this.minecraft;
    const player = mc.player!;
    let blink = Math.trunc(player.invulnerableTime / 3) % 2 === 1;
    if (player.invulnerableTime < 10) blink = false;
    const h = player.health;
    const oh = player.lastHealth;
    this.random.setSeed(Math.imul(this.tickCount, 312871));
    const screenWidth = Math.trunc(mc.width * Gui.InvGuiScale);
    const screenHeight = Math.trunc(mc.height * Gui.InvGuiScale);
    const xx = mc.options.getBooleanValue(OptionId.OPTIONS_BAR_ON_TOP)
      ? Math.trunc(screenWidth / 2) - this.getNumSlots() * 10 - 1
      : 2;
    const armor = player.getArmorValue();
    for (let i = 0; i < Math.trunc(Player.MAX_HEALTH / 2); i++) {
      let yo = mc.options.getBooleanValue(OptionId.OPTIONS_BAR_ON_TOP) ? screenHeight - 32 : 2;
      const ip2 = i + i + 1;
      if (armor > 0) {
        const xo = xx + 80 + i * 8 + 4;
        if (ip2 < armor) this.blit(xo, yo, 16 + 2 * 9, 9 * 1, 9, 9);
        else if (ip2 === armor) this.blit(xo, yo, 16 + 4 * 9, 9 * 1, 9, 9);
        else if (ip2 > armor) this.blit(xo, yo, 16 + 0 * 9, 9 * 1, 9, 9);
      }
      let bg = 0;
      if (blink) bg = 1;
      const xo = xx + i * 8;
      if (h <= 4) {
        yo = yo + this.random.nextInt(2) - 1;
      }
      this.blit(xo, yo, 16 + bg * 9, 9 * 0, 9, 9);
      if (blink) {
        if (ip2 < oh) this.blit(xo, yo, 16 + 6 * 9, 9 * 0, 9, 9);
        else if (ip2 === oh) this.blit(xo, yo, 16 + 7 * 9, 9 * 0, 9, 9);
      }
      if (ip2 < h) this.blit(xo, yo, 16 + 4 * 9, 9 * 0, 9, 9);
      else if (ip2 === h) this.blit(xo, yo, 16 + 5 * 9, 9 * 0, 9, 9);
    }
  }

  renderBubbles(): void {
    const mc = this.minecraft;
    const player = mc.player!;
    if (player.isUnderLiquid(Material.water)) {
      const screenWidth = Math.trunc(mc.width * Gui.InvGuiScale);
      const screenHeight = Math.trunc(mc.height * Gui.InvGuiScale);
      const xx = mc.options.getBooleanValue(OptionId.OPTIONS_BAR_ON_TOP)
        ? Math.trunc(screenWidth / 2) - this.getNumSlots() * 10 - 1
        : 2;
      const yo = mc.options.getBooleanValue(OptionId.OPTIONS_BAR_ON_TOP) ? screenHeight - 42 : 12;
      const count = Math.trunc(
        Math.ceil(f(f((player.airSupply - 2) * 10.0) / Player.TOTAL_AIR_SUPPLY)),
      );
      const extra =
        Math.trunc(Math.ceil(f(f(player.airSupply * 10.0) / Player.TOTAL_AIR_SUPPLY))) - count;
      for (let i = 0; i < count + extra; i++) {
        const xo = i * 8 + xx;
        if (i < count) this.blit(xo, yo, 16, 9 * 2, 9, 9);
        else this.blit(xo, yo, 16 + 9, 9 * 2, 9, 9);
      }
    }
  }

  onLevelGenerated(): void {
    const level = this.minecraft.level;
    if (level) {
      const p = level.getSharedSpawnPos();
      posTranslator.set(-p.x, -p.y, -p.z); // posTranslator = OffsetPosTranslator(...)
    }
  }

  renderDebugInfo(): void {
    const mc = this.minecraft;
    const s = debugStatics;
    const now = f(getTimeS());
    s.fpsFrames++;
    if (now - s.fpsLastTime >= 1) {
      s.fps = Math.trunc(s.fpsFrames / (now - s.fpsLastTime)); // static int fps
      s.displayChunkUpdates = Chunk.updates;
      Chunk.updates = 0;
      s.fpsFrames = 0;
      s.fpsLastTime = Math.trunc(now); // static int fpsLastTime
    }
    const p = mc.player!;
    const lvl = mc.level;
    const px = p.x;
    const py = f(p.y - p.heightOffset);
    const pz = p.z;
    const bx = Math.floor(px);
    const by = Math.floor(py);
    const bz = Math.floor(pz);
    const cx = bx >> 4;
    const cz = bz >> 4;
    let yMod = f(p.yRot % 360.0);
    if (yMod < 0) yMod = f(yMod + 360.0);
    let facing: string;
    let axis: string;
    if (yMod < 45 || yMod >= 315) {
      facing = 'South';
      axis = '+Z';
    } else if (yMod < 135) {
      facing = 'West';
      axis = '-X';
    } else if (yMod < 225) {
      facing = 'North';
      axis = '-Z';
    } else {
      facing = 'East';
      axis = '+X';
    }
    let biomeName = 'unknown';
    if (lvl) {
      const biome = lvl.getBiome(bx, bz);
      if (biome) biomeName = biome.name;
    }
    const worldTime = lvl ? lvl.getTime() : 0;
    const dayTime = worldTime % Level.TICKS_PER_DAY;
    const day = Math.trunc(worldTime / Level.TICKS_PER_DAY);
    const seed = lvl ? lvl.getSeed() : 0;
    let CurrentTile = 'Air';
    if (mc.hitResult.type === HitResultType.TILE) {
      const tileID = mc.level!.getTile(mc.hitResult.x, mc.hitResult.y, mc.hitResult.z);
      if (tileID > 0 && tileID < 256) {
        const LookingTile = Tile.tiles[tileID] ?? null;
        CurrentTile = LookingTile !== null ? LookingTile.getDescriptionId() : 'Unknown Tile';
      } else {
        CurrentTile = 'Air';
      }
    }
    const font = mc.font!;
    if (mc.options.getIntValue(OptionId.OPTIONS_DEBUG_STYLE) === 0) {
      font.drawShadow(
        `Minecraft - Pocket Edition (${s.fps} fps, ${s.displayChunkUpdates} chunk updates)`,
        2,
        2,
        0xffffff,
      );
      font.drawShadow(mc.gatherStats1(), 2, 12, 0xffffff);
      font.drawShadow(mc.gatherStats2(), 2, 22, 0xffffff);
      font.drawShadow(mc.gatherStats3(), 2, 32, 0xffffff);
      font.drawShadow(mc.gatherStats4(), 2, 42, 0xffffff);
      this.drawString(font, `x: ${p.x.toFixed(8)}`, 2, 64, 0xe0e0e0);
      this.drawString(font, `y: ${p.y.toFixed(8)}`, 2, 72, 0xe0e0e0);
      this.drawString(font, `z: ${p.z.toFixed(8)}`, 2, 80, 0xe0e0e0);
      this.drawString(font, `f: ${Mth.floor((p.yRot * 4.0) / 360.0 + 0.5) & 0x3}`, 2, 88, 0xe0e0e0);
      this.drawString(
        font,
        `Seed: ${lvl!.getSeed() === 0 ? '' : lvl!.getSeed()}`,
        2,
        104,
        0xe0e0e0,
      ); // "%.ld"：精度 0，值为 0 时不输出数字
      this.drawString(
        font,
        `Dimension: ${lvl!.dimension.id} (${lvl!.dimension.getDimension()})`,
        2,
        114,
        0xe0e0e0,
      );
      this.drawString(font, `Biome: ${biomeName}`, 2, 124, 0xe0e0e0);
      this.drawString(font, `Looking at: ${CurrentTile}`, 2, 134, 0xe0e0e0);
    } else if (mc.options.getIntValue(OptionId.OPTIONS_DEBUG_STYLE) === 1) {
      const ln: string[] = [
        'Minecraft PE 0.6.1 alpha (mcpe64)',
        `${s.fps.toFixed(1)} fps`, // ADAPTED(Cpp)：C++ 用 %.1f 打印 int（未定义行为），这里按数值打印
        '',
        `XYZ: ${px.toFixed(3)} / ${py.toFixed(3)} / ${pz.toFixed(3)}`,
        `Block: ${bx} ${by} ${bz}   Chunk: ${cx} ${cz}`,
        `Facing: ${facing} (${axis})  (${p.yRot.toFixed(1)} / ${p.xRot.toFixed(1)})`,
        `Biome: ${biomeName}`,
        `Day ${day}  Time: ${dayTime}  Seed: ${seed}`,
      ];
      const N = 8;
      const LH = Font.DefaultLineHeight;
      const MGN = 2.0;
      const PAD = 2.0;
      for (let i = 0; i < N; i++) {
        if (ln[i] === '') continue;
        const w = font.width(ln[i]!);
        this.fill(
          MGN - PAD,
          MGN + i * LH - 1.0,
          MGN + w + PAD,
          MGN + (i + 1) * LH - 1.0,
          0x90000000 | 0,
        );
      }
      const t = Tesselator.instance;
      t.beginOverride();
      for (let i = 0; i < N; i++) {
        if (ln[i] === '') continue;
        const y = MGN + i * LH;
        const col = i === 0 ? 0xffffff55 | 0 : 0xffffffff | 0;
        font.draw(ln[i]!, MGN, y, col);
      }
      t.endOverrideAndDraw();
    }
  }

  renderPlayerList(font: Font, screenWidth: number, _screenHeight: number): void {
    const level = this.minecraft.level;
    if (!level) return;
    if (!level.isClientSide) return;
    const playerNames: string[] = [];
    for (const player of level.players) {
      if (!player) continue;
      playerNames.push(player.name);
    }
    playerNames.sort();
    let maxNameWidth = 0.0;
    for (const name of playerNames) {
      const nameWidth = font.width(name);
      if (nameWidth > maxNameWidth) maxNameWidth = nameWidth;
    }
    const titleText = `Players (${playerNames.length})`;
    const titleWidth = font.width(titleText);
    if (titleWidth > maxNameWidth) maxNameWidth = titleWidth;
    const padding = 4.0;
    const lineHeight = Font.DefaultLineHeight;
    const boxWidth = maxNameWidth + padding * 2;
    const boxHeight = (playerNames.length + 1) * lineHeight + padding * 2;
    const boxLeft = f((screenWidth - boxWidth) / 2.0);
    const boxTop = 10.0;
    const boxRight = boxLeft + boxWidth;
    const boxBottom = boxTop + boxHeight;
    this.fill(boxLeft, boxTop, boxRight, boxBottom, 0x90000000 | 0);
    const titleX = f((screenWidth - titleWidth) / 2.0);
    const titleY = boxTop + padding;
    font.draw(titleText, titleX, titleY, 0xffffffff | 0);
    let currentY = boxTop + padding + lineHeight;
    for (const name of playerNames) {
      font.draw(name, boxLeft + padding, currentY, 0xffdddddd | 0);
      currentY += lineHeight;
    }
  }

  renderSleepAnimation(screenWidth: number, screenHeight: number): void {
    const timer = this.minecraft.player!.getSleepTimer();
    let amount = f(timer / Player.SLEEP_DURATION);
    if (amount > 1) {
      amount = f(1.0 - f((timer - Player.SLEEP_DURATION) / Player.WAKE_UP_DURATION));
    }
    const color = (Math.trunc(220.0 * amount) << 24) | 0x101020;
    this.fill(0, 0, screenWidth, screenHeight, color);
  }

  renderOnSelectItemNameText(screenWidth: number, font: Font, ySlot: number): void {
    if (this.itemNameOverlayTime < 1.0) {
      const item = this.minecraft.player!.inventory.getSelected();
      if (item !== null) {
        const x = Math.trunc(screenWidth / 2) - Math.trunc(font.width(item.getName()) / 2);
        const y = ySlot - 22;
        let alpha = 255;
        if (this.itemNameOverlayTime > 0.75) {
          const time = f(0.25 - f(this.itemNameOverlayTime - 0.75));
          const percentage = Gui.cubeSmoothStep(f(time * 4), 0.0, 1.0);
          alpha = Math.trunc(percentage * 255);
        }
        if (alpha !== 0) font.drawShadow(item.getName(), x, y, 0x00ffffff + (alpha << 24));
      }
    }
  }

  drawColoredString(font: Font, text: string, x: number, y: number, alpha: number): void {
    const segs = parseColorTags(text);
    let cx = x;
    for (const s of segs) {
      const color = (s.color + (alpha << 24)) | 0;
      font.drawShadow(s.text, cx, y, color);
      cx += font.width(s.text);
    }
  }

  getColoredWidth(font: Font, text: string): number {
    let w = 0;
    for (const s of parseColorTags(text)) w += font.width(s.text);
    return w;
  }

  renderChatMessages(screenHeight: number, max: number, isChatting: boolean, font: Font): void {
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    const baseY = screenHeight - 48;
    let start = this.chatScrollOffset;
    if (start < 0) start = 0;
    for (let i = 0; i < max; i++) {
      const msgIdx = start + i;
      if (msgIdx >= this.guiMessages.length) break;
      const message = this.guiMessages[msgIdx]!;
      if (message.ticks < 20 * 10 || isChatting) {
        let t = f(message.ticks / (20 * 10.0));
        t = 1 - t;
        t = t * 10;
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        t = f(t * t);
        let alpha = Math.trunc(255 * t);
        if (isChatting) alpha = 255;
        if (alpha > 0) {
          const x = 2;
          const y = baseY - i * 9;
          const msg = message.message;
          this.fill(x, y - 1, x + this.MAX_MESSAGE_WIDTH, y + 8, Math.trunc(alpha / 2) << 24);
          glEnable(GL_BLEND);
          // C++ 里算了 baseColor（加入、离开游戏为黄色）却没有使用
          this.drawColoredString(font, msg, x, y, alpha);
        }
      }
    }
  }

  renderToolBar(a: number, ySlot: number, screenWidth: number): void {
    const mc = this.minecraft;
    glColor4f2(1, 1, 1, 1);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    mc.textures!.loadAndBindTexture('gui/gui.png');
    const inventory = mc.player!.inventory;
    const [xBase, yBase] = this.getSlotPos(0);
    const baseItemX = xBase + 3;
    const slotsWidth = 20 * this.getNumSlots();
    this.blit(xBase, yBase, 0, 0, slotsWidth, 22);
    this.blit(xBase + slotsWidth, yBase, 180, 0, 2, 22);
    if (this._currentDropSlot >= 0 && inventory.getItem(this._currentDropSlot)) {
      const x = xBase + 3 + this._currentDropSlot * 20;
      const color = 0x8000ff00 | 0;
      const yy = Math.trunc(f(17.0 * (this._currentDropTicks + a)) / Gui.DropTicks);
      if (this._currentDropTicks >= 3) {
        glColor4f2(0, 1, 0, 0.5);
      }
      this.fill(x, ySlot + 16 - yy, x + 16, ySlot + 16, color);
    }
    this.blit(xBase - 1 + 20 * inventory.selected, yBase - 1, 0, 22, 24, 22);
    glColor4f2(1, 1, 1, 1);
    if (this._flashSlotId >= 0) {
      const since = f(getTimeS() - this._flashSlotStartTime);
      if (since > 0.2) this._flashSlotId = -1;
      else {
        const x =
          Math.trunc(screenWidth / 2) - this.getNumSlots() * 10 + this._flashSlotId * 20 + 2;
        const color =
          (0xffffff + (Math.trunc(0x51 - 0x50 * Mth.cos(10 * f(6.28) * since)) << 24)) | 0;
        this.fill(x, ySlot, x + 16, ySlot + 16, color);
      }
    }
    glColor4f2(1, 1, 1, 1);
    const t = Tesselator.instance;
    t.beginOverride();
    let x = baseItemX;
    const slots = this.getNumSlots() - (this._openInventorySlot ? 1 : 0);
    for (let i = 0; i < slots; i++) {
      this.renderSlot(i, Math.trunc(x), ySlot, a);
      x += 20;
    }
    this._inventoryNeedsUpdate = false;
    if (this._openInventorySlot) {
      this.blit(
        Math.trunc(screenWidth / 2) + 10 * this.getNumSlots() - 20 + 4,
        ySlot + 6,
        242,
        252,
        14,
        4,
        14,
        4,
      );
    }
    mc.textures!.loadAndBindTexture('gui/gui_blocks.png');
    t.endOverrideAndDraw();
    glDisable2(GL_DEPTH_TEST);
    glDisable2(GL_TEXTURE_2D);
    t.beginOverride();
    x = baseItemX;
    for (let i = 0; i < slots; i++) {
      ItemRenderer.renderGuiItemDamage(inventory.getItem(i), x, ySlot);
      x += 20;
    }
    t.endOverrideAndDraw();
    glEnable(GL_DEPTH_TEST);
    glEnable(GL_TEXTURE_2D);
    const k = f(0.5 * Gui.GuiScale);
    if (mc.options.getBooleanValue(OptionId.OPTIONS_JAVA_HUD)) {
      t.beginOverride();
      if (mc.gameMode!.isSurvivalType()) {
        x = baseItemX;
        for (let i = 0; i < slots; i++) {
          const item = inventory.getItem(i);
          if (item && item.count >= 0)
            ItemRenderer.renderGuiItemDecorations(
              mc.font!,
              mc.textures!,
              inventory.getItem(i),
              x,
              ySlot,
            );
          x += 20;
        }
      }
      mc.textures!.loadAndBindTexture('font/default8.png');
      t.endOverrideAndDraw();
    } else {
      glPushMatrix2();
      glScalef2(Gui.InvGuiScale + Gui.InvGuiScale, Gui.InvGuiScale + Gui.InvGuiScale, 1);
      t.beginOverride();
      if (mc.gameMode!.isSurvivalType()) {
        x = baseItemX;
        for (let i = 0; i < slots; i++) {
          const item = inventory.getItem(i);
          if (item && item.count >= 0) this.renderSlotText(item, k * x, k * ySlot, true, true);
          x += 20;
        }
      }
      mc.textures!.loadAndBindTexture('font/default8.png');
      t.endOverrideAndDraw();
      glPopMatrix2();
    }
  }

  private random = new Random();
}

/** Inventory::MAX_SELECTION_SIZE */
const Inventory_MAX_SELECTION_SIZE = Inventory.MAX_SELECTION_SIZE;

/** Gui::tickItemDrop 的 static bool isCurrentlyActive */
const tickItemDropStatics = { isCurrentlyActive: false };
/** Gui::postError 的 static std::set<int> posted */
const postedErrors = new Set<number>();
/** Gui::renderDebugInfo 的 static int fps、fpsLastTime、fpsFrames、displayChunkUpdates */
const debugStatics = { fps: 0, fpsLastTime: 0, fpsFrames: 0, displayChunkUpdates: 0 };

/** Gui.cpp 的 static OffsetPosTranslator posTranslator（只在 onLevelGenerated 里设置） */
const posTranslator = {
  xo: 0,
  yo: 0,
  zo: 0,
  set(x: number, y: number, z: number): void {
    this.xo = x;
    this.yo = y;
    this.zo = z;
  },
};

/** Gui.cpp 的 struct ColorSegment 与 static parseColorTags */
interface ColorSegment {
  text: string;
  color: number;
}
function parseColorTags(input: string): ColorSegment[] {
  const out: ColorSegment[] = [];
  let curColor = 0xffffff;
  let pos = 0;
  while (pos < input.length) {
    const open = input.indexOf('[', pos);
    if (open === -1) {
      out.push({ text: input.substring(pos), color: curColor });
      break;
    }
    if (open > pos) {
      out.push({ text: input.substring(pos, open), color: curColor });
    }
    const close = input.indexOf(']', open);
    if (close === -1) {
      out.push({ text: input.substring(open), color: curColor });
      break;
    }
    const tag = input.substring(open + 1, close);
    if (tag.length > 0 && tag[0] === '/') {
      curColor = 0xffffff;
    } else {
      const lower = tag.toLowerCase();
      if (lower.includes('gold')) curColor = 0xffd700;
      else if (lower.includes('green')) curColor = 0x00ff00;
      else if (lower.includes('yellow')) curColor = 0xffff00;
      else if (lower.includes('red')) curColor = 0xff0000;
      else if (lower.includes('blue')) curColor = 0x0000ff;
    }
    pos = close + 1;
  }
  return out;
}
