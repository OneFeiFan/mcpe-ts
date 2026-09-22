export interface GameInputState {
  readonly forward: boolean;
  readonly backward: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly jump: boolean;
  readonly attack: boolean;
  readonly use: boolean;
}

export interface InputSource {
  sample(): GameInputState;
}
