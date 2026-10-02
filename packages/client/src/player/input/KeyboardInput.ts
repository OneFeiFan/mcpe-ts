// 1:1 移植自 src/client/player/input/KeyboardInput.h 与 KeyboardInput.cpp：按选项里的键位把按键映射成移动输入
import type { Player } from '@mcpe/world';
import { OptionId, type Options } from '../../Options';
import { IMoveInput } from './IMoveInput';

export class KeyboardInput extends IMoveInput {
  private static readonly NumKeys = 10;
  static readonly KEY_UP = 0;
  static readonly KEY_DOWN = 1;
  static readonly KEY_LEFT = 2;
  static readonly KEY_RIGHT = 3;
  static readonly KEY_JUMP = 4;
  static readonly KEY_SNEAK = 5;
  static readonly KEY_CRAFT = 6;

  protected keys: boolean[] = new Array<boolean>(KeyboardInput.NumKeys).fill(false);
  protected options: Options;

  constructor(options: Options) {
    super();
    this.options = options;
  }

  override setKey(key: number, state: boolean): void {
    const o = this.options;
    let id = -1;
    if (key === o.getIntValue(OptionId.OPTIONS_KEY_FORWARD)) id = KeyboardInput.KEY_UP;
    if (key === o.getIntValue(OptionId.OPTIONS_KEY_BACK)) id = KeyboardInput.KEY_DOWN;
    if (key === o.getIntValue(OptionId.OPTIONS_KEY_LEFT)) id = KeyboardInput.KEY_LEFT;
    if (key === o.getIntValue(OptionId.OPTIONS_KEY_RIGHT)) id = KeyboardInput.KEY_RIGHT;
    if (key === o.getIntValue(OptionId.OPTIONS_KEY_JUMP)) id = KeyboardInput.KEY_JUMP;
    if (key === o.getIntValue(OptionId.OPTIONS_KEY_SNEAK)) id = KeyboardInput.KEY_SNEAK;
    if (id >= 0) {
      this.keys[id] = state;
    }
  }

  override releaseAllKeys(): void {
    this.xa = 0;
    this.ya = 0;
    for (let i = 0; i < KeyboardInput.NumKeys; i++) {
      this.keys[i] = false;
    }
    this.wantUp = this.wantDown = false;
  }

  override tick(_player: Player | null): void {
    this.xa = 0;
    this.ya = 0;
    if (this.keys[KeyboardInput.KEY_UP]) this.ya++;
    if (this.keys[KeyboardInput.KEY_DOWN]) this.ya--;
    if (this.keys[KeyboardInput.KEY_LEFT]) this.xa++;
    if (this.keys[KeyboardInput.KEY_RIGHT]) this.xa--;
    this.jumping = this.keys[KeyboardInput.KEY_JUMP]!;
    this.sneaking = this.keys[KeyboardInput.KEY_SNEAK]!;
    if (this.sneaking) {
      this.xa *= 0.3;
      this.ya *= 0.3;
    }
    this.wantUp = this.jumping;
    this.wantDown = this.sneaking;
    if (this.keys[KeyboardInput.KEY_CRAFT]) {
      // DEFERRED(Crafting): player->startCrafting((int)player->x, (int)player->y, (int)player->z, Recipe::SIZE_2X2);
      // （setKey 从不设置 KEY_CRAFT，这句实际走不到）
    }
  }
}
