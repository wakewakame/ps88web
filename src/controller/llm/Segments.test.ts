import { describe, expect, it } from "vitest";
import { parseSegments, pickCode } from "./Segments.ts";

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

describe("pickCode", () => {
  const program = (body: string) => `ps88.audio((ctx) => {\n${body}\n});`;
  const code = (markdown: string) => {
    const picked = pickCode(markdown);
    return picked.type === "code" ? picked.code : picked.type;
  };

  it("書き直されたコードを返す", () => {
    const markdown = [
      "```js",
      program("  // 古い"),
      "```",
      "直しました",
      "```js",
      program("  // 新しい"),
      "```",
    ].join("\n");
    expect(code(markdown)).toContain("新しい");
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
    expect(code(markdown)).toContain("短い版");
  });

  it("JavaScript でないブロックが後ろにあっても本体を返す", () => {
    const markdown = [
      "```js",
      program("  // 本体"),
      "```",
      "動かすには:",
      "```sh",
      "npm run dev",
      "```",
    ].join("\n");
    expect(code(markdown)).toContain("本体");
  });

  it("言語の指定が無くても反映する", () => {
    // 言語を書かないモデルがある。ここで取りこぼす方が困る
    expect(code("```\nps88.audio(cb);\n```")).toBe("ps88.audio(cb);");
  });

  it("分割代入で ps88 を使うコードも反映する", () => {
    expect(code("```js\nconst { audio } = ps88;\naudio(cb);\n```")).toContain(
      "audio(cb);",
    );
  });

  // 反映しない場合は、その理由まで返す。黙って何も起きないと、
  // 壊れているのか仕様なのか画面から区別が付かないため
  it("シェルのコマンドは反映せず、理由を返す", () => {
    expect(code("```sh\nnpm install\n```")).toBe("notJavaScript");
  });

  it("ps88 を使わないコードは反映せず、理由を返す", () => {
    expect(code('```js\nthrow new Error("x");\n```')).toBe("notPS88");
  });

  it("書きかけのコードは反映せず、理由を返す", () => {
    // 応答が途中で切れた場合もここに来る
    expect(code("```js\nps88.audio((ctx) => {")).toBe("unclosed");
  });

  it("コードブロックが無ければ理由も返さない", () => {
    // 質問に答えただけの回答は、反映されなくて当たり前
    expect(code("文章だけ")).toBe("noCode");
  });
});
