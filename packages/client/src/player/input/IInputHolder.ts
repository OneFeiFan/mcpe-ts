// 1:1 移植自 src/client/player/input/IInputHolder.h：移动、转向、建造三种输入的持有者
import { Mouse, MouseAction } from '@mcpe/platform';
import { type Config, IConfigListener } from '../../IConfigListener';
import type { IBuildInput } from './IBuildInput';
import type { IMoveInput } from './IMoveInput';
import type { ITurnInput } from './ITurnInput';

export abstract class IInputHolder extends IConfigListener {
  mousex = 0;
  mousey = 0;
  alpha = 0;

  render(_alpha: number): void {}

  allowPicking(): boolean {
    this.mousex = Mouse.getX();
    this.mousey = Mouse.getY();
    return Mouse.getButtonState(MouseAction.ACTION_LEFT) === MouseAction.DATA_DOWN;
  }

  onConfigChanged(c: Config): void {
    this.getMoveInput().onConfigChanged(c);
    this.getTurnInput().onConfigChanged(c);
    this.getBuildInput().onConfigChanged(c);
  }

  abstract getMoveInput(): IMoveInput;
  abstract getTurnInput(): ITurnInput;
  abstract getBuildInput(): IBuildInput;
}

export class CustomInputHolder extends IInputHolder {
  private _move!: IMoveInput;
  private _turn!: ITurnInput;
  private _build!: IBuildInput;

  constructor(move: IMoveInput, turn: ITurnInput, build: IBuildInput) {
    super();
    this.setInputs(move, turn, build);
  }

  setInputs(move: IMoveInput, turn: ITurnInput, build: IBuildInput): void {
    this._move = move;
    this._turn = turn;
    this._build = build;
  }

  getMoveInput(): IMoveInput { return this._move; }
  getTurnInput(): ITurnInput { return this._turn; }
  getBuildInput(): IBuildInput { return this._build; }
}
