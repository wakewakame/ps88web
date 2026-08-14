import * as AudioController from "./AudioController.ts";
import * as AudioDevices from "./AudioDevices.ts";
import { enqueue } from "./Queue.ts";
import { createStore } from "./Store.ts";

// 入力の実行時の状態を持つ。
//
// マイクと画面キャプチャは同時に使えない (どちらも AudioController.setInput の
// 唯一の入力になる) ため、別々の状態ではなく「今の入力源」ひとつで表す。
//
// 設定の復元は行っていない。マイクを開くと録音インジケータが点灯するため、
// 起動時に自動で開くかどうかは方針の判断が必要。画面キャプチャは
// getDisplayMedia が仕様上ユーザー操作を必須とするため、そもそも復元できない。

export type InputState = {
  /** 現在の入力源 */
  source: "mic" | "display" | null;
  /** 選択中のマイク (null=既定)。使用中とは限らない */
  deviceId: string | null;
};

const store = createStore<InputState>({ source: null, deviceId: null });

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;

/**
 * マイクを切り替える
 *
 * @param enabled - true=有効化, false=無効化
 * @param deviceId - マイクのデバイスID (null=既定のデバイス)
 */
export const setMicrophone = (enabled: boolean, deviceId: string | null) => {
  store.update({ deviceId });
  enqueue(async () => {
    const stream = enabled
      ? await AudioDevices.getInputStream(deviceId ?? undefined)
      : null;
    store.update({ source: stream != null ? "mic" : null });
    await AudioController.setInput(stream);
  });
};

/**
 * 画面キャプチャを切り替える
 *
 * @param enabled - true=有効化, false=無効化
 */
export const setDisplay = (enabled: boolean) => {
  enqueue(async () => {
    const stream = enabled
      ? await AudioDevices.getInputStreamFromDisplay()
      : null;
    store.update({ source: stream != null ? "display" : null });
    await AudioController.setInput(stream);
  });
};
