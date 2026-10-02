// 1:1 移植自 src/client/player/input/IBuildInput.h：放置与破坏方块的意图
import type { Player } from '@mcpe/world';
import { type Config, IConfigListener } from '../../IConfigListener';

export class BuildActionIntention {
  static readonly BAI_BUILD = 1;
  static readonly BAI_REMOVE = 2;
  static readonly BAI_FIRSTREMOVE = 4;
  static readonly BAI_ATTACK = 8;
  static readonly BAI_INTERACT = 16;

  action: number;

  constructor(action = 0) {
    this.action = action;
  }

  isFirstRemove(): boolean { return (this.action & BuildActionIntention.BAI_FIRSTREMOVE) !== 0; }
  isRemoveContinue(): boolean { return (this.action & BuildActionIntention.BAI_REMOVE) !== 0; }
  isBuild(): boolean { return (this.action & BuildActionIntention.BAI_BUILD) !== 0; }
  isRemove(): boolean { return this.isFirstRemove() || this.isRemoveContinue(); }
  isAttack(): boolean { return (this.action & BuildActionIntention.BAI_ATTACK) !== 0; }
  isInteract(): boolean { return (this.action & BuildActionIntention.BAI_INTERACT) !== 0; }

  /** C++ 的 *bai = BuildActionIntention(...)（按值赋值） */
  assign(rhs: BuildActionIntention): this {
    this.action = rhs.action;
    return this;
  }
}

export class IBuildInput extends IConfigListener {
  onConfigChanged(_c: Config): void {}
  tickBuild(_player: Player | null, _bai: BuildActionIntention): boolean {
    return false;
  }
}
