import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AppPlatform,
  GLES1,
  glSetContext,
  Minecraft,
  NinecraftApp,
  TextureData,
} from '@mcpe/client';
import { VirtualFS, setVfs } from '@mcpe/platform';
import { OptionId } from '../../../packages/client/src/Options';
import { PauseScreen } from '../../../packages/client/src/gui/screens/PauseScreen';
import { TouchStartMenuScreen } from '../../../packages/client/src/gui/screens/TouchStartMenuScreen';

// Minecraft::leaveGame（B8f）：把当前世界整个扔掉、退回起始菜单。
//
// 前半段用真 app（NinecraftApp + VirtualFS + 真的 ExternalFileLevelStorage）跑 ——
// leaveGame 的价值全在"拆世界之前先把改动落盘"这一步上，用替身测不出东西来。
// 后半段是暂停界面的接线，用替身就够了。

class FakePlatform extends AppPlatform {
  override loadTexture(name: string): TextureData {
    const t = new TextureData();
    if (!['terrain.png', 'misc/grasscolor.png', 'misc/foliagecolor.png'].includes(name)) return t;
    t.w = 256;
    t.h = 256;
    t.data = new Uint8Array(256 * 256 * 4).fill(200);
    return t;
  }
}

const WORLD_DIR = '/games/com.mojang/minecraftWorlds/demo';

let app: NinecraftApp;
let vfs: VirtualFS;

/** 拆过之后重新进同一个 demo 世界（startDemoWorld 是公开的，走的还是那条真存档路） */
function reenterWorld(): void {
  app.startDemoWorld();
  app.tick(0, 0);
}

beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vfs = new VirtualFS();
  setVfs(vfs);
  glSetContext(new GLES1(null));
  app = new NinecraftApp();
  app.init({ platform: new FakePlatform(), doRender: true });
  app.setSize(854, 480);
  // B8g 起启动入口是起始菜单，不再自动进世界 —— 这里显式走一遍。
  app.startDemoWorld();
  app.tick(0, 0); // 首个 tick 触发 _levelGenerated：建玩家
});

describe('client/Minecraft.leaveGame', () => {
  it('退出前先把改动落盘：退出去再进来，方块还在', () => {
    const level = app.level!;
    const px = Math.floor(app.player!.x);
    const pz = Math.floor(app.player!.z);
    const py = Math.floor(app.player!.y); // 玩家脚下那一格是空气，正好拿来砌
    expect(level.getTile(px, py, pz), '动手之前那儿是空的').toBe(0);

    level.setTile(px, py, pz, 1); // Tile.stone
    expect(level.getTile(px, py, pz)).toBe(1);

    app.leaveGame();
    reenterWorld();

    expect(
      app.level!.getTile(px, py, pz),
      'leaveGame 里那句 saveAll(true) 没生效的话，这里会变回空气',
    ).toBe(1);
  });

  it('世界、玩家、镜头目标全清空，_running 关掉，界面退回起始菜单', () => {
    const mc = app as unknown as { _running: boolean };
    app.level!.setTile(
      Math.floor(app.player!.x),
      Math.floor(app.player!.y),
      Math.floor(app.player!.z),
      1,
    );
    app.leaveGame();

    expect(app.level).toBeNull();
    expect(app.player).toBeNull();
    expect(app.cameraTargetPlayer).toBeNull();
    expect(mc._running).toBe(false);
    expect(app.screen).toBeInstanceOf(TouchStartMenuScreen);

    reenterWorld(); // 后面的用例还要用世界
  });

  it('拆世界顺手把 levelRenderer 上的世界也摘掉（不然还挂在那儿画旧世界）', () => {
    // levelRenderer.level 是 private，走它给测试开的那个口子（同 s9.test.ts）
    expect(app.levelRenderer!._statsForTest().level).toBe(app.level);
    app.leaveGame();
    expect(app.levelRenderer!._statsForTest().level).toBeNull();
    reenterWorld();
  });

  it('正在生成世界时直接返回，什么都不动', () => {
    const before = app.level;
    (app as unknown as { isGeneratingLevel: boolean }).isGeneratingLevel = true;
    app.leaveGame();
    expect(app.level, 'isGeneratingLevel 时不能拆').toBe(before);
    (app as unknown as { isGeneratingLevel: boolean }).isGeneratingLevel = false;
  });

  it('还没收到"世界生成完毕"信号时也直接返回', () => {
    const before = app.level;
    (
      app as unknown as { _hasSignaledGeneratingLevelFinished: boolean }
    )._hasSignaledGeneratingLevelFinished = false;
    app.leaveGame();
    expect(app.level).toBe(before);
    (
      app as unknown as { _hasSignaledGeneratingLevelFinished: boolean }
    )._hasSignaledGeneratingLevelFinished = true;
  });

  it('renameLevel = true（联机那条路）不切界面 —— RenameMPLevelScreen 没移植', () => {
    const screenBefore = app.screen;
    app.leaveGame(true);
    expect(app.level).toBeNull();
    expect(app.screen, '那条分支是 DEFERRED(Gui)，界面保持原样').toBe(screenBefore);
    reenterWorld();
  });

  it('退出之后存档文件还在（level.dat / chunks.dat 都没被删）', () => {
    app.leaveGame();
    expect(vfs.exists(`${WORLD_DIR}/level.dat`)).toBe(true);
    expect(vfs.exists(`${WORLD_DIR}/chunks.dat`)).toBe(true);
    reenterWorld();
  });
});

describe('client/PauseScreen 的 "Quit to title"', () => {
  function makePause(menuStyle = 0): {
    screen: PauseScreen;
    leaveGame: ReturnType<typeof vi.fn>;
    setScreen: ReturnType<typeof vi.fn>;
    buttons: { id: number; msg: string }[];
  } {
    const leaveGame = vi.fn();
    const setScreen = vi.fn();
    const mc = {
      width: 854,
      height: 480,
      options: {
        getIntValue: (id: number) => (id === OptionId.OPTIONS_MENU_STYLE ? menuStyle : 0),
        getBooleanValue: () => false, // OptionButton.updateImage 要它
      },
      raknetInstance: null, // 网页单机版恒为 null —— "退出并复制地图"那个按钮因此不存在
      leaveGame,
      setScreen,
    } as unknown as Minecraft;
    const screen = new PauseScreen(false);
    screen.init(mc, 854, 480);
    return {
      screen,
      leaveGame,
      setScreen,
      buttons: (screen as unknown as { buttons: { id: number; msg: string }[] }).buttons,
    };
  }

  const click = (screen: PauseScreen, button: unknown) =>
    (screen as unknown as { buttonClicked(b: unknown): void }).buttonClicked.call(screen, button);

  it('单机版只有 4 个按钮（"退出并复制地图"/"服务器可见"都不加）', () => {
    expect(makePause().buttons.map((b) => b.msg)).toEqual([
      'Back to game',
      'Quit to title',
      'Options',
      '',
    ]);
  });

  it('点 "Quit to title" 调 minecraft.leaveGame()，无参', () => {
    const { screen, leaveGame, setScreen, buttons } = makePause();
    const quit = buttons.find((b) => b.msg === 'Quit to title')!;
    click(screen, quit);
    expect(leaveGame).toHaveBeenCalledTimes(1);
    expect(leaveGame).toHaveBeenCalledWith();
    expect(setScreen, '切界面是 leaveGame 自己干的活，界面这边不再插手').not.toHaveBeenCalled();
  });

  it('点 "Back to game" 只是关掉界面，不碰世界', () => {
    const { screen, leaveGame, setScreen, buttons } = makePause();
    click(
      screen,
      buttons.find((b) => b.msg === 'Back to game')!,
    );
    expect(setScreen).toHaveBeenCalledWith(null);
    expect(leaveGame).not.toHaveBeenCalled();
  });

  it('"Quit and copy map"（rake 里造出来的那个按钮）调的是 leaveGame(true)', () => {
    const { screen, leaveGame } = makePause();
    const saveLocal = (screen as unknown as { bQuitAndSaveLocally: { id: number } })
      .bQuitAndSaveLocally;
    click(screen, saveLocal);
    expect(leaveGame).toHaveBeenCalledWith(true);
  });

  it('经典菜单风格（style 2）下按钮文字与 C++ 一致，接线不变', () => {
    const { screen, leaveGame, buttons } = makePause(2);
    expect(buttons.map((b) => b.msg)).toEqual([
      'Back to game',
      'Save and quit to title',
      'Options...',
      '',
    ]);
    click(
      screen,
      buttons.find((b) => b.msg === 'Save and quit to title')!,
    );
    expect(leaveGame).toHaveBeenCalledWith();
  });
});
