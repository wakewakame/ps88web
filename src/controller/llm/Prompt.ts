import type { RecvMessageError } from "../audio/AudioControllerTypes.ts";
import { t } from "../../i18n";
import ps88_d_ts from "../../../lib/ps88.d.ts?raw";
import sineExample from "../../../public/examples/examples/sine.js?raw";
import baseExample from "../../../public/examples/examples/base.js?raw";

/**
 * AI に渡すプロンプトの組み立て
 *
 * ps88 はごく限られた環境でユーザーのコードを実行するため、AI が一般的な
 * JavaScript の知識だけで書くと動かないものが出てくる (DOM も import も
 * setTimeout も無い、など)。型定義と実際に動く例を丸ごと渡して、その差を埋める。
 */

const RULES = `# あなたの役割

あなたは PS88 というシンセサイザーのコードを書くアシスタントです。
ユーザーの要望を聞いて、PS88 で動く JavaScript を書いてください。

# 実行環境の制約

ユーザーのコードは AudioWorklet の中で \`new Function("ps88", code)\` として
実行されます。そのため以下の制約があります。

- 使えるのは標準の JavaScript と \`ps88\`、\`console\` だけです
- \`import\` / \`require\` は使えません。外部ライブラリも使えません
- DOM (\`document\`, \`window\`) はありません
- \`setTimeout\` / \`setInterval\` / \`fetch\` はありません
- 時間の経過は \`ctx.sampleRate\` から自分で計算します
- コールバックをまたいで保つ状態は、トップレベルの変数に置きます

# コードの書き方

- \`ps88.audio(...)\` で波形を生成し、必要なら \`ps88.gui(...)\` で画面を描きます
- \`ps88.audio\` のコールバックは数ミリ秒ごとに呼ばれます。中で重い処理をすると
  音が途切れるため、テーブルの生成などは初回だけ行うようにしてください
- 出力は -1.0 〜 1.0 の範囲です。複数の音を重ねるときは音量を割ってください
- MIDI ノート番号から周波数は \`440 * Math.pow(2, (note - 69) / 12)\` です
- \`ctx.audio\` は空の場合があります。長さは \`ctx.audio[0]?.length ?? 0\` で取ります

# 回答の仕方

- ${t.prompt.replyLanguage}
- コードを書くときは \`write_code\` ツールを呼んでください。地の文にコードを
  書いても反映されません
- 1 回の回答につき \`write_code\` は 1 回だけ呼んでください
- 変更した理由が分かるよう、コードには簡潔なコメントを添えてください
- コードを変える必要がない質問には、ツールを呼ばずに文章で答えてください`;

const buildSystemPrompt = () =>
  [
    RULES,
    "# API の型定義 (ps88.d.ts)",
    "```ts\n" + ps88_d_ts.trim() + "\n```",
    "# 例1: 440Hz のサイン波",
    "```js\n" + sineExample.trim() + "\n```",
    "# 例2: MIDI を受けて鳴らすシンセ",
    "```js\n" + baseExample.trim() + "\n```",
  ].join("\n\n");

// 型定義と例は変わらないため、一度だけ組み立てる
export const SYSTEM_PROMPT = buildSystemPrompt();

/**
 * ユーザーの発言に、いまのエディタの状態を添える
 *
 * コードは会話の途中でユーザーが直接編集することもあるため、毎回の発言に
 * 最新のものを添える。会話履歴に残った古いコードと食い違うが、AI には
 * 「これが現在の状態」と明示しているので問題にならない。
 *
 * @param text - ユーザーが入力した文章
 * @param code - 現在エディタにあるコード
 * @param error - 現在のコードが出しているエラー (null=エラー無し)
 */
export const buildUserMessage = (
  text: string,
  code: string,
  error: RecvMessageError | null,
): string => {
  const sections = ["# 現在のコード", "```js\n" + code + "\n```"];
  if (error != null) {
    sections.push(
      "# 現在のコードが出しているエラー",
      `${error.phase}: ${error.message}`,
    );
  }
  sections.push("# 要望", text);
  return sections.join("\n\n");
};
