import { Dimension, Material, Tile, type Biome, type BiomeSource, type Level, type LevelChunk, type LightLayer } from '@mcpe/world';

/**
 * 测试用的最小世界：实现 Level 前向声明接口，方块与数据存在 Map 里。
 * 只保证方块代码常用的读写语义；不做光照、邻居更新与计划刻执行（计划刻只记录下来）。
 */
export class FakeLevel implements Level {
  isClientSide = false;
  noNeighborUpdate = false;
  dimension: Dimension = new Dimension(); // 默认：ultraWarm、hasCeiling 都是 false
  readonly scheduled: [x: number, y: number, z: number, tileId: number, delay: number][] = [];
  readonly particles: string[] = [];
  readonly sounds: string[] = [];
  private readonly tileMap = new Map<string, number>();
  private readonly dataMap = new Map<string, number>();

  private static key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  put(x: number, y: number, z: number, tile: number, data = 0): this {
    this.tileMap.set(FakeLevel.key(x, y, z), tile);
    this.dataMap.set(FakeLevel.key(x, y, z), data);
    return this;
  }

  getTile(x: number, y: number, z: number): number {
    return this.tileMap.get(FakeLevel.key(x, y, z)) ?? 0;
  }

  getData(x: number, y: number, z: number): number {
    return this.dataMap.get(FakeLevel.key(x, y, z)) ?? 0;
  }

  isEmptyTile(x: number, y: number, z: number): boolean {
    return this.getTile(x, y, z) === 0;
  }

  getMaterial(x: number, y: number, z: number): Material {
    const t = this.getTile(x, y, z);
    return t === 0 ? Material.air : Tile.tiles[t]!.material;
  }

  isSolidRenderTile(x: number, y: number, z: number): boolean {
    const t = Tile.tiles[this.getTile(x, y, z)];
    return t != null && t.isSolidRender();
  }

  isSolidBlockingTile(x: number, y: number, z: number): boolean {
    const t = Tile.tiles[this.getTile(x, y, z)];
    return t != null && t.material.blocksMotion() && t.isCubeShaped();
  }

  /** 两个重载：LevelSource 的 (x, y, z) 固定返回 1；按光照层的 (layer, x, y, z) 读下面的 light 表（默认 0） */
  getBrightness(x: number, y: number, z: number): number;
  getBrightness(layer: LightLayer, x: number, y: number, z: number): number;
  getBrightness(a: number | LightLayer, x: number, y: number, z?: number): number {
    if (typeof a === 'number') return 1;
    return this.light.get(`${a.surrounding}:${x},${y},${z!}`) ?? 0;
  }

  readonly light = new Map<string, number>();

  setBrightness(layer: LightLayer, x: number, y: number, z: number, brightness: number): void {
    this.light.set(`${layer.surrounding}:${x},${y},${z}`, brightness);
  }

  /** 替身：没有天空 */
  isSkyLit(_x: number, _y: number, _z: number): boolean {
    return false;
  }

  readonly otherThanCalls: [layer: LightLayer, x: number, y: number, z: number, expected: number][] = [];

  updateLightIfOtherThan(layer: LightLayer, x: number, y: number, z: number, expected: number): void {
    this.otherThanCalls.push([layer, x, y, z, expected]);
  }

  /** 替身：所有区块都存在且不为空 */
  getChunk(_x: number, _z: number): LevelChunk {
    return { isEmpty: () => false } as LevelChunk;
  }

  getBiomeSource(): BiomeSource {
    throw new Error('FakeLevel 没有 BiomeSource');
  }

  getBiome(_x: number, _z: number): Biome {
    throw new Error('FakeLevel 没有 Biome');
  }

  getRawBrightness(_x: number, _y: number, _z: number, _propagate?: boolean): number {
    return 15;
  }

  hasChunksAt(..._args: number[]): boolean {
    return true;
  }

  setTile(x: number, y: number, z: number, tile: number): boolean {
    this.put(x, y, z, tile, 0);
    return true;
  }

  setData(x: number, y: number, z: number, data: number): void {
    this.dataMap.set(FakeLevel.key(x, y, z), data);
  }

  setDataNoUpdate(x: number, y: number, z: number, data: number): boolean {
    this.setData(x, y, z, data);
    return true;
  }

  setTileAndData(x: number, y: number, z: number, tile: number, data: number): boolean {
    this.put(x, y, z, tile, data);
    return true;
  }

  setTileAndDataNoUpdate(x: number, y: number, z: number, tile: number, data: number): boolean {
    return this.setTileAndData(x, y, z, tile, data);
  }

  setTilesDirty(): void {}

  sendTileUpdated(): void {}

  updateNeighborsAt(): void {}

  seed = 0;
  readonly lightUpdates: [layer: LightLayer, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number][] = [];

  updateLight(layer: LightLayer, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, _join?: boolean): void {
    this.lightUpdates.push([layer, x0, y0, z0, x1, y1, z1]);
  }

  lightColumnChanged(): void {}

  /** 替身：没有真实区块，统一返回 0 */
  getHeightmap(_x: number, _z: number): number {
    return 0;
  }

  getSeed(): number {
    return this.seed;
  }

  /** 照 Level::getTopTile（Level.cpp）：从 y = 63 往上找到第一个上方为空的方块 */
  getTopTile(x: number, z: number): number {
    let y = 63;
    while (!this.isEmptyTile(x, y + 1, z)) y++;
    return this.getTile(x, y, z);
  }

  addToTickNextTick(x: number, y: number, z: number, tileId: number, tickDelay: number): void {
    this.scheduled.push([x, y, z, tileId, tickDelay]);
  }

  addParticle(id: string): void {
    this.particles.push(id);
  }

  playSound(_x: number, _y: number, _z: number, name: string): void {
    this.sounds.push(name);
  }
}
