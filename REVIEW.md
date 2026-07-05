# ps88web リポジトリ全体レビュー

対象: main ブランチ (16e429f)。`public/docs/` は typedoc の生成物のためレビュー対象外。

全体としてはコンパクトで読みやすい構成です。AudioWorklet 内でユーザーコードを `new Function` で実行し、
メインスレッドとは型付きメッセージ (`AudioControllerTypes.ts`) でやり取りする設計は筋が良く、
型ガードの使い方も一貫しています。以下は見つかった問題を優先度順にまとめたものです。

---

## 🔴 高: 動作に影響するバグ

### 1. `ps88.save(Uint8Array)` がリロード後に壊れる
`src/controller/AudioController.ts:183` で保存データを `JSON.stringify` していますが、
`Uint8Array` を JSON 化すると `{"0":1,"1":2,...}` という**ただのオブジェクト**になります。
リロード後に `JSON.parse` して worklet に渡す (`AudioController.ts:131`) と、
`isSaveDataBytes` の判定 (`AudioControllerTypes.ts:54`) は `type === "bytes"` だけを見るため通ってしまい、
`ps88.load()` が `Uint8Array` ではないオブジェクトを返します。ドキュメント記載の API 仕様と食い違います。

**修正案**: 保存時に Base64 などへエンコードし、復元時に `Uint8Array` へ戻す。
(将来 IndexedDB 化する予定なら、その際に structured clone でそのまま保存するのでも解決します)

### 2. `NoteOn velocity=0` を NoteOff として扱っていない
`src/controller/AudioController.ts:85-104`。MIDI の慣習では「NoteOn velocity 0 = NoteOff」で、
ランニングステータスを使う実機キーボードは NoteOff の代わりにこれを送ることが多いです。
現状 `type === 0x9` は velocity 0 でも NoteOn として worklet に届くため、
`Processor.js` のように `NoteOff` で `keyboard.delete` する実装では**音が止まらなくなります**。

**修正案**: `type === 0x9 && velocity === 0` のとき NoteOff として送る。

### 3. render 中に `fetch` を実行している (React のルール違反)
`src/App.tsx:53-70`。`?src=` 読み込みの fetch がコンポーネント本体(render)で直接実行されています。

- StrictMode (`main.tsx:8`) では render が 2 回走るため fetch も 2 回飛ぶ
- `setLoading(false)` が resolve するまでの間に再 render が起きるたびに fetch が追加発火する
- 読み込み中にユーザーがエディタを編集すると、後から resolve した fetch が `setCode` で編集内容を上書きする

**修正案**: `useEffect(() => { ... }, [])` に移動し、AbortController で二重実行を打ち切る。

### 4. `setMIDI` の `removeEventListener` が効いていない
`src/controller/AudioController.ts:66-77`。`onMIDIMessage` ハンドラは `setMIDI` を呼ぶたびに
新しいクロージャとして作られるため、`removeEventListener` に渡しても**前回登録したものと別参照**で解除できません。
現状は直後の `midi.close()` に救われていますが、close が失敗した場合や将来 close を外した場合にリスナーが多重登録され、
1 打鍵で複数の NoteOn が届くようになります。

**修正案**: ハンドラをモジュールレベル(または context に保持)の単一関数にする。

### 5. `index.css` の `font` 指定が無効な CSS
`src/index.css:9-11` の `* { font: "Roboto Mono"; }` は不正な値です
(`font` ショートハンドは最低でも size と family が必要)。ブラウザに無視されるため、
せっかく Google Fonts から読み込んでいる Roboto Mono がテキストに適用されていません。

**修正案**: `font-family: "Roboto Mono", monospace;` にする。
ただし `*` セレクタのままだと Material Icons(`material-icons` クラスが指定する `font-family`)を
上書きしてアイコンが壊れるので、`body { font-family: ... }` にして継承させるのが安全です。

---

## 🟡 中: 潜在バグ・堅牢性

### 6. `onDraw` の参照が毎 render 変わり、Canvas の描画ループが再起動される
`src/App.tsx:141-148` の `onDraw` は render ごとに新しい関数になるため、
`Canvas.tsx:94` の `useEffect` 依存配列に引っかかり、**エディタの 1 キーストロークごとに**
requestAnimationFrame ループの破棄・再生成とイベントリスナーの付け替えが走ります。
`Canvas.tsx:20` のマウス状態もリセットされるので、ドラッグ操作中に再 render が起きると座標が (0,0) に飛びます。

**修正案**: App 側で `useCallback(onDraw, [])` にする(参照先はすべて static なので依存なしで安全)。

### 7. render 中の `addEventListener` でリスナーが蓄積する
`src/App.tsx:150-157`。`appRef.current?.addEventListener("touchmove", ...)` が render 本体にあるため、
再 render のたびに新しいリスナーが追加され続けます(初回 render では `current` が null で登録されない、という問題もあります)。

**修正案**: `useEffect` に移動してクリーンアップで解除する。

### 8. `getContexts()` の競合で AudioContext が二重生成されうる
`src/controller/AudioController.ts:125-163`。`context` の代入前に `await ctx.audioWorklet.addModule(...)` があるため、
初期化中に別の呼び出し(例: 出力トグルと MIDI トグルをほぼ同時に操作)が入ると
両方が `context == undefined` を見て AudioContext を 2 つ作り、片方が捨てられます。

**修正案**: `Promise<AudioControllerContext>` 自体をキャッシュする(初回呼び出しで即代入)。

### 9. 入力コピーのループ変数の取り違え
`src/controller/AudioControllerWorker.ts:137`。`input` でループしているのに読み出しが `inputs[0][ch][sample]` に
固定されています。現在は `numberOfInputs: 1` なので実害はありませんが、入力数を増やした瞬間にバグになります。
`inputs[input][ch][sample]` が意図した形のはずです。

### 10. ホットリロードのタイマー ID を useState で持っている
`src/App.tsx:31-50`。タイマー ID は描画に関係ない値なので `useRef` が適切です。
useState だとキーストロークごとに不要な再 render が 1 回増えるうえ(問題 6 を悪化させる)、
同一 render 内で onChange が複数回呼ばれた場合に古い ID を参照してタイマーがリークする余地があります。

### 11. 出力デバイスの ButtonSelector だけ `disabled` 処理がない
`src/App.tsx:209-215`。マイク・MIDI は `disabled={inputs === null}` で権限拒否を表現していますが、
出力 (`outputs`) だけ `disabled` が渡されておらず、権限拒否時 (`outputs === null`) に空のリストが開くだけになります。

---

## 🟢 低: 改善提案

### 12. TypeScript の `strict` が無効
`tsconfig.app.json` / `tsconfig.node.json` に `"strict": true` がありません。
現状のコードは null チェックが丁寧なのでほぼそのまま通るはずで、有効化のコストは低いです。
`noUncheckedIndexedAccess` も合わせると `inputs[0][ch]` 系の取り違え(問題 9)を型で検出できます。

### 13. `?src=` で任意 URL のコードを取得・実行する点の扱い
`src/App.tsx:25,54`。`?src=https://…` のリンクを踏ませるだけで第三者のコードが実行されます。
実行環境が AudioWorklet 内(DOM・ネットワークアクセスなし)なので影響範囲は限定的ですが、
localStorage の `code` を消す・上書きする、音を出す、CPU を食う程度のことはできます。
共有リンク機能(TODO.md)を作る前に、「外部 URL のときは実行前に確認を出す」
「同一オリジンのみ許可する」などの方針を決めておくと良いです。

### 14. 型定義の重複
`GuiContext.addPolygon` / `addText` のオプション型が `lib/ps88.d.ts:206-227` と
`AudioControllerWorker.ts:75-96` に手書きで重複しています。`Parameters<PS88.GuiContext["addPolygon"]>[1]`
のように d.ts から導出すると、API 変更時のズレを防げます。
また `lib/ps88.d.ts` の `AudioContext` は DOM の `AudioContext` と同名で、
`AudioController.ts` では DOM 側、worker では PS88 側を指すため読み手が混乱しやすいです
(`Ps88AudioContext` など別名も検討の余地あり)。

### 15. CI の再現性
`.github/workflows/static.yml`:
- `node-version: 'latest'` は将来の Node 破壊的変更でビルドが突然壊れます。LTS (`22` / `24`) 固定を推奨
- `npm install` ではなく `npm ci` を使うと lockfile 通りの再現ビルドになります
- `npm run lint`(と `prettier --check`)を deploy 前に走らせるとレビュー済みの品質が保てます

### 16. `sampler.js` のユーティリティ内の未使用バグ
`public/examples/examples/sampler.js:64-66` の `vec2.unit` は `len(a)` / `div(a, len)` と
裸で呼んでいて、呼ぶと ReferenceError になります(`vec2.len` / `vec2.div` が正)。
`vec2.get_rot` (89 行目) も配列に対して `a.y` / `a.x` を参照しています。
どちらも現在未使用なので実害はありませんが、example はユーザーがコピーして使う想定なら直しておきたいところです。

### 17. その他小さな点
- `src/App.tsx:183` の `./license.md` は Vite の `build.license` が生成するファイルなので、`npm run dev` では 404 になります
- `src/index.css:1` の Google Fonts への `@import` はオフライン時・中国圏などで描画をブロックします。セルフホスト(例: Fontsource)も検討を
- `ButtonSelector.tsx:36` のドロップダウンは `onMouseLeave` で閉じる設計のため、タッチデバイスでは開いたままになります(外側タップで閉じる処理があると良い)
- `Keyboard.tsx:9` の `pressed` state は全鍵盤で共有されており、マルチタッチで複数鍵を押すと hover 高さの見た目が最後の操作に引きずられます(表示のみの問題)

---

## 良かった点

- メッセージの型と型ガードを `AudioControllerTypes.ts` に集約し、送受信双方で使い回している構成
- ユーザーコードの例外時にコールバックを確実に解除して console.error する防御 (`AudioControllerWorker.ts:59-65,148-154`)
- `AudioDevices.getPermission` の「prompt 状態ならダミー取得で権限を取る」処理や、
  ディスプレイキャプチャで音声トラックがない場合の後始末 (`AudioDevices.ts:65-68`) など、ブラウザ API の癖への配慮
- `lib/ps88.d.ts` を Monaco の補完 (`App.tsx:242`) と typedoc の両方の source of truth にしている点

## 対応の優先順位(提案)

1. 問題 1・2(save の破損、velocity 0)— API/実機互換のバグで、ユーザーに直接見える
2. 問題 3・6・7(React 周り)— まとめて `useEffect`/`useCallback` 化すると一掃できる
3. 問題 5(フォント CSS)— 1 行修正
4. 問題 12・15(strict / CI)— 今後の変更の安全ネットとして早めに入れると効果が大きい
