import { Dimension, Material, Tile, type Biome, type BiomeSource, type Level, type LevelChunk, type LightLayer } from '@mcpe/world';

/**
 * 测试用的最小世界：实现 Level 前向声明接口，方块与数据存在 Map 里。
 * 只保证方块代码常用的读写语义；不做光照、邻居更新与计划刻执行（计划刻只记录下来）。
 */
/**
 * 类型上继承 Level（运行时不调用 Level 的构造函数，也不带它的任何实现）：
 * Level 正身有 private、protected 成员，别的类无法 implements 它；这样 FakeLevel 才能传给参数类型是 Level 的代码。
 * 只实现方块代码与单测用到的成员；调用没有实现的 Level 方法会在运行时报错。
 */
const LevelType = Object as unknown as abstract new () => Level;

export class FakeLevel extends LevelType {
  override isClientSide = false;
  override noNeighborUpdate = false;
  override dimension: Dimension = new Dimension(); // 默认：ultraWarm、hasCeiling 都是 false
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

  override getTile(x: number, y: number, z: number): number {
    return this.tileMap.get(FakeLevel.key(x, y, z)) ?? 0;
  }

  override getData(x: number, y: number, z: number): number {
    return this.dataMap.get(FakeLevel.key(x, y, z)) ?? 0;
  }

  override isEmptyTile(x: number, y: number, z: number): boolean {
    return this.getTile(x, y, z) === 0;
  }

  override getMaterial(x: number, y: number, z: number): Material {
    const t = this.getTile(x, y, z);
    return t === 0 ? Material.air : Tile.tiles[t]!.material;
  }

  override isSolidRenderTile(x: number, y: number, z: number): boolean {
    const t = Tile.tiles[this.getTile(x, y, z)];
    return t != null && t.isSolidRender();
  }

  override isSolidBlockingTile(x: number, y: number, z: number): boolean {
    const t = Tile.tiles[this.getTile(x, y, z)];
    return t != null && t.material.blocksMotion() && t.isCubeShaped();
  }

  /** 两个重载：LevelSource 的 (x, y, z) 固定返回 1；按光照层的 (layer, x, y, z) 读下面的 light 表（默认 0） */
  override getBrightness(x: number, y: number, z: number): number;
  override getBrightness(layer: LightLayer, x: number, y: number, z: number): number;
  override getBrightness(a: number | LightLayer, x: number, y: number, z?: number): number {
    if (typeof a === 'number') return 1;
    return this.light.get(`${a.surrounding}:${x},${y},${z!}`) ?? 0;
  }

  readonly light = new Map<string, number>();

  override setBrightness(layer: LightLayer, x: number, y: number, z: number, brightness: number): void {
    this.light.set(`${layer.surrounding}:${x},${y},${z}`, brightness);
  }

  /** 替身：没有天空 */
  override isSkyLit(_x: number, _y: number, _z: number): boolean {
    return false;
  }

  readonly otherThanCalls: [layer: LightLayer, x: number, y: number, z: number, expected: number][] = [];

  override updateLightIfOtherThan(layer: LightLayer, x: number, y: number, z: number, expected: number): void {
    this.otherThanCalls.push([layer, x, y, z, expected]);
  }

  /** 替身：所有区块都存在且不为空 */
  override getChunk(_x: number, _z: number): LevelChunk {
    return { isEmpty: () => false } as LevelChunk;
  }

  override getBiomeSource(): BiomeSource {
    throw new Error('FakeLevel 没有 BiomeSource');
  }

  override getBiome(_x: number, _z: number): Biome {
    throw new Error('FakeLevel 没有 Biome');
  }

  override getRawBrightness(_x: number, _y: number, _z: number, _propagate?: boolean): number {
    return 15;
  }

  override hasChunksAt(..._args: number[]): boolean {
    return true;
  }

  override setTile(x: number, y: number, z: number, tile: number): boolean {
    this.put(x, y, z, tile, 0);
    return true;
  }

  override setData(x: number, y: number, z: number, data: number): void {
    this.dataMap.set(FakeLevel.key(x, y, z), data);
  }

  override setDataNoUpdate(x: number, y: number, z: number, data: number): boolean {
    this.setData(x, y, z, data);
    return true;
  }

  override setTileAndData(x: number, y: number, z: number, tile: number, data: number): boolean {
    this.put(x, y, z, tile, data);
    return true;
  }

  override setTileAndDataNoUpdate(x: number, y: number, z: number, tile: number, data: number): boolean {
    return this.setTileAndData(x, y, z, tile, data);
  }

  override setTilesDirty(): void {}

  override sendTileUpdated(): void {}

  override updateNeighborsAt(): void {}

  seed = 0;
  override skyDarken = 0;
  time = 0;

  override getTime(): number {
    return this.time;
  }

  readonly lightUpdates: [layer: LightLayer, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number][] = [];

  override updateLight(layer: LightLayer, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, _join?: boolean): void {
    this.lightUpdates.push([layer, x0, y0, z0, x1, y1, z1]);
  }

  override lightColumnChanged(): void {}

  /** 替身：没有真实区块，统一返回 0 */
  override getHeightmap(_x: number, _z: number): number {
    return 0;
  }

  override getSeed(): number {
    return this.seed;
  }

  /** 照 Level::getTopTile（Level.cpp）：从 y = 63 往上找到第一个上方为空的方块 */
  override getTopTile(x: number, z: number): number {
    let y = 63;
    while (!this.isEmptyTile(x, y + 1, z)) y++;
    return this.getTile(x, y, z);
  }

  override addToTickNextTick(x: number, y: number, z: number, tileId: number, tickDelay: number): void {
    this.scheduled.push([x, y, z, tileId, tickDelay]);
  }

  override addParticle(id: string): void {
    this.particles.push(id);
  }

  /** 两个重载都只记录声音名：playSound(entity, name, …) 与 playSound(x, y, z, name, …) */
  override playSound(a: unknown, b: unknown, _c?: unknown, d?: unknown): void {
    this.sounds.push(typeof a === 'number' ? (d as string) : (b as string));
  }
}
