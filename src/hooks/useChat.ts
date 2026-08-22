import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@earendil-works/pi-ai";
import * as AudioController from "../controller/audio/AudioController";
import * as CodeStore from "../controller/CodeStore";
import * as Chat from "../controller/llm/Chat";
import * as Prompt from "../controller/llm/Prompt";
import * as Settings from "../controller/llm/Settings";
import { t } from "../i18n";

export type ChatEntry = {
  /** 表示の key 用。会話の中で一意であればよい */
  id: number;
  role: "user" | "assistant";
  /**
   * 画面に出す中身
   *
   * ユーザーの発言は地の文だけなので text ブロックが 1 つ入る。AI の回答は
   * 地の文とコードが混ざる
   */
  blocks: Chat.ChatBlock[];
};

let nextId = 0;

/**
 * AI との会話の管理
 *
 * 会話はページを閉じると消える。コードは CodeStore が保存するため、
 * 続きから作業することはできる
 */
export const useChat = () => {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * AI に届いたコード (null=まだ無い)
   *
   * 反映は呼び出し側が行う。ここで CodeStore を触ると、反映前のコードを
   * 控える処理まで抱え込むことになるため
   */
  const [code, setCode] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /**
   * AI に送る会話
   *
   * 画面に出すもの (entries) とは別に持つ。ツール呼び出しとその結果は
   * 会話の一部として送り返す必要があるが、画面に出すものではないため。
   * また、ユーザーの発言には現在のコードを添えて送っており、その添付を
   * 画面に出すと会話が読みにくくなる
   */
  const historyRef = useRef<Message[]>([]);

  // 画面を離れたら通信も止める
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (trimmed === "" || abortRef.current != null) {
      return;
    }
    const { settings } = Settings.getState();
    if (!Settings.isReady(settings)) {
      setError(t.chat.notSetUp);
      return;
    }

    setError(null);
    // 前回のコードを残すと、今回は何も届かなかったときに反映済みのものが
    // もう一度反映されうる
    setCode(null);

    const userEntry: ChatEntry = {
      id: nextId++,
      role: "user",
      blocks: [{ type: "text", text: trimmed }],
    };
    const assistantEntry: ChatEntry = {
      id: nextId++,
      role: "assistant",
      blocks: [],
    };
    setEntries((prev) => [...prev, userEntry, assistantEntry]);
    setStreaming(true);

    // 画面に出す文章とは別に、現在のコードを添えたものを送る
    historyRef.current.push({
      role: "user",
      content: Prompt.buildUserMessage(
        trimmed,
        CodeStore.get(),
        AudioController.getLastError(),
      ),
      timestamp: Date.now(),
    });

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const message = await Chat.streamChat(
        Settings.toModel(settings),
        settings.apiKey,
        Prompt.SYSTEM_PROMPT,
        historyRef.current,
        {
          onUpdate: (blocks) => {
            setEntries((prev) =>
              prev.map((entry) =>
                entry.id === assistantEntry.id ? { ...entry, blocks } : entry,
              ),
            );
          },
          onCode: setCode,
        },
        abort.signal,
      );

      if (Chat.isComplete(message)) {
        historyRef.current.push(message, ...Chat.toToolResults(message));
      } else {
        // 中断や失敗で終わった回答は会話に残さない。ユーザーの発言だけを
        // 残すと、そのまま次を送ったときに続きとして扱われる
        historyRef.current.pop();
      }
      const reason = Chat.toErrorMessage(message);
      if (reason != null) {
        console.error(message.errorMessage ?? reason);
        setError(reason);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      // 何も返らなかった場合、空の吹き出しだけが残ると壊れて見えるため消す
      setEntries((prev) =>
        prev.filter(
          (entry) =>
            entry.id !== assistantEntry.id || entry.blocks.length !== 0,
        ),
      );
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    historyRef.current = [];
    setEntries([]);
    setError(null);
    setCode(null);
  }, []);

  return { entries, streaming, error, code, send, stop, clear };
};
