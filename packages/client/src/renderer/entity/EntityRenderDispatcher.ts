/**
 * 1:1 移植自 src/client/renderer/entity/EntityRenderDispatcher.h 与 .cpp（S13 阶段 C，部分移植）。
 * 部分：注册了 ER_ITEM_RENDERER（掉落物）、ER_FALLINGTILE_RENDERER（下落方块，D2.5）、
 *   ER_CHICKEN_RENDERER（鸡，G9 —— 第一个用上模型系统的生物）、ER_TNT_RENDERER 与
 *   ER_PAINTING_RENDERER（TNT 和画，G10）、ER_PLAYER_RENDERER（玩家，G11）；
 *   其余 7 只生物（猪牛羊骷髅僵尸苦力怕蜘蛛）的渲染器和 ER_HUMANOID_RENDERER 都拦在实体侧，
 *   在构造函数末尾逐条记录（G12）。
 *   ⚠ 相机渲染器（TripodCameraRenderer）在 C++ 里**从未注册**：EntityRenderDispatcher.h:55 只有一行
 *   注释掉的成员 `//TripodCameraRenderer tripodCameraRenderer;`，assign 列表里也没有它 ——
 *   照 C++ 1:1，TS 同样不注册（原版画面上相机实体就是隐形的）。
 *   没有注册的渲染器 getRenderer 返回 null，render 什么都不画（与 C++ 找不到时一样）。
 * R10：render(entity, a) 与 render(entity, x, y, z, rot, a) → 分派入口 render + renderAt；getRenderer(Entity*) / getRenderer(id) → getRenderer + getRendererById。
 * C++ 的 assign 在 `for (… init(this))` 循环**之前**逐条调用，这里照抄那个顺序。
 */
import { Mth } from '@mcpe/util';
import { type Entity, EntityRendererId, Item, type Level, type Mob, Tile } from '@mcpe/world';
import type { Font } from '../../gui/Font';
import type { Minecraft } from '../../Minecraft';
import type { Options } from '../../Options';
import { glColor4f2 } from '../gles';
import type { ItemInHandRenderer } from '../ItemInHandRenderer';
import type { Textures } from '../Textures';
import type { EntityRenderer } from './EntityRenderer';
import { FallingTileRenderer } from './FallingTileRenderer';
import { ItemRenderer } from './ItemRenderer';
import { ItemSpriteRenderer } from './ItemSpriteRenderer';
import { ArrowRenderer } from './ArrowRenderer';
import { ChickenRenderer } from './ChickenRenderer';
import { PaintingRenderer } from './PaintingRenderer';
import { TntRenderer } from './TntRenderer';
import { ChickenModel } from '../../model/ChickenModel';
import { HumanoidModel } from '../../model/HumanoidModel';
import { PlayerRenderer } from './PlayerRenderer';
import { HumanoidMobRenderer } from './HumanoidMobRenderer';
import { MobRenderer } from './MobRenderer';
import { PigRenderer } from './PigRenderer';
import { SheepRenderer } from './SheepRenderer';
import { CreeperRenderer } from './CreeperRenderer';
import { SpiderRenderer } from './SpiderRenderer';
import { SkeletonModel } from '../../model/SkeletonModel';
import { ZombieModel } from '../../model/ZombieModel';
import { SheepFurModel } from '../../model/SheepFurModel';
import { SheepModel } from '../../model/SheepModel';
import { CowModel } from '../../model/CowModel';
import { PigModel } from '../../model/PigModel';

const f = Math.fround;

export class EntityRenderDispatcher {
  static xOff = 0;
  static yOff = 0;
  static zOff = 0;
  private static instance: EntityRenderDispatcher | null = null;

  itemInHandRenderer: ItemInHandRenderer | null = null;
  textures: Textures | null = null;
  level: Level | null = null;
  minecraft: Minecraft | null = null;
  cameraEntity: Mob | null = null;
  playerRotY = 0;
  playerRotX = 0;
  options: Options | null = null;
  xPlayer = 0;
  yPlayer = 0;
  zPlayer = 0;
  private _font: Font | null = null;
  private _renderers = new Map<number, EntityRenderer>();

  constructor() {
    this.assign(EntityRendererId.ER_ITEM_RENDERER, new ItemRenderer());
    // D9.5：雪球和蛋共用同一个"物品图标"渲染器，只是图标格号不同。
    // ⚠ 这两行读 Item，所以**必须在 initItems() 之后**构造这个单例（真机顺序天然满足）。
    //   C++ 里它们排在 ER_ITEM(42) 和 ER_FALLINGTILE(58) 之间，照那个相对顺序摆。
    this.assign(
      EntityRendererId.ER_THROWNEGG_RENDERER,
      new ItemSpriteRenderer(Item.egg.getIcon(0)), // EntityRenderDispatcher.cpp:55
    );
    this.assign(
      EntityRendererId.ER_SNOWBALL_RENDERER,
      new ItemSpriteRenderer(Item.snowBall.getIcon(0)), // EntityRenderDispatcher.cpp:56
    );
    // D2.5：这个不依赖模型系统，所以能单拎出来先补 —— 补之前下落的方块在画面上是隐形的
    this.assign(EntityRendererId.ER_FALLINGTILE_RENDERER, new FallingTileRenderer()); // EntityRenderDispatcher.cpp:58
    // D11.5：箭的渲染器（也不依赖模型系统，只画 12 个顶点）
    this.assign(EntityRendererId.ER_ARROW_RENDERER, new ArrowRenderer()); // EntityRenderDispatcher.cpp:53
    // G9：鸡 —— 第一个用上模型系统的实体渲染器（也是第一只画面上看得见的生物）。
    // C++ 里这行在 EntityRenderDispatcher.cpp:46，与 C++ 的调用顺序无关紧要（各 id 互不覆盖）。
    // ⚠ C++ 字面量 `0.3` 没有 f 后缀，但传进的是 `float shadow` 形参 —— 按 PITFALLS 第 3 条包 f()
    this.assign(EntityRendererId.ER_CHICKEN_RENDERER, new ChickenRenderer(new ChickenModel(), f(0.3))); // EntityRenderDispatcher.cpp:46
    // G10：TNT 和画 —— 都不依赖模型系统（TNT 复用 TileRenderer，画只发顶点）。
    // ⚠ TntRenderer 构造会 `new TileRenderer()`、TripodCameraRenderer 构造会 `new Tile(0, …)` ——
    //   TNT 在真机上的构造晚于 initTiles，没影响；相机类不注册（见文件头），构造根本不发生。
    this.assign(EntityRendererId.ER_TNT_RENDERER, new TntRenderer()); // EntityRenderDispatcher.cpp:52
    this.assign(EntityRendererId.ER_PAINTING_RENDERER, new PaintingRenderer()); // EntityRenderDispatcher.cpp:57
    // G11：玩家 —— 两套皮肤模型（64×32 / 64×64）与四件盔甲模型都在 PlayerRenderer 里；
    // 第一人称的手臂（ItemInHandRenderer）和第三人称画面里的自己都靠它画。
    // ⚠ C++ 字面量 `0.5` 传进 `float shadow` 形参 —— 按 PITFALLS 第 3 条包 f()
    this.assign(
      EntityRendererId.ER_PLAYER_RENDERER,
      new PlayerRenderer(new HumanoidModel(0, 0, 64, 64), f(0.5)), // EntityRenderDispatcher.cpp:54
    );
    // C++ 第 43–51 行（任务单 H5–H8 起全部注册）
    // 任务单 H5 起：Monster 的默认渲染器、猪、牛
    this.assign(EntityRendererId.ER_HUMANOID_RENDERER, new HumanoidMobRenderer(new HumanoidModel(), 0.5)); // EntityRenderDispatcher.cpp:43
    this.assign(EntityRendererId.ER_PIG_RENDERER, new PigRenderer(new PigModel(0.5), null, f(0.7))); // :44（第二个模型 C++ 传 NULL）
    this.assign(EntityRendererId.ER_COW_RENDERER, new MobRenderer(new CowModel(), f(0.7))); // :45
    this.assign(EntityRendererId.ER_SHEEP_RENDERER, new SheepRenderer(new SheepModel(), new SheepFurModel(), f(0.7))); // :47
    this.assign(EntityRendererId.ER_SKELETON_RENDERER, new HumanoidMobRenderer(new SkeletonModel(), f(0.5))); // :48
    this.assign(EntityRendererId.ER_ZOMBIE_RENDERER, new HumanoidMobRenderer(new ZombieModel(), f(0.5))); // :49
    this.assign(EntityRendererId.ER_CREEPER_RENDERER, new CreeperRenderer()); // :50
    this.assign(EntityRendererId.ER_SPIDER_RENDERER, new SpiderRenderer()); // :51
    for (const r of this._renderers.values()) r.init(this);
  }

  static getInstance(): EntityRenderDispatcher {
    if (!EntityRenderDispatcher.instance)
      EntityRenderDispatcher.instance = new EntityRenderDispatcher();
    return EntityRenderDispatcher.instance;
  }

  static destroy(): void {
    EntityRenderDispatcher.instance = null;
  }

  prepare(level: Level, font: Font | null, player: Mob, options: Options, a: number): void {
    this.level = level;
    this.options = options;
    this.cameraEntity = player;
    this._font = font;
    if (player.isSleeping()) {
      const t = level.getTile(Mth.floor(player.x), Mth.floor(player.y), Mth.floor(player.z));
      if (t === Tile.bed.id) {
        const data = level.getData(Mth.floor(player.x), Mth.floor(player.y), Mth.floor(player.z));
        const direction = data & 3;
        this.playerRotY = direction * 90 + 180;
        this.playerRotX = 0;
      }
    } else {
      this.playerRotY = player.yRotO + (player.yRot - player.yRotO) * a;
      this.playerRotX = player.xRotO + (player.xRot - player.xRotO) * a;
    }
    this.xPlayer = player.xOld + (player.x - player.xOld) * a;
    this.yPlayer = player.yOld + (player.y - player.yOld) * a;
    this.zPlayer = player.zOld + (player.z - player.zOld) * a;
  }

  render(entity: Entity, a: number): void {
    const x = entity.xOld + (entity.x - entity.xOld) * a;
    const y = entity.yOld + (entity.y - entity.yOld) * a;
    const z = entity.zOld + (entity.z - entity.zOld) * a;
    const r = entity.yRotO + (entity.yRot - entity.yRotO) * a;
    const br = entity.getBrightness(a);
    glColor4f2(br, br, br, 1);
    this.renderAt(
      entity,
      x - EntityRenderDispatcher.xOff,
      y - EntityRenderDispatcher.yOff,
      z - EntityRenderDispatcher.zOff,
      r,
      a,
    );
  }

  renderAt(entity: Entity, x: number, y: number, z: number, rot: number, a: number): void {
    const renderer = this.getRenderer(entity);
    if (renderer !== null) {
      renderer.render(entity, x, y, z, rot, a);
      renderer.postRender(entity, x, y, z, rot, a);
    }
  }

  getRenderer(entity: Entity): EntityRenderer | null {
    let rendererId = entity.entityRendererId;
    if (rendererId === EntityRendererId.ER_QUERY_RENDERER)
      rendererId = entity.queryEntityRenderer();
    return this.getRendererById(rendererId);
  }

  getRendererById(rendererId: number): EntityRenderer | null {
    return this._renderers.get(rendererId) ?? null;
  }

  setLevel(level: Level | null): void {
    this.level = level;
  }

  setMinecraft(minecraft: Minecraft): void {
    this.minecraft = minecraft;
  }

  distanceToSqr(x: number, y: number, z: number): number {
    const xd = x - this.xPlayer;
    const yd = y - this.yPlayer;
    const zd = z - this.zPlayer;
    return xd * xd + yd * yd + zd * zd;
  }

  getFont(): Font | null {
    return this._font;
  }

  onGraphicsReset(): void {
    for (const r of this._renderers.values()) r.onGraphicsReset();
  }

  /* EntityRenderDispatcher.cpp:140 */
  setModernSkin(player: Entity): void {
    // C++ 的 `(PlayerRenderer*)getRenderer(player)` 不安全强转：只在玩家实体上调用
    //（玩家恒映射到 PlayerRenderer），照抄这个"假定类型正确"的写法
    const rend = this.getRenderer(player) as PlayerRenderer;
    rend.setModernSkin(player as Mob);
  }

  private assign(id: number, renderer: EntityRenderer): void {
    if (!this._renderers.has(id)) this._renderers.set(id, renderer); // std::map::insert 不覆盖
  }
}
