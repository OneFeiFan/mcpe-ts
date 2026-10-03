/**
 * VirtualFS 的浏览器持久层（ADAPTED(Web)，非移植）。
 *
 * 参考 C++ 直接往磁盘写文件；浏览器里能长期存放字节的只有 IndexedDB（OPFS 是另一条路，
 * 但它在 Safari 上的支持面窄）。这里实现 @mcpe/platform 的 VfsBackend 接口，
 * 由 VirtualFS 在启动时 load、在写入后防抖 flush。
 *
 * 为什么放在 apps/web 而不是 packages/platform：platform 包的 tsconfig 是 lib: ["ESNext"]，
 * 没有 DOM，一引用 indexedDB 就类型检查不过；全仓库只有 client 和 apps/web 有 DOM。
 * 这与项目既有做法一致（AssetSource 的接口在 locale 包、实现在 apps/web）。
 *
 * 【为什么不需要在 put 里拷贝字节】IndexedDB 的 put() 在**调用那一刻**就对 value 做结构化克隆
 * （规范如此），所以把 VirtualFS 里那块还在被游戏写的内存交出去是安全的 —— 克隆早就完成了。
 * 这正是 VfsBackend 接口注释里"实现必须立刻拷贝或序列化"的落实方式：交给 IDB 克隆，
 * 而不是自己再多拷一份（区块文件动辄几 MB，白拷一遍代价不小）。
 */
import { LOGW, type VfsBackend, type VfsSnapshot } from '@mcpe/platform';

const DB_NAME = 'mcpe-ts';
const DB_VERSION = 1;
/** 文件：key = 规范化后的绝对路径，value = Uint8Array */
const STORE_FILES = 'files';
/** 元数据：目前只放目录集合（key 固定为 DIRS_KEY） */
const STORE_META = 'meta';
const DIRS_KEY = 'dirs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('打开 IndexedDB 失败'));
    req.onblocked = () => reject(new Error('打开 IndexedDB 被其它标签页挡住（有旧版本连接没关）'));
  });
}

/** 等一个事务真正提交完成；oncomplete 才算数，request 的 onsuccess 只表示请求被接受了 */
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB 事务被中止'));
  });
}

export class IndexedDbBackend implements VfsBackend {
  private db: IDBDatabase | null = null;

  async loadAll(): Promise<VfsSnapshot> {
    const db = await this.connect();
    const files = new Map<string, Uint8Array>();
    const dirs: string[] = [];
    // 事务的 oncomplete 必须在创建它的同一个任务里挂上。若等到 await 完游标再挂，
    // 事务可能已经完成过了，oncomplete 就永远不触发 —— 表现为整个 Promise 挂死。
    return new Promise<VfsSnapshot>((resolve, reject) => {
      const tx = db.transaction([STORE_FILES, STORE_META], 'readonly');
      tx.oncomplete = () => resolve({ files, dirs });
      tx.onerror = () => reject(tx.error ?? new Error('读 IndexedDB 失败'));
      tx.onabort = () => reject(tx.error ?? new Error('读 IndexedDB 被中止'));

      const cursorReq = tx.objectStore(STORE_FILES).openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor === null) return;
        // 库里存的一定是 Uint8Array（只有我们从 put 写入），但同一个库里可能有
        // 别的东西写过，所以还是挡一道
        if (cursor.value instanceof Uint8Array) {
          files.set(String(cursor.key), cursor.value);
        } else {
          LOGW(`IndexedDbBackend: 跳过 ${String(cursor.key)}，存进去的不是字节`);
        }
        cursor.continue();
      };

      const dirsReq = tx.objectStore(STORE_META).get(DIRS_KEY);
      dirsReq.onsuccess = () => {
        const v: unknown = dirsReq.result;
        if (Array.isArray(v)) for (const d of v) if (typeof d === 'string') dirs.push(d);
      };
    });
  }

  async put(path: string, data: Uint8Array): Promise<void> {
    const db = await this.connect();
    const tx = db.transaction(STORE_FILES, 'readwrite');
    // value 在 put() 这一行就被 IDB 结构化克隆了，之后调用方再改这块内存不影响存进去的内容
    tx.objectStore(STORE_FILES).put(data, path);
    await txDone(tx);
  }

  async remove(path: string): Promise<void> {
    const db = await this.connect();
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).delete(path);
    await txDone(tx);
  }

  async setDirs(dirs: string[]): Promise<void> {
    const db = await this.connect();
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put([...dirs], DIRS_KEY);
    await txDone(tx);
  }

  /** 关掉连接；测试里每次用完都要调，否则下一个用例的 open 会被旧连接挡住 */
  close(): void {
    this.db?.close();
    this.db = null;
  }

  private async connect(): Promise<IDBDatabase> {
    if (this.db === null) this.db = await openDb();
    return this.db;
  }
}
