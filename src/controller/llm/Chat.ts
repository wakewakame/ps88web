import { createModels, createProvider } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
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
import type { Protocol } from "./Providers.ts";
import { t } from "../../i18n";

/**
 * AI との会話
 *
 * 接続先ごとの差 (リクエストの形、SSE の読み方、エラーの包み方、プロンプト
 * キャッシュの付け方) は pi-ai が吸収する。ここでやるのは、接続先を 2 つ
 * 登録することと、届いたイベントを画面に出せる形へ落とすことだけ。
 *
 * 登録するのはプロトコルの実装だけで、モデルは持たせない。モデルの一覧は
 * 接続先から取り、選ばれたものを Settings が組み立てて渡す (ModelList.ts)
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
 * ストリームを読み進めて、届いたものを渡す
 *
 * pi-ai は失敗しても例外を投げず、最後のメッセージに理由を載せて返す。
 * 中断も同じ扱いになるため、呼び出し側は stopReason を見て判断する
 */
export const consume = async (
  stream: AssistantMessageEventStream,
  handlers: StreamHandlers,
): Promise<AssistantMessage> => {
  for await (const event of stream) {
    if (event.type === "done" || event.type === "error") {
      // 終端は result() で受け取る
      continue;
    }
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
 * AI との会話 (ストリーミング)
 *
 * @param model - 接続先とモデル (Settings.toModel が組み立てる)
 * @param apiKey - ユーザーの API キー
 * @param system - システムプロンプト
 * @param messages - これまでの会話
 * @param handlers - 受け取り口
 * @param signal - 中断用
 */
export const streamChat = (
  model: Model<Api>,
  apiKey: string,
  system: string,
  messages: Message[],
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<AssistantMessage> =>
  consume(
    models.stream(
      model,
      { systemPrompt: system, messages, tools: [writeCodeTool] },
      { apiKey, signal },
    ),
    handlers,
  );

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
