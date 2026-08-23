import { describe, expect, it } from "vitest";
import type { AssistantMessage, StopReason } from "@earendil-works/pi-ai";
import { toBlocks, toToolResults } from "./Chat.ts";
import { WRITE_CODE } from "./Tools.ts";

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
