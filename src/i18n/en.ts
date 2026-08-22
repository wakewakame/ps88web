/**
 * 画面に出る文言 (英語)
 *
 * このファイルが基準になる。他の言語は Messages 型に合わせるため、
 * ここに項目を足すと訳し忘れがコンパイルエラーになる。
 *
 * 値を持たせるだけで、書式の組み立てが要るものは関数にする。
 * 文字列の連結を呼び出し側でやると、語順が変わる言語で行き詰まるため。
 */
export const en = {
  chat: {
    title: "Let an AI write the code",
    swapWithPrevious: "Swap with the code from before",
    clearConversation: "Clear the conversation",
    connectionSettings: "Connection settings",
    /** エラー表示の横に出すボタン */
    askForFix: "Ask for a fix",
    /** 上のボタンを押したときに AI へ送る文章 */
    fixRequest: "Please fix this error.",
    inputPlaceholder: "Describe the synth you want",
    inputPlaceholderNotReady: "Set up the connection first",
    notSetUp: "The connection is not set up yet",
    intro: {
      lead: "Your current code is sent along with your request. For example:",
      examples: [
        "Make it a sawtooth synth",
        "Add a low-pass filter and put the cutoff on the mouse",
        "Add a delay",
      ],
      sendHint: "Press Ctrl (Cmd) + Enter to send.",
      setUpFirst:
        "Open the gear above to pick an AI and enter your API key. It runs on your own account.",
    },
  },

  settings: {
    provider: "Provider",
    endpoint: "Endpoint",
    apiKey: "API key",
    getApiKey: "Get a key",
    subscriptionNote:
      "API access is billed separately from subscription plans such as ChatGPT Plus.",
    rememberApiKey: "Save it in this browser",
    model: "Model",
    modelPlaceholder: "Pick from the list, or type it",
    /** 一覧から選ぶときの、まだ選んでいない状態 */
    modelPick: "Pick a model",
    /** 選択と入力を行き来するリンク */
    modelTypeIn: "Type a model name instead",
    modelFromList: "Pick from the list instead",
    fetchModels: "List",
    fetchingModels: "Loading",
    apiKeyFirst: "Enter the API key first",
    modelsFailed: (reason: string) => `Could not fetch the list (${reason})`,
    keyNote:
      "Your key stays in this browser and goes straight to the endpoint above. It never reaches PS88 web, which has no server of its own.",
  },

  providers: {
    openrouterNote: "One key for models from several vendors",
    localName: "Local (Ollama and similar)",
    localNote: "Connects to a local server with an OpenAI-compatible API",
    otherName: "Other (OpenAI-compatible)",
  },

  client: {
    /** 接続先が理由を返さずに失敗したとき */
    failed: "The request failed",
    truncated:
      "The answer was cut off at the length limit. It may be longer than the model can output in one go.",
  },

  prompt: {
    /** AI にどの言語で答えてほしいかを伝える一行 */
    replyLanguage: "Write your explanation in English, and keep it brief.",
  },
};

/**
 * 文言の型
 *
 * 英語の定義から導く。as const を付けないのは、他の言語が同じ文字列で
 * あることまで求めてしまわないようにするため
 */
export type Messages = typeof en;
