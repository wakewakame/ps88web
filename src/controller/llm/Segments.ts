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
 * 回答からコードを取り出した結果
 *
 * 反映しなかった場合は、その理由まで返す。理由を持たずに null を返すと、
 * 画面上は「AI がコードを出したのに何も起きない」としか見えず、
 * 壊れているのか仕様なのか区別が付かないため。
 */
export type PickedCode =
  | { type: "code"; code: string }
  /** コードブロックが無い (説明だけの回答) */
  | { type: "noCode" }
  /** 閉じの ``` が来ていない (書きかけ、または応答が途中で切れた) */
  | { type: "unclosed" }
  /** JavaScript ではない言語のブロックしか無い */
  | { type: "notJavaScript" }
  /** ps88 を使っていない (反映しても何も起きない) */
  | { type: "notPS88" };

/**
 * 回答から、エディタに反映するコードを選ぶ
 *
 * 条件を満たすコードブロックのうち最後のものを採る。どれが本体かを長さなどで
 * 当てにいくことはしない。書き直したものが後に来るという前提の方が外れにくく、
 * 外れた場合も反映前のコードと入れ替えて戻せるため。
 */
export const pickCode = (markdown: string): PickedCode => {
  const blocks = parseSegments(markdown).filter(
    (segment) => segment.type === "code",
  );
  if (blocks.length === 0) {
    return { type: "noCode" };
  }

  // 条件に合う最後のブロックを採る。合うものが一つも無かったときのために、
  // 弾いた理由も控えておく (採れたあとの理由は使わない。説明のためだけに
  // 後ろに別の言語のブロックを添えてくることがあるため)
  let chosen: string | null = null;
  let reason: PickedCode = { type: "unclosed" };
  const reject = (next: PickedCode) => {
    if (chosen == null) {
      reason = next;
    }
  };

  for (const block of blocks) {
    if (block.type !== "code") {
      continue;
    }
    if (block.open) {
      reject({ type: "unclosed" });
    } else if (NOT_JAVASCRIPT.has(block.lang.toLowerCase())) {
      reject({ type: "notJavaScript" });
    } else if (!block.code.includes("ps88")) {
      // ps88 を使わないコードを反映しても音も絵も変わらない。
      // 差し替えると、それまでのシンセが黙って消えるだけになる
      reject({ type: "notPS88" });
    } else {
      chosen = block.code;
    }
  }
  return chosen != null ? { type: "code", code: chosen } : reason;
};
