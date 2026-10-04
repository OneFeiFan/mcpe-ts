import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CameraItem,
  type Entity,
  EntityRendererId,
  type Level,
  LevelListener,
  ItemInstance,
  Mob,
  type Player,
  TripodCamera,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 任务单 D5：`TripodCamera`（相机道具立起来的三脚架）+ `Level.takePicture`。
// 它**继承 Mob 不是 Entity**（C++ 里就是 `class TripodCamera: public Mob`），
// 但 `tick()` 整体重写、完全不调 super，所以 Mob 那套 AI 空壳碰不到它。

const f = Math.fround;
let level: Level;
const X = 130;
const Z = 130;

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

beforeEach(() => {
  level = createFlatLevel();
  prepareLevel(level);
});

/** 一个只记事情的 listener，用来验证 Level.takePicture 真的转发下去了 */
class RecordingListener extends LevelListener {
  calls: Array<[TripodCamera, Entity]> = [];
  override takePicture(cam: TripodCamera, entity: Entity): void {
    this.calls.push([cam, entity]);
  }
}

/** TripodCamera 的构造函数只读 owner 的 xRot/yRot，这里给个最小的替身就够了 */
function fakePlayer(xRot = 30, yRot = 90): Player {
  return { xRot, yRot } as unknown as Player;
}

describe('TripodCamera（D5）', () => {
  describe('构造与身份', () => {
    it('继承 Mob（不是直接继承 Entity）', () => {
      const cam = new TripodCamera(level, fakePlayer(), X + 0.5, 70, Z + 0.5);
      expect(cam).toBeInstanceOf(Mob);
    });

    it('字段照 C++ 初始化列表：life=80、activated=false、尺寸 1.0×1.5、朝向抄玩家的', () => {
      const cam = new TripodCamera(level, fakePlayer(30, 90), X + 0.5, 70, Z + 0.5);
      expect(cam.life).toBe(80);
      expect((cam as unknown as { activated: boolean }).activated).toBe(false);
      expect(cam.entityRendererId).toBe(EntityRendererId.ER_TRIPODCAMERA_RENDERER);
      expect(cam.blocksBuilding).toBe(true);
      expect([cam.bbWidth, cam.bbHeight]).toEqual([f(1.0), f(1.5)]);
      // heightOffset = bbHeight / 2.0f - 0.25f
      expect(cam.heightOffset).toBeCloseTo(0.5, 6);
      // `xRot = xRotO = owner->xRot; yRot = yRotO = owner->yRot;`
      expect([cam.xRot, cam.xRotO]).toEqual([30, 30]);
      expect([cam.yRot, cam.yRotO]).toEqual([90, 90]);
      expect([cam.x, cam.y, cam.z]).toEqual([X + 0.5, 70, Z + 0.5]);
      // 只对齐 xo/yo/zo（没有 xOld，和 PrimedTnt 一样）
      expect([cam.xo, cam.yo, cam.zo]).toEqual([X + 0.5, 70, Z + 0.5]);
    });

    it('⚠ getEntityTypeId() 硬编码返回 0（EntityTypes 里根本没有它）', () => {
      const cam = new TripodCamera(level, fakePlayer(), X + 0.5, 70, Z + 0.5);
      expect(cam.getEntityTypeId()).toBe(0);
    });

    it('isPickable 跟着 removed；isPushable 恒 false；interactPreventDefault 恒 true', () => {
      const cam = new TripodCamera(level, fakePlayer(), X + 0.5, 70, Z + 0.5);
      expect(cam.isPickable()).toBe(true);
      expect(cam.isPushable()).toBe(false);
      expect(cam.interactPreventDefault()).toBe(true);
      cam.remove();
      expect(cam.isPickable()).toBe(false);
    });

    it('getShadowHeightOffs 是 0', () => {
      expect(new TripodCamera(level, fakePlayer(), X + 0.5, 70, Z + 0.5).getShadowHeightOffs()).toBe(
        0,
      );
    });
  });

  describe('引信', () => {
    it('没激活时 life 一直不动（摆在那儿就是个装饰）', () => {
      const cam = new TripodCamera(level, fakePlayer(), X + 0.5, 70, Z + 0.5);
      level.addEntity(cam);
      for (let i = 0; i < 50; i++) level.tickEntities();
      expect(cam.life).toBe(80);
      expect(cam.removed).toBe(false);
    });

    it('interact 之后才开始走引信', () => {
      const cam = new TripodCamera(level, fakePlayer(), X + 0.5, 70, Z + 0.5);
      level.addEntity(cam);
      expect(cam.interact(fakePlayer())).toBe(true);
      level.tickEntities();
      expect(cam.life).toBe(79);
    });

    it('life == 8 那一刻拍一张照（== 是等于判断，不是 <=）', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      const owner = fakePlayer();
      const cam = new TripodCamera(level, owner, X + 0.5, 70, Z + 0.5);
      level.addEntity(cam);
      cam.interact(owner);

      // 数到 8 之前一张都不拍（走 71 刻 → life = 80 - 71 = 9）
      for (let i = 0; i < 71; i++) level.tickEntities();
      expect(cam.life, '差一刻还没到 8').toBe(9);
      expect(rec.calls.length, `life=${cam.life} 时不该拍照`).toBe(0);
    });

    it('life 正好走到 8 时拍一次照，到 0 时自己消失', () => {
      const rec = new RecordingListener();
      level.addListener(rec);
      const owner = fakePlayer();
      const cam = new TripodCamera(level, owner, X + 0.5, 70, Z + 0.5);
      level.addEntity(cam);
      cam.interact(owner);

      // life: 79, 78, ... 从 80 数到 8 要 72 刻
      for (let i = 0; i < 72; i++) level.tickEntities();
      expect(cam.life).toBe(8);
      expect(rec.calls.length, 'life == 8 这一刻拍一张').toBe(1);
      expect(rec.calls[0]![0]).toBe(cam);
      expect(rec.calls[0]![1]).toBe(owner);

      for (let i = 0; i < 8; i++) level.tickEntities();
      expect(cam.life).toBe(0);
      expect(cam.removed, 'life == 0 时 remove()').toBe(true);
      expect(rec.calls.length, '只拍这一张').toBe(1);
    });
  });

  describe('Level.takePicture', () => {
    it('转发给每一个 listener', () => {
      const a = new RecordingListener();
      const b = new RecordingListener();
      level.addListener(a);
      level.addListener(b);
      const owner = fakePlayer();
      const cam = new TripodCamera(level, owner, X + 0.5, 70, Z + 0.5);

      level.takePicture(cam, owner);
      expect(a.calls).toEqual([[cam, owner]]);
      expect(b.calls).toEqual([[cam, owner]]);
    });

    it('没有 listener 时不炸', () => {
      const owner = fakePlayer();
      const cam = new TripodCamera(level, owner, X + 0.5, 70, Z + 0.5);
      expect(() => level.takePicture(cam, owner)).not.toThrow();
    });
  });

  describe('CameraItem 接线', () => {
    it('use 一次就立起一个 TripodCamera，位置就是玩家所在的位置', () => {
      const owner = fakePlayer();
      (owner as unknown as { x: number }).x = 12.5;
      (owner as unknown as { y: number }).y = 64;
      (owner as unknown as { z: number }).z = 13.5;
      const item = new CameraItem(200);
      const before = level.entities.length;

      const ret = item.use(new ItemInstance(200 + 256, 1, 0), level, owner);

      expect(level.entities.length).toBe(before + 1);
      const cam = level.entities[level.entities.length - 1]!;
      expect(cam).toBeInstanceOf(TripodCamera);
      expect([cam.x, cam.y, cam.z]).toEqual([12.5, 64, 13.5]);
      // 原句没有返回值处理，直接把 itemInstance 交回去
      expect(ret).toBeInstanceOf(ItemInstance);
    });

    it('⚠ 没有 !isClientSide 守卫 —— 客户端也会造（C++ 原句就是这样）', () => {
      const owner = fakePlayer();
      const item = new CameraItem(200);
      level.isClientSide = true;
      const before = level.entities.length;
      item.use(new ItemInstance(200 + 256, 1, 0), level, owner);
      expect(level.entities.length).toBe(before + 1);
    });
  });
});
