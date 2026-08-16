/**
 * AI の回答を、地の文とコードブロックに分ける
 *
 * 回答は Markdown で返ってくるが、表示に必要なのはコードブロックの切り出し
 * だけなので、Markdown ライブラリは入れずにここで済ませる。
 */

export type Segment =
  | { type: "text"; text: string }
  | {
      type: "code";
      lang: string;
      code: string;
      /**
       * 閉じの ``` がまだ来ていないか
       *
       * ストリーミング中は必ず一度この状態を通る。書きかけのコードを
       * 反映しても動かないため、反映してよいかの判断に使う
       */
      open: boolean;
    };

const FENCE = /^ {0,3}```(.*)$/;

/** 回答を地の文とコードブロックに分ける */
export const parseSegments = (markdown: string): Segment[] => {
  const segments: Segment[] = [];
  const lines = markdown.split("\n");

  let text: string[] = [];
  let code: string[] | null = null;
  let lang = "";

  const flushText = () => {
    const joined = text.join("\n").trim();
    if (joined !== "") {
      segments.push({ type: "text", text: joined });
    }
    text = [];
  };

  for (const line of lines) {
    const fence = FENCE.exec(line);
    if (code == null) {
      if (fence != null) {
        flushText();
        lang = fence[1].trim();
        code = [];
      } else {
        text.push(line);
      }
      continue;
    }
    if (fence != null) {
      segments.push({ type: "code", lang, code: code.join("\n"), open: false });
      code = null;
      continue;
    }
    code.push(line);
  }

  if (code != null) {
    segments.push({ type: "code", lang, code: code.join("\n"), open: true });
  } else {
    flushText();
  }
  return segments;
};

/**
 * 回答から、エディタに自動で反映するコードを取り出す
 *
 * 完成したコードブロックのうち、ps88 の登録を含む最後のものを返す。
 *
 * ps88.audio / ps88.gui を登録しないコードは、反映しても何も鳴らないため
 * 候補から外す。使い方の説明でシェルのコマンドなどが混ざることがある。
 *
 * 複数のコードブロックがあるとき、どれが本体かを長さなどで当てにいくことは
 * しない。書き直したものが後に来るという前提の方が外れにくく、外れた場合も
 * ブロックごとのボタンから選び直せるため。
 *
 * 言語の指定も当てにしない。js / javascript 以外を書いてくるモデルがあり、
 * そこで取りこぼす方が困るため。
 *
 * @returns 反映できるコード (null=まだ無い)
 */
export const extractCode = (markdown: string): string | null => {
  let body: string | null = null;
  for (const segment of parseSegments(markdown)) {
    if (
      segment.type === "code" &&
      !segment.open &&
      segment.code.includes("ps88.")
    ) {
      body = segment.code;
    }
  }
  return body;
};
