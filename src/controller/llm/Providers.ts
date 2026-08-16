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

/** リクエストとレスポンスの形式 */
export type Protocol = "anthropic" | "openai";

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
};

// 使っている人が多いと思われる順に並べる。探す手間が一番少なくなるため
export const PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "ChatGPT (OpenAI)",
    protocol: "openai",
    baseURL: "https://api.openai.com/v1",
    model: "",
    apiKeyURL: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    name: "Gemini (Google)",
    protocol: "openai",
    // Google が用意している OpenAI 互換の窓口。
    // 独自形式の API もあるが、こちらなら OpenAI 用の実装をそのまま使える
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "",
    apiKeyURL: "https://aistudio.google.com/apikey",
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    protocol: "anthropic",
    baseURL: "https://api.anthropic.com",
    model: "claude-opus-5",
    apiKeyURL: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    protocol: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    model: "",
    apiKeyURL: "https://openrouter.ai/keys",
    note: "1 つのキーで複数社のモデルを選べます",
  },
  {
    id: "local",
    name: "ローカル (Ollama など)",
    protocol: "openai",
    baseURL: "http://localhost:11434/v1",
    model: "",
    apiKeyURL: "",
    note: "OpenAI 互換の API を持つローカルのサーバーに接続します",
  },
  {
    id: "custom",
    name: "その他 (OpenAI 互換)",
    protocol: "openai",
    baseURL: "",
    model: "",
    apiKeyURL: "",
  },
];

// 何も設定されていないときに選ばれる接続先。
// 一番使われているものを初期値にしたいので、並びの先頭をそのまま使う
export const DEFAULT_PROVIDER = PROVIDERS[0];

/** id から接続先を探す (未知の id は既定の接続先として扱う) */
export const findProvider = (id: string): Provider =>
  PROVIDERS.find((provider) => provider.id === id) ?? DEFAULT_PROVIDER;
