# PS88 web

[English](README.md) | [日本語](README.ja.md)

波形を JavaScript で記述するシンセサイザー。
ブラウザと VST3 の両方で動作します。

<p align="center">
  <img src="./public/logo.svg" width="160">
</p>

- ブラウザで試す: https://wakewakame.github.io/ps88web
- VST3 版: https://github.com/wakewakame/ps88

# 使い方

例えば 440 Hz の正弦波を鳴らすには以下のように記述します。

```js
// 経過時間 (秒)
let time = 0;

// オーディオコールバック関数を登録
ps88.audio((ctx) => {
  // 出力する波形の長さ
  const length = ctx.audio[0]?.length ?? 0;

  for (let i = 0; i < length; i++) {
    // 440 Hz の正弦波を生成
    let wave = Math.sin(time * 440 * 2 * Math.PI);

    // 全てのチャンネルに同じ波形を出力
    for (let ch of ctx.audio) {
      ch[i] = wave;
    }
    time += 1 / ctx.sampleRate;
  }
});
```

他にもマイクや MIDI の入力を利用したり、GUI を描画したりすることもできます。

- [API docs](https://wakewakame.github.io/ps88web/docs/variables/ps88.html)
- [examples](https://wakewakame.github.io/ps88web/examples/index.html)

# AI にコードを書いてもらう

ツールバーの ✨ からチャット欄を開くと、「ノコギリ波のシンセにして」のように
頼んでコードを書いてもらえます。書かれたコードはそのままエディタに反映され、
すぐに音が変わります。

計算はあなた自身の AI アカウントで行われるため、API キーの用意が必要です。
以下のいずれにも接続できます。

- ChatGPT (OpenAI)
- Gemini (Google)
- Claude (Anthropic)
- OpenRouter
- OpenAI 互換の API を持つもの (Ollama や LM Studio など)

なお月額プラン (ChatGPT Plus など) とは別に、API の利用登録が必要です。
ps88web にはサーバーが無いため、キーはブラウザから接続先へ直接送られます。
ps88web の側にキーが渡ることはありません。

# ローカルでの実行方法

```sh
git clone https://github.com/wakewakame/ps88web.git
cd ps88web
npm install
npm run dev
```
