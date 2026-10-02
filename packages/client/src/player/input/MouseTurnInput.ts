// 1:1 移植自 src/client/player/input/MouseTurnInput.h：MODE_DELTA 直接取鼠标的相对移动（pointer lock 下的 movementX/Y）
import { Mouse } from '@mcpe/platform';
import type { Config } from '../../IConfigListener';
import { ITurnInput, TurnDelta } from './ITurnInput';

export class MouseTurnInput extends ITurnInput {
  static readonly MODE_OFFSET = 1;
  static readonly MODE_DELTA = 2;

  mode: number;
  private _centerX: number;
  private _centerY: number;

  constructor(mode_: number, centerX: number, centerY: number) {
    super();
    this.mode = mode_;
    this._centerX = centerX;
    this._centerY = centerY;
  }

  override onConfigChanged(config: Config): void {
    this._centerX = config.width * 0.5;
    this._centerY = config.height * 0.5;
  }

  getTurnDelta(): TurnDelta {
    let dx = 0, dy = 0;
    if (MouseTurnInput.MODE_DELTA === this.mode) {
      dx = Mouse.getDX();
      dy = Mouse.getDY();
    } else if (MouseTurnInput.MODE_OFFSET === this.mode) {
      const dt = this.getDeltaTime();
      dx = ITurnInput.linearTransform(Mouse.getX() - this._centerX, 40, 0.4) * dt;
      dy = ITurnInput.linearTransform(Mouse.getY() - this._centerY, 30, 0.6) * dt;
    }
    return new TurnDelta(dx, dy);
  }
}
