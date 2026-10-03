/**
 * 1:1 移植自 src/client/gui/components/ScrollingPane.h 与 ScrollingPane.cpp（S13 阶段 C：物品选择界面的滚动格子）。
 * C++ 的 Vec3 成员按值复制：赋值时一律 new Vec3(...)；float 成员的运算不刻意 fround（第三档：界面动画）。
 * R10：setContentOffset(float, float) / setContentOffset(Vec3) → 分派入口 setContentOffset(x | Vec3, y?)。
 * getGridItemFor_slow(int, GridItem& out) 的引用参数改为返回 [是否可见, GridItem]；queryHoldTime(int*, int*) 改为返回 [结果, gridId, heldMs]。
 */
import { LOGW, getTimeMs, Mouse, MouseAction } from '@mcpe/platform';
import { Mth } from '@mcpe/util';
import { Vec3 } from '@mcpe/world';
import { RectangleArea } from '../../player/input/touchscreen/TouchAreaModel';
import { Timer } from '../../Timer';
import { GuiComponent } from '../GuiComponent';
import { IntRectangle } from './ImageButton';

export const ScrollingPaneFlags = {
  SF_LockX: 1 << 0,
  SF_LockY: 1 << 1,
  SF_WrapX: 1 << 2,
  SF_WrapY: 1 << 3,
  SF_HardLimits: 1 << 4,
  SF_MultiSelect: 1 << 5,
  SF_ShowScrollbar: 1 << 9,
  SF_NoHoldSelect: 1 << 10,
} as const;
const { SF_LockX, SF_LockY, SF_WrapX, SF_WrapY, SF_HardLimits, SF_MultiSelect, SF_ShowScrollbar, SF_NoHoldSelect } = ScrollingPaneFlags;

/** C++ 的 struct ScrollBar */
export class ScrollBar {
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  alpha = 0;
  fading = -1;
}

/** C++ 的 struct ScrollingPane::GridItem */
export class GridItem {
  id = 0;
  x = 0;
  y = 0;
  xf = 0;
  yf = 0;
  selected = false;
}

const kPenetrationDeceleration = 0.03;
const kPenetrationAcceleration = 0.08;
const kMaxTrackingTime = 100.0;
const kAcceleration = 15;
const kMinVelocityForDecelerationWithPaging = 4 / 3.0;
const kMinVelocityForDeceleration = 1 / 3.0;
const kDesiredAnimationFrameRate = 1000.0 / 60;
const kDecelerationFrictionFactor = 0.95;
const kMinimumVelocityToHideScrollIndicators = 0.05;
const kMinimumVelocity = 0.01;
const kMinimumTrackingForDrag = 5;
const kMinIndicatorLength = 34.0 / 3;
const PKScrollIndicatorEndSize = 3;
const PKScrollIndicatorThickness = 7.0 / 3;
const kWheelOverscrollMax = 80.0;
const kWheelOverscrollDamping = 0.6;
const kWheelOverscrollRestoreAlpha = 0.18;
const PKTableViewMinTouchDurationForCellSelection = 150;

const fmod = (a: number, b: number): number => a % b;

export class ScrollingPane extends GuiComponent {
  protected flags: number;
  protected columns: number;
  protected rows: number;
  protected numItems: number;
  protected px = 0;
  protected py = 0;
  protected fpx = 0;
  protected fpy = 0;
  protected screenScale: number;
  protected invScreenScale: number;
  protected bbox: IntRectangle;
  protected itemRect: IntRectangle;
  protected itemBbox: IntRectangle;
  protected area: RectangleArea;
  protected bboxArea: RectangleArea;
  protected dragDeltas: number[] = [];
  protected dragState = -1;
  protected dragBeginPos = new Vec3(0, 0, 0);
  protected dragBeginScreenPos = new Vec3(0, 0, 0);
  protected dragTicks = 0;
  protected dragLastDeltaTimeStamp = -1.0;
  protected dragLastPos = new Vec3(0, 0, 0);
  protected dx = 0;
  protected dy = 0;
  protected friction = 0.95;
  protected dstx = 0;
  protected dsty = 0;
  protected dragging = false;
  protected decelerating = false;
  protected tracking = false;
  protected pagingEnabled = false;
  protected _contentOffset = new Vec3(0, 0, 0);
  protected _contentOffsetBeforeDeceleration = new Vec3(0, 0, 0);
  protected lastEventTime = 0;
  protected decelerationVelocity = new Vec3(0, 0, 0);
  protected minDecelerationPoint = new Vec3(0, 0, 0);
  protected maxDecelerationPoint = new Vec3(0, 0, 0);
  protected penetrationDeceleration = 0;
  protected penetrationAcceleration = 0;
  protected minPoint = new Vec3(0, 0, 0);
  protected startPosition = new Vec3(0, 0, 0);
  protected startTouchPosition = new Vec3(0, 0, 0);
  protected startTimePosition = new Vec3(0, 0, 0);
  protected wasDeceleratingWhenTouchesBegan = false;
  protected firstDrag = false;
  protected startTime = 0;
  protected size: IntRectangle;
  protected lastFrame = 0;
  protected _scrollEnabled = true;
  protected touchesHaveMoved = false;
  protected te_moved = 0;
  protected te_ended = 1;
  protected te_highlight = 0;
  protected highlightTimer = -1;
  protected highlightStarted = -1;
  protected highlightItem = new GridItem();
  protected selected: boolean[];
  protected selectedId = -1;
  protected vScroll = new ScrollBar();
  protected hScroll = new ScrollBar();
  protected adjustedContentSize = new IntRectangle();
  private _timer = new Timer(60);
  private _doStepTimer = false;
  private _wasDown = false;
  private _lx = -9999;
  private _ly = -9999;

  constructor(optionFlags: number, boundingBox: IntRectangle, itemRect: IntRectangle, columns: number, numItems: number, screenScale = 1.0, itemBoundingRect: IntRectangle = new IntRectangle(0, 0, 0, 0)) {
    super();
    this.flags = optionFlags;
    this.bbox = new IntRectangle(boundingBox.x, boundingBox.y, boundingBox.w, boundingBox.h);
    this.size = new IntRectangle(boundingBox.x, boundingBox.y, boundingBox.w, boundingBox.h);
    this.area = new RectangleArea(this.bbox.x, this.bbox.y, this.bbox.x + this.bbox.w, this.bbox.y + this.bbox.h);
    this.bboxArea = this.area.copy();
    this.itemRect = new IntRectangle(itemRect.x, itemRect.y, itemRect.w, itemRect.h);
    this.numItems = numItems;
    this.screenScale = screenScale;
    this.invScreenScale = 1.0 / screenScale;
    const ib = itemBoundingRect.w > 0 ? itemBoundingRect : itemRect;
    this.itemBbox = new IntRectangle(ib.x, ib.y, ib.w, ib.h);
    this.columns = columns > 0 ? columns : Math.trunc(this.bbox.w / this.itemBbox.w);
    if (this.columns <= 0) {
      LOGW('Columns are 0! Area width is smaller than item width. Setting columns to 1.\n');
      this.columns = 1;
    }
    this.rows = 1 + Math.trunc((numItems - 1) / this.columns);
    this.adjustContentSize();
    this.minPoint.set(this.size.w - this.adjustedContentSize.w, this.size.h - this.adjustedContentSize.h, 0);
    this.snapContentOffsetToBounds(false);
    this.selected = new Array<boolean>(numItems).fill(false);
    this.vScroll.w = this.vScroll.h = PKScrollIndicatorThickness;
    this.hScroll.w = this.hScroll.h = PKScrollIndicatorThickness;
    this.vScroll.x = this.bbox.x + this.bbox.w - this.vScroll.w;
    this.vScroll.y = 0;
    this.hScroll.x = 0;
    this.hScroll.y = this.bbox.y + this.bbox.h - this.hScroll.h;
  }

  protected isAllSet(flag: number): boolean {
    return (this.flags & flag) === flag;
  }
  protected isSet(flag: number): boolean {
    return (this.flags & flag) !== 0;
  }
  protected isNotSet(flag: number): boolean {
    return !this.isSet(flag);
  }

  tick(): void {
    if (this.isSet(SF_ShowScrollbar)) {
      this.updateScrollFade(this.vScroll);
      this.updateScrollFade(this.hScroll);
    }
    if (this.isNotSet(SF_HardLimits) && !Mouse.isButtonDown(MouseAction.ACTION_LEFT) && !this.dragging && !this.tracking && !this.decelerating) {
      let targetX = this._contentOffset.x;
      let targetY = this._contentOffset.y;
      let corrected = false;
      if (targetX > 0.0) {
        targetX = Mth.lerp(targetX, 0.0, kWheelOverscrollRestoreAlpha);
        corrected = true;
      } else if (targetX < this.minPoint.x) {
        targetX = Mth.lerp(targetX, this.minPoint.x, kWheelOverscrollRestoreAlpha);
        corrected = true;
      }
      if (targetY > 0.0) {
        targetY = Mth.lerp(targetY, 0.0, kWheelOverscrollRestoreAlpha);
        corrected = true;
      } else if (targetY < this.minPoint.y) {
        targetY = Mth.lerp(targetY, this.minPoint.y, kWheelOverscrollRestoreAlpha);
        corrected = true;
      }
      if (corrected) {
        if (Mth.abs(targetX - this._contentOffset.x) < 0.25) targetX = targetX > 0.0 ? 0.0 : targetX < this.minPoint.x ? this.minPoint.x : targetX;
        if (Mth.abs(targetY - this._contentOffset.y) < 0.25) targetY = targetY > 0.0 ? 0.0 : targetY < this.minPoint.y ? this.minPoint.y : targetY;
        this.setContentOffset(new Vec3(targetX, targetY, 0));
      }
    }
  }

  getGridItemFor_slow(itemIndex: number): [boolean, GridItem] {
    const nw = this.getItemForPos(0, 0, false);
    const se = this.getItemForPos(this.bbox.w - 1, this.bbox.h - 1, false);
    const bxx = this.bbox.x - this.fpx + (nw.xf - nw.x);
    const byy = this.bbox.y - this.fpy + (nw.yf - nw.y);
    const y = Math.trunc(itemIndex / this.columns);
    const x = itemIndex - y * this.columns;
    const out = new GridItem();
    out.id = itemIndex;
    out.xf = bxx + x * this.itemBbox.w;
    out.yf = byy + y * this.itemBbox.h;
    out.x = x;
    out.y = y;
    return [x >= nw.x && x <= se.x && y >= nw.y && y <= se.y, out];
  }

  render(_xm: number, _ym: number, alpha: number): void {
    this.handleUserInput();
    this._timer.advanceTime();
    if (this._doStepTimer && !this.te_moved) {
      for (let i = 0; i < this._timer.ticks; ++i) this.stepThroughDecelerationAnimation(false);
      this.lastFrame = getTimeMs();
    }
    const itemsToRender: GridItem[] = [];
    const nw = this.getItemForPos(0, 0, false);
    const se = this.getItemForPos(this.bbox.w - 1, this.bbox.h - 1, false);
    const bxx = this.bbox.x - this.fpx + (nw.xf - nw.x);
    const byy = this.bbox.y - this.fpy + (nw.yf - nw.y);
    for (let y = nw.y; y <= se.y; ++y) {
      for (let x = nw.x; x <= se.x; ++x) {
        const id = y * this.columns + x;
        if (y < 0 || id < 0 || id >= this.numItems) continue;
        if (this.isNotSet(SF_WrapX) && (x < 0 || x >= this.columns)) continue;
        const item = new GridItem();
        item.id = id;
        item.xf = bxx + x * this.itemBbox.w;
        item.yf = byy + y * this.itemBbox.h;
        item.x = Math.trunc(item.xf);
        item.y = Math.trunc(item.yf);
        if (this.isSet(SF_MultiSelect)) item.selected = this.selected[id]!;
        else item.selected = id === this.selectedId;
        itemsToRender.push(item);
      }
    }
    this.renderBatch(itemsToRender, alpha);
  }

  renderBatch(items: GridItem[], alpha: number): void {
    for (const item of items) this.renderItem(item, alpha);
  }

  renderItem(_item: GridItem, _alpha: number): void {}

  protected getItemForPos(x: number, y: number, isScreenPos: boolean): GridItem {
    if (isScreenPos) {
      x -= this.bbox.x;
      y -= this.bbox.y;
    }
    x += this.fpx;
    y += this.fpy;
    if (this.isSet(SF_WrapX)) x = fmod(x, this.itemBbox.w * this.columns);
    if (this.isSet(SF_WrapY)) y = fmod(y, this.itemBbox.h * this.rows);
    const out = new GridItem();
    out.xf = x / this.itemBbox.w;
    out.yf = y / this.itemBbox.h;
    out.x = Math.trunc(out.xf);
    out.y = Math.trunc(out.yf);
    out.id = out.y * this.columns + out.x;
    return out;
  }

  protected addDeltaPos(x: number, y: number, dt: number, _a: number): void {
    if (dt <= 0) return;
    const delta = new Vec3((this.dragLastPos.x - x) * (1.0 / dt), (this.dragLastPos.y - y) * (1.0 / dt), 0);
    this.dragDeltas.push(delta.x);
    this.dragDeltas.push(delta.y);
    this.dragLastPos.set(x, y, 0);
    this.dragLastDeltaTimeStamp += dt;
  }

  protected handleUserInput(): void {
    const isDown = Mouse.isButtonDown(MouseAction.ACTION_LEFT);
    const x = Mouse.getX() * this.invScreenScale;
    const y = Mouse.getY() * this.invScreenScale;
    const t = getTimeMs();
    const isInside = this.area.isInside(x, y);
    const moved = x !== this._lx || y !== this._ly;
    this._lx = x;
    this._ly = y;
    if (this.te_ended > 0 && this._wasDown && !isDown) this.touchesEnded(x, y, t);
    else if (isDown && !this._wasDown && isInside) this.touchesBegan(x, y, t);
    else if (this.te_moved > 0 && moved && isDown) this.touchesMoved(x, y, t);
    if (this.highlightTimer >= 0 && this.isNotSet(SF_NoHoldSelect)) {
      if (getTimeMs() - this.highlightTimer >= PKTableViewMinTouchDurationForCellSelection) this.onHoldItem();
    }
    this._wasDown = isDown;
  }

  protected contentOffset(): Vec3 {
    return this._contentOffset;
  }

  protected beginTracking(x: number, y: number, t: number): void {
    if (this.tracking) return;
    this.stopDecelerationAnimation();
    this.adjustContentSize();
    this.minPoint.set(this.size.w - this.adjustedContentSize.w, this.size.h - this.adjustedContentSize.h, 0);
    this.snapContentOffsetToBounds(false);
    this.startPosition = new Vec3(this._contentOffset.x, this._contentOffset.y, this._contentOffset.z);
    this.startTouchPosition.set(x, y, 0);
    this.startTime = t;
    this.startTimePosition = new Vec3(this._contentOffset.x, this._contentOffset.y, this._contentOffset.z);
    this.tracking = true;
    this.dragging = false;
    this.touchesHaveMoved = false;
  }

  protected touchesBegan(x: number, y: number, t: number): void {
    if (!this._scrollEnabled) return;
    this.te_ended = 1;
    this.beginTracking(x, y, t);
    this.te_moved = 2;
    const gi = this.getItemForPos(x, y, true);
    if (gi.id >= 0 && gi.id < this.numItems) {
      this.highlightItem.id = this.bboxArea.isInside(x, y) ? gi.id : -1;
      this.highlightStarted = this.highlightTimer = this.bboxArea.isInside(x, y) ? getTimeMs() : -1;
    } else {
      this.highlightItem.id = -1;
      this.highlightStarted = this.highlightTimer = -1;
    }
  }

  protected touchesMoved(x: number, y: number, t: number): void {
    this.touchesHaveMoved = true;
    const e = new Vec3(x, y, 0);
    const b = e.x - this.startTouchPosition.x;
    const c = e.y - this.startTouchPosition.y;
    if (!this.dragging) {
      if ((Mth.abs(b) >= kMinimumTrackingForDrag && this.isNotSet(SF_LockX)) || (Mth.abs(c) >= kMinimumTrackingForDrag && this.isNotSet(SF_LockY))) {
        this.willBeginDragging();
        this.dragging = true;
        this.firstDrag = true;
        if (this.isSet(SF_ShowScrollbar)) {
          if (this.isNotSet(SF_LockX) && this.adjustedContentSize.w > this.size.w) this.hScroll.fading = 1;
          if (this.isNotSet(SF_LockY) && this.adjustedContentSize.h > this.size.h) this.vScroll.fading = 1;
        }
      }
    }
    if (this.dragging) {
      let f = this.isNotSet(SF_LockX) ? this.startPosition.x + b : this._contentOffset.x;
      let a = this.isNotSet(SF_LockY) ? this.startPosition.y + c : this._contentOffset.y;
      if (this.isNotSet(SF_HardLimits)) {
        f -= (f < this.minPoint.x ? f - this.minPoint.x : f > 0 ? f : 0) / 2;
        a -= (a < this.minPoint.y ? a - this.minPoint.y : a > 0 ? a : 0) / 2;
      } else {
        f = Mth.Min(Mth.Max(this.minPoint.x, f), 0.0);
        a = Mth.Min(Mth.Max(this.minPoint.y, a), 0.0);
      }
      if (this.firstDrag) {
        this.firstDrag = false;
        this.startTouchPosition = e;
        return;
      }
      this.setContentOffset(f, a);
      this.lastEventTime = t;
    }
  }

  protected touchesEnded(x: number, y: number, t: number): void {
    this.te_ended = 0;
    this.highlightStarted = -1;
    this.tracking = false;
    if (this.dragging) {
      this.dragging = false;
      if (t - this.lastEventTime <= kMaxTrackingTime) {
        this._contentOffsetBeforeDeceleration = new Vec3(this._contentOffset.x, this._contentOffset.y, this._contentOffset.z);
        this.startDecelerationAnimation(false);
      }
      this.didEndDragging();
    }
    if (!this.decelerating) {
      if (this.fpy < 0 || this.fpy > this.bbox.h) {
        this._contentOffsetBeforeDeceleration = new Vec3(this._contentOffset.x, this._contentOffset.y, this._contentOffset.z);
        this.startDecelerationAnimation(true);
      } else {
        this.snapContentOffsetToBounds(true);
        this.hideScrollIndicators();
      }
    }
    if (new Vec3(x, y, 0).distanceToSqr(this.startTouchPosition.x, this.startTouchPosition.y, this.startTouchPosition.z) <= 6.0 * 6.0 && this.highlightItem.id >= 0) {
      this._onSelect(this.highlightItem.id);
    }
    this.te_moved = 0;
  }

  protected touchesCancelled(x: number, y: number, a: number): void {
    this.touchesEnded(x, y, a);
  }

  protected startDecelerationAnimation(force: boolean): void {
    const a = new Vec3(this._contentOffset.x - this.startTimePosition.x, this._contentOffset.y - this.startTimePosition.y, 0);
    const b = (getTimeMs() - this.startTime) / kAcceleration;
    this.decelerationVelocity = new Vec3(a.x / b, a.y / b, 0);
    this.minDecelerationPoint = new Vec3(this.minPoint.x, this.minPoint.y, this.minPoint.z);
    this.maxDecelerationPoint = new Vec3(0, 0, 0);
    if (this.pagingEnabled) {
      const s = this.size;
      const cb = this._contentOffsetBeforeDeceleration;
      this.minDecelerationPoint.x = Mth.Max(this.minPoint.x, Math.floor(cb.x / s.w) * s.w);
      this.minDecelerationPoint.y = Mth.Max(this.minPoint.y, Math.floor(cb.y / s.h) * s.h);
      this.maxDecelerationPoint.x = Mth.Min(0.0, Math.ceil(cb.x / s.w) * s.w);
      this.maxDecelerationPoint.y = Mth.Min(0.0, Math.ceil(cb.y / s.h) * s.h);
    }
    this.penetrationDeceleration = kPenetrationDeceleration;
    this.penetrationAcceleration = kPenetrationAcceleration;
    if (this.pagingEnabled) this.penetrationDeceleration *= 5;
    const c = this.pagingEnabled ? kMinVelocityForDecelerationWithPaging : kMinVelocityForDeceleration;
    if (force || Mth.abs(this.decelerationVelocity.x) > c || Mth.abs(this.decelerationVelocity.y) > c) {
      this.decelerating = true;
      this._doStepTimer = true;
      this.lastFrame = getTimeMs();
      this.willBeginDecelerating();
    }
  }

  protected hideScrollIndicators(): void {
    this.hScroll.fading = this.vScroll.fading = 0;
  }

  protected stopDecelerationAnimation(): void {
    this.decelerating = false;
    this._doStepTimer = false;
  }

  protected stepThroughDecelerationAnimation(noAnimation: boolean): void {
    if (!this.decelerating) return;
    const d = getTimeMs();
    const k = d - this.lastFrame;
    const l = noAnimation ? 0 : Math.trunc(Math.floor(0.5 + k / kDesiredAnimationFrameRate - 1));
    for (let j = 0; j < l; j++) this.stepThroughDecelerationAnimation(true);
    let g = this.contentOffset().x + this.decelerationVelocity.x;
    let h = this.contentOffset().y + this.decelerationVelocity.y;
    if (this.isSet(SF_HardLimits)) {
      const a = Mth.Min(Mth.Max(this.minPoint.x, g), 0.0);
      if (a !== g) {
        g = a;
        this.decelerationVelocity.x = 0;
      }
      const c = Mth.Min(Mth.Max(this.minPoint.y, h), 0.0);
      if (c !== h) {
        h = c;
        this.decelerationVelocity.y = 0;
      }
    }
    if (noAnimation) {
      this.contentOffset().x = g;
      this.contentOffset().y = h;
    } else {
      this.setContentOffset(g, h);
    }
    if (!this.pagingEnabled) {
      this.decelerationVelocity.x *= kDecelerationFrictionFactor;
      this.decelerationVelocity.y *= kDecelerationFrictionFactor;
    }
    const b = Mth.abs(this.decelerationVelocity.x);
    const i = Mth.abs(this.decelerationVelocity.y);
    if (!noAnimation && b <= kMinimumVelocityToHideScrollIndicators && i <= kMinimumVelocityToHideScrollIndicators) {
      this.hideScrollIndicators();
      if (b <= kMinimumVelocity && i <= kMinimumVelocity) {
        this.decelerating = false;
        this.didEndDecelerating();
        return;
      }
    }
    if (this.isNotSet(SF_HardLimits)) {
      const e = new Vec3(0, 0, 0);
      if (g < this.minDecelerationPoint.x) e.x = this.minDecelerationPoint.x - g;
      else if (g > this.maxDecelerationPoint.x) e.x = this.maxDecelerationPoint.x - g;
      if (h < this.minDecelerationPoint.y) e.y = this.minDecelerationPoint.y - h;
      else if (h > this.maxDecelerationPoint.y) e.y = this.maxDecelerationPoint.y - h;
      if (e.x !== 0) {
        if (e.x * this.decelerationVelocity.x <= 0) this.decelerationVelocity.x += e.x * this.penetrationDeceleration;
        else this.decelerationVelocity.x = e.x * this.penetrationAcceleration;
      }
      if (e.y !== 0) {
        if (e.y * this.decelerationVelocity.y <= 0) this.decelerationVelocity.y += e.y * this.penetrationDeceleration;
        else this.decelerationVelocity.y = e.y * this.penetrationAcceleration;
      }
    }
    if (!noAnimation) this.lastFrame = d;
  }

  scrollBy(dx: number, dy: number): void {
    let targetX = this._contentOffset.x - dx;
    let targetY = this._contentOffset.y - dy;
    if (this.isSet(SF_LockX)) targetX = this._contentOffset.x;
    if (this.isSet(SF_LockY)) targetY = this._contentOffset.y;
    if (this.isSet(SF_HardLimits)) {
      targetX = Mth.clamp(targetX, this.minPoint.x, 0.0);
      targetY = Mth.clamp(targetY, this.minPoint.y, 0.0);
    } else {
      if (targetX > 0.0) {
        targetX = Mth.Min(targetX, kWheelOverscrollMax) * kWheelOverscrollDamping;
      } else if (targetX < this.minPoint.x) {
        const overshoot = Mth.Max(targetX - this.minPoint.x, -kWheelOverscrollMax);
        targetX = this.minPoint.x + overshoot * kWheelOverscrollDamping;
      }
      if (targetY > 0.0) {
        targetY = Mth.Min(targetY, kWheelOverscrollMax) * kWheelOverscrollDamping;
      } else if (targetY < this.minPoint.y) {
        const overshoot = Mth.Max(targetY - this.minPoint.y, -kWheelOverscrollMax);
        targetY = this.minPoint.y + overshoot * kWheelOverscrollDamping;
      }
    }
    this.setContentOffset(new Vec3(targetX, targetY, 0));
  }

  protected setContentOffset(a: number | Vec3, y?: number): void {
    if (typeof a === 'number') this.setContentOffsetWithAnimation(new Vec3(a, y!, 0), false);
    else this.setContentOffsetWithAnimation(a, false);
  }

  protected setContentOffsetWithAnimation(b: Vec3, doScroll: boolean): void {
    this._contentOffset = new Vec3(b.x, b.y, b.z);
    this.fpx = -this._contentOffset.x;
    this.fpy = -this._contentOffset.y;
    if (!doScroll) {
      if (this.isSet(SF_ShowScrollbar)) {
        if (this.isNotSet(SF_LockX)) this.updateHorizontalScrollIndicator();
        if (this.isNotSet(SF_LockY)) this.updateVerticalScrollIndicator();
      }
    }
  }

  protected snapContentOffsetToBounds(a: boolean): void {
    let b = false;
    const c = new Vec3(0, 0, 0);
    if (this.pagingEnabled) {
      c.x = Math.floor(0.5 + this._contentOffset.x / this.size.w) * this.size.w;
      c.y = Math.floor(0.5 + this._contentOffset.y / this.size.h) * this.size.h;
      b = true;
    } else if (this.isNotSet(SF_HardLimits)) {
      c.x = Mth.Min(Mth.Max(this.minPoint.x, this._contentOffset.x), 0.0);
      c.y = Mth.Min(Mth.Max(this.minPoint.y, this._contentOffset.y), 0.0);
      b = c.x !== this._contentOffset.x || c.y !== this._contentOffset.y;
    }
    if (b) this.setContentOffsetWithAnimation(c, a);
  }

  protected adjustContentSize(): void {
    this.adjustedContentSize.w = Mth.Max(this.itemBbox.w * this.columns, this.bbox.w);
    this.adjustedContentSize.h = Mth.Max(this.itemBbox.h * this.rows, this.bbox.h);
  }

  protected onHoldItem(): void {
    const id = this.highlightItem.id;
    if (id !== -1 && !this.dragging && this.tracking) this._onSelect(id);
    this.highlightTimer = -1;
  }

  protected onSelect(_gridId: number, selected: boolean): boolean {
    return selected;
  }

  protected updateHorizontalScrollIndicator(): void {
    const c = this.isNotSet(SF_LockX) && this.isSet(SF_ShowScrollbar) ? PKScrollIndicatorEndSize * 2 : 1;
    let d = Mth.Max(kMinIndicatorLength, Math.floor(0.5 + (this.size.w / this.adjustedContentSize.w) * (this.size.w - c)));
    let a = (-this._contentOffset.x / (this.adjustedContentSize.w - this.size.w)) * (this.size.w - c - d);
    if (this._contentOffset.x > 0) {
      d = Math.floor(0.5 + Mth.Max(d - this._contentOffset.x, PKScrollIndicatorThickness));
      a = 1;
    } else if (this._contentOffset.x < -(this.adjustedContentSize.w - this.size.w)) {
      d = Math.floor(0.5 + Mth.Max(d + this.adjustedContentSize.w - this.size.w + this.contentOffset().x, PKScrollIndicatorThickness));
      a = this.size.w - d - c;
    }
    this.hScroll.x = a + this.bbox.x;
    this.hScroll.w = d;
  }

  protected updateVerticalScrollIndicator(): void {
    const c = this.isNotSet(SF_LockY) && this.isSet(SF_ShowScrollbar) ? PKScrollIndicatorEndSize * 2 : 1;
    let d = Mth.Max(kMinIndicatorLength, Math.floor(0.5 + (this.size.h / this.adjustedContentSize.h) * (this.size.h - c)));
    let b = (-this._contentOffset.y / (this.adjustedContentSize.h - this.size.h)) * (this.size.h - c - d);
    if (this._contentOffset.y > 0) {
      d = Math.floor(0.5 + Mth.Max(d - this._contentOffset.y, PKScrollIndicatorThickness));
      b = 1;
    } else if (this._contentOffset.y < -(this.adjustedContentSize.h - this.size.h)) {
      d = Math.floor(0.5 + Mth.Max(d + this.adjustedContentSize.h - this.size.h + this.contentOffset().y, PKScrollIndicatorThickness));
      b = this.size.h - d - c;
    }
    this.vScroll.y = b + this.bbox.y;
    this.vScroll.h = d;
  }

  protected _onSelect(id: number): void {
    if (this.isSet(SF_MultiSelect)) {
      this.selected[id] = this.onSelect(id, !this.selected[id]);
    } else {
      const doSelect = this.onSelect(id, true);
      if (id !== this.selectedId && doSelect) {
        this.onSelect(this.selectedId, false);
        this.selectedId = id;
      }
    }
  }

  protected updateScrollFade(sb: ScrollBar): void {
    if (sb.fading === 1 && (sb.alpha += 0.33) >= 1) {
      sb.alpha = 1;
      sb.fading = -1;
    }
    if (sb.fading === 0 && (sb.alpha -= 0.1) <= 0) {
      sb.alpha = 0;
      sb.fading = -1;
    }
  }

  setSelected(id: number, selected: boolean): void {
    if (this.isSet(SF_MultiSelect)) this.selected[id] = selected;
    else {
      if (selected) this.selectedId = selected ? id : -1;
      else if (id === this.selectedId) this.selectedId = -1;
    }
  }

  protected translate(xo: number, yo: number): void {
    this.bbox.x += Math.trunc(xo);
    this.bbox.y += Math.trunc(yo);
    this.area._x0 += xo;
    this.area._x1 += xo;
    this.area._y0 += yo;
    this.area._y1 += yo;
    this.bboxArea._x0 += xo;
    this.bboxArea._x1 += xo;
    this.bboxArea._y0 += yo;
    this.bboxArea._y1 += yo;
    this.hScroll.x += xo;
    this.hScroll.y += yo;
    this.vScroll.x += xo;
    this.vScroll.y += yo;
  }

  queryHoldTime(): [boolean, number, number] {
    if (!this.dragging && this.highlightStarted >= 0) {
      const item = this.getItemForPos(this._lx, this._ly, true);
      if (item.id === this.highlightItem.id) {
        return [true, this.highlightItem.id, getTimeMs() - this.highlightStarted];
      } else {
        this.highlightStarted = -1;
      }
    }
    return [false, -1, -1];
  }

  protected didEndDragging(): void {}
  protected didEndDecelerating(): void {}
  protected willBeginDecelerating(): void {}
  protected willBeginDragging(): void {}
}
void SF_LockY; void SF_WrapY;
