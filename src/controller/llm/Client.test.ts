import { describe, expect, it } from "vitest";
import { extractDelta, parseSSE, toErrorMessage } from "./Client.ts";

/** 文字列の配列を、チャンクの区切りを保ったままストリームにする */
const toStream = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

const collect = async (chunks: string[]): Promise<string[]> => {
  const result: string[] = [];
  for await (const data of parseSSE(toStream(chunks))) {
    result.push(data);
  }
  return result;
};

describe("parseSSE", () => {
  it("data 行の中身を取り出す", async () => {
    expect(await collect(["data: a\n\ndata: b\n\n"])).toEqual(["a", "b"]);
  });

  it("data 以外の行を無視する", async () => {
    expect(await collect(["event: ping\nid: 1\ndata: a\n\n"])).toEqual(["a"]);
  });

  it("行の途中でチャンクが切れても復元する", async () => {
    // ネットワークの都合でチャンクの境界は行の途中に来る
    expect(await collect(['data: {"x":', "1}\n\n"])).toEqual(['{"x":1}']);
  });

  it("マルチバイト文字がチャンクを跨いでも壊さない", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode("data: あ\n\n");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // 「あ」の 3 バイトの途中で切る
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7));
        controller.close();
      },
    });
    const result: string[] = [];
    for await (const data of parseSSE(stream)) {
      result.push(data);
    }
    expect(result).toEqual(["あ"]);
  });

  it("CRLF の改行を扱える", async () => {
    expect(await collect(["data: a\r\n\r\n"])).toEqual(["a"]);
  });

  it("最後が改行で終わっていなくても取りこぼさない", async () => {
    // 最後の delta を送った直後に接続を切る中継がある。
    // 持ち越したまま終わると、その 1 件だけ消える
    expect(await collect(["data: a\n\ndata: b"])).toEqual(["a", "b"]);
  });
});

describe("extractDelta", () => {
  it("Anthropic のテキスト増分を取り出す", () => {
    const data = JSON.stringify({
      type: "content_block_delta",
      delta: { type: "text_delta", text: "こん" },
    });
    expect(extractDelta("anthropic", data)).toBe("こん");
  });

  it("Anthropic の thinking は本文に混ぜない", () => {
    const data = JSON.stringify({
      type: "content_block_delta",
      delta: { type: "thinking_delta", thinking: "考え中" },
    });
    expect(extractDelta("anthropic", data)).toBe("");
  });

  it("Anthropic のエラーイベントは例外にする", () => {
    const data = JSON.stringify({
      type: "error",
      error: { message: "overloaded" },
    });
    // ストリームの途中で来るため、握り潰すと沈黙したように見える
    expect(() => extractDelta("anthropic", data)).toThrow("overloaded");
  });

  it("OpenAI 互換のエラーイベントも例外にする", () => {
    // OpenRouter や Gemini は、途中で失敗すると data 行にエラーを流してくる。
    // 無視すると書きかけの回答で止まったように見える
    const data = JSON.stringify({ error: { message: "rate limited" } });
    expect(() => extractDelta("openai", data)).toThrow("rate limited");
  });

  it("OpenAI 互換のテキスト増分を取り出す", () => {
    const data = JSON.stringify({ choices: [{ delta: { content: "hi" } }] });
    expect(extractDelta("openai", data)).toBe("hi");
  });

  it("OpenAI 互換の終端と空の choices を無視する", () => {
    expect(extractDelta("openai", "[DONE]")).toBe("");
    expect(extractDelta("openai", JSON.stringify({ choices: [] }))).toBe("");
  });

  it("壊れた JSON や未知のイベントで落ちない", () => {
    // プロバイダごとに独自のイベントが混ざるため、会話全体を止めたくない
    expect(extractDelta("openai", "{壊れている")).toBe("");
    expect(extractDelta("anthropic", JSON.stringify({ type: "ping" }))).toBe(
      "",
    );
    expect(extractDelta("openai", "null")).toBe("");
  });
});

describe("toErrorMessage", () => {
  const res = (body: string, status = 400) =>
    new Response(body, { status, statusText: "Bad Request" });

  it("OpenAI 互換の形から message を取り出す", async () => {
    const body = JSON.stringify({ error: { message: "invalid model" } });
    expect(await toErrorMessage(res(body))).toBe("400: invalid model");
  });

  it("Anthropic の形から message を取り出す", async () => {
    const body = JSON.stringify({
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    });
    expect(await toErrorMessage(res(body, 401))).toBe("401: invalid x-api-key");
  });

  it("配列で包まれた形からも message を取り出す", async () => {
    // Gemini の OpenAI 互換窓口はエラーを配列で返すことがある
    const body = JSON.stringify([
      { error: { code: 400, message: "Please pass a valid API key" } },
    ]);
    expect(await toErrorMessage(res(body))).toBe(
      "400: Please pass a valid API key",
    );
  });

  it("JSON でなければ本文をそのまま添える", async () => {
    // 途中のゲートウェイが HTML を返すことがある
    expect(await toErrorMessage(res("<html>oops</html>", 502))).toContain(
      "oops",
    );
  });

  it("空の本文でもステータスだけ返す", async () => {
    expect(await toErrorMessage(res("", 500))).toBe("500 Bad Request");
  });
});
