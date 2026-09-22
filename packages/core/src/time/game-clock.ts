export interface GameClock {
  readonly tick: number;
  readonly tickRate: number;
  advance(): void;
}

export class FixedGameClock implements GameClock {
  private _tick = 0;

  public constructor(public readonly tickRate = 20) {}

  public get tick(): number {
    return this._tick;
  }

  public advance(): void {
    this._tick += 1;
  }
}
