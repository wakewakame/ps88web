import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { streamChat } from "./Chat.ts";
import { toModel, defaultSettings, withProvider } from "./Settings.ts";
import { WRITE_CODE } from "./Tools.ts";

/**
 * 接続先との疎通
 *
 * 他のテストは組み立てた値や受け取ったイベントだけを見ているため、pi-ai へ
 * 渡している設定が実際に通るかは分からない。モデルの組み立てと接続先の
 * 登録が噛み合っていないと、ここで初めて落ちる。
 *
 * 本物の API は使わず、OpenAI 互換の応答を返すサーバーを立てて確かめる
 */

/** OpenAI 互換のチャンクを SSE の 1 イベントにする */
const chunk = (delta: unknown, finishReason: string | null = null): string =>
  `data: ${JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 0,
    model: "test-model",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;

/** 受け取ったリクエストの本文 (最後の 1 件) */
let received: Record<string, unknown> | null = null;
/** 次に返す SSE の中身 */
let response: string[] = [];

let server: Server;
let baseURL: string;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        const body: Buffer[] = [];
        req.on("data", (part: Buffer) => body.push(part));
        req.on("end", () => {
          received = JSON.parse(Buffer.concat(body).toString());
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.end(response.join("") + "data: [DONE]\n\n");
        });
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        // listen したあとの address は必ずオブジェクトになる
        baseURL = `http://127.0.0.1:${typeof address === "object" && address != null ? address.port : 0}/v1`;
        resolve();
      });
    }),
);

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

/** Anthropic のイベントを SSE の 1 イベントにする */
const event = (type: string, payload: Record<string, unknown>): string =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`;

/** モックサーバーを指した設定 (providerId で形式が決まる) */
const settings = (providerId: string) => ({
  ...withProvider(defaultSettings(), providerId),
  baseURL,
  model: "test-model",
  apiKey: "sk-test",
});

const run = async (providerId = "custom") => {
  const onCode = vi.fn();
  const onUpdate = vi.fn();
  const message = await streamChat(
    toModel(settings(providerId)),
    "sk-test",
    "system prompt",
    [{ role: "user", content: "サイン波にして", timestamp: 0 }],
    { onUpdate, onCode },
    new AbortController().signal,
  );
  return { message, onCode, onUpdate };
};

describe("streamChat", () => {
  it("ツール呼び出しからコードを受け取る", async () => {
    response = [
      chunk({ role: "assistant", content: "サイン波にします" }),
      chunk({
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: WRITE_CODE, arguments: "" },
          },
        ],
      }),
      chunk({
        tool_calls: [{ index: 0, function: { arguments: '{"code":"ps88.' } }],
      }),
      chunk({
        tool_calls: [{ index: 0, function: { arguments: 'audio();"}' } }],
      }),
      chunk({}, "tool_calls"),
    ];

    const { message, onCode, onUpdate } = await run();

    expect(message.stopReason).toBe("toolUse");
    expect(onCode).toHaveBeenCalledExactlyOnceWith("ps88.audio();");
    // 地の文とコードが並んで届く
    expect(onUpdate).toHaveBeenLastCalledWith([
      { type: "text", text: "サイン波にします" },
      { type: "code", code: "ps88.audio();" },
    ]);
  });

  it("ツールの定義とシステムプロンプトを送る", async () => {
    response = [chunk({ content: "はい" }), chunk({}, "stop")];
    await run();

    expect(received).toMatchObject({
      model: "test-model",
      stream: true,
      tools: [{ type: "function", function: { name: WRITE_CODE } }],
    });
    // system プロンプトは messages の先頭に入る (developer ロールは
    // 解さない接続先があるため、custom には送らない設定にしてある)
    expect(received?.messages).toMatchObject([
      { role: "system", content: "system prompt" },
      { role: "user", content: "サイン波にして" },
    ]);
  });

  it("ツールを呼ばない回答ではコードを渡さない", async () => {
    response = [chunk({ content: "それは無理です" }), chunk({}, "stop")];
    const { message, onCode } = await run();

    expect(message.stopReason).toBe("stop");
    expect(onCode).not.toHaveBeenCalled();
  });
});

describe("streamChat (Anthropic 形式)", () => {
  // 形式ごとに送る内容も読み方も違うため、こちらも一度通しておく
  beforeAll(() => {
    response = [
      event("message_start", {
        message: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "test-model",
          content: [],
          stop_reason: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
      event("content_block_start", {
        index: 0,
        content_block: { type: "text", text: "" },
      }),
      event("content_block_delta", {
        index: 0,
        delta: { type: "text_delta", text: "サイン波にします" },
      }),
      event("content_block_stop", { index: 0 }),
      event("content_block_start", {
        index: 1,
        content_block: { type: "tool_use", id: "toolu_1", name: WRITE_CODE },
      }),
      event("content_block_delta", {
        index: 1,
        delta: {
          type: "input_json_delta",
          partial_json: '{"code":"ps88.audio();"}',
        },
      }),
      event("content_block_stop", { index: 1 }),
      event("message_delta", {
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 10 },
      }),
      event("message_stop", {}),
    ];
  });

  it("ツール呼び出しからコードを受け取る", async () => {
    const { message, onCode } = await run("anthropic");

    expect(message.stopReason).toBe("toolUse");
    expect(onCode).toHaveBeenCalledExactlyOnceWith("ps88.audio();");
  });

  it("必須の max_tokens と、system をブロックで送る", async () => {
    await run("anthropic");

    // Anthropic は max_tokens が無いと受け付けない
    expect(received?.max_tokens).toBeGreaterThan(0);
    // system は messages ではなく専用の欄に入る
    expect(received?.system).toMatchObject([
      { type: "text", text: "system prompt" },
    ]);
    expect(received?.tools).toMatchObject([{ name: WRITE_CODE }]);
  });

  it("プロンプトキャッシュを効かせる", async () => {
    await run("anthropic");

    // system には API の型定義とサンプルを丸ごと載せるため、
    // キャッシュを効かせて 2 回目以降の入力料金を下げる
    const system = received?.system as { cache_control?: unknown }[];
    expect(system[0].cache_control).toBeDefined();
  });
});
