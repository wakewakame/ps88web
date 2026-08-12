import { useCallback, useEffect, useRef, useState } from "react";
import * as AudioController from "../controller/AudioController";
import * as Storage from "../controller/Storage";
import defaultProcessorCode from "../controller/Processor?raw";

const CODE_STORAGE_KEY = "code";

// 入力が止まってからビルドするまでの待ち時間
const HOT_RELOAD_DELAY_MS = 1000;

// 保存されたコードの読み込みは非同期なので、それまでの表示
const LOADING_CODE = "// loading...";

// src クエリが指定された場合は、そのURLからコードを読み込む
// この場合はユーザーのコードではないため保存は行わない
const sourceURL = new URLSearchParams(window.location.search).get("src");

/**
 * エディタに表示するコードの管理
 *
 * 初期コードの読み込み (URL or 保存されたコード) と、
 * 編集後の自動ビルド・自動保存を行う。
 */
export const useProcessorCode = () => {
  const [code, setCode] = useState(LOADING_CODE);

  useEffect(() => {
    const abort = new AbortController();
    const apply = (next: string) => {
      if (abort.signal.aborted) {
        return;
      }
      setCode(next);
      AudioController.build(next);
    };

    if (sourceURL == null) {
      Storage.load<string>(CODE_STORAGE_KEY).then((stored) =>
        apply(stored ?? defaultProcessorCode),
      );
      return () => abort.abort();
    }

    fetch(sourceURL, { signal: abort.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        apply(await res.text());
      })
      .catch((e) => {
        if (abort.signal.aborted) {
          return;
        }
        console.error(e);
        apply("// error: failed to load the code from URL");
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
        Storage.store(CODE_STORAGE_KEY, code);
      }
    }, HOT_RELOAD_DELAY_MS);
  }, []);

  return { code, onCodeChange };
};
