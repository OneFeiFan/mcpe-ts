/**
 * 1:1 移植自 src/client/renderer/entity/EntityRenderDispatcher.h 与 .cpp（S13 阶段 C，部分移植）。
 * 部分：注册了 ER_ITEM_RENDERER（掉落物）与 ER_FALLINGTILE_RENDERER（下落方块，D2.5 补的）；
 *   人形、动物、TNT、箭、玩家、抛射物、画的渲染器要用模型系统或计划外的实体，留 DEFERRED(EntityRender)。
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
    // DEFERRED(EntityRender): ER_HUMANOID、ER_PIG、ER_COW、ER_CHICKEN、ER_SHEEP、ER_SKELETON、ER_ZOMBIE、ER_CREEPER、ER_SPIDER、
    //   ER_TNT、ER_PLAYER、ER_PAINTING 的渲染器（模型系统与这些实体计划外）
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

  // OMIT(EntityRender): setModernSkin(player)（PlayerRenderer，模型系统计划外）

  private assign(id: number, renderer: EntityRenderer): void {
    if (!this._renderers.has(id)) this._renderers.set(id, renderer); // std::map::insert 不覆盖
  }
}
