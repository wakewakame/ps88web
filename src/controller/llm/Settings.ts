import * as Storage from "../Storage.ts";
import { createStore } from "../Store.ts";
import {
  DEFAULT_PROVIDER,
  findProvider,
  type Connection,
} from "./Providers.ts";

/**
 * AI の接続設定
 *
 * エンドポイント・モデル・API キーは接続先ごとに別物のため、接続先ごとに
 * 分けて持つ。編集中のものも同じ場所に置き、いま選んでいる接続先が指す
 * 1 件を「編集中の入力」として扱う。
 *
 * こうすると接続先の切り替えは providerId を差し替えるだけになり、前に
 * 入力した内容は何もしなくても残る。少し見に行って戻っただけで入れ直しに
 * なることがない
 */

const STORAGE_KEY = "llm";

// --- 設定の型と操作 -------------------------------------------------------

/** 接続先ごとの入力内容 */
export type ProviderSettings = {
  baseURL: string;
  model: string;
  apiKey: string;
};

export type Settings = {
  /** いま選んでいる接続先 (Providers.ts の id) */
  providerId: string;
  /**
   * API キーをこのブラウザに保存するか
   *
   * 保存すると次回から入力が要らないが、XSS などでキーを盗まれる余地が残る。
   * 共用の端末で使う人のために、保存しない選択肢も用意する
   */
  rememberApiKey: boolean;
  /** 接続先ごとの入力内容 (一度も触っていない接続先は持たない) */
  providers: Record<string, ProviderSettings>;
};

export const defaultSettings = (): Settings => ({
  providerId: DEFAULT_PROVIDER.id,
  rememberApiKey: true,
  providers: {},
});

/**
 * いま選んでいる接続先への入力内容
 *
 * まだ触っていない接続先には入力が無いため、接続先の既定値を返す
 */
export const current = (settings: Settings): ProviderSettings => {
  const provider = findProvider(settings.providerId);
  return (
    settings.providers[settings.providerId] ?? {
      baseURL: provider.baseURL,
      model: provider.model,
      // キーに既定値は無い
      apiKey: "",
    }
  );
};

/** いま選んでいる接続先への入力内容を書き換える */
export const edit = (
  settings: Settings,
  changes: Partial<ProviderSettings>,
): Settings => ({
  ...settings,
  providers: {
    ...settings.providers,
    [settings.providerId]: { ...current(settings), ...changes },
  },
});

/** 設定が使える状態か (接続先とモデルが揃っているか) */
export const isReady = (settings: Settings): boolean => {
  const { baseURL, model, apiKey } = current(settings);
  const needsApiKey = findProvider(settings.providerId).apiKeyURL !== "";
  return baseURL !== "" && model !== "" && (!needsApiKey || apiKey !== "");
};

/** 接続に必要な情報を取り出す */
export const toConnection = (settings: Settings): Connection => {
  const provider = findProvider(settings.providerId);
  const { baseURL, apiKey } = current(settings);
  return {
    protocol: provider.protocol,
    baseURL,
    apiKey,
    compat: provider.compat,
  };
};

// --- 保持と永続化 ---------------------------------------------------------

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

const store = createStore<State>({
  settings: defaultSettings(),
  loaded: false,
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;

/** 保存する形にする (キーを保存しない設定なら、どの接続先の分も落とす) */
const toStored = (settings: Settings): Settings =>
  settings.rememberApiKey
    ? settings
    : {
        ...settings,
        providers: Object.fromEntries(
          Object.entries(settings.providers).map(([id, provider]) => [
            id,
            { ...provider, apiKey: "" },
          ]),
        ),
      };

// 読み込みより先にユーザーが触ったか。
// 読み込みは非同期のため、先に入力されたものを保存内容で上書きしてしまうと、
// 打ち込んだキーが消える
let edited = false;

export const set = (settings: Settings) => {
  edited = true;
  store.update({ settings });
  Storage.store(STORAGE_KEY, toStored(settings));
};

let loadPromise: Promise<void> | undefined;

/** 保存された設定の読み込み (二重に読み込まない) */
export const load = (): Promise<void> =>
  (loadPromise ??= (async () => {
    const stored = await Storage.load<Settings>(STORAGE_KEY);
    // 保存された内容に欠けている項目があっても動くよう、既定値に重ねる
    const settings =
      stored != null && !edited
        ? { ...defaultSettings(), ...stored }
        : store.getSnapshot().settings;
    store.update({ settings, loaded: true });
  })());
