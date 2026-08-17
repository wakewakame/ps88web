import { useCallback, useEffect, useRef, useState } from "react";
import * as AudioController from "../controller/AudioController";
import * as CodeStore from "../controller/CodeStore";
import * as Client from "../controller/llm/Client";
import * as Prompt from "../controller/llm/Prompt";
import * as Settings from "../controller/llm/Settings";
import { t } from "../i18n";

export type ChatEntry = {
  /** 表示の key 用。会話の中で一意であればよい */
  id: number;
  role: "user" | "assistant";
  content: string;
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
  const abortRef = useRef<AbortController | null>(null);

  // 画面を離れたら通信も止める
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed === "" || abortRef.current != null) {
        return;
      }
      const settings = Settings.get();
      if (!Settings.isReady(settings)) {
        setError(t.chat.notSetUp);
        return;
      }

      setError(null);
      const userEntry: ChatEntry = {
        id: nextId++,
        role: "user",
        content: trimmed,
      };
      const assistantEntry: ChatEntry = {
        id: nextId++,
        role: "assistant",
        content: "",
      };

      // AI に渡す履歴。画面に出す文章とは別に、現在のコードを添えたものを送る。
      // 画面に添付内容まで出すと会話が読みにくくなるため分けている
      const history: Client.ChatMessage[] = entries.map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));
      history.push({
        role: "user",
        content: Prompt.buildUserMessage(
          trimmed,
          CodeStore.get(),
          AudioController.getLastError(),
        ),
      });

      setEntries((prev) => [...prev, userEntry, assistantEntry]);
      setStreaming(true);

      const abort = new AbortController();
      abortRef.current = abort;
      try {
        await Client.streamChat(
          Settings.toConnection(settings),
          Prompt.SYSTEM_PROMPT,
          history,
          (delta) => {
            setEntries((prev) =>
              prev.map((entry) =>
                entry.id === assistantEntry.id
                  ? { ...entry, content: entry.content + delta }
                  : entry,
              ),
            );
          },
          abort.signal,
        );
      } catch (e) {
        // 中断はユーザーの操作なのでエラー表示しない
        if (!abort.signal.aborted) {
          console.error(e);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        // 何も返らなかった場合、空の吹き出しだけが残ると壊れて見えるため消す
        setEntries((prev) =>
          prev.filter(
            (entry) => entry.id !== assistantEntry.id || entry.content !== "",
          ),
        );
      }
    },
    [entries],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setEntries([]);
    setError(null);
  }, []);

  return { entries, streaming, error, send, stop, clear };
};
