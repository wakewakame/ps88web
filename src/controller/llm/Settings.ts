import type { Api, Model } from "@earendil-works/pi-ai";
import * as Storage from "../Storage.ts";
import { DEFAULT_PROVIDER, findProvider } from "./Providers.ts";
import type { Connection } from "./ModelList.ts";

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

/**
 * 保持している状態
 *
 * 設定と「読み込みが終わったか」は同時にしか変わらないため、ひとつにまとめる。
 * 別々に持つと、購読する側が中途半端な組み合わせを気にすることになる
 */
export type State = {
  settings: Settings;
  /** 読み込みが終わっているか (終わるまで「未設定」と判断しないために使う) */
  loaded: boolean;
};

// useSyncExternalStore は参照の同一性で変化を判定するため、内容が変わった
// ときだけ作り直す。読み出しのたびに作ると再 render が止まらなくなる
let state: State = { settings: defaultSettings(), loaded: false };

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

export const getState = (): State => state;

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const set = (next: Settings) => {
  const settings = recordCurrent(next);
  state = { ...state, settings };
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
export const selectProvider = (id: string) =>
  set(withProvider(state.settings, id));

let loadPromise: Promise<void> | undefined;

/** 保存された設定の読み込み (二重に読み込まない) */
export const load = (): Promise<void> =>
  (loadPromise ??= (async () => {
    const stored = await Storage.load<StoredSettings>(SETTINGS_STORAGE_KEY);
    const settings =
      stored != null && !edited
        ? { ...defaultSettings(), ...stored, apiKey: stored.apiKey ?? "" }
        : state.settings;
    state = { settings, loaded: true };
    notify();
  })());

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

/** モデルの一覧を引くための接続情報を作る */
export const toConnection = (settings: Settings): Connection => ({
  protocol: findProvider(settings.providerId).protocol,
  baseURL: settings.baseURL,
  apiKey: settings.apiKey,
});

/**
 * 出力の上限
 *
 * Anthropic は必須のため何かを入れる必要がある。OpenAI 互換の側へは送らず、
 * 接続先の既定に任せる (モデルごとの上限が分からないまま大きな値を送ると、
 * 上限の小さいモデルで弾かれるため)
 */
const MAX_TOKENS = 16000;

/**
 * 入力の上限
 *
 * 接続先から取れないため、当たり障りのない値を置く。会話をこの長さで
 * 打ち切る処理は入れていないので、ここが実際の動きを変えることはない
 */
const CONTEXT_WINDOW = 128000;

/**
 * 設定から、pi-ai に渡すモデルを作る
 *
 * pi-ai は本来モデルの一覧を持っていて、そこから選ぶ作りになっている。
 * ここでは接続先から取った名前をユーザーが選ぶため、選ばれたものを毎回
 * 組み立てて渡す。値段やコンテキスト長は接続先から取れないので、既定を置く
 */
export const toModel = (settings: Settings): Model<Api> => {
  const provider = findProvider(settings.providerId);
  return {
    id: settings.model,
    name: settings.model,
    api: provider.protocol,
    // Chat.ts が登録している接続先の識別子と同じ名前にそろえてある
    provider: provider.protocol,
    baseUrl: settings.baseURL,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: CONTEXT_WINDOW,
    maxTokens: MAX_TOKENS,
    compat: provider.compat,
  };
};
