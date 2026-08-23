import { createModels, createProvider } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type {
  Api,
  AssistantMessage,
  Message,
  Model,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
import {
  WRITE_CODE_FAILED,
  WRITE_CODE_RESULT,
  toCode,
  writeCodeTool,
} from "./Tools.ts";
import type { Connection, Protocol } from "./Providers.ts";
import { t } from "../../i18n";

/**
 * AI との会話
 *
 * 接続先ごとの差 (リクエストの形、SSE の読み方、エラーの包み方、プロンプト
 * キャッシュの付け方) は pi-ai が吸収する。ここでやるのは、接続先を 2 つ
 * 登録することと、届いたイベントを画面に出せる形へ落とすことだけ。
 *
 * 登録するのはプロトコルの実装だけで、モデルは持たせない。モデルの一覧は
 * 接続先から取り (ModelList.ts)、選ばれた名前を毎回組み立てて渡す
 */

/**
 * pi-ai は接続先ごとに認証方法を要求するが、キーはリクエストのたびに
 * 明示して渡すため、ここで解決するものは無い
 */
const auth = {
  apiKey: { name: "API key", resolve: async () => ({ auth: {} }) },
};

// 登録する識別子は API 実装の名前にそろえる。Settings が組み立てるモデルの
// provider にも同じ名前を入れており、pi-ai はそれを見て振り分ける
const models = createModels();
models.setProvider(
  createProvider({
    id: "openai-completions" satisfies Protocol,
    auth,
    models: [],
    api: openAICompletionsApi(),
  }),
);
models.setProvider(
  createProvider({
    id: "anthropic-messages" satisfies Protocol,
    auth,
    models: [],
    api: anthropicMessagesApi(),
  }),
);

/**
 * 画面に出す回答の中身
 *
 * 地の文とコードが最初から分かれて届くため、回答を後から解析する必要はない
 */
export type ChatBlock =
  { type: "text"; text: string } | { type: "code"; code: string };

/** 回答の中身を、画面に出す形へ落とす */
export const toBlocks = (message: AssistantMessage): ChatBlock[] =>
  message.content.flatMap((block): ChatBlock[] => {
    if (block.type === "text") {
      // 空の text ブロックが先に立つ接続先がある。吹き出しが増えて見えるだけ
      return block.text === "" ? [] : [{ type: "text", text: block.text }];
    }
    if (block.type === "toolCall") {
      const code = toCode(block);
      return code == null ? [] : [{ type: "code", code }];
    }
    // thinking は表示しない (回答ではなく途中の思考のため)
    return [];
  });

export type StreamHandlers = {
  /** 回答が変わるたびに、そのときの中身をまとめて渡す */
  onUpdate: (blocks: ChatBlock[]) => void;
  /**
   * コードが最後まで届いたときに呼ばれる
   *
   * 書きかけを渡さないため、ツール呼び出しが完結した時点でだけ呼ぶ。
   * 途中経過は onUpdate 側にしか流れない
   */
  onCode: (code: string) => void;
};

/**
 * 出力の上限
 *
 * Anthropic は必須のため何かを入れる必要がある。OpenAI 互換の側へは送らず、
 * 接続先の既定に任せる (モデルごとの上限が分からないまま大きな値を送ると、
 * 上限の小さいモデルで弾かれるため)
 */
const MAX_TOKENS = 16000;

/**
 * 入力の上限
 *
 * 接続先から取れないため、当たり障りのない値を置く。会話をこの長さで
 * 打ち切る処理は入れていないので、ここが実際の動きを変えることはない
 */
const CONTEXT_WINDOW = 128000;

/**
 * pi-ai に渡すモデルを組み立てる
 *
 * pi-ai は本来モデルの一覧を持っていて、そこから選ぶ作りになっている。
 * ここでは接続先から取った名前をユーザーが選ぶため、選ばれたものを毎回
 * 組み立てて渡す。値段やコンテキスト長は接続先から取れないので、既定を置く
 */
const toModel = (connection: Connection, model: string): Model<Api> => ({
  id: model,
  name: model,
  api: connection.protocol,
  // 上で登録している接続先の識別子と同じ名前にそろえてある
  provider: connection.protocol,
  baseUrl: connection.baseURL,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: CONTEXT_WINDOW,
  maxTokens: MAX_TOKENS,
  compat: connection.compat,
});

/**
 * AI との会話 (ストリーミング)
 *
 * pi-ai は失敗しても例外を投げず、最後のメッセージに理由を載せて返す。
 * 中断も同じ扱いになるため、呼び出し側は stopReason を見て判断する
 *
 * @param connection - 接続先 (Settings.toConnection が作る)
 * @param model - 選ばれたモデルの名前
 * @param system - システムプロンプト
 * @param messages - これまでの会話
 * @param handlers - 受け取り口
 * @param signal - 中断用
 */
export const streamChat = async (
  connection: Connection,
  model: string,
  system: string,
  messages: Message[],
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<AssistantMessage> => {
  const stream = models.stream(
    toModel(connection, model),
    { systemPrompt: system, messages, tools: [writeCodeTool] },
    { apiKey: connection.apiKey, signal },
  );
  for await (const event of stream) {
    if (event.type === "done" || event.type === "error") {
      // 終端は result() で受け取る
      continue;
    }
    // partial はそこまでに組み上がった回答そのもの。増分を自分で積む必要は
    // ない (ブロックをまたいでイベントが交互に届くため、積む側に回ると
    // contentIndex での対応付けが要る)。
    // 毎回同じオブジェクトが書き換えられて届くため、保持してはいけない
    handlers.onUpdate(toBlocks(event.partial));
    if (event.type === "toolcall_end") {
      // ここで初めて引数が揃う。書きかけのコードを反映しないよう、
      // 途中の toolcall_delta では呼ばない
      const code = toCode(event.toolCall);
      if (code != null) {
        handlers.onCode(code);
      }
    }
  }
  return await stream.result();
};

/**
 * この回答を会話に残してよいか
 *
 * 中断と失敗のときは残さない。書きかけのツール呼び出しが混ざったまま次を
 * 送ると、結果を返していないツール呼び出しがあるとして接続先に弾かれる
 */
export const isComplete = (message: AssistantMessage): boolean =>
  message.stopReason === "stop" ||
  message.stopReason === "toolUse" ||
  message.stopReason === "length";

/**
 * ツール呼び出しへの返事
 *
 * 呼ばれたものには必ず結果を返す。返さないまま次を送ると、接続先によっては
 * 会話の形が壊れているとして拒否される
 */
export const toToolResults = (message: AssistantMessage): ToolResultMessage[] =>
  message.content
    .filter((block) => block.type === "toolCall")
    .map((call) => {
      const applied = toCode(call) != null;
      return {
        role: "toolResult",
        toolCallId: call.id,
        toolName: call.name,
        content: [
          {
            type: "text",
            text: applied ? WRITE_CODE_RESULT : WRITE_CODE_FAILED,
          },
        ],
        isError: !applied,
        timestamp: Date.now(),
      };
    });

/**
 * 終わり方から、ユーザーに伝えることを決める (null=伝えることは無い)
 *
 * 中断はユーザー自身の操作なので黙る。長さで切れたことは伝える。黙って
 * 終わると「コードを出したのに反映されない」ようにしか見えないため
 */
export const toErrorMessage = (message: AssistantMessage): string | null => {
  switch (message.stopReason) {
    case "aborted":
      return null;
    case "error":
      return message.errorMessage ?? t.client.failed;
    case "length":
      return t.client.truncated;
    default:
      return null;
  }
};
