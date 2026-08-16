import { describe, expect, it } from "vitest";
import { extractCode, parseSegments } from "./Segments.ts";

describe("parseSegments", () => {
  it("地の文とコードブロックを分ける", () => {
    const segments = parseSegments(
      "説明です\n\n```js\nconst a = 1;\n```\n以上",
    );
    expect(segments).toEqual([
      { type: "text", text: "説明です" },
      { type: "code", lang: "js", code: "const a = 1;", open: false },
      { type: "text", text: "以上" },
    ]);
  });

  it("閉じていないコードブロックを open として返す", () => {
    // ストリーミング中は必ずこの状態を通る
    const segments = parseSegments("書きます\n```js\nconst a =");
    expect(segments).toEqual([
      { type: "text", text: "書きます" },
      { type: "code", lang: "js", code: "const a =", open: true },
    ]);
  });

  it("コードブロック内の空行と字下げを保つ", () => {
    const segments = parseSegments("```js\nif (a) {\n\n  b();\n}\n```");
    expect(segments).toEqual([
      { type: "code", lang: "js", code: "if (a) {\n\n  b();\n}", open: false },
    ]);
  });

  it("言語の指定が無くても扱える", () => {
    expect(parseSegments("```\nx\n```")).toEqual([
      { type: "code", lang: "", code: "x", open: false },
    ]);
  });

  it("コードブロックが無ければ地の文だけを返す", () => {
    expect(parseSegments("ただの文章")).toEqual([
      { type: "text", text: "ただの文章" },
    ]);
  });

  it("空文字では何も返さない", () => {
    expect(parseSegments("")).toEqual([]);
  });
});

describe("extractCode", () => {
  const program = (body: string) => `ps88.audio((ctx) => {\n${body}\n});`;

  it("書き直されたコードを返す", () => {
    const markdown = [
      "```js",
      program("  // 古い"),
      "```",
      "直しました",
      "```js",
      program("  // 新しい\n  // 行が増えた"),
      "```",
    ].join("\n");
    expect(extractCode(markdown)).toContain("新しい");
  });

  it("短く書き直された場合もあとのものを返す", () => {
    // 「短くして」と頼むと、元のコードを引用してから短い版を書くモデルがある。
    // 長い方を本体とみなすと、書き直しが永久に反映されなくなる
    const markdown = [
      "```js",
      program("  // 元のコード\n  // たくさんの行\n  // たくさんの行"),
      "```",
      "短くしました。",
      "```js",
      program("  // 短い版"),
      "```",
    ].join("\n");
    expect(extractCode(markdown)).toContain("短い版");
  });

  it("ps88 を使わないブロックが後ろにあっても本体を返す", () => {
    const markdown = [
      "```js",
      program("  // 本体"),
      "```",
      "動かすには:",
      "```sh",
      "npm run dev",
      "```",
    ].join("\n");
    expect(extractCode(markdown)).toContain("本体");
  });

  it("ps88 を使わないコードブロックは無視する", () => {
    // 使い方の説明などで、動かないコードが混ざることがある
    expect(extractCode("```sh\nnpm install\n```")).toBeNull();
  });

  it("書きかけのコードブロックは返さない", () => {
    expect(extractCode("```js\nps88.audio((ctx) => {")).toBeNull();
  });

  it("コードブロックが無ければ null を返す", () => {
    expect(extractCode("文章だけ")).toBeNull();
  });
});
