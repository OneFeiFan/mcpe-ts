/**
 * ADAPTED(ESM)：MobSpawner 的注入槽（叶子模块，不 import 任何东西）。
 * RandomLevelSource 需要调 MobSpawner::postProcessSpawnMobs，但值导入 MobSpawner 会经 MobFactory → 各种生物类形成加载循环；
 * 由 MobSpawner 模块加载时把函数填进来。
 */
export const MobSpawnerHooks: {
  postProcessSpawnMobs:
    | ((
        level: never,
        biome: never,
        xo: number,
        zo: number,
        w: number,
        h: number,
        random: never,
      ) => void)
    | null;
} = { postProcessSpawnMobs: null };
