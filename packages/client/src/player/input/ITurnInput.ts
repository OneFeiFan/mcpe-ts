// 1:1 移植自 src/client/player/input/ITurnInput.h：转向输入的基类与 TurnDelta
import { getTimeS } from '@mcpe/platform';
import { type Config, IConfigListener } from '../../IConfigListener';

/** Representing a Turn delta value（按值传递的小结构） */
export class TurnDelta {
  x: number;
  y: number;

  constructor(dx: number, dy: number) {
    this.x = dx;
    this.y = dy;
  }
}

/** Base class for classes providing TurnDeltas */
export abstract class ITurnInput extends IConfigListener {
  private _lastTime = -1.0;

  protected constructor() {
    super();
  }

  onConfigChanged(_c: Config): void {}

  abstract getTurnDelta(): TurnDelta;

  protected getDeltaTime(): number {
    if (this._lastTime === -1.0) {
      this._lastTime = getTimeS();
    }
    const now = getTimeS();
    const dt = now - this._lastTime;
    this._lastTime = now;
    return dt;
  }

  protected static linearTransform(value: number, deadZone: number, scale = 1.0, limit1 = false): number {
    const deadSigned = value >= 0 ? deadZone : -deadZone;
    if (Math.abs(deadSigned) >= Math.abs(value)) return 0;
    let ret = (value - deadSigned) * scale;
    if (limit1 && Math.abs(ret) > 1) ret /= Math.abs(ret);
    return ret;
  }
}
