import { useEffect, useSyncExternalStore } from "react";
import * as Settings from "../controller/llm/Settings";

/** AI の接続設定の読み書き */
export const useLLMSettings = () => {
  // 設定と読み込みの状態は同時にしか変わらないため、まとめて読む
  const { settings, loaded } = useSyncExternalStore(
    Settings.subscribe,
    Settings.getState,
  );

  useEffect(() => {
    void Settings.load();
  }, []);

  return {
    settings,
    /** 保存された設定の読み込みが終わっているか */
    loaded,
    /** 会話を始められる状態か */
    ready: Settings.isReady(settings),
    setSettings: Settings.set,
  };
};
