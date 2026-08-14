import * as AudioController from "./AudioController.ts";
import * as AudioDevices from "./AudioDevices.ts";
import { enqueue } from "./Queue.ts";
import { createStore } from "./Store.ts";
import * as Storage from "./Storage.ts";

// 入力の実行時の状態と、その永続化を持つ。
//
// マイクと画面キャプチャは同時に使えない (どちらも AudioController.setInput の
// 唯一の入力になる) ため、別々の状態ではなく「今の入力源」ひとつで表す。
//
// 保存するのはマイクの設定だけ。画面キャプチャは getDisplayMedia が仕様上
// ユーザー操作を必須とするため復元できない。

const STORAGE_KEY = "input";

/** 保存する設定。マイクを起動時に開くかどうかを表す */
type Setting = {
  enabled: boolean;
  deviceId: string | null;
};

export type InputState = {
  /** 現在の入力源 */
  source: "mic" | "display" | null;
  /** 選択中のマイク (null=既定)。使用中とは限らない */
  deviceId: string | null;
  /** ユーザーがこのセッションで明示的に操作したか */
  chosen: boolean;
};

const store = createStore<InputState>({
  source: null,
  deviceId: null,
  chosen: false,
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;

const applyMicrophone = async (enabled: boolean, deviceId: string | null) => {
  const stream = enabled
    ? await AudioDevices.getInputStream(deviceId ?? undefined)
    : null;
  store.update({ source: stream != null ? "mic" : null });
  await AudioController.setInput(stream);
};

/**
 * マイクを切り替える
 *
 * @param enabled - true=有効化, false=無効化
 * @param deviceId - マイクのデバイスID (null=既定のデバイス)
 */
export const setMicrophone = (enabled: boolean, deviceId: string | null) => {
  // 復元より先に操作されたことを同期的に記録する
  store.update({ deviceId, chosen: true });
  Storage.store(STORAGE_KEY, { enabled, deviceId } satisfies Setting);
  enqueue(() => applyMicrophone(enabled, deviceId));
};

/**
 * 画面キャプチャを切り替える
 *
 * @param enabled - true=有効化, false=無効化
 */
export const setDisplay = (enabled: boolean) => {
  store.update({ chosen: true });
  // 画面キャプチャを有効にするとマイクは止まる。無効にした場合も入力は無くなる。
  // どちらにせよ次回の起動でマイクを開くべきではないので false を保存する
  Storage.store(STORAGE_KEY, {
    enabled: false,
    deviceId: store.getSnapshot().deviceId,
  } satisfies Setting);
  enqueue(async () => {
    const stream = enabled
      ? await AudioDevices.getInputStreamFromDisplay()
      : null;
    store.update({ source: stream != null ? "display" : null });
    await AudioController.setInput(stream);
  });
};

let restored = false;

/** 保存された設定を復元する (起動時に一度だけ呼ぶ) */
export const restore = () => {
  if (restored) {
    return;
  }
  restored = true;
  enqueue(async () => {
    // 復元より先にユーザーが操作していたら、その選択を尊重する
    if (store.getSnapshot().chosen) {
      return;
    }
    const saved = await Storage.load<Setting>(STORAGE_KEY);
    if (saved == null || store.getSnapshot().chosen) {
      return;
    }
    store.update({ deviceId: saved.deviceId });
    if (!saved.enabled) {
      return;
    }
    // 権限が未許可のまま getUserMedia を呼ぶと、ページを開いただけで許可を
    // 求めることになる。Firefox のように権限を記憶しないブラウザでは、
    // 一度有効にしただけで毎回プロンプトが出てしまう
    if (!(await AudioDevices.isPermissionGranted())) {
      return;
    }
    await applyMicrophone(true, saved.deviceId);
  });
};
