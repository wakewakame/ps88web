import { describe, expect, it } from "vitest";
import type { ToolCall } from "@earendil-works/pi-ai";
import { WRITE_CODE, toCode, writeCodeTool } from "./Tools.ts";

const call = (name: string, args: Record<string, unknown>): ToolCall => ({
  type: "toolCall",
  id: "call-1",
  name,
  arguments: args,
});

describe("writeCodeTool", () => {
  it("code だけを必須の文字列として要求する", () => {
    // 接続先にそのまま渡る形なので、素の JSON Schema であることを確かめる
    expect(writeCodeTool.parameters).toEqual({
      type: "object",
      properties: {
        code: { type: "string", description: expect.any(String) },
      },
      required: ["code"],
      additionalProperties: false,
    });
  });
});

describe("toCode", () => {
  it("引数の code を取り出す", () => {
    expect(toCode(call(WRITE_CODE, { code: "ps88.audio(() => {});" }))).toBe(
      "ps88.audio(() => {});",
    );
  });

  it("別のツールの呼び出しは拾わない", () => {
    expect(toCode(call("other", { code: "x" }))).toBeNull();
  });

  it("code がまだ無いストリーミング途中の引数を拒む", () => {
    // pi-ai は部分的な JSON を解釈して渡してくるため、引数が空のことがある
    expect(toCode(call(WRITE_CODE, {}))).toBeNull();
  });

  it("code が文字列でなければ拾わない", () => {
    // スキーマを守らない接続先やモデルがある
    expect(toCode(call(WRITE_CODE, { code: 42 }))).toBeNull();
    expect(toCode(call(WRITE_CODE, { code: null }))).toBeNull();
  });

  it("空文字は取り出す", () => {
    // 空のコードを書いてきたことと、書かなかったことは別物
    expect(toCode(call(WRITE_CODE, { code: "" }))).toBe("");
  });
});
