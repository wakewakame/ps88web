import { useEffect, useSyncExternalStore } from "react";
import * as Settings from "../controller/llm/Settings";

/** AI の接続設定の読み書き */
export const useLLMSettings = () => {
  const settings = useSyncExternalStore(Settings.subscribe, Settings.get);
  const loaded = useSyncExternalStore(Settings.subscribe, Settings.isLoaded);

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
