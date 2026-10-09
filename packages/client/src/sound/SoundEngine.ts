/**
 * 1:1 移植自 src/client/sound/SoundEngine.h 与 SoundEngine.cpp（68 + 258 行）。
 * 部分：`loadLibrary()` 是空的（C++ 网页版里就是 `{}`）；`_pp()` 属 iOS 那份 `.mm`，不移植。
 *
 * 声音系统的门面：把"游戏里发生了什么事"翻译成"放哪段音频、多大声"。
 * 一条链是 **`play` → 音量两件事 → 随机挑变体 → 交给后端 `playAt`**。
 *
 * 【照抄的六处】
 *   1. `update()` **只调 `setListenerAngle`，从来不调 `setListenerPos`** ——
 *      听者永远在原点，而 `play()` 传给后端的是 `x-_x, y-_y, z-_z`（**相对坐标**）。
 *      两边刚好自洽，别"顺手"把 listener 挪到玩家世界坐标上去。
 *   2. `_getVolumeMult` 是 `clamp(1.1f - dist * _invMaxDistance, -1.0f, 1.0f)`，
 *      `_invMaxDistance = 1/maxDistance`（`Minecraft` 传 20）。
 *   3. ⚠ `play()` 里这两句是**死代码**：
 *          float dist = SOUND_DISTANCE;      // = 16
 *          if (volume > 1) dist *= volume;   // volume 上一行刚被 clamp 到 [0,1]，恒假
 *      `dist` 声明之后再没被读过。**真正**生效的 16 格硬剔除在
 *      `LevelRenderer::playSound`（`dd*dd` 和 `distanceToSqr` 比）—— 作者从那边复制过来忘了删。
 *      原样保留 + 注释，别删也别"修"。
 *   4. `enable` / `updateOptions` / `destroy` 在 C++ 里都是**空函数体**，照抄。
 *   5. `playUI` 不做距离衰减，`playAt` 传的坐标是 `(0,0,0)`。
 *   6. 挑变体用的是 `SoundRepository`（内部 `Mth::random`），不是 `sharedRandom`。
 *
 * 【ADAPTED(Web) 两处】
 *   - C++ 的 `init(Minecraft*, Options*)` 从**编译进二进制的 `SA_*` 全局**取数据；
 *     TS 的数据是运行时从 `SoundBank`（`sounds.bin`）取的，所以 `init` 多读一个 bank。
 *   - `SoundSystem soundSystem` 在 C++ 是**按值成员、类型编译期定死**；
 *     TS 靠 `new SoundEngine(20.0f, system)` 注入，默认给一个空实现的基类
 *     （= 原版网页版的行为：一点声音都没有）。
 */
import { Mth } from '@mcpe/util';
import { LOGI } from '@mcpe/platform';
import type { Minecraft } from '../Minecraft';
import type { Options } from '../Options';
import { OptionId } from '../Options';
import { SoundBank } from './SoundBank';
import { SoundRepository } from './SoundRepository';
import { SoundSystem } from './SoundSystem';

const f = Math.fround;

export class SoundEngine {
  /** C++ `static const int SOUND_DISTANCE = 16;` */
  static readonly SOUND_DISTANCE = 16;

  /** C++ `SoundSystem soundSystem;`（按值成员，见文件头 ADAPTED） */
  private readonly soundSystem: SoundSystem;
  private readonly sounds = new SoundRepository();
  /** C++ `Minecraft* mc;` —— 这个类里其实**没读过它**，留着是为了和 C++ 的字段一致 */
  private mc: Minecraft | null = null;
  private options: Options | null = null;
  private idCounter = 0;
  /** C++ `float _x, _y, _z;` */
  private _x = 0;
  private _y = 0;
  private _z = 0;
  /** C++ `float _yRot;` */
  private _yRot = 0;
  /** C++ `float _invMaxDistance;` —— 1/maxDistance */
  private readonly _invMaxDistance: number;
  /** ADAPTED(Web)：C++ 的数据是编译进二进制的，TS 的要运行时从包里取 */
  private bank: SoundBank | null = null;

  /** C++ `SoundEngine(float maxDistance)` */
  constructor(maxDistance: number, soundSystem: SoundSystem = new SoundSystem()) {
    this.soundSystem = soundSystem;
    // C++ 初始化列表：idCounter(0), mc(0), _x(0), _y(0), _z(0), _yRot(0), _invMaxDistance(1/maxDistance)
    this._invMaxDistance = f(f(1.0) / maxDistance);
  }

  /** C++ `void init(Minecraft* mc, Options* options)` */
  init(mc: Minecraft, options: Options, bank: SoundBank | null): void {
    this.mc = mc;
    this.options = options;
    this.bank = bank;

    if (
      options === null ||
      options.getProgressValue(OptionId.OPTIONS_SOUND_VOLUME) !== 0 ||
      options.getProgressValue(OptionId.OPTIONS_MUSIC_VOLUME) !== 0
    ) {
      this.loadLibrary();
    }

    // ↓↓↓ 这 100 条是从 SoundEngine.cpp 的 init 里逐条提取出来的（42 个游戏内名字）
    this.addSound('step.cloth', 'cloth1');
    this.addSound('step.cloth', 'cloth2');
    this.addSound('step.cloth', 'cloth3');
    this.addSound('step.cloth', 'cloth4');
    this.addSound('step.grass', 'grass1');
    this.addSound('step.grass', 'grass2');
    this.addSound('step.grass', 'grass3');
    this.addSound('step.grass', 'grass4');
    this.addSound('step.gravel', 'gravel1');
    this.addSound('step.gravel', 'gravel2');
    this.addSound('step.gravel', 'gravel3');
    this.addSound('step.gravel', 'gravel4');
    this.addSound('step.sand', 'sand1');
    this.addSound('step.sand', 'sand2');
    this.addSound('step.sand', 'sand3');
    this.addSound('step.sand', 'sand4');
    this.addSound('step.stone', 'stone1');
    this.addSound('step.stone', 'stone2');
    this.addSound('step.stone', 'stone3');
    this.addSound('step.stone', 'stone4');
    this.addSound('step.wood', 'wood1');
    this.addSound('step.wood', 'wood2');
    this.addSound('step.wood', 'wood3');
    this.addSound('step.wood', 'wood4');
    this.addSound('random.splash', 'splash');
    this.addSound('random.explode', 'explode');
    this.addSound('random.click', 'click');
    this.addSound('random.door_open', 'door_open');
    this.addSound('random.door_close', 'door_close');
    this.addSound('random.pop', 'pop');
    this.addSound('random.pop2', 'pop2');
    this.addSound('random.hurt', 'hurt');
    this.addSound('random.glass', 'glass1');
    this.addSound('random.glass', 'glass2');
    this.addSound('random.glass', 'glass3');
    this.addSound('mob.sheep', 'sheep1');
    this.addSound('mob.sheep', 'sheep2');
    this.addSound('mob.sheep', 'sheep3');
    this.addSound('mob.pig', 'pig1');
    this.addSound('mob.pig', 'pig2');
    this.addSound('mob.pig', 'pig3');
    this.addSound('mob.pigdeath', 'pigdeath');
    this.addSound('mob.cow', 'cow1');
    this.addSound('mob.cow', 'cow2');
    this.addSound('mob.cow', 'cow3');
    this.addSound('mob.cow', 'cow4');
    this.addSound('mob.cowhurt', 'cowhurt1');
    this.addSound('mob.cowhurt', 'cowhurt2');
    this.addSound('mob.cowhurt', 'cowhurt3');
    this.addSound('mob.chicken', 'chicken2');
    this.addSound('mob.chicken', 'chicken3');
    this.addSound('mob.chickenhurt', 'chickenhurt1');
    this.addSound('mob.chickenhurt', 'chickenhurt2');
    this.addSound('mob.zombie', 'zombie1');
    this.addSound('mob.zombie', 'zombie2');
    this.addSound('mob.zombie', 'zombie3');
    this.addSound('mob.zombiedeath', 'zombiedeath');
    this.addSound('mob.zombiehurt', 'zombiehurt1');
    this.addSound('mob.zombiehurt', 'zombiehurt2');
    this.addSound('mob.skeleton', 'skeleton1');
    this.addSound('mob.skeleton', 'skeleton2');
    this.addSound('mob.skeleton', 'skeleton3');
    this.addSound('mob.skeletonhurt', 'skeletonhurt1');
    this.addSound('mob.skeletonhurt', 'skeletonhurt2');
    this.addSound('mob.skeletonhurt', 'skeletonhurt3');
    this.addSound('mob.skeletonhurt', 'skeletonhurt4');
    this.addSound('mob.spider', 'spider1');
    this.addSound('mob.spider', 'spider2');
    this.addSound('mob.spider', 'spider3');
    this.addSound('mob.spider', 'spider4');
    this.addSound('mob.spiderdeath', 'spiderdeath');
    this.addSound('mob.zombiepig.zpig', 'zpig1');
    this.addSound('mob.zombiepig.zpig', 'zpig2');
    this.addSound('mob.zombiepig.zpig', 'zpig3');
    this.addSound('mob.zombiepig.zpig', 'zpig4');
    this.addSound('mob.zombiepig.zpigangry', 'zpigangry1');
    this.addSound('mob.zombiepig.zpigangry', 'zpigangry2');
    this.addSound('mob.zombiepig.zpigangry', 'zpigangry3');
    this.addSound('mob.zombiepig.zpigangry', 'zpigangry4');
    this.addSound('mob.zombiepig.zpigdeath', 'zpigdeath');
    this.addSound('mob.zombiepig.zpighurt', 'zpighurt1');
    this.addSound('mob.zombiepig.zpighurt', 'zpighurt2');
    this.addSound('damage.fallbig', 'fallbig1');
    this.addSound('damage.fallbig', 'fallbig2');
    this.addSound('damage.fallsmall', 'fallsmall');
    this.addSound('random.bow', 'bow');
    this.addSound('random.bowhit', 'bowhit1');
    this.addSound('random.bowhit', 'bowhit2');
    this.addSound('random.bowhit', 'bowhit3');
    this.addSound('random.bowhit', 'bowhit4');
    this.addSound('mob.creeper', 'creeper1');
    this.addSound('mob.creeper', 'creeper2');
    this.addSound('mob.creeper', 'creeper3');
    this.addSound('mob.creeper', 'creeper4');
    this.addSound('mob.creeperdeath', 'creeperdeath');
    this.addSound('random.eat', 'eat1');
    this.addSound('random.eat', 'eat2');
    this.addSound('random.eat', 'eat3');
    this.addSound('random.burp', 'burp1');
    this.addSound('random.fuse', 'fuse');
  }

  /** C++ `void loadLibrary() {}` —— 网页版构建里就是空的（iOS 那份 .mm 才有实现） */
  private loadLibrary(): void {}

  /** 把"游戏内名字 + 文件名"登记进仓库；包里没有这个文件就记一行日志跳过 */
  private addSound(name: string, fileName: string): void {
    const desc = this.bank?.desc(fileName) ?? null;
    if (desc === null) {
      // C++ 里这些数据是编译进去的、不可能缺；TS 里缺了要能看出来
      LOGI(`SoundEngine: 音源包里没有 ${fileName}（注册名 ${name}）\n`);
      return;
    }
    this.sounds.add(name, desc);
  }

  /** C++ `void enable(bool status)` —— 空函数体 */
  enable(_status: boolean): void {}

  /** C++ `void updateOptions()` —— 空函数体 */
  updateOptions(): void {}

  /** C++ `void destroy()` —— 空函数体 */
  destroy(): void {}

  /** C++ `void update(Mob* player, float a)` */
  update(
    player: {
      xo: number;
      x: number;
      yo: number;
      y: number;
      zo: number;
      z: number;
      yRotO: number;
      yRot: number;
    } | null,
    a: number,
  ): void {
    if (this.options === null || this.options.getProgressValue(OptionId.OPTIONS_SOUND_VOLUME) === 0)
      return;
    if (player === null) return;
    this._x = player.xo + (player.x - player.xo) * a;
    this._y = player.yo + (player.y - player.yo) * a;
    this._z = player.zo + (player.z - player.zo) * a;
    this._yRot = player.yRotO + (player.yRot - player.yRotO) * a;
    // ⚠ 只有角度，没有 setListenerPos（见文件头第 1 条）
    this.soundSystem.setListenerAngle(this._yRot);
  }

  /** C++ `float _getVolumeMult(float x, float y, float z)` */
  _getVolumeMult(x: number, y: number, z: number): number {
    // C++ 整条都是 float 运算，逐步 fround
    const dx = f(x - this._x);
    const dy = f(y - this._y);
    const dz = f(z - this._z);
    const dist = f(Math.sqrt(f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz))));
    // ⚠ 上界是 1.0，所以 dist ≤ 2 格时被夹成正好 1（不是 1.1）
    return Mth.clamp(f(f(1.1) - f(dist * this._invMaxDistance)), -1.0, 1.0);
  }

  /** C++ `void play(const std::string& name, float x, float y, float z, float volume, float pitch)` */
  play(name: string, x: number, y: number, z: number, volume: number, pitch: number): void {
    const options = this.options;
    if (options === null) return;

    volume *= options.getProgressValue(OptionId.OPTIONS_SOUND_VOLUME);
    if (volume <= 0) return;
    volume = Mth.clamp(volume * this._getVolumeMult(x, y, z), 0.0, 1.0);
    if (options.getProgressValue(OptionId.OPTIONS_SOUND_VOLUME) === 0 || volume <= 0) return;

    // ⚠ 这两句是死代码（见文件头第 3 条）：dist 算完从不使用，`volume > 1` 恒假。原样保留。
    let dist = SoundEngine.SOUND_DISTANCE;
    if (volume > 1) dist *= volume;
    void dist;

    const sound = this.sounds.get(name);
    if (sound !== null) {
      this.soundSystem.playAt(sound, x - this._x, y - this._y, z - this._z, volume, pitch);
    }
  }

  /** C++ `void playUI(const std::string& name, float volume, float pitch)` */
  playUI(name: string, volume: number, pitch: number): void {
    const options = this.options;
    if (options === null) return;

    volume *= options.getProgressValue(OptionId.OPTIONS_SOUND_VOLUME);
    if (volume <= 0) return;
    volume = Mth.clamp(volume, 0.0, 1.0);
    if (options.getProgressValue(OptionId.OPTIONS_SOUND_VOLUME) === 0 || volume <= 0) return;

    const sound = this.sounds.get(name);
    if (sound !== null) {
      this.soundSystem.playAt(sound, 0, 0, 0, volume, pitch);
    }
  }

  /** 只给测试和场景用：仓库里登记了多少个游戏内名字 */
  _soundCountForTest(): number {
    return this.sounds._nameCountForTest();
  }

  /** 只给测试和场景用：拿到底层后端 */
  _systemForTest(): SoundSystem {
    return this.soundSystem;
  }
}
