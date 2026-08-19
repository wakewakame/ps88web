import type { Protocol } from "./Providers.ts";
import { t } from "../../i18n";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type Connection = {
  protocol: Protocol;
  baseURL: string;
  apiKey: string;
  model: string;
};

/** SSE の 1 行から data の中身を取り出す (data 行でなければ null) */
const toData = (line: string): string | null => {
  const trimmed = line.trimEnd();
  return trimmed.startsWith("data:")
    ? trimmed.slice("data:".length).trim()
    : null;
};

/**
 * SSE のイベントを 1 件ずつ取り出す
 *
 * data 行の中身だけを返す。ストリームはチャンクの境界が行の途中に来るため、
 * 改行が現れるまでバッファに溜めてから切り出す。
 */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  // マルチバイト文字はチャンクを跨ぐことがあるため stream: true で復号する
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done
        ? decoder.decode() // 積み残しの復号を終わらせる
        : decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      // 途中なら、最後の要素は行の途中かもしれないので次回に持ち越す。
      // 終端では持ち越し先が無いため、改行で終わっていなくても流す
      // (そうしないと最後のイベントだけ落ちる)
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const data = toData(line);
        if (data != null) {
          yield data;
        }
      }
      if (done) {
        break;
      }
    }
  } finally {
    // 途中で break した場合にも接続を切る
    await reader.cancel().catch(() => {});
  }
}

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

const headers = (conn: Connection): HeadersInit => {
  if (conn.protocol === "anthropic") {
    return {
      "content-type": "application/json",
      "x-api-key": conn.apiKey,
      "anthropic-version": "2023-06-01",
      // ブラウザから直接呼び出すために必要。
      // 通常はキーの漏洩を防ぐため拒否されるが、ここではユーザー自身のキーを
      // ユーザー自身のブラウザからのみ使うため、明示的に許可する
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }
  return {
    "content-type": "application/json",
    authorization: `Bearer ${conn.apiKey}`,
  };
};

const endpoint = (conn: Connection, path: "chat" | "models"): string => {
  const base = conn.baseURL.replace(/\/+$/, "");
  if (conn.protocol === "anthropic") {
    return path === "chat" ? `${base}/v1/messages` : `${base}/v1/models`;
  }
  return path === "chat" ? `${base}/chat/completions` : `${base}/models`;
};

const body = (
  conn: Connection,
  system: string,
  messages: ChatMessage[],
): unknown => {
  if (conn.protocol === "anthropic") {
    return {
      model: conn.model,
      max_tokens: 16000,
      stream: true,
      system: [
        {
          type: "text",
          text: system,
          // system には API の型定義とサンプルを丸ごと載せるため、
          // キャッシュを効かせて 2 回目以降の入力料金を下げる
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
    };
  }
  return {
    model: conn.model,
    stream: true,
    messages: [{ role: "system", content: system }, ...messages],
  };
};

/** 長さの上限で打ち切られたことを伝えるイベントか */
const isTruncated = (
  protocol: Protocol,
  event: Record<string, unknown>,
): boolean => {
  if (protocol === "anthropic") {
    const delta = event.delta as { stop_reason?: unknown } | undefined;
    return (
      event.type === "message_delta" && delta?.stop_reason === "max_tokens"
    );
  }
  const choices = event.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return false;
  }
  return (choices[0] as { finish_reason?: unknown }).finish_reason === "length";
};

/**
 * ストリームの 1 イベントから本文の増分を取り出す
 *
 * 想定外の形のイベントは無視する。プロバイダごとに独自のイベントが
 * 混ざることがあり、それで会話全体を落としたくないため
 */
export const extractDelta = (protocol: Protocol, data: string): string => {
  if (data === "" || data === "[DONE]") {
    return "";
  }
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return "";
  }
  if (typeof json !== "object" || json == null) {
    return "";
  }
  const event = json as Record<string, unknown>;

  // 途中で失敗したとき、どの接続先も data 行にエラーを流してくる。
  // 無視すると、書きかけの回答で黙って止まったように見える
  const message = findErrorMessage(event);
  if (message != null) {
    throw new Error(message);
  }

  // 長さの上限で打ち切られると、コードブロックが閉じないまま終わる。
  // 黙って終わると「コードを出したのに反映されない」ようにしか見えないため、
  // 打ち切られたこと自体を伝える
  if (isTruncated(protocol, event)) {
    throw new Error(t.client.truncated);
  }

  if (protocol === "anthropic") {
    if (event.type === "error") {
      throw new Error("stream error");
    }
    if (event.type !== "content_block_delta") {
      return "";
    }
    const delta = event.delta as { type?: unknown; text?: unknown } | undefined;
    // thinking_delta などのテキスト以外は表示しない
    return delta?.type === "text_delta" && typeof delta.text === "string"
      ? delta.text
      : "";
  }

  const choices = event.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }
  const delta = (choices[0] as { delta?: { content?: unknown } }).delta;
  return typeof delta?.content === "string" ? delta.content : "";
};

/**
 * AI との会話 (ストリーミング)
 *
 * @param conn - 接続先
 * @param system - システムプロンプト
 * @param messages - これまでの会話
 * @param onDelta - 本文が届くたびに増分で呼ばれる
 * @param signal - 中断用
 */
export const streamChat = async (
  conn: Connection,
  system: string,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  signal: AbortSignal,
): Promise<void> => {
  const res = await fetch(endpoint(conn, "chat"), {
    method: "POST",
    headers: headers(conn),
    body: JSON.stringify(body(conn, system, messages)),
    signal,
  });
  if (!res.ok) {
    throw new Error(await toErrorMessage(res));
  }
  if (res.body == null) {
    throw new Error(t.client.emptyResponse);
  }
  for await (const data of parseSSE(res.body)) {
    const delta = extractDelta(conn.protocol, data);
    if (delta !== "") {
      onDelta(delta);
    }
  }
};

/**
 * 利用できるモデルの一覧
 *
 * モデル名は増減が激しくアプリ側に埋め込むとすぐ古くなるため、
 * 接続先から取得する。取得できない接続先もあるので、失敗は呼び出し側で扱う
 */
export const listModels = async (conn: Connection): Promise<string[]> => {
  const res = await fetch(endpoint(conn, "models"), { headers: headers(conn) });
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
