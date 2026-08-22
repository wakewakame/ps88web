import type { Tool, ToolCall } from "@earendil-works/pi-ai";

/**
 * AI にコードを書いてもらうためのツール
 *
 * 差分の適用 (置換) は用意しない。全体を書き直してもらう方が、一致しな
 * かったときの往復が要らず、届いたものをそのまま反映すれば済む
 */

export const WRITE_CODE = "write_code";

/**
 * スキーマは素の JSON Schema で書く
 *
 * pi-ai は TypeBox の `Type` も提供しているが、そちらを import すると
 * typebox が初期バンドルに入る (実測で gzip +32kB)。AI を使わない人にも
 * 配られるため、ここでは値としての依存を持たない形にしておく
 */
export const writeCodeTool: Tool = {
  name: WRITE_CODE,
  description: [
    "PS88 で実行する JavaScript のコード全体を書き込む。",
    "書き込んだコードはそのままエディタに反映され、すぐに実行される。",
    "コードを変更するときは、差分や省略 (// ...省略... など) ではなく、",
    "必ずファイル全体を書くこと。",
    "コードを変更する必要がない質問には、このツールを呼ばずに文章で答えること。",
  ].join("\n"),
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "PS88 で実行する JavaScript のコード全体",
      },
    },
    required: ["code"],
    additionalProperties: false,
  },
  // 対応している接続先ではスキーマを接続先側で強制してもらう。
  // 非対応なら通常のツール呼び出しに落ちるだけなので、付けておいて損はない
  constrainedSampling: { type: "json_schema", strict: "prefer" },
};

/**
 * ツールの実行結果として AI に返す文言
 *
 * 呼ばれたツールには必ず結果を返す決まりのため、実際には何も計算していなく
 * ても返事は要る。反映できたかどうかだけを伝える
 */
export const WRITE_CODE_RESULT = "コードをエディタに反映し、実行しました。";

/** 引数からコードを取り出せなかったときの返事 */
export const WRITE_CODE_FAILED =
  "code が受け取れませんでした。code に JavaScript のコード全体を入れて、もう一度呼んでください。";

/**
 * ツール呼び出しからコードを取り出す (このツールの呼び出しでなければ null)
 *
 * ストリーミング中の引数は途中までしか無い。pi-ai が部分的な JSON を
 * 解釈して埋めてくれるが、code がまだ無いことも、文字列が途中で切れて
 * いることもあるため、呼び出し側は書きかけである前提で扱う
 */
export const toCode = (call: ToolCall): string | null => {
  if (call.name !== WRITE_CODE) {
    return null;
  }
  const code: unknown = call.arguments.code;
  return typeof code === "string" ? code : null;
};
