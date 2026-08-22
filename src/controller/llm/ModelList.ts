import type { Protocol } from "./Providers.ts";

/**
 * 接続先が持っているモデルの一覧
 *
 * 会話そのものは pi-ai が担当するが、一覧の取得は担当しない (pi-ai が持つ
 * のは、接続先ごとに用意された静的なカタログか、接続先ごとの独自実装のため)。
 * ここは素の fetch のままにしてある。
 *
 * モデル名は増減が激しくアプリ側に埋め込むとすぐ古くなるため、接続先から
 * 取得する。取得できない接続先もあるので、失敗は呼び出し側で扱う
 */

export type Connection = {
  protocol: Protocol;
  baseURL: string;
  apiKey: string;
};

const headers = (conn: Connection): HeadersInit => {
  if (conn.protocol === "anthropic-messages") {
    return {
      "x-api-key": conn.apiKey,
      "anthropic-version": "2023-06-01",
      // ブラウザから直接呼び出すために必要。
      // 通常はキーの漏洩を防ぐため拒否されるが、ここではユーザー自身のキーを
      // ユーザー自身のブラウザからのみ使うため、明示的に許可する
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }
  return { authorization: `Bearer ${conn.apiKey}` };
};

const endpoint = (conn: Connection): string => {
  const base = conn.baseURL.replace(/\/+$/, "");
  return conn.protocol === "anthropic-messages"
    ? `${base}/v1/models`
    : `${base}/models`;
};

/** { error: { message } } の形から message を取り出す */
const findErrorMessage = (json: unknown): string | null => {
  // Gemini の OpenAI 互換窓口は、エラーを配列で包んで返すことがある
  if (Array.isArray(json)) {
    return json.length === 0 ? null : findErrorMessage(json[0]);
  }
  if (typeof json !== "object" || json == null || !("error" in json)) {
    return null;
  }
  const error = json.error;
  if (typeof error === "string") {
    return error;
  }
  if (
    typeof error === "object" &&
    error != null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return null;
};

/**
 * エラーレスポンスから人間向けのメッセージを作る
 *
 * どの接続先も { error: { message } } を基本にしているが、包み方に差がある。
 * ゲートウェイが挟まると HTML が返ることもあるため、読めなければ本文を出す
 */
export const toErrorMessage = async (res: Response): Promise<string> => {
  const text = await res.text().catch(() => "");
  try {
    const message = findErrorMessage(JSON.parse(text));
    if (message != null) {
      return `${res.status}: ${message}`;
    }
  } catch {
    // JSON でなければそのまま本文を使う
  }
  return `${res.status} ${res.statusText}${text === "" ? "" : `: ${text.slice(0, 300)}`}`;
};

/** 利用できるモデルの一覧 */
export const listModels = async (conn: Connection): Promise<string[]> => {
  const res = await fetch(endpoint(conn), { headers: headers(conn) });
  if (!res.ok) {
    throw new Error(await toErrorMessage(res));
  }
  const json: unknown = await res.json();
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((model: unknown) => (model as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string")
    .sort();
};
