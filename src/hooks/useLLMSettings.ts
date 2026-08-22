import { useEffect, useSyncExternalStore } from "react";
import * as Settings from "../controller/llm/Settings";

/**
 * AI の接続設定を React から読む
 *
 * するのは購読と読み込みの開始だけで、状態はそのまま返す。判定や更新は
 * Settings 側の関数がそのまま使えるため、ここで包み直すと同じものへの
 * 入口が 2 つできてしまう
 */
export const useLLMSettings = () => {
  useEffect(() => {
    void Settings.load();
  }, []);

  // 設定と読み込みの状態は同時にしか変わらないため、まとめて読む
  return useSyncExternalStore(Settings.subscribe, Settings.getState);
};
