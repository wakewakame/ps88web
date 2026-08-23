import { describe, expect, it } from "vitest";
import {
  current,
  defaultSettings,
  edit,
  isReady,
  toConnection,
  type Settings,
} from "./Settings.ts";

/** 接続先を選んだだけの状態 */
const select = (settings: Settings, providerId: string): Settings => ({
  ...settings,
  providerId,
});

/** Claude を選んでキーを入れた状態 */
const claude = (): Settings =>
  edit(select(defaultSettings(), "anthropic"), { apiKey: "sk-ant-xxx" });

describe("edit", () => {
  it("接続先ごとに入力を覚え、戻ってきたら復元する", () => {
    // Claude にキーを入れた状態から ChatGPT に移り、キーを入れて戻る
    const openai = edit(select(claude(), "openai"), {
      apiKey: "sk-openai-yyy",
      model: "gpt-x",
    });

    expect(current(select(openai, "anthropic"))).toMatchObject({
      apiKey: "sk-ant-xxx",
      model: "claude-opus-5",
    });
    // もう一度 ChatGPT に移っても、そちらの入力は残っている
    expect(current(openai)).toMatchObject({
      apiKey: "sk-openai-yyy",
      model: "gpt-x",
    });
  });
});

describe("isReady", () => {
  it("モデルが決まっていなければ使えない", () => {
    // ChatGPT は既定のモデルを持たない (一覧から選んでもらう)
    expect(isReady(defaultSettings())).toBe(false);
  });

  it("キーが要る接続先ではキーが揃うまで使えない", () => {
    expect(isReady(select(defaultSettings(), "anthropic"))).toBe(false);
    expect(isReady(claude())).toBe(true);
  });

  it("キーが要らない接続先ではモデルだけで使える", () => {
    // ローカル LLM は認証を求めないことが多い
    const local = edit(select(defaultSettings(), "custom"), {
      baseURL: "http://localhost:11434/v1",
      model: "llama",
    });
    expect(isReady(local)).toBe(true);
  });
});

describe("toConnection", () => {
  it("接続先の定義と入力を 1 つにまとめる", () => {
    expect(toConnection(claude())).toEqual({
      protocol: "anthropic-messages",
      baseURL: "https://api.anthropic.com",
      apiKey: "sk-ant-xxx",
      // 素の OpenAI や Anthropic は pi-ai が baseURL から判断できる
      compat: undefined,
    });
    // 推測の効かない接続先の調整を落とすと、Ollama などが黙って動かなくなる
    expect(toConnection(select(claude(), "custom")).compat).toEqual({
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    });
  });
});
