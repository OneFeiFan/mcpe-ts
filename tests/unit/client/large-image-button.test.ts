import { beforeAll, describe, expect, it } from 'vitest';
import { GLES1, glSetContext } from '@mcpe/client';
import type { Minecraft } from '../../../packages/client/src/Minecraft';
import { ImageDef } from '../../../packages/client/src/gui/components/ImageButton';
import { LargeImageButton } from '../../../packages/client/src/gui/components/LargeImageButton';

// LargeImageButton（B8b-1）：起始菜单那三个 72×72 的大图标按钮。
// 与基类 ImageButton 的差别只在悬停缩放的**过程**：ImageButton 一步就乘 0.95，
// 这个是一帧走 0.025 地逼近。那条平滑逻辑藏在 render() 里，所以用无头 GL 直接跑 render。

const TEX_ID = 7;

function makeMinecraft(useTouchscreen = false, validTexture = true): Minecraft {
  return {
    useTouchscreen: () => useTouchscreen,
    textures: {
      loadAndBindTexture: () => (validTexture ? TEX_ID : -1), // -1 就是 Textures.InvalidId
      getTemporaryTextureData: () => ({ w: 256, h: 256 }),
    },
    font: { width: () => 0, height: () => 10, drawShadow: () => {} },
  } as unknown as Minecraft;
}

/**
 * 造一个带贴图的按钮。**必须给 ImageDef 一个非空 name** ——
 * `render` 里是 `_imageDef.name.length > 0 ? loadAndBindTexture(...) : InvalidId`，
 * name 为空的话压根不查贴图，后面那段（含缩放更新）整块跳过。
 */
function makeButton(id = 1, msg = 'Start Game'): LargeImageButton {
  const def = new ImageDef();
  def.name = 'gui/touchgui.png';
  def.width = 72;
  def.height = 72;
  return new LargeImageButton(id, msg, def);
}

/** _buttonScale 是 private，测试里掀开看一眼 */
function scaleOf(b: LargeImageButton): number {
  return (b as unknown as { _buttonScale: number })._buttonScale;
}

/** 直接改 _currentlyDown（触摸屏模式下的"按着"状态） */
function setDown(b: LargeImageButton, down: boolean): void {
  (b as unknown as { _currentlyDown: boolean })._currentlyDown = down;
}

beforeAll(() => {
  glSetContext(new GLES1(null)); // 无头模式：只维护状态与矩阵
});

describe('client/LargeImageButton', () => {
  it('默认 72×72，还保留基类的 scaleWhenPressed', () => {
    const b = makeButton();
    expect(b.width).toBe(72);
    expect(b.height).toBe(72);
    // C++ 的 LargeImageButton::setupDefault 只设 _buttonScale 和尺寸，不碰 scaleWhenPressed；
    // 那个仍是基类 setupDefault 设的 true
    expect(b.scaleWhenPressed).toBe(true);
    expect(scaleOf(b)).toBe(1);
  });

  it('传了 ImageDef 也还是 72×72：图只决定画什么，不决定按钮多大', () => {
    const def = new ImageDef();
    def.name = 'gui/touchgui.png';
    def.width = 48;
    def.height = 48;
    const b = new LargeImageButton(2, 'Join Game', def);
    expect(b.width, 'C++ 直接赋 _imageDef，不走 setImageDef（那个才会改尺寸）').toBe(72);
    expect(b.height).toBe(72);
  });

  describe('悬停时图标的平滑缩放', () => {
    it('停在按钮上：一帧缩 0.025，最低到 0.95 就不再缩', () => {
      const b = makeButton();
      const mc = makeMinecraft();
      b.x = 0;
      b.y = 0;

      b.render(mc, 10, 10); // 第 1 帧
      expect(scaleOf(b)).toBeCloseTo(0.975, 10);
      b.render(mc, 10, 10); // 第 2 帧
      expect(scaleOf(b)).toBeCloseTo(0.95, 10);
      b.render(mc, 10, 10); // 第 3 帧：Mth::Max(0.95, 0.925) 还是 0.95
      expect(scaleOf(b)).toBeCloseTo(0.95, 10);
    });

    it('移开：一帧涨回 0.025，最高到 1.00', () => {
      const b = makeButton();
      const mc = makeMinecraft();
      b.x = 0;
      b.y = 0;

      for (let i = 0; i < 5; i++) b.render(mc, 10, 10); // 先缩到 0.95
      expect(scaleOf(b)).toBeCloseTo(0.95, 10);

      b.render(mc, 999, 999); // 移开
      expect(scaleOf(b)).toBeCloseTo(0.975, 10);
      b.render(mc, 999, 999);
      expect(scaleOf(b)).toBeCloseTo(1.0, 10);
      b.render(mc, 999, 999); // Mth::Min(1.00, 1.025) 还是 1.00
      expect(scaleOf(b)).toBeCloseTo(1.0, 10);
    });

    /**
     * 【原样保留：更新缩放的语句在 `if (isTextureIdValid(texId))` 里面】C++ 就是这么套的 ——
     * 没有有效贴图的按钮压根不跑缩放那段（反正它也什么都不画）。看着像 bug，但没影响，照抄。
     */
    it('没有有效贴图时缩放根本不更新', () => {
      const b = makeButton();
      const mc = makeMinecraft(false, false);
      b.render(mc, 10, 10);
      b.render(mc, 10, 10);
      expect(scaleOf(b), '贴图取不到，缩放那几行不执行').toBe(1);
    });

    it('禁用（active=false）时不算悬停，缩放回 1.00', () => {
      const b = makeButton();
      const mc = makeMinecraft();
      b.x = 0;
      b.y = 0;
      b.render(mc, 10, 10);
      expect(scaleOf(b)).toBeLessThan(1);

      b.active = false;
      b.render(mc, 10, 10);
      expect(scaleOf(b), 'active 为假时 hovered 恒假').toBeGreaterThan(0.95);
    });
  });

  it('触摸屏模式下要"按着"才算悬停', () => {
    const b = makeButton();
    const mc = makeMinecraft(true);
    b.x = 0;
    b.y = 0;

    b.render(mc, 10, 10); // 手指没按下去，只当成指针划过
    expect(scaleOf(b), '没按着 → 不算悬停 → 往 1.00 涨').toBe(1);

    setDown(b, true);
    b.render(mc, 10, 10);
    expect(scaleOf(b), '按着且在框内 → 缩').toBeCloseTo(0.975, 10);
  });
});
