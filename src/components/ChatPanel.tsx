import { memo, useCallback, useEffect, useRef, useState } from "react";
import * as CodeStore from "../controller/CodeStore";
import type { ChatBlock } from "../controller/llm/Chat";
import * as Settings from "../controller/llm/Settings";
import { useChat } from "../hooks/useChat";
import type { ChatEntry } from "../hooks/useChat";
import { useLLMSettings } from "../hooks/useLLMSettings";
import { useProcessorError } from "../hooks/useProcessorError";
import { ChatSettings } from "./ChatSettings";
import { t } from "../i18n";

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
  const { settings, loaded } = useLLMSettings();
  const ready = Settings.isReady(settings);
  const { entries, streaming, error, code, send, stop, clear } = useChat();
  const processorError = useProcessorError();
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 反映する前のコード。行き来できるように保持する
  const [undoCode, setUndoCode] = useState<string | null>(null);

  // 設定が未完了なら開いておく。読み込みを待たずに判断すると、保存済みの
  // 設定がある人にも一瞬だけ設定画面が出てしまう
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

  // コードが最後まで届いた時点で、そのままエディタへ反映する。
  // 書きかけのコードは useChat から流れてこないため、途中のものが
  // ビルドされることはない
  useEffect(() => {
    // すでに同じ内容なら触らない。ここを「前回反映したコード」ではなく
    // 現在のコードと比べているのは、反映したあとにユーザーが手で書き換えた
    // 場合や、会話を消してもう一度同じコードを受け取った場合にも、
    // 意図どおり反映されるようにするため
    if (code == null || code === CodeStore.get()) {
      return;
    }
    applyCode(code);
  }, [code, applyCode]);

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
          <span className="text-sm text-zinc-100 grow">{t.chat.title}</span>
          {undoCode != null ? (
            <IconButton
              icon="swap_horiz"
              title={t.chat.swapWithPrevious}
              onClick={onSwap}
            />
          ) : null}
          <IconButton
            icon="delete_sweep"
            title={t.chat.clearConversation}
            onClick={() => {
              clear();
              setUndoCode(null);
            }}
          />
          <IconButton
            icon="settings"
            title={t.chat.connectionSettings}
            pressed={settingsOpen}
            onClick={() => setSettingsOpen(!settingsOpen)}
          />
        </div>

        {settingsOpen ? (
          // 設定が縦に長いときも、会話の領域を潰しきらないように上限を設ける
          <div className="flex-none max-h-[50%] overflow-y-auto">
            <ChatSettings settings={settings} onChange={Settings.set} />
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
              onClick={() => void send(t.chat.fixRequest)}
            >
              {t.chat.askForFix}
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
              ready ? t.chat.inputPlaceholder : t.chat.inputPlaceholderNotReady
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
        <p>{t.chat.intro.lead}</p>
        <ul className="list-disc list-inside">
          {/* 文言は起動時に決まった定数で、並び替えも増減もしない。
              添字をキーにして問題が出る場面が無く、文言そのものをキーに
              すると、訳に同じ文が並んだときに重複してしまう */}
          {t.chat.intro.examples.map((example, i) => (
            <li key={i}>{example}</li>
          ))}
        </ul>
        <p>{t.chat.intro.sendHint}</p>
      </>
    ) : (
      <p>{t.chat.intro.setUpFirst}</p>
    )}
  </div>
);

type EntryArgs = {
  entry: ChatEntry;
};

// ストリーミング中は増分が届くたびに親が再 render されるが、書き換わるのは
// 最後の発言だけ。memo を付けないと、会話が伸びるほど重くなる
const Entry = memo(({ entry }: EntryArgs) => {
  if (entry.role === "user") {
    return (
      <p className="self-end max-w-11/12 px-3 py-2 rounded-xl bg-zinc-700 text-zinc-100 text-sm whitespace-pre-wrap break-words">
        {entry.blocks.map((block) => (block.type === "text" ? block.text : ""))}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {entry.blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
});

type BlockViewArgs = {
  block: ChatBlock;
};

const BlockView = ({ block }: BlockViewArgs) => {
  if (block.type === "text") {
    return (
      <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words">
        {block.text}
      </p>
    );
  }
  return (
    <div className="rounded-md bg-zinc-900 border border-zinc-700 overflow-hidden">
      <pre className="p-2 max-h-48 overflow-auto text-xs text-zinc-300">
        <code>{block.code}</code>
      </pre>
    </div>
  );
};
