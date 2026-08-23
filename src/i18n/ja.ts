import type { Messages } from "./en.ts";

/**
 * 画面に出る文言 (日本語)
 *
 * Messages 型に合わせているため、en.ts に項目が増えると
 * ここでコンパイルエラーになる (訳し忘れに気付ける)
 */
export const ja: Messages = {
  chat: {
    title: "AI にコードを書いてもらう",
    swapWithPrevious: "反映前のコードと入れ替える",
    clearConversation: "会話を消す",
    connectionSettings: "接続の設定",
    askForFix: "直してもらう",
    fixRequest: "このエラーを直してください。",
    inputPlaceholder: "こんな感じのシンセを書いて",
    inputPlaceholderNotReady: "先に接続の設定をしてください",
    notSetUp: "接続先の設定が未完了です",
    intro: {
      lead: "いまのコードを渡したうえで、要望を伝えます。例えば",
      examples: [
        "ノコギリ波のシンセにして",
        "ローパスフィルタを足して、カットオフをマウスで動かせるように",
        "ディレイを足して",
      ],
      sendHint: "Ctrl (Cmd) + Enter で送信します。",
      setUpFirst:
        "右上の歯車から、使う AI と API キーを設定してください。計算はあなたのアカウントで行われます。",
    },
  },

  settings: {
    provider: "接続先",
    endpoint: "エンドポイント",
    apiKey: "API キー",
    getApiKey: "キーを取得する",
    subscriptionNote:
      "月額プラン (ChatGPT Plus など) とは別に、API の利用登録が必要です。",
    rememberApiKey: "このブラウザに保存する",
    model: "モデル",
    modelPlaceholder: "「一覧」から選ぶか直接入力",
    modelPick: "モデルを選ぶ",
    modelTypeIn: "モデル名を直接入力する",
    modelFromList: "一覧から選ぶ",
    fetchModels: "一覧",
    fetchingModels: "取得中",
    apiKeyFirst: "先に API キーを入力してください",
    modelsFailed: (reason: string) => `一覧を取得できませんでした (${reason})`,
    keyNote:
      "入力したキーはこのブラウザに留まり、上のエンドポイントへ直接送られます。ps88web の側にキーが渡ることはありません (サーバーがありません)。",
  },

  providers: {
    openrouterNote: "1 つのキーで複数社のモデルを選べます",
    localName: "ローカル (Ollama など)",
    localNote: "OpenAI 互換の API を持つローカルのサーバーに接続します",
    otherName: "その他 (OpenAI 互換)",
  },

  client: {
    failed: "リクエストに失敗しました",
    truncated:
      "回答が長さの上限で切れました。モデルの出力上限を超えている可能性があります。",
  },

  prompt: {
    replyLanguage: "説明は日本語で、簡潔に書いてください。",
  },
};
