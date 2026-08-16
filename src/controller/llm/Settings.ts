import * as Storage from "../Storage.ts";
import { DEFAULT_PROVIDER, findProvider } from "./Providers.ts";
import type { Connection } from "./Client.ts";

const SETTINGS_STORAGE_KEY = "llm";

/** 接続先ごとに覚えておく入力内容 */
export type ProviderSettings = {
  baseURL: string;
  model: string;
  apiKey: string;
};

export type Settings = ProviderSettings & {
  /** Providers.ts の id */
  providerId: string;
  /**
   * API キーをこのブラウザに保存するか
   *
   * 保存すると次回から入力が要らないが、XSS などでキーを盗まれる余地が残る。
   * 共用の端末で使う人のために、保存しない選択肢も用意する
   */
  rememberApiKey: boolean;
  /**
   * 接続先ごとの入力内容
   *
   * キーは接続先ごとに別物なので、切り替えたら現在の入力からは消す必要がある。
   * ただし捨ててしまうと、少し見に行って戻っただけで入れ直しになる。
   * ここに退避しておき、戻ってきたときに復元する
   */
  saved: Record<string, ProviderSettings>;
};

// 保存する内容 (キーを保存しない設定のときは apiKey を落とす)
type StoredSettings = Omit<Settings, "apiKey"> & { apiKey?: string };

export const defaultSettings = (): Settings => ({
  providerId: DEFAULT_PROVIDER.id,
  baseURL: DEFAULT_PROVIDER.baseURL,
  model: DEFAULT_PROVIDER.model,
  apiKey: "",
  rememberApiKey: true,
  saved: {},
});

/** 現在の入力内容を、いまの接続先のものとして控える */
export const recordCurrent = (settings: Settings): Settings => ({
  ...settings,
  saved: {
    ...settings.saved,
    [settings.providerId]: {
      baseURL: settings.baseURL,
      model: settings.model,
      apiKey: settings.apiKey,
    },
  },
});

/**
 * 接続先を切り替えた設定を返す
 *
 * 以前その接続先に入力した内容があれば戻し、無ければ既定値から始める
 */
export const withProvider = (settings: Settings, id: string): Settings => {
  if (settings.providerId === id) {
    return settings;
  }
  // 切り替える前に、いまの入力内容を控えておく
  const recorded = recordCurrent(settings);
  const provider = findProvider(id);
  const saved = recorded.saved[id];
  return {
    ...recorded,
    providerId: id,
    baseURL: saved?.baseURL ?? provider.baseURL,
    model: saved?.model ?? provider.model,
    apiKey: saved?.apiKey ?? "",
  };
};

let settings = defaultSettings();
let loaded = false;
// 読み込みより先にユーザーが触ったか。
// 読み込みは非同期のため、先に入力されたものを保存内容で上書きしてしまうと、
// 打ち込んだキーが消える
let edited = false;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const get = () => settings;

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const set = (next: Settings) => {
  settings = recordCurrent(next);
  edited = true;
  notify();

  const stored: StoredSettings = { ...settings };
  if (!settings.rememberApiKey) {
    // 保存しない設定に変えたときは、以前保存したキーも残らないようにする
    delete stored.apiKey;
    stored.saved = Object.fromEntries(
      Object.entries(settings.saved).map(([id, saved]) => [
        id,
        { ...saved, apiKey: "" },
      ]),
    );
  }
  Storage.store(SETTINGS_STORAGE_KEY, stored);
};

/** 接続先の切り替え */
export const selectProvider = (id: string) => set(withProvider(settings, id));

let loadPromise: Promise<void> | undefined;

/** 保存された設定の読み込み (二重に読み込まない) */
export const load = (): Promise<void> =>
  (loadPromise ??= (async () => {
    const stored = await Storage.load<StoredSettings>(SETTINGS_STORAGE_KEY);
    if (stored != null && !edited) {
      settings = {
        ...defaultSettings(),
        ...stored,
        apiKey: stored.apiKey ?? "",
      };
    }
    loaded = true;
    notify();
  })());

/** 読み込みが終わっているか (終わるまで「未設定」と判断しないために使う) */
export const isLoaded = () => loaded;

/** 設定が使える状態か (接続先とモデルが揃っているか) */
export const isReady = (settings: Settings): boolean => {
  const provider = findProvider(settings.providerId);
  const needsApiKey = provider.apiKeyURL !== "";
  return (
    settings.baseURL !== "" &&
    settings.model !== "" &&
    (!needsApiKey || settings.apiKey !== "")
  );
};

/** 設定から接続情報を作る */
export const toConnection = (settings: Settings): Connection => ({
  protocol: findProvider(settings.providerId).protocol,
  baseURL: settings.baseURL,
  apiKey: settings.apiKey,
  model: settings.model,
});
