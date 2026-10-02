// FORWARD-DECL(LocalPlayer)：对应 src/client/player/LocalPlayer.h。demo 里 mc.player 始终为 null（用 DebugFreeCamera 代替，附录 C）。
// 只列出保留下来的代码在 player 非空分支里读到的成员（resetPos 在 Entity 里是 protected、Player 里才公开，前向声明的接口无法表达，调用处经 resetPlayerPos）；isPlayer() 为真时 GameRenderer 会把相机目标当成它来读 bob、tilt 等。
import type { Player } from '@mcpe/world';
import type { CameraTarget } from '../camera/CameraTarget';
import type { IMoveInput } from './input/IMoveInput';

export interface LocalPlayer extends Player, CameraTarget {
  input: IMoveInput | null;
  walkDist: number;
  walkDistO: number;
  bob: number;
  oBob: number;
  tilt: number;
  oTilt: number;
  setKey(eventKey: number, eventKeyState: boolean): void;
  releaseAllKeys(): void;
  getFieldOfViewModifier(): number;
  isSleeping(): boolean;
}
