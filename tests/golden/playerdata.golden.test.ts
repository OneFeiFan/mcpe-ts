import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { VirtualFS, setVfs } from '@mcpe/platform';
import { ExternalFileLevelStorage, LevelData, PLAYER_DATA_LAYOUT } from '@mcpe/world';

// G14-3：player.dat 的裸结构体转储逐字段比对。
// 夹具由 tools/golden/harness_playerdata.cpp 用参考 C++ 的 readPlayerData 生成，禁止手改。
//
// 这个格式的字节布局取决于编译器的字段顺序与对齐填充，所以夹具里记了**量出来的**
// sizeof 与各字段偏移，下面第一条用例拿它跟 TS 里硬编码的那组数字逐项核对。
interface Case {
  name: string;
  header: { version: number; size: number };
  payloadLen: number;
  bytes: string;
  ret: number;
  version: number;
  got: {
    pos: [number, number, number];
    motion: [number, number, number];
    xRot: number;
    yRot: number;
    fallDistance: number;
    onFire: number;
    airSupply: number;
    onGround: number;
    inventorySlots: number[];
  };
}
interface Fixture {
  layout: Record<string, number>;
  cases: Case[];
}

const fixture = JSON.parse(
  readFileSync(new URL('../../fixtures/golden/playerdata.json', import.meta.url), 'utf8'),
) as Fixture;

const bytesOf = (h: string): Uint8Array =>
  new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));

const DIR = '/w';
const DAT = DIR + '/player.dat';

function freshVfs(): VirtualFS {
  const vfs = new VirtualFS();
  vfs.mkdir(DIR);
  setVfs(vfs);
  return vfs;
}

/** 按用例的头 + 载荷造一个 player.dat。载荷长度用 payloadLen（truncated 用例比 sizeof 短）。 */
function writeCase(vfs: VirtualFS, c: Case): void {
  const head = new Uint8Array(8);
  const dv = new DataView(head.buffer);
  dv.setInt32(0, c.header.version, true);
  dv.setInt32(4, c.header.size, true);

  const f = vfs.open(DAT, 'wb')!;
  f.write(head, 1, 8);
  const payload = bytesOf(c.bytes);
  if (payload.length > 0) f.write(payload, 1, payload.length);
  f.close();
}

afterEach(() => {
  setVfs(null); // 模块级状态，用例之间必须清掉
});

describe('golden/G14-3 player.dat 裸结构体转储', () => {
  it('参考编译器量出来的 sizeof 与各字段偏移，与 TS 里硬编码的一致', () => {
    // 这条是整个文件的地基：下面所有用例都是按这些偏移去解码的。
    // 布局一旦变了（换编译器、改结构体），这里先红，而不是等到字段读错位才发现。
    const L = PLAYER_DATA_LAYOUT;
    expect(fixture.layout.sizeof).toBe(L.sizeOf);
    expect(fixture.layout.maxSelectionSize).toBe(L.maxSelectionSize);
    expect(fixture.layout.pos).toBe(L.pos);
    expect(fixture.layout.motion).toBe(L.motion);
    expect(fixture.layout.xRot).toBe(L.xRot);
    expect(fixture.layout.yRot).toBe(L.yRot);
    expect(fixture.layout.fallDistance).toBe(L.fallDistance);
    expect(fixture.layout.onFire).toBe(L.onFire);
    expect(fixture.layout.airSupply).toBe(L.airSupply);
    expect(fixture.layout.onGround).toBe(L.onGround);
    expect(fixture.layout.inventorySlots).toBe(L.inventorySlots);
  });

  for (const c of fixture.cases) {
    it(`用例 ${c.name}：与参考 C++ 的读回结果一致`, () => {
      const vfs = freshVfs();
      // missing 用例测的是 fopen 失败那条路，**不能**先把文件造出来
      if (c.name !== 'missing') writeCase(vfs, c);

      const dest = new LevelData();
      const ret = ExternalFileLevelStorage.readPlayerData(DAT, dest);

      expect(ret).toBe(c.ret === 1);
      expect(dest.playerDataVersion).toBe(c.version);

      const got = dest.playerData;
      expect([got.pos.x, got.pos.y, got.pos.z]).toEqual(c.got.pos);
      expect([got.motion.x, got.motion.y, got.motion.z]).toEqual(c.got.motion);
      expect(got.xRot).toBe(c.got.xRot);
      expect(got.yRot).toBe(c.got.yRot);
      expect(got.fallDistance).toBe(c.got.fallDistance);
      expect(got.onFire).toBe(c.got.onFire);
      expect(got.airSupply).toBe(c.got.airSupply);
      expect(got.onGround).toBe(c.got.onGround === 1);
      expect([...got.inventorySlots]).toEqual(c.got.inventorySlots);
    });
  }
});
