/**
 * 1:1 移植自 src/client/renderer/entity/TripodCameraRenderer.h 与 .cpp（任务单 G 的 G10）。
 *
 * 【它是谁】三脚架相机实体的渲染器：一个木叉（`tesselateCrossTexture`）+ 一个 8×8×10 的
 * 相机方块（`ModelPart`，不 `setModel`，摆位全靠直接写 `xRot/yRot/y`）。
 *
 * 【⚠ 它在 C++ 里从未被注册】EntityRenderDispatcher.h:55 只有一行注释掉的
 * `//TripodCameraRenderer tripodCameraRenderer;`，构造函数的 assign 列表里也没有它 ——
 * 原版画面上相机实体就是**隐形**的（实体照常存在、照常 tick，只是没渲染器去画）。
 * 本类照 C++ 1:1 写全，但**同样不注册**（见 EntityRenderDispatcher 里的说明）。
 *
 * 【照抄的三处】
 *   1. 闪光那两句是连发的：`glColor4f2(1, 1, 1, flashStrength)` 之后立刻
 *      `glColor4f2(1, 1, 1, 1)` 重置，中间没有任何绘制调用 —— 等于白设，原样保留。
 *      另外 C++ 用的是 `::sin`（标准库）而不是 `Mth::sin`（查表）→ TS 用 `Math.sin`。
 *   2. `tripod` 是 `Tile(0, 15 * 16 + 3, Material::plant)`：id 0 已被空气占用，构造会打一条
 *      `Slot 0 is already occupied` 的警告 —— Tile 构造只警告不注册（注册在 `Tile.init()` 里），
 *      不会污染空气，照抄。
 *   3. `isCurrentlyPicked` 比的是"指针相等"（C++ `==` 比较地址）→ TS 用 `===`。
 *
 * 【浮点】第三档：整数形态字面量（180.0f、1.0f、16.0）直写；带 f 后缀的小数（0.5f、0.125f、
 * 6.2830f）过 f()。
 */
import { Mth } from '@mcpe/util';
import { type Entity, Material, Tile, type TripodCamera } from '@mcpe/world';
import { ModelPart } from '../../model/geom/ModelPart';
import {
  GL_BLEND,
  GL_DST_ALPHA,
  GL_SRC_ALPHA,
  GL_TEXTURE_2D,
  glBlendFunc2,
  glColor4f2,
  glDisable2,
  glEnable2,
  glPopMatrix2,
  glPushMatrix2,
  glTranslatef2,
} from '../gles';
import { Tesselator } from '../Tesselator';
import { TileRenderer } from '../TileRenderer';
import { EntityRenderer } from './EntityRenderer';

const f = Math.fround;

export class TripodCameraRenderer extends EntityRenderer {
  private tileRenderer = new TileRenderer();
  private tripod: Tile;
  private cameraCube: ModelPart;

  constructor() {
    super();
    this.tripod = new Tile(0, 15 * 16 + 3, Material.plant);
    this.cameraCube = new ModelPart(0, 0);
    this.cameraCube.addBox(-4, -4, -6, 8, 8, 10);
    this.cameraCube.y = 11;
    this.shadowRadius = f(0.5);
  }

  static getFlashTime(c: TripodCamera, a: number): number {
    if (c.life >= 8) return -1;
    if (c.life < 0) return -1;
    return (c.life - a) * f(0.125);
  }

  override render(e: Entity, x: number, y: number, z: number, _rot: number, a: number): void {
    const cam = e as TripodCamera;

    glPushMatrix2();
    glTranslatef2(x, y, z);

    this.cameraCube.xRot = Mth.DEGRAD * (180.0 + cam.xRot * f(0.5));
    this.cameraCube.yRot = -Mth.DEGRAD * cam.yRot;

    const t = Tesselator.instance;
    t.color(1.0, 1.0, 1.0);
    this.bindTexture('gui/items.png');
    t.begin();
    this.tileRenderer.tesselateCrossTexture(this.tripod, 0, f(-0.5), f(-0.5), f(-0.5));
    t.draw();

    this.bindTexture('item/camera.png');
    this.cameraCube.render(1.0 / 16.0);

    const isCurrentlyPicked =
      EntityRenderer.entityRenderDispatcher!.minecraft!.hitResult.entity === cam;

    const flashLife = TripodCameraRenderer.getFlashTime(cam, a);
    if (flashLife >= 0) {
      const flashStrength = Math.sin(flashLife * f(6.283));
      glColor4f2(1, 1, 1, flashStrength);
      glColor4f2(1, 1, 1, 1);
    }

    if (isCurrentlyPicked) {
      glDisable2(GL_TEXTURE_2D);
      glEnable2(GL_BLEND);
      glBlendFunc2(GL_SRC_ALPHA, GL_DST_ALPHA);
      glColor4f2(f(0.5), f(0.5), f(0.5), f(0.5));
      this.cameraCube.renderHorrible(1.0 / 16.0);
      glColor4f2(1, 1, 1, 1);
      glDisable2(GL_BLEND);
      glEnable2(GL_TEXTURE_2D);
    }

    glPopMatrix2();
  }
}
