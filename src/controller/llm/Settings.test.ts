import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  recordCurrent,
  toModel,
  withProvider,
  type Settings,
} from "./Settings.ts";

/** Claude を選んでキーを入れた状態 */
const claude = (): Settings => ({
  ...withProvider(defaultSettings(), "anthropic"),
  apiKey: "sk-ant-xxx",
});

describe("withProvider", () => {
  it("接続先ごとの既定値に入れ替える", () => {
    const next = withProvider(claude(), "openai");
    expect(next.providerId).toBe("openai");
    expect(next.baseURL).toBe("https://api.openai.com/v1");
    // キーは接続先ごとに別物なので、そのまま持ち越してはいけない
    expect(next.apiKey).toBe("");
  });

  it("戻ってきたら前に入力した内容を復元する", () => {
    // Claude にキーを入れた状態から ChatGPT に移り、キーを入れて戻る
    const openai = withProvider(claude(), "openai");
    const filled = { ...openai, apiKey: "sk-openai-yyy", model: "gpt-x" };
    const back = withProvider(filled, "anthropic");

    expect(back.apiKey).toBe("sk-ant-xxx");
    expect(back.model).toBe("claude-opus-5");

    // もう一度 ChatGPT に移ると、そちらの入力も残っている
    const again = withProvider(back, "openai");
    expect(again.apiKey).toBe("sk-openai-yyy");
    expect(again.model).toBe("gpt-x");
  });

  it("編集したエンドポイントも接続先ごとに覚える", () => {
    const custom = { ...claude(), baseURL: "https://proxy.example/v1" };
    const back = withProvider(withProvider(custom, "openai"), "anthropic");
    expect(back.baseURL).toBe("https://proxy.example/v1");
  });

  it("同じ接続先を選び直しても入力を消さない", () => {
    const settings = claude();
    expect(withProvider(settings, "anthropic")).toBe(settings);
  });

  it("未知の id は既定の接続先として扱う", () => {
    // 保存された設定が古くて、無くなった接続先を指していることがある
    const next = withProvider(claude(), "unknown");
    expect(next.baseURL).toBe(defaultSettings().baseURL);
  });
});

describe("recordCurrent", () => {
  it("いまの入力をいまの接続先のものとして控える", () => {
    const recorded = recordCurrent(claude());
    expect(recorded.saved.anthropic).toEqual({
      baseURL: "https://api.anthropic.com",
      model: "claude-opus-5",
      apiKey: "sk-ant-xxx",
    });
  });

  it("他の接続先の控えは残す", () => {
    const recorded = recordCurrent(withProvider(claude(), "openai"));
    expect(recorded.saved.anthropic.apiKey).toBe("sk-ant-xxx");
    expect(recorded.saved.openai.apiKey).toBe("");
  });
});

describe("defaultSettings", () => {
  it("一番上の接続先を初期値にする", () => {
    // 並びは使っている人が多い順。初期値もそれに従う
    expect(defaultSettings().providerId).toBe("openai");
  });
});

describe("toModel", () => {
  it("接続先の形式と、入力されたモデルとエンドポイントを載せる", () => {
    const model = toModel({ ...claude(), model: "claude-x" });
    expect(model.api).toBe("anthropic-messages");
    // Chat.ts が登録している識別子と一致していないと振り分けられない
    expect(model.provider).toBe("anthropic-messages");
    expect(model.id).toBe("claude-x");
    expect(model.baseUrl).toBe("https://api.anthropic.com");
  });

  it("Anthropic に必要な出力上限を持たせる", () => {
    // Anthropic は max_tokens が必須で、pi-ai はここから読む
    expect(toModel(claude()).maxTokens).toBeGreaterThan(0);
  });

  it("OpenAI 互換は openai-completions として扱う", () => {
    // Gemini も OpenRouter も互換窓口を使うため、ここは 1 つで足りる
    const model = toModel(withProvider(claude(), "gemini"));
    expect(model.api).toBe("openai-completions");
    expect(model.provider).toBe("openai-completions");
  });

  it("推測の効かない接続先にだけ互換の調整を付ける", () => {
    // Ollama などは developer ロールと reasoning_effort を解さない
    expect(toModel(withProvider(claude(), "local")).compat).toEqual({
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    });
    // 素の OpenAI は pi-ai が baseURL から判断できるので何も指定しない
    expect(toModel(withProvider(claude(), "openai")).compat).toBeUndefined();
  });
});
