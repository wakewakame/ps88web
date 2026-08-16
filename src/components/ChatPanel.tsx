import { memo, useCallback, useEffect, useRef, useState } from "react";
import * as CodeStore from "../controller/CodeStore";
import { parseSegments, pickCode } from "../controller/llm/Segments";
import type { PickedCode, Segment } from "../controller/llm/Segments";
import { useChat } from "../hooks/useChat";
import type { ChatEntry } from "../hooks/useChat";
import { useLLMSettings } from "../hooks/useLLMSettings";
import { useProcessorError } from "../hooks/useProcessorError";
import { ChatSettings } from "./ChatSettings";

type ChatPanelArgs = {
  visible: boolean;
};

/**
 * AI にコードを書いてもらうためのチャット欄
 *
 * AI の呼び出しはユーザー自身のアカウントで行う (ChatSettings 参照)。
 * 生成されたコードはエディタに自動で反映する。書いてもらうたびにボタンを
 * 押すのは煩わしく、音がすぐ変わる方がこのツールの使い方に合うため。
 * 意図しない上書きに備えて、反映前のコードと行き来できるようにしておく
 */
export const ChatPanel = ({ visible }: ChatPanelArgs) => {
  const { settings, loaded, ready, setSettings } = useLLMSettings();
  const { entries, streaming, error, send, stop, clear } = useChat();
  const processorError = useProcessorError();
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 反映する前のコード。行き来できるように保持する
  const [undoCode, setUndoCode] = useState<string | null>(null);

  // 設定が未完了なら開いておく。読み込みを待たずに開くと、保存済みの設定が
  // ある人にも一瞬だけ設定画面が出てしまう
  useEffect(() => {
    if (loaded && !ready) {
      setSettingsOpen(true);
    }
  }, [loaded, ready]);

  // 新しい発言が届いたら一番下まで送る
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries]);

  // 送信できる状態か。ボタンの活性とキー操作で同じ判断を使う。
  // 片方だけで判断すると、送れない状況でも入力欄だけ空になってしまう
  const canSend = !streaming && ready && input.trim() !== "";

  const onSend = () => {
    if (!canSend) {
      return;
    }
    const text = input;
    setInput("");
    void send(text);
  };

  const applyCode = useCallback((code: string) => {
    setUndoCode(CodeStore.get());
    CodeStore.set(code, true);
  }, []);

  // 回答にコードブロックが出そろった時点で、そのままエディタへ反映する。
  // pickCode は閉じていないブロックを選ばないため、ストリーミング途中の
  // 書きかけのコードがビルドされることはない
  const latest = entries.at(-1);
  const picked: PickedCode | null =
    latest?.role === "assistant" ? pickCode(latest.content) : null;
  const latestCode = picked?.type === "code" ? picked.code : null;
  useEffect(() => {
    // すでに同じ内容なら触らない。ここを「前回反映したコード」ではなく
    // 現在のコードと比べているのは、反映したあとにユーザーが手で書き換えた
    // 場合や、会話を消してもう一度同じコードを受け取った場合にも、
    // 意図どおり反映されるようにするため
    if (latestCode == null || latestCode === CodeStore.get()) {
      return;
    }
    applyCode(latestCode);
  }, [latestCode, applyCode]);

  // 反映しなかったときは理由を出す。黙って何も起きないと、壊れているのか
  // そういう仕様なのかが画面から判断できない。
  // 書いている途中は当然まだ反映できないので、終わってから出す
  const notApplied = streaming ? null : describeNotApplied(picked);

  // 反映前のコードと入れ替える。戻すのではなく入れ替えにしているのは、
  // 反映後に手で書き直したものを、押し間違いで失わないようにするため
  const onSwap = () => {
    if (undoCode == null) {
      return;
    }
    const current = CodeStore.get();
    CodeStore.set(undoCode, true);
    setUndoCode(current);
  };

  return (
    // 開閉は幅のアニメーションで行う。中身は幅を固定したまま外側で切り取るため、
    // アニメーション中に文章が折り返し直されることがない。
    // 閉じている間も中身は残し、会話と入力中の文章を保つ。ただし inert を付けて
    // キーボード操作の行き先にはしない (見えないものに移ると迷子になるため)
    <div
      inert={!visible}
      className={`
        flex-none overflow-hidden
        max-sm:absolute max-sm:inset-y-0 max-sm:right-0 max-sm:z-2
        ${visible ? "w-96 max-sm:w-screen" : "w-0"}
        transition-[width] duration-150 ease-in-out
      `}
    >
      {/* App 全体は select-none にしてある (鍵盤やキャンバスを操作するときに
          文字が選択されると邪魔なため) が、チャットは読んで写す場所なので戻す */}
      <div className="h-full w-96 max-sm:w-screen flex flex-col select-text bg-zinc-800 border-l border-zinc-700">
        <div className="flex-none flex flex-row items-center gap-2 px-3 py-2 border-b border-zinc-700">
          <span className="text-sm text-zinc-100 grow">
            AI にコードを書いてもらう
          </span>
          {undoCode != null ? (
            <IconButton
              icon="swap_horiz"
              title="反映前のコードと入れ替える"
              onClick={onSwap}
            />
          ) : null}
          <IconButton
            icon="delete_sweep"
            title="会話を消す"
            onClick={() => {
              clear();
              setUndoCode(null);
            }}
          />
          <IconButton
            icon="settings"
            title="接続の設定"
            pressed={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          />
        </div>

        {settingsOpen ? (
          // 設定が縦に長いときも、会話の領域を潰しきらないように上限を設ける
          <div className="flex-none max-h-[50%] overflow-y-auto">
            <ChatSettings settings={settings} onChange={setSettings} />
          </div>
        ) : null}

        {/* flex の子は既定で内容より小さくならないため、min-h-0 を付けないと
            会話が伸びた分だけ枠を押し広げ、ページ全体が縦に伸びてしまう。
            ここだけがスクロールする場所になるようにする */}
        <div className="grow min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
          {entries.length === 0 ? (
            <Placeholder ready={ready} />
          ) : (
            entries.map((entry) => <Entry key={entry.id} entry={entry} />)
          )}
          <div ref={bottomRef} />
        </div>

        {notApplied != null ? (
          <p className="flex-none px-3 py-2 text-xs text-amber-400 border-t border-zinc-700">
            {notApplied}
          </p>
        ) : null}

        {error != null ? (
          <p className="flex-none px-3 py-2 text-xs text-red-400 border-t border-zinc-700">
            {error}
          </p>
        ) : null}

        {processorError != null ? (
          <div className="flex-none flex flex-row items-center gap-2 px-3 py-2 border-t border-zinc-700">
            <p className="grow text-xs text-red-400 break-all">
              {processorError.message}
            </p>
            <button
              className="
              px-2 py-1 flex-none rounded-md bg-zinc-700 hover:bg-zinc-600
              text-zinc-100 text-xs whitespace-nowrap cursor-pointer
              disabled:text-zinc-500 disabled:cursor-not-allowed
              transition-all duration-150 ease-in-out
            "
              disabled={streaming || !ready}
              onClick={() => void send("このエラーを直してください。")}
            >
              直してもらう
            </button>
          </div>
        ) : null}

        <div className="flex-none flex flex-row gap-2 p-3 border-t border-zinc-700">
          <textarea
            className="
            grow px-2 py-1 rounded-md bg-zinc-900 text-zinc-100 text-sm resize-none
            border border-zinc-700 focus:border-blue-400 focus:outline-none
          "
            rows={2}
            placeholder={
              ready
                ? "こんな感じのシンセを書いて"
                : "先に接続の設定をしてください"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter は改行。誤送信を防ぐため送信は Ctrl / Cmd + Enter にする
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          <button
            className={`
            px-3 flex-none rounded-md text-zinc-100 text-sm cursor-pointer
            disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed
            ${streaming ? "bg-zinc-600 hover:bg-zinc-500" : "bg-blue-400 hover:bg-blue-300"}
            transition-all duration-150 ease-in-out
          `}
            disabled={!streaming && !canSend}
            onClick={() => (streaming ? stop() : onSend())}
          >
            <span className="material-icons align-middle">
              {streaming ? "stop" : "send"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * コードを反映しなかった理由の説明 (null=説明する必要が無い)
 *
 * コードブロックがそもそも無い回答 (質問への答えなど) は、反映されなくて
 * 当たり前なので黙っている
 */
const describeNotApplied = (picked: PickedCode | null): string | null => {
  switch (picked?.type) {
    case "unclosed":
      return "コードが最後まで届かなかったため反映していません。もう一度頼むか、短く分けて頼んでみてください。";
    case "notJavaScript":
      return "JavaScript のコードブロックが無かったため反映していません。";
    case "notPS88":
      return "ps88 を使っていないコードだったため反映していません。";
    default:
      return null;
  }
};

type IconButtonArgs = {
  icon: string;
  title: string;
  pressed?: boolean;
  onClick: () => void;
};

const IconButton = ({ icon, title, pressed, onClick }: IconButtonArgs) => (
  <button
    title={title}
    aria-label={title}
    aria-pressed={pressed}
    onClick={onClick}
    className={`
      flex-none size-8 rounded-full cursor-pointer
      ${pressed === true ? "bg-blue-400 hover:bg-blue-300 text-zinc-100" : "text-zinc-300 hover:bg-zinc-700"}
      transition-all duration-150 ease-in-out
    `}
  >
    <span className="material-icons align-middle text-lg">{icon}</span>
  </button>
);

const Placeholder = ({ ready }: { ready: boolean }) => (
  <div className="text-xs text-zinc-500 flex flex-col gap-2">
    {ready ? (
      <>
        <p>いまのコードを渡したうえで、要望を伝えます。例えば</p>
        <ul className="list-disc list-inside">
          <li>ノコギリ波のシンセにして</li>
          <li>ローパスフィルタを足して、カットオフをマウスで動かせるように</li>
          <li>ディレイを足して</li>
        </ul>
        <p>Ctrl (Cmd) + Enter で送信します。</p>
      </>
    ) : (
      <p>
        右上の歯車から、使う AI と API キーを設定してください。
        計算はあなたのアカウントで行われます。
      </p>
    )}
  </div>
);

type EntryArgs = {
  entry: ChatEntry;
};

// ストリーミング中は 1 文字ごとに親が再 render されるが、書き換わるのは
// 最後の発言だけ。memo を付けないと、過去の発言まで毎回 parseSegments を
// やり直すことになり、会話が伸びるほど重くなる
const Entry = memo(({ entry }: EntryArgs) => {
  if (entry.role === "user") {
    return (
      <p className="self-end max-w-11/12 px-3 py-2 rounded-xl bg-zinc-700 text-zinc-100 text-sm whitespace-pre-wrap break-words">
        {entry.content}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {parseSegments(entry.content).map((segment, i) => (
        <SegmentView key={i} segment={segment} />
      ))}
    </div>
  );
});

type SegmentViewArgs = {
  segment: Segment;
};

const SegmentView = ({ segment }: SegmentViewArgs) => {
  if (segment.type === "text") {
    return (
      <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words">
        {segment.text}
      </p>
    );
  }
  return (
    <div className="rounded-md bg-zinc-900 border border-zinc-700 overflow-hidden">
      <pre className="p-2 max-h-48 overflow-auto text-xs text-zinc-300">
        <code>{segment.code}</code>
      </pre>
    </div>
  );
};
