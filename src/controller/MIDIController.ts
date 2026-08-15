import * as AudioController from "./AudioController.ts";
import * as MIDIDevices from "./MIDIDevices.ts";
import { enqueue } from "./Queue.ts";
import { createStore } from "./Store.ts";
import * as Storage from "./Storage.ts";

// MIDI の実行時の状態と、その永続化を持つ。
//
// requestMIDIAccess はユーザー操作を必要としないため、権限さえあれば起動時に
// 復元できる。ただし権限が未許可の場合はプロンプトが出るため復元しない。

const STORAGE_KEY = "midi";

type Setting = {
  enabled: boolean;
  deviceId: string | null;
};

export type MIDIState = {
  /** 実際に有効になっているか */
  enabled: boolean;
  /** ユーザーが選んだデバイス (null=既定)。適用できているとは限らない */
  deviceId: string | null;
  /** ユーザーがこのセッションで明示的に選択したか */
  chosen: boolean;
};

const store = createStore<MIDIState>({
  enabled: false,
  deviceId: null,
  chosen: false,
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;

const apply = async (enabled: boolean, deviceId: string | null) => {
  const device = enabled
    ? await MIDIDevices.getDevice(deviceId ?? undefined)
    : null;
  // 反映は接続してから。先に更新すると、setMIDI が投げた場合に
  // 有効表示のまま実体が無い状態が残る
  await AudioController.setMIDI(device);
  store.update({ enabled: device != null });
};

/**
 * MIDI を切り替える
 *
 * @param enabled - true=有効化, false=無効化
 * @param deviceId - MIDI デバイスID (null=既定のデバイス)
 */
export const set = (enabled: boolean, deviceId: string | null) => {
  // 復元より先に操作されたことを同期的に記録する
  store.update({ deviceId, chosen: true });
  Storage.store(STORAGE_KEY, { enabled, deviceId } satisfies Setting);
  enqueue(() => apply(enabled, deviceId));
};

let restored = false;

/** 保存された設定を復元する (起動時に一度だけ呼ぶ) */
export const restore = () => {
  if (restored) {
    return;
  }
  restored = true;
  enqueue(async () => {
    if (store.getSnapshot().chosen) {
      return;
    }
    const saved = await Storage.load<Setting>(STORAGE_KEY);
    if (saved == null || !saved.enabled || store.getSnapshot().chosen) {
      return;
    }
    store.update({ deviceId: saved.deviceId });
    // 権限が未許可のまま requestMIDIAccess を呼ぶと、ページを開いただけで
    // 許可を求めることになる。Firefox のように権限を記憶しないブラウザでは、
    // 一度有効にしただけで毎回プロンプトが出てしまう
    if (!(await MIDIDevices.isPermissionGranted())) {
      return;
    }
    // 保存していたデバイスが見つからない場合は無効のままにする。
    // 出力と違い、別の機器に勝手に繋ぐと想定外の入力になるため
    await apply(true, saved.deviceId);
  });
};
