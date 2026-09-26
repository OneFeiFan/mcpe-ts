// 1:1 移植自 src/world/level/LevelSettings.h（S4 前置）
export const GameType = {
  Undefined: -1,
  Survival: 0,
  Creative: 1,
  Default: 1, // = Creative
} as const;

export class LevelSettings {
  constructor(
    private readonly seed: number,
    private readonly gameType: number,
    private readonly allowCheats = false,
  ) {}

  static None(): LevelSettings {
    return new LevelSettings(-1, -1, false);
  }

  getSeed(): number {
    return this.seed;
  }

  getGameType(): number {
    return this.gameType;
  }

  getAllowCheats(): boolean {
    return this.allowCheats;
  }

  static validateGameType(gameType: number): number {
    switch (gameType) {
      case GameType.Creative:
      case GameType.Survival:
        return gameType;
    }
    return GameType.Default;
  }

  static gameTypeToString(gameType: number): string {
    if (gameType === GameType.Survival) return 'Survival';
    if (gameType === GameType.Creative) return 'Creative';
    return 'Undefined';
  }
}
