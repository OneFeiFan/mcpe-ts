// 1:1 移植自 src/client/player/input/MouseBuildInput.h：左键破坏/攻击，右键放置/交互（按住时每 10 tick 一次）
import { Mouse, MouseAction } from '@mcpe/platform';
import type { Player } from '@mcpe/world';
import { BuildActionIntention, IBuildInput } from './IBuildInput';

export class MouseBuildInput extends IBuildInput {
  private buildHoldTicks = 0;
  private buildDelayTicks = 10;

  override tickBuild(_p: Player | null, bai: BuildActionIntention): boolean {
    if (Mouse.getButtonState(MouseAction.ACTION_LEFT) !== 0) {
      bai.assign(
        new BuildActionIntention(BuildActionIntention.BAI_REMOVE | BuildActionIntention.BAI_ATTACK),
      );
      return true;
    }
    if (Mouse.getButtonState(MouseAction.ACTION_RIGHT) !== 0) {
      if (this.buildHoldTicks >= this.buildDelayTicks) this.buildHoldTicks = 0;
      if (++this.buildHoldTicks === 1) {
        bai.assign(
          new BuildActionIntention(
            BuildActionIntention.BAI_BUILD | BuildActionIntention.BAI_INTERACT,
          ),
        );
        return true;
      }
    } else {
      this.buildHoldTicks = 0;
    }
    return false;
  }
}
