// ユーザーのコードと ps88.save() / ps88.load() のデータを永続化する key-value ストア。
// localStorage は文字列しか保存できず JSON では Uint8Array が復元できないため、
// 値をそのままの型で保存できる IndexedDB (structured clone) を使う

const DB_NAME = "ps88web";
const DB_VERSION = 1;
const STORE_NAME = "keyValue";

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

let dbPromise: Promise<IDBDatabase> | undefined;
const getDB = () => (dbPromise ??= openDB());

const request = <T>(
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> =>
  getDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = run(
          db.transaction(STORE_NAME, mode).objectStore(STORE_NAME),
        );
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );

/**
 * 保存されている値を読み込む
 *
 * @returns 保存されていない場合と読み込みに失敗した場合は null
 */
export const load = async <T>(key: string): Promise<T | null> => {
  try {
    const stored = await request<T | undefined>("readonly", (objectStore) =>
      objectStore.get(key),
    );
    return stored ?? null;
  } catch (e) {
    console.error(e);
    return null;
  }
};

// 書き込み中に来た値はキーごとに最新のものだけを保持し、完了後にまとめて書く。
// ps88.save() のように高頻度で呼ばれてもトランザクションが積み上がらないようにする
// (undefined も有効な値のため、box に入れて有無を区別する)
const pending = new Map<string, { value: unknown }>();
let isFlushing = false;

const flush = async () => {
  try {
    while (pending.size > 0) {
      const entries = [...pending];
      pending.clear();
      for (const [key, boxed] of entries) {
        if (boxed.value == undefined) {
          await request("readwrite", (objectStore) => objectStore.delete(key));
        } else {
          await request("readwrite", (objectStore) =>
            objectStore.put(boxed.value, key),
          );
        }
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    // while を抜けるのと同じタイミングでフラグを下ろす。
    // Promise の then や finally に置くとマイクロタスクまで下がらず、
    // その間に来た store() が pending に積まれたまま書き込まれない
    isFlushing = false;
  }
};

/** 値を保存する (書き込みの完了は待たない。null と undefined は削除を意味する) */
export const store = (key: string, value: unknown) => {
  pending.set(key, { value });
  if (isFlushing) {
    return;
  }
  isFlushing = true;
  void flush();
};
