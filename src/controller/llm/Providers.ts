import type { OpenAICompletionsCompat } from "@earendil-works/pi-ai";
import { t } from "../../i18n";

/**
 * AI の接続先の定義
 *
 * ps88web はサーバーを持たない静的サイトのため、AI の呼び出しはブラウザから
 * 直接行う。費用と利用規約はユーザーのアカウントに乗るので、API キーは
 * ユーザー自身に用意してもらう (BYOK)。
 *
 * プロトコルは Anthropic 形式と OpenAI 互換形式の 2 つだけを実装する。
 * Gemini・OpenRouter・ローカルの Ollama / LM Studio はいずれも OpenAI 互換の
 * 窓口を持っているため、この 2 つでほとんどの接続先を賄える。
 */

/**
 * リクエストとレスポンスの形式
 *
 * 値は pi-ai の API 実装の名前をそのまま使う。ここで独自の名前を付けて
 * 変換を挟んでも、増えるのは対応表だけで得るものが無いため
 */
export type Protocol = "anthropic-messages" | "openai-completions";

export type Provider = {
  /** 設定に保存する識別子 */
  id: string;
  /** 一覧に表示する名前 (ユーザーが知っている呼び名を先に置く) */
  name: string;
  protocol: Protocol;
  /** 既定のエンドポイント (ユーザーが変更できる) */
  baseURL: string;
  /** 既定のモデル (空文字は「一覧から選ぶ」を意味する) */
  model: string;
  /** API キーの取得先。空文字ならキーが不要 (ローカル LLM など) */
  apiKeyURL: string;
  /** 設定画面に出す補足 */
  note?: string;
  /**
   * OpenAI 互換を名乗るサーバー向けの調整
   *
   * pi-ai は baseURL から接続先を推測して既定を決めるが、ローカルや任意の
   * エンドポイントは推測が効かない。素の OpenAI にしか無い項目を送ると
   * 弾く実装があるため、そういう接続先にだけ明示する
   */
  compat?: OpenAICompletionsCompat;
};

// 使っている人が多いと思われる順に並べる。探す手間が一番少なくなるため
export const PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "ChatGPT (OpenAI)",
    protocol: "openai-completions",
    baseURL: "https://api.openai.com/v1",
    model: "",
    apiKeyURL: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    name: "Gemini (Google)",
    protocol: "openai-completions",
    // Google が用意している OpenAI 互換の窓口。
    // 独自形式の API もあるが、こちらなら OpenAI 用の実装をそのまま使える
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "",
    apiKeyURL: "https://aistudio.google.com/apikey",
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    protocol: "anthropic-messages",
    baseURL: "https://api.anthropic.com",
    model: "claude-opus-5",
    apiKeyURL: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "openai-completions",
    baseURL: "https://openrouter.ai/api/v1",
    model: "",
    apiKeyURL: "https://openrouter.ai/keys",
    note: t.providers.openrouterNote,
  },
  {
    id: "local",
    name: t.providers.localName,
    protocol: "openai-completions",
    baseURL: "http://localhost:11434/v1",
    model: "",
    apiKeyURL: "",
    note: t.providers.localNote,
    // Ollama や LM Studio は developer ロールと reasoning_effort を解さない
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
  },
  {
    id: "custom",
    name: t.providers.otherName,
    protocol: "openai-completions",
    baseURL: "",
    model: "",
    apiKeyURL: "",
    // どんなサーバーが来るか分からないため、ローカルと同じく控えめに送る
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
  },
];

// 何も設定されていないときに選ばれる接続先。
// 一番使われているものを初期値にしたいので、並びの先頭をそのまま使う
export const DEFAULT_PROVIDER = PROVIDERS[0];

/** id から接続先を探す (未知の id は既定の接続先として扱う) */
export const findProvider = (id: string): Provider =>
  PROVIDERS.find((provider) => provider.id === id) ?? DEFAULT_PROVIDER;
