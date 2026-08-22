import { describe, expect, it, vi } from "vitest";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type {
  AssistantMessage,
  AssistantMessageEvent,
  StopReason,
} from "@earendil-works/pi-ai";
import {
  consume,
  isComplete,
  toBlocks,
  toErrorMessage,
  toToolResults,
} from "./Chat.ts";
import { WRITE_CODE } from "./Tools.ts";
import { t } from "../../i18n";

const message = (
  content: AssistantMessage["content"],
  stopReason: StopReason = "stop",
  errorMessage?: string,
): AssistantMessage => ({
  role: "assistant",
  content,
  api: "openai-completions",
  provider: "openai-completions",
  model: "test",
  usage: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
  stopReason,
  errorMessage,
  timestamp: 0,
});

const toolCall = (code: unknown, id = "call-1") =>
  ({
    type: "toolCall",
    id,
    name: WRITE_CODE,
    arguments: code === undefined ? {} : { code },
  }) as const;

describe("toBlocks", () => {
  it("地の文とコードを並んだ順のまま返す", () => {
    const blocks = toBlocks(
      message([
        { type: "text", text: "サイン波にします" },
        toolCall("ps88.audio(() => {});"),
      ]),
    );
    expect(blocks).toEqual([
      { type: "text", text: "サイン波にします" },
      { type: "code", code: "ps88.audio(() => {});" },
    ]);
  });

  it("thinking は表示に混ぜない", () => {
    // 回答ではなく途中の思考のため
    const blocks = toBlocks(
      message([
        { type: "thinking", thinking: "考え中" },
        { type: "text", text: "できました" },
      ]),
    );
    expect(blocks).toEqual([{ type: "text", text: "できました" }]);
  });

  it("空の text ブロックを落とす", () => {
    // 本文より先に空の text を立てる接続先がある。吹き出しが増えて見えるだけ
    expect(toBlocks(message([{ type: "text", text: "" }]))).toEqual([]);
  });

  it("引数がまだ届いていないツール呼び出しを落とす", () => {
    expect(toBlocks(message([toolCall(undefined)]))).toEqual([]);
  });
});

describe("isComplete", () => {
  it("最後まで終わった回答は残す", () => {
    expect(isComplete(message([], "stop"))).toBe(true);
    expect(isComplete(message([], "toolUse"))).toBe(true);
  });

  it("長さで切れた回答も残す", () => {
    // 途中まででも会話として成立しており、続きを頼めるため
    expect(isComplete(message([], "length"))).toBe(true);
  });

  it("中断と失敗は残さない", () => {
    // 結果を返していないツール呼び出しが混ざると、次を送るときに弾かれる
    expect(isComplete(message([], "aborted"))).toBe(false);
    expect(isComplete(message([], "error"))).toBe(false);
  });
});

describe("toToolResults", () => {
  it("呼ばれたツールに結果を返す", () => {
    const results = toToolResults(message([toolCall("ps88.audio(() => {});")]));
    expect(results).toHaveLength(1);
    expect(results[0].toolCallId).toBe("call-1");
    expect(results[0].toolName).toBe(WRITE_CODE);
    expect(results[0].isError).toBe(false);
  });

  it("コードを取り出せなかった呼び出しにも結果を返す", () => {
    // 返さないまま次を送ると、会話の形が壊れているとして拒否される
    const results = toToolResults(message([toolCall(undefined)]));
    expect(results).toHaveLength(1);
    expect(results[0].isError).toBe(true);
  });

  it("複数の呼び出しすべてに返す", () => {
    const results = toToolResults(
      message([toolCall("a", "call-1"), toolCall("b", "call-2")]),
    );
    expect(results.map((result) => result.toolCallId)).toEqual([
      "call-1",
      "call-2",
    ]);
  });

  it("ツールを呼ばなかった回答には何も返さない", () => {
    expect(toToolResults(message([{ type: "text", text: "はい" }]))).toEqual(
      [],
    );
  });
});

describe("toErrorMessage", () => {
  it("中断は伝えない", () => {
    // ユーザー自身の操作のため
    expect(toErrorMessage(message([], "aborted"))).toBeNull();
  });

  it("失敗は理由をそのまま伝える", () => {
    expect(toErrorMessage(message([], "error", "invalid api key"))).toBe(
      "invalid api key",
    );
  });

  it("理由の無い失敗にも文言を出す", () => {
    expect(toErrorMessage(message([], "error"))).toBe(t.client.failed);
  });

  it("長さで切れたことは伝える", () => {
    // 黙って終わると、コードを出したのに反映されないようにしか見えない
    expect(toErrorMessage(message([], "length"))).toBe(t.client.truncated);
  });

  it("正常終了では何も伝えない", () => {
    expect(toErrorMessage(message([], "stop"))).toBeNull();
    expect(toErrorMessage(message([], "toolUse"))).toBeNull();
  });
});

describe("consume", () => {
  /** イベントを順に流し、最後のメッセージで閉じるストリームを作る */
  const streamOf = (
    events: AssistantMessageEvent[],
    result: AssistantMessage,
  ) => {
    const stream = createAssistantMessageEventStream();
    for (const event of events) {
      stream.push(event);
    }
    stream.end(result);
    return stream;
  };

  it("届くたびに、そのときの中身をまとめて渡す", async () => {
    const partial = message([{ type: "text", text: "サイン" }]);
    const onUpdate = vi.fn();
    await consume(
      streamOf(
        [{ type: "text_delta", contentIndex: 0, delta: "サイン", partial }],
        partial,
      ),
      { onUpdate, onCode: vi.fn() },
    );
    expect(onUpdate).toHaveBeenCalledWith([{ type: "text", text: "サイン" }]);
  });

  it("コードは呼び出しが完結したときにだけ渡す", async () => {
    const half = message([toolCall("ps88.au")]);
    const full = message([toolCall("ps88.audio(() => {});")], "toolUse");
    const onCode = vi.fn();

    await consume(
      streamOf(
        [
          // 書きかけの引数。ここで反映すると動かないコードがビルドされる
          {
            type: "toolcall_delta",
            contentIndex: 0,
            delta: "ps88.au",
            partial: half,
          },
          {
            type: "toolcall_end",
            contentIndex: 0,
            toolCall: toolCall("ps88.audio(() => {});"),
            partial: full,
          },
        ],
        full,
      ),
      { onUpdate: vi.fn(), onCode },
    );

    expect(onCode).toHaveBeenCalledTimes(1);
    expect(onCode).toHaveBeenCalledWith("ps88.audio(() => {});");
  });

  it("書きかけのコードも表示には流す", async () => {
    // 反映はしないが、書かれていく様子は見せる
    const half = message([toolCall("ps88.au")]);
    const onUpdate = vi.fn();
    await consume(
      streamOf(
        [
          {
            type: "toolcall_delta",
            contentIndex: 0,
            delta: "u",
            partial: half,
          },
        ],
        half,
      ),
      { onUpdate, onCode: vi.fn() },
    );
    expect(onUpdate).toHaveBeenCalledWith([{ type: "code", code: "ps88.au" }]);
  });

  it("コードを取り出せない呼び出しでは渡さない", async () => {
    const partial = message([toolCall(undefined)]);
    const onCode = vi.fn();
    await consume(
      streamOf(
        [
          {
            type: "toolcall_end",
            contentIndex: 0,
            toolCall: toolCall(undefined),
            partial,
          },
        ],
        partial,
      ),
      { onUpdate: vi.fn(), onCode },
    );
    expect(onCode).not.toHaveBeenCalled();
  });

  it("最後のメッセージを返す", async () => {
    const result = message([{ type: "text", text: "できました" }], "stop");
    expect(
      await consume(streamOf([], result), {
        onUpdate: vi.fn(),
        onCode: vi.fn(),
      }),
    ).toBe(result);
  });
});
