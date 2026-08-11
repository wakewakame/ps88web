import type * as Types from "./AudioControllerTypes.ts";

// worker 側の ps88.save() / ps88.load() が読み書きするデータの永続化。
// localStorage は文字列しか保存できず JSON では Uint8Array が復元できないため、
// 値をそのままの型で保存できる IndexedDB (structured clone) を使う

const DB_NAME = "ps88web";
const DB_VERSION = 1;
const STORE_NAME = "processor";
const SAVE_KEY = "save";

const openDB = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

let dbPromise: Promise<IDBDatabase> | undefined;
const getDB = () => (dbPromise ??= openDB());

const request = <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
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

/** 保存されているデータを読み込む */
export const loadSaveData = async (): Promise<Types.SaveData> => {
  try {
    const stored: Types.SaveData = await request("readonly", (store) =>
      store.get(SAVE_KEY),
    );
    // 保存されていない場合は undefined が返るため null に寄せる
    return stored ?? null;
  } catch (e) {
    console.error(e);
    return null;
  }
};

// 書き込み中に来た値は最新のものだけを保持し、完了後にまとめて書く。
// ps88.save() が高頻度で呼ばれてもトランザクションが積み上がらないようにする
// (SaveData は undefined も有効な値のため、box に入れて有無を区別する)
let pendingSave: { data: Types.SaveData } | undefined;
let isSaving = false;

/** データを保存する (書き込みの完了は待たない) */
export const storeSaveData = (data: Types.SaveData) => {
  pendingSave = { data };
  if (isSaving) {
    return;
  }
  isSaving = true;
  void (async () => {
    try {
      while (pendingSave != undefined) {
        const next = pendingSave.data;
        pendingSave = undefined;
        if (next == undefined) {
          await request("readwrite", (store) => store.delete(SAVE_KEY));
        } else {
          await request("readwrite", (store) => store.put(next, SAVE_KEY));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      isSaving = false;
    }
  })();
};
