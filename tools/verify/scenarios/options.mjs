// B9c 场景：选项存得住 —— 改一个选项、**刷新页面**，它还在。
//
// 为什么用用户名当试金石：它有三个好处 ——
//   ① 是字符串（数字选项被 parseInt/parseFloat 一过，读错也看着差不多）；
//   ② 起始菜单左上角就画着 `Username: <它>`，改没改一眼看得见（有截图）；
//   ③ 每次启动 `Minecraft::init` 都会 options.load() + reloadOptions()，所以开局就有一份文件。
//
// 【为什么要手动调一次 options.save()】参考 C++ 里 `Options::save` 只在四个地方被调：
//   `Minecraft::init`（经 reloadOptions）、`OptionsScreen` 两处、`UsernameScreen` 一处。
//   后三个界面都还没移植，而且 `Minecraft::optionUpdated` 本身**不存盘** ——
//   所以照着 C++ 移植的话，改完选项是不会自动落的。这里显式调一次，
//   测的是"存下去 → 刷新 → 读回来"这条链本身。
//
// 【h.state 的 fn 只能写字面量】它会被 toString() 后在页面里重新求值，闭包全丢。
// 所以 OptionId.OPTIONS_USERNAME = 8 直接写死。
const PROBE_NAME = 'XiaoMing';
const OPTIONS_PATH = '/options.txt';

export default async function (h) {
  h.allowConsole('Missing category for tile');

  await h.wait(1500);

  // ---- 开局：起始菜单画着默认用户名，options.txt 已经写出来了 ----
  const s0 = await h.state('开局', (a) => ({
    screen: a.screen && a.screen.constructor.name,
    username: a.screen.username,
    exists: window.__vfs.exists('/options.txt'),
    text: (() => {
      const f = window.__vfs.open('/options.txt', 'rb');
      if (f === null) return null;
      f.seek(0, 2);
      const n = f.tell();
      f.seek(0, 0);
      const buf = new Uint8Array(n);
      if (n > 0) f.read(buf, 1, n);
      f.close();
      return new TextDecoder().decode(buf);
    })(),
  }));
  h.expect(s0.screen === 'TouchStartMenuScreen', '打开页面是起始菜单');
  h.expect(s0.exists === true, 'options.txt 已经写出来了（启动时 reloadOptions 存的）');
  h.expect((s0.text || '').includes('options.username:'), '文件里有一行 options.username:');
  // 每一行都以 \n 结尾 —— 最后一行也补，是 OptionsFile::save 的原样
  h.expect((s0.text || '').endsWith('\n'), '文件以换行结尾（每行都补 \\n，最后一行也是）');
  await h.shot('01-开局-默认用户名');

  // ---- 改一个选项并显式存盘 ----
  const s1 = await h.state('改成 XiaoMing 并存盘', async (a) => {
    a.options.set(8, 'XiaoMing'); // 8 = OptionId.OPTIONS_USERNAME
    a.options.save();
    await window.__vfs.flush(); // 防抖 200ms，这里强制落进 IndexedDB
    const f = window.__vfs.open('/options.txt', 'rb');
    f.seek(0, 2);
    const n = f.tell();
    f.seek(0, 0);
    const buf = new Uint8Array(n);
    f.read(buf, 1, n);
    f.close();
    const text = new TextDecoder().decode(buf);
    return {
      value: a.options.getStringValue(8),
      line: text.split('\n').find((l) => l.indexOf('options.username:') === 0) || null,
      lines: text.split('\n').length - 1, // 结尾那个空段不算
    };
  });
  h.expect(s1.value === PROBE_NAME, '内存里的用户名改了');
  h.expect(s1.line === 'options.username:' + PROBE_NAME, `文件里那行也改了（实际 ${s1.line}）`);

  // ---- 真的刷新页面 ----
  await h.page.reload({ waitUntil: 'load' });
  await h.page.waitForFunction(() => globalThis.__app !== undefined, null, { timeout: 60_000 });
  await h.wait(1500);

  const s2 = await h.state('刷新之后', (a) => ({
    username: a.screen.username,
    value: a.options.getStringValue(8),
  }));
  h.expect(s2.value === PROBE_NAME, '刷新之后选项读回来了（走的是 options.txt → VFS → IndexedDB）');
  h.expect(
    s2.username === 'Username: ' + PROBE_NAME,
    `起始菜单左上角画的就是新名字（实际「${s2.username}」）`,
  );
  await h.shot('02-刷新后-用户名还在');
}
