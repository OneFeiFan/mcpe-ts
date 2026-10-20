import { beforeEach, describe, expect, it } from 'vitest';
import { type Level, Player, TripodCamera } from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// 全量审核 W26：`TripodCamera(Level*, Player*, float x, float y, float z)` 的形参是 float。
// 实参在函数入口就该舍入；否则 `xo = x; yo = y; zo = z;`（直接赋形参）会和
// `setPos` 之后已经舍入成 float 的 `this.x/y/z` 不一致（实参不能在 float32 精确表示时）。
// 同批的 FallingTile（W24）、PrimedTnt（W25）是同一个问题。

const f = Math.fround;

/** Player 是抽象类（displayClientMessage 纯虚），最小子类即可实例化 */
class TestPlayer extends Player {
  override displayClientMessage(_m: string): void {}
}

/** 构造函数只读 owner 的 xRot/yRot；用真实 Player，避免伪造对象绕过类型检查 */
function makePlayer(level: Level, xRot = 0, yRot = 0): Player {
  const player = new TestPlayer(level, false);
  player.xRot = xRot;
  player.yRot = yRot;
  return player;
}

describe('TripodCamera 审核（W26）', () => {
  let level: Level;

  beforeEach(() => {
    level = createFlatLevel();
    prepareLevel(level);
  });

  it('W26：构造形参 x/y/z 先按 float 舍入，xo/yo/zo 与 setPos 后的 x/y/z 一致', () => {
    const cam = new TripodCamera(level, makePlayer(level), 0.1, 0.2, 0.3);

    // 实参在 float32 里都不可精确表示：舍入前后必然不同
    expect(f(0.1)).not.toBe(0.1);
    expect(cam.xo).toBe(f(0.1));
    expect(cam.yo).toBe(f(0.2));
    expect(cam.zo).toBe(f(0.3));
    expect([cam.xo, cam.yo, cam.zo]).toEqual([cam.x, cam.y, cam.z]);

    // C++ 只对齐 xo/yo/zo，没有 xOld/yOld/zOld（和 PrimedTnt 一样）
    expect([cam.xOld, cam.yOld, cam.zOld]).toEqual([0, 0, 0]);
  });

  it('W26：抄玩家的朝向时按 float 字段舍入（xRot = xRotO = owner->xRot）', () => {
    // C++ 里 Player::xRot/yRot 是 float 字段；替身直接给 double 0.1/0.2，
    // 赋进 float 字段必须舍入（和 EntityPos W10 同一类）
    const cam = new TripodCamera(level, makePlayer(level, 0.1, 0.2), 1, 2, 3);
    expect([cam.xRot, cam.xRotO]).toEqual([f(0.1), f(0.1)]);
    expect([cam.yRot, cam.yRotO]).toEqual([f(0.2), f(0.2)]);
  });
});
