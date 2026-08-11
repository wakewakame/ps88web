import { useCallback, useEffect, useRef, useState } from "react";
import AudioController from "../controller/AudioController";
import defaultProcessorCode from "../controller/Processor?raw";

const STORAGE_KEY = "code";

// 入力が止まってからビルドするまでの待ち時間
const HOT_RELOAD_DELAY_MS = 1000;

// src クエリが指定された場合は、そのURLからコードを読み込む
// この場合はユーザーのコードではないため localStorage への保存は行わない
const sourceURL = new URLSearchParams(window.location.search).get("src");

const initialCode =
  sourceURL == null
    ? (localStorage.getItem(STORAGE_KEY) ?? defaultProcessorCode)
    : "// loading...";

/**
 * エディタに表示するコードの管理
 *
 * 初期コードの読み込み (URL or localStorage) と、
 * 編集後の自動ビルド・自動保存を行う。
 */
export const useProcessorCode = () => {
  const [code, setCode] = useState(initialCode);

  useEffect(() => {
    if (sourceURL == null) {
      AudioController.build(initialCode);
      return;
    }
    const abort = new AbortController();
    fetch(sourceURL, { signal: abort.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        const text = await res.text();
        setCode(text);
        AudioController.build(text);
      })
      .catch((e) => {
        if (abort.signal.aborted) {
          return;
        }
        console.error(e);
        setCode("// error: failed to load the code from URL");
      });
    return () => abort.abort();
  }, []);

  // 一文字打つ度にビルドすると重いため、入力が止まるまで待つ
  const hotReloadTimeout = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(hotReloadTimeout.current), []);

  const onCodeChange = useCallback((code?: string) => {
    clearTimeout(hotReloadTimeout.current);
    if (code == undefined) {
      return;
    }
    setCode(code);
    hotReloadTimeout.current = setTimeout(() => {
      AudioController.build(code);
      if (sourceURL == null) {
        localStorage.setItem(STORAGE_KEY, code);
      }
    }, HOT_RELOAD_DELAY_MS);
  }, []);

  return { code, onCodeChange };
};
