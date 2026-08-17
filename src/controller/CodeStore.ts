import * as AudioController from "./audio/AudioController.ts";
import * as Storage from "./Storage.ts";
import defaultProcessorCode from "./audio/Processor?raw";

// ユーザーのコードを保存する key
const CODE_STORAGE_KEY = "code";

// 入力が止まってからビルドするまでの待ち時間
const HOT_RELOAD_DELAY_MS = 1000;

// 保存されたコードの読み込みは非同期なので、それまでの表示
const LOADING_CODE = "// loading...";

// src クエリが指定された場合は、そのURLからコードを読み込む
// この場合はユーザーのコードではないため保存は行わない
const sourceURL = new URLSearchParams(window.location.search).get("src");

/**
 * エディタに表示するコードの保持
 *
 * コードはエディタと AI チャットの両方から書き換わる。React の state に持つと
 * 両者の共通の祖先である App まで持ち上げることになり、1 文字入力するたびに
 * Toolbar / Canvas / Keyboard まで再 render されてしまう。そのため
 * モジュールレベルのストアに置き、必要なコンポーネントだけが購読する。
 *
 * ビルドと保存もここで行う。コードの変更経路が増えても、変更したら必ず
 * ビルドされるという性質を呼び出し側に依存せず保てるようにするため。
 */

let code = LOADING_CODE;

// 読み込みが終わるまでは編集を受け付けない。
// 読み込みは非同期のため、完了前の set をそのまま通すと、保存されたコードが
// 後から上書きして戻してしまう
let loaded = false;

const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

let hotReloadTimeout: number | undefined;

/** 現在のコードを返す */
export const get = () => code;

/** コードの変更を購読する */
export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * コードの変更
 *
 * 変更はすぐに反映されるが、ビルドと保存は入力が止まるまで待つ。
 * 一文字打つ度にビルドすると重いため。
 *
 * @param next - 変更後のコード
 * @param immediate - true ならビルドと保存を待たずに行う (AI の適用など、
 *   連続で呼ばれないことが分かっている場合に指定する)
 */
export const set = (next: string, immediate = false) => {
  if (!loaded || next === code) {
    return;
  }
  code = next;
  notify();
  // ビルドを待たずに消す。編集した時点で、それまでのエラーは
  // いま画面にあるコードのものではなくなっているため
  AudioController.clearError();

  clearTimeout(hotReloadTimeout);
  if (immediate) {
    apply(next);
    return;
  }
  hotReloadTimeout = setTimeout(() => apply(next), HOT_RELOAD_DELAY_MS);
};

const apply = (next: string) => {
  AudioController.build(next);
  if (sourceURL == null) {
    Storage.store(CODE_STORAGE_KEY, next);
  }
};

const loadFromURL = async (url: string): Promise<string> => {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`status ${res.status}`);
    }
    return await res.text();
  } catch (e) {
    console.error(e);
    return "// error: failed to load the code from URL";
  }
};

let loadPromise: Promise<void> | undefined;

/**
 * 初期コードの読み込み (URL or 保存されたコード)
 *
 * 二重に読み込まないよう、Promise 自体をキャッシュする。
 * React の StrictMode では effect が 2 回呼ばれるため。
 */
export const load = (): Promise<void> =>
  (loadPromise ??= (async () => {
    const initial =
      sourceURL != null
        ? await loadFromURL(sourceURL)
        : ((await Storage.load<string>(CODE_STORAGE_KEY)) ??
          defaultProcessorCode);
    code = initial;
    loaded = true;
    notify();
    // 起動時は待つ理由が無いため、デバウンスを挟まずにビルドする
    AudioController.build(initial);
  })());
