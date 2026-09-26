// 1:1 移植自 src/SharedConstants.h / SharedConstants.cpp（分支版本字符串）
export const LevelGeneratorVersion = {
  LGV_ORIGINAL: 0,
} as const;

export const SharedConstants = {
  // 0.5.0 uses NPv8
  // 0.6.0 uses NPv9
  NetworkProtocolVersion: 9,
  NetworkProtocolLowestSupportedVersion: 9,
  GameProtocolVersion: 1,
  GameProtocolLowestSupportedVersion: 1,
  StorageVersion: 3,
  MaxChatLength: 100,
  TicksPerSecond: 20,
  GeneratorVersion: LevelGeneratorVersion.LGV_ORIGINAL,
  // int FULLBRIGHT_LIGHTVALUE = 15 << 20 | 15 << 4;
} as const;

export const Common = {
  getGameVersionString(versionSuffix = ''): string {
    // C++ 仅在 Android 64 位时追加 " (64-bit)"；Web 端不适用
    return 'v0.1.0 (forked from v0.6.1 alpha)' + versionSuffix;
  },
} as const;
