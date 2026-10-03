import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FlatChunkSource,
  FlatDimension,
  Level,
  LevelListener,
  LightLayer,
  Material,
  MobCategory,
  Tile,
  Vec3,
} from '@mcpe/world';
import { createFlatLevel, prepareLevel } from '../../helpers/headlessLevel';

// S5 检查点：真正的 Level + FlatChunkSource + FlatDimension，在无头环境里完整准备一遍世界
let level: Level;
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
const bits = (x: number): number => {
  f32[0] = x;
  return u32[0]!;
};

class RecordingListener extends LevelListener {
  readonly changed: string[] = [];
  override tileChanged(x: number, y: number, z: number): void {
    this.changed.push(`${x},${y},${z}`);
  }
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {}); // 缺 category 的 3 条日志
  level = createFlatLevel();
  prepareLevel(level);
});

describe('S5：Level 正身与平坦世界', () => {
  it('新世界、FlatDimension、skyDarken 为 0', () => {
    expect(level.isNew()).toBe(true);
    expect(level.dimension).toBeInstanceOf(FlatDimension);
    expect(level.skyDarken).toBe(0);
    expect(level.getChunkSource().gatherStats()).not.toBe('');
  });

  it('getTile：平台分层、空气区块、世界之外是隐形基岩', () => {
    expect([
      level.getTile(136, 63, 136),
      level.getTile(136, 62, 136),
      level.getTile(136, 1, 136),
      level.getTile(136, 0, 136),
      level.getTile(136, 64, 136),
    ]).toEqual([2, 3, 1, 7, 0]);
    expect(level.getTile(100, 64, 100)).toBe(0); // 区块 (6, 6)：0–15 内的空气区块
    expect([level.getTile(-1, 64, 0), level.getTile(256, 64, 0)]).toEqual([95, 95]); // EmptyLevelChunk
  });

  it('高度图、原始亮度、亮度（第 15 级 = 0.9）', () => {
    expect([level.getHeightmap(136, 136), level.getHeightmap(100, 100)]).toEqual([64, 0]);
    expect([level.getRawBrightness(136, 64, 136), level.getRawBrightness(136, 63, 136)]).toEqual([
      15, 0,
    ]);
    expect(bits(level.getBrightness(136, 64, 136))).toBe(bits(level.dimension.brightnessRamp[15]!));
    expect(level.getBrightness(136, 64, 136)).toBeCloseTo(0.9);
    expect(level.getBrightness(LightLayer.Sky, 136, 64, 136)).toBe(15); // 第二个重载
  });

  it('出生点 (128, 64, 128)：setInitialSpawn 第一次就合法，validateSpawn 不改它', () => {
    expect(level.getSharedSpawnPos()).toMatchObject({ x: 128, y: 64, z: 128 });
    level.validateSpawn();
    expect(level.getSharedSpawnPos()).toMatchObject({ x: 128, y: 64, z: 128 });
  });

  it('连续 200 次 tick 后时间为 200，没有异常', () => {
    const t0 = level.getTime();
    for (let i = 0; i < 200; i++) level.tick();
    expect(level.getTime() - t0).toBe(200);
  });

  it('同一坐标调用两次 addToTickNextTick，队列长度为 2（去重分支永不命中）', () => {
    const before = level._pendingTickCountForTest();
    level.addToTickNextTick(130, 64, 130, 1, 10);
    level.addToTickNextTick(130, 64, 130, 1, 10);
    expect(level._pendingTickCountForTest() - before).toBe(2);
  });

  it('setTile：监听器收到 tileChanged，光照更新入队，updateLights 最终返回 false', () => {
    const l = new RecordingListener();
    level.addListener(l);
    expect(level.setTile(136, 64, 136, 1)).toBe(true);
    expect(l.changed).toContain('136,64,136');
    expect(level.getLightsToUpdate()).toBeGreaterThan(0);
    let guard = 0;
    while (level.updateLights() && guard++ < 1000);
    expect(level.updateLights()).toBe(false);
    expect(level.getHeightmap(136, 136)).toBe(65);
    expect(level.getRawBrightness(136, 64, 136)).toBe(0);
    level.setTile(136, 64, 136, 0);
    while (level.updateLights());
    level.removeListener(l);
  });

  it('整体联动：放一格水源，经计划刻在平台上流开', () => {
    level.setTile(140, 64, 140, Tile.water.id);
    for (let i = 0; i < 30; i++) level.tick();
    expect(level.getMaterial(141, 64, 140)).toBe(Material.water); // 流不动之后会变成静止水（id 9），所以只看材质
    expect(level.getData(141, 64, 140)).toBeGreaterThan(0);
    expect(level.getMaterial(150, 64, 140)).toBe(Material.air); // 流动距离有限
  });

  it('clip：从上往下看平台，命中草地顶面', () => {
    const hit = level.clip(new Vec3(136.5, 80, 136.5), new Vec3(136.5, 50, 136.5));
    expect(hit.isHit()).toBe(true);
    expect([hit.x, hit.y, hit.z, hit.f]).toEqual([136, 63, 136, 1]);
  });

  it('getMobsAt 经 BiomeSource 取到群系的刷怪表', () => {
    const src = new FlatChunkSource(level);
    expect(src.getMobsAt(MobCategory.monster, 128, 64, 128).length).toBeGreaterThan(0);
    expect(src.create(8, 8).getTile(0, 63, 0)).toBe(2);
    expect(src.create(5, 5).getTile(0, 63, 0)).toBe(0);
  });
});
