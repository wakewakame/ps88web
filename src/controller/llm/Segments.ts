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
 * JavaScript ではないことがはっきりしている言語
 *
 * 逆に「JavaScript である言語」の一覧では判定しない。js / javascript 以外の
 * 名前を書いてくるモデルや、言語を書かないモデルがあり、それを取りこぼすと
 * 反映されない理由がユーザーから見て分からないため。
 */
const NOT_JAVASCRIPT = new Set([
  "sh",
  "bash",
  "zsh",
  "shell",
  "console",
  "text",
  "plaintext",
  "json",
  "yaml",
  "yml",
  "toml",
  "html",
  "css",
  "diff",
  "md",
  "markdown",
]);

/**
 * 回答から、エディタに自動で反映するコードを取り出す
 *
 * 完成したコードブロックのうち、最後のものを返す。
 *
 * 中身が ps88 を使っているかは見ない。エラーの挙動を確かめるためだけの
 * `throw` や、`console.log` だけのコードを頼むこともあり、そこで弾くと
 * 反映されない理由が分からないため。使い方の説明に混ざるシェルのコマンドは、
 * 言語の指定で除ける範囲だけ除く。
 *
 * 複数のコードブロックがあるとき、どれが本体かを長さなどで当てにいくことは
 * しない。書き直したものが後に来るという前提の方が外れにくく、外れた場合も
 * 反映前のコードと入れ替えて戻せるため。
 *
 * @returns 反映できるコード (null=まだ無い)
 */
export const extractCode = (markdown: string): string | null => {
  let body: string | null = null;
  for (const segment of parseSegments(markdown)) {
    if (
      segment.type === "code" &&
      !segment.open &&
      !NOT_JAVASCRIPT.has(segment.lang.toLowerCase())
    ) {
      body = segment.code;
    }
  }
  return body;
};
