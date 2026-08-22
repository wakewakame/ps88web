import { afterEach, describe, expect, it, vi } from "vitest";
import { listModels, toErrorMessage, type Connection } from "./ModelList.ts";

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

describe("listModels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** fetch を差し替え、呼ばれた URL とヘッダを控える */
  const stubFetch = (response: Response) => {
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetch);
    return fetch;
  };

  const openai: Connection = {
    protocol: "openai-completions",
    baseURL: "https://api.openai.com/v1",
    apiKey: "sk-xxx",
  };

  const anthropic: Connection = {
    protocol: "anthropic-messages",
    baseURL: "https://api.anthropic.com",
    apiKey: "sk-ant-xxx",
  };

  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });

  it("id を名前順に並べて返す", async () => {
    stubFetch(ok({ data: [{ id: "b" }, { id: "a" }] }));
    expect(await listModels(openai)).toEqual(["a", "b"]);
  });

  it("OpenAI 互換は Bearer で /models を引く", async () => {
    const fetch = stubFetch(ok({ data: [] }));
    await listModels(openai);
    expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", {
      headers: { authorization: "Bearer sk-xxx" },
    });
  });

  it("Anthropic は x-api-key で /v1/models を引く", async () => {
    const fetch = stubFetch(ok({ data: [] }));
    await listModels(anthropic);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/models");
    // ブラウザから直接呼ぶために要る
    expect(init.headers).toMatchObject({
      "x-api-key": "sk-ant-xxx",
      "anthropic-dangerous-direct-browser-access": "true",
    });
  });

  it("末尾のスラッシュを重ねない", async () => {
    const fetch = stubFetch(ok({ data: [] }));
    await listModels({ ...openai, baseURL: "https://api.openai.com/v1//" });
    expect(fetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
  });

  it("id を持たない要素を落とす", async () => {
    // 一覧の形は接続先ごとに揺れる
    stubFetch(ok({ data: [{ id: "a" }, {}, { id: 1 }] }));
    expect(await listModels(openai)).toEqual(["a"]);
  });

  it("data が無ければ空にする", async () => {
    stubFetch(ok({}));
    expect(await listModels(openai)).toEqual([]);
  });

  it("失敗の理由を例外にする", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { message: "no access" } }), {
        status: 403,
        statusText: "Forbidden",
      }),
    );
    await expect(listModels(openai)).rejects.toThrow("403: no access");
  });
});
