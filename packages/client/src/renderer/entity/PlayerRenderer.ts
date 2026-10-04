/**
 * 1:1 移植自 src/client/renderer/entity/PlayerRenderer.h 与 .cpp（任务单 G 的 G11，全量移植）。
 *
 * 【这一层干什么】玩家专用的类人渲染器，比 HumanoidMobRenderer 多三件玩家专属的事：
 *   1. 两套密度的皮肤模型 —— `playerModel32`（64×32 旧皮肤，默认）与 `playerModel64`（64×64 现代皮肤，
 *      就是构造参数传进来的那个 64×64 模型）。每次画之前按 `isModernPlayerSkin` 的结果二选一
 *      （`setModernSkin`）；`ItemInHandRenderer` 画第一人称手臂前也调它切模型；
 *   2. 四件盔甲模型 `armorParts1` / `armorParts2`（收缩系数 g=1.0 / 0.5），`prepareArmor` 里
 *      按层号摆可见性，并按 `armorFilenames[modelIndex + modelIndex + (layer==2)]` 选盔甲贴图；
 *   3. 睡觉时位置/朝向交给床（`setupPosition` / `setupRotations` 的睡觉分支）。
 *
 * 【ADAPTED(Cpp)】
 * - 析构函数里 delete 四个模型：TS 交给 GC，不写。
 * - `render` 里一段被块注释掉的 LOGI 调试语句（.cpp:85-88），照抄不写。
 * - `renderName` 里 `((Player*)mob)->name`：C++ 的 `name` 声明在 `Entity` 上，TS 里搬到了 `Player`
 *   上（Player.ts:84），所以这里和 C++ 一样写 `(mob as Player).name`。
 * - `prepareArmor` 里 `(ArmorItem*) itemInstance->getItem()`、`render` / `setupPosition` 里的 `(Player*)`
 *   不安全强转：照抄成 `as`（调用点已保证类型，与 C++ 同构）。
 * - `onGraphicsReset` 里 C++ 对四个字段逐一判空（可能已是 nullptr）；TS 里这四个字段恒非空，判空省掉。
 * - `1.0f` / `0.5f` / `32` / `64` 都能被 float 精确表示，直接写数字（包 f() 无意义）。
 *
 * 【数值】渲染第三档（画面），不逐步 fround；只有 `setupPosition` 的三处加法包 `f()`
 *   （与 HumanoidMobRenderer 同款 —— 位置是 float 运算）。`prepareArmor` 的下标是整数运算。
 */
import { type ArmorItem, type Entity, ItemInstance, type Mob, type Player } from '@mcpe/world';
import { HumanoidModel } from '../../model/HumanoidModel';
import { Textures } from '../Textures';
import { glRotatef2 } from '../gles';
import { EntityRenderer } from './EntityRenderer';
import { HumanoidMobRenderer } from './HumanoidMobRenderer';

const f = Math.fround;

/* PlayerRenderer.cpp:7 */
const armorFilenames: string[] = [
  'armor/cloth_1.png',
  'armor/cloth_2.png',
  'armor/chain_1.png',
  'armor/chain_2.png',
  'armor/iron_1.png',
  'armor/iron_2.png',
  'armor/diamond_1.png',
  'armor/diamond_2.png',
  'armor/gold_1.png',
  'armor/gold_2.png',
];

export class PlayerRenderer extends HumanoidMobRenderer {
  private playerModel32: HumanoidModel;
  private playerModel64: HumanoidModel;
  private armorParts1: HumanoidModel;
  private armorParts2: HumanoidModel;

  /* PlayerRenderer.cpp:16 */
  constructor(humanoidModel: HumanoidModel, shadow: number) {
    super(humanoidModel, shadow);
    this.playerModel64 = humanoidModel;
    this.playerModel32 = new HumanoidModel(0, 0, 64, 32);
    this.armorParts1 = new HumanoidModel(1.0, 0, 64, 32);
    this.armorParts2 = new HumanoidModel(0.5, 0, 64, 32);
    // C++ 构造末尾：两个指针都指向 32 皮肤模型（默认旧皮肤，render 时再按需切换）
    this.model = this.playerModel32;
    this.humanoidModel = this.playerModel32;
  }

  /* PlayerRenderer.cpp:38 */
  override setupPosition(mob: Entity, x: number, y: number, z: number): void {
    const player = mob as Player;
    if (player.isAlive() && player.isSleeping()) {
      super.setupPosition(
        mob,
        f(x + player.bedOffsetX),
        f(y + player.bedOffsetY),
        f(z + player.bedOffsetZ),
      );
      return;
    }
    super.setupPosition(mob, x, y, z);
  }

  /* PlayerRenderer.cpp:46 */
  override setupRotations(mob: Entity, bob: number, bodyRot: number, a: number): void {
    const player = mob as Player;
    if (player.isAlive() && player.isSleeping()) {
      glRotatef2(player.getSleepRotation(), 0, 1, 0);
      glRotatef2(this.getFlipDegrees(player), 0, 0, 1);
      glRotatef2(270, 0, 1, 0);
      return;
    }
    super.setupRotations(mob, bob, bodyRot, a);
  }

  /* PlayerRenderer.cpp:57 */
  isModernPlayerSkin(mob: Mob): boolean {
    const texName = mob.getTexture();
    const textures = EntityRenderer.entityRenderDispatcher!.textures!;
    const texId = textures.loadTexture(texName);
    if (!Textures.isTextureIdValid(texId)) return false;
    const texData = textures.getTemporaryTextureData(texId);
    return texData !== null && texData.w === 64 && texData.h === 64;
  }

  /* PlayerRenderer.cpp:66 */
  override renderName(mob: Mob, x: number, y: number, z: number): void {
    const erd = EntityRenderer.entityRenderDispatcher!;
    if (mob !== erd.cameraEntity && mob.level.adventureSettings.showNameTags) {
      this.renderNameTag(mob, (mob as Player).name, x, y, z, 32);
    }
  }

  /* PlayerRenderer.cpp:74 */
  setModernSkin(mob: Mob): void {
    const desired = this.isModernPlayerSkin(mob) ? this.playerModel64 : this.playerModel32;
    if (this.model !== desired || this.humanoidModel !== desired) {
      this.model = desired;
      this.humanoidModel = desired;
    }
  }

  /* PlayerRenderer.cpp:82 */
  override render(entity: Entity, x: number, y: number, z: number, rot: number, a: number): void {
    this.setModernSkin(entity as Mob);
    super.render(entity, x, y, z, rot, a);
  }

  /* PlayerRenderer.cpp:92 */
  override prepareArmor(mob: Mob, layer: number, _a: number): number {
    const player = mob as Player;
    const itemInstance = player.getArmor(layer);
    if (!ItemInstance.isArmorItem(itemInstance)) return -1;
    const armorItem = itemInstance!.getItem() as ArmorItem;
    const fnIndex = armorItem.modelIndex + armorItem.modelIndex + (layer === 2 ? 1 : 0);
    this.bindTexture(armorFilenames[fnIndex]!);
    const armor = layer === 2 ? this.armorParts2 : this.armorParts1;
    armor.head.visible = layer === 0;
    armor.body.visible = layer === 1 || layer === 2;
    armor.arm0.visible = layer === 1;
    armor.arm1.visible = layer === 1;
    armor.leg0.visible = layer === 2 || layer === 3;
    armor.leg1.visible = layer === 2 || layer === 3;
    this.setArmor(armor);
    return 1;
  }

  /* PlayerRenderer.cpp:121 */
  override onGraphicsReset(): void {
    // C++ 里对四个字段逐一判空（构造中途可能为 nullptr）；这里恒非空，直接调
    this.playerModel32.onGraphicsReset();
    this.playerModel64.onGraphicsReset();
    this.armorParts1.onGraphicsReset();
    this.armorParts2.onGraphicsReset();
    super.onGraphicsReset();
  }
}
