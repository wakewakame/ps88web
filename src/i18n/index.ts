import { en } from "./en.ts";
import type { Messages } from "./en.ts";
import { ja } from "./ja.ts";

/**
 * 表示言語の決定
 *
 * 言語を増やすには、訳を書いたファイルを作って下の LOCALES に足すだけでよい。
 * 型は en.ts から導いているため、訳し忘れはコンパイルエラーになる。
 *
 * 起動時に一度だけ決め、あとから切り替えることはしない。切り替えの UI が
 * まだ無いためで、必要になったらここを購読できるストアに変えて、
 * t を参照している箇所を hook 経由にする。
 */

// satisfies を使うのは、キーの一覧を型として保ったまま
// 各値が Messages を満たすことを検査するため
const LOCALES = { en, ja } satisfies Record<string, Messages>;

export type Locale = keyof typeof LOCALES;

// 訳が無い言語はここに落とす。README や API ドキュメントも英語が基準
const FALLBACK: Locale = "en";

const isLocale = (tag: string): tag is Locale => tag in LOCALES;

/**
 * 使う言語を選ぶ
 *
 * lang クエリ → ブラウザの設定 → 英語 の順に見る。
 * クエリを見るのは、切り替えの UI がまだ無いためと、
 * 既にコードの読み込みで src クエリを使っている流儀に合わせるため
 */
const resolveLocale = (): Locale => {
  // テストなど、ブラウザ以外から読み込まれることがある
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return FALLBACK;
  }
  const requested = new URLSearchParams(window.location.search).get("lang");
  const preferred =
    navigator.languages?.length > 0
      ? navigator.languages
      : [navigator.language];
  for (const tag of [requested, ...preferred]) {
    // ja-JP のような地域付きの指定も ja として扱う
    const language = tag?.toLowerCase().split("-")[0];
    if (language != undefined && isLocale(language)) {
      return language;
    }
  }
  return FALLBACK;
};

/** 表示に使っている言語 */
export const locale = resolveLocale();

/** 画面に出す文言 */
export const t = LOCALES[locale];
