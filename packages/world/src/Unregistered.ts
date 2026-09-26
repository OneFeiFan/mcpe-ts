/**
 * ADAPTED(Safety)：未注册的具名方块 / 物品（C++ 里是 NULL）。
 *
 * Tile.xxx、Item.xxx 这些静态字段在 C++ 里初值为 NULL，initTiles / initItems 里 DEFERRED 的那些一直是 NULL，
 * 一旦被访问就是空指针崩溃。TS 里改用这里的哨兵对象：任何属性访问都会抛出一条写明是哪个字段、为什么没注册的错误，
 * 而不是 “Cannot read properties of null (reading 'id')”。失败方式与 C++ 相同（都会中止），只是信息更清楚。
 *
 * 已核对：分支源码里没有任何地方用 “是否为 NULL” 判断具名方块或物品，所以换成哨兵不改变任何行为。
 * 测试或调试时用 isUnregistered(x) 判断，它不会触发哨兵。
 */
// ADAPTED(Safety): 未注册的具名方块/物品用访问即报错的哨兵代替 C++ 的 NULL
const sentinels = new WeakSet<object>();
/** 模块私有的探针：哨兵对它返回 -1，普通对象上不存在（见 idOf） */
const ID_PROBE = Symbol('idOf');

export function unregistered<T extends object>(kind: 'Tile' | 'Item' | 'Biome', name: string): T {
  const where = kind === 'Tile' ? 'Tile.initTiles' : kind === 'Item' ? 'Item.initItems' : 'Biome.initBiomes';
  const proxy = new Proxy(Object.create(null) as object, {
    get(_target, prop) {
      if (prop === ID_PROBE) return -1;
      // 让 await、JSON、控制台打印等工具性访问不抛错
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined;
      throw new Error(`${kind}.${name} 尚未注册（访问了 .${String(prop)}）：${where} 里对应的一行是 DEFERRED，C++ 此处为 NULL`);
    },
  });
  sentinels.add(proxy);
  return proxy as T;
}

/**
 * ADAPTED(Safety)：依赖尚未移植的系统、暂时造不出来的对象（例如 Dimension 里的 BiomeSource）。
 * 与上面的哨兵相同：任何属性访问都抛出写明原因的错误；isUnregistered 对它同样返回 true。
 */
export function notPorted<T extends object>(what: string, reason: string): T {
  const proxy = new Proxy(Object.create(null) as object, {
    get(_target, prop) {
      if (prop === ID_PROBE) return -1;
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined;
      throw new Error(`${what} 尚未移植（访问了 .${String(prop)}）：${reason}`);
    },
  });
  sentinels.add(proxy);
  return proxy as T;
}

export function isUnregistered(x: unknown): boolean {
  return typeof x === 'object' && x !== null && sentinels.has(x);
}

/**
 * ADAPTED(DeferredTile)：只用于“拿方块 id 做比较”的地方，例如 `level.getTile(x, y, z) === idOf(Tile.door_wood)`。
 * 已注册时就是 tile.id；未注册时返回 -1，任何真实方块的 id 都不会等于它——一个还不存在的方块，本来就不可能出现在世界里。
 * 把 id 写进世界（setTile）或读纹理等其他用途，仍然直接写 `.id`、`.tex`，未注册时照常报错。
 */
export function idOf(x: { readonly id: number }): number {
  const probed = (x as unknown as Record<symbol, number | undefined>)[ID_PROBE];
  return probed !== undefined ? probed : x.id;
}
