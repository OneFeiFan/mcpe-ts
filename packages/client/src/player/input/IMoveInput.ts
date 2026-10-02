// 1:1 移植自 src/client/player/input/IMoveInput.h：移动输入的基类（虚函数都有空的默认实现）
import type { Player } from '@mcpe/world';
import type { Config } from '../../IConfigListener';

export class IMoveInput {
  xa = 0;
  ya = 0;
  wasJumping = false;
  jumping = false;
  sneaking = false;
  wantUp = false;
  wantDown = false;
  isChangingFlightHeight = false;

  protected constructor() {}

  tick(_player: Player | null): void {}
  render(_a: number): void {}
  setKey(_eventKey: number, _eventKeyState: boolean): void {}
  releaseAllKeys(): void {}
  onConfigChanged(_c: Config): void {}
}
