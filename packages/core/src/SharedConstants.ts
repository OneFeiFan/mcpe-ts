enum LevelGeneratorVersion {
    LGV_ORIGINAL = 0,
};

namespace SharedConstants {
    // 0.5.0 uses NPv8
    // 0.6.0 uses NPv9
    const NetworkProtocolVersion: number = 9;
    const NetworkProtocolLowestSupportedVersion: number = 9;
    const GameProtocolVersion: number = 1;
    const GameProtocolLowestSupportedVersion: number = 1;

    const StorageVersion: number = 3;

    const MaxChatLength: number = 100;

    const TicksPerSecond: number = 20;

    const GeneratorVersion: number = LevelGeneratorVersion.LGV_ORIGINAL;
    //int FULLBRIGHT_LIGHTVALUE = 15 << 20 | 15 << 4;
}

namespace Common {
    function getGameVersionString(versionSuffix: string) {
        let result = "v0.1.0 (forked from v0.6.1 alpha)" + versionSuffix;
        return result;
    }
};

export { };