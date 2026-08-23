import { useSyncExternalStore } from "react";
import * as AudioController from "../controller/audio/AudioController";

/**
 * ユーザーコードの実行エラー (null=エラー無し)
 *
 * コードを書き換えると消える。エラーが残っている間は AI に添えて送る
 */
export const useProcessorError = () =>
  useSyncExternalStore(
    AudioController.subscribeError,
    AudioController.getLastError,
  );
