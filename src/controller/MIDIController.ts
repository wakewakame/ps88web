import * as AudioController from "./AudioController.ts";
import * as MIDIDevices from "./MIDIDevices.ts";
import { enqueue } from "./Queue.ts";
import { createStore } from "./Store.ts";
import * as Storage from "./Storage.ts";

// MIDI の実行時の状態と、その永続化を持つ。
//
// 出力と違い、requestMIDIAccess はユーザー操作を必要とせず権限も既定で
// granted のため、復元が拒否されることは無い。

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
  store.update({ enabled: device != null });
  await AudioController.setMIDI(device);
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
    // 保存していたデバイスが見つからない場合は無効のままにする。
    // 出力と違い、別の機器に勝手に繋ぐと想定外の入力になるため
    await apply(true, saved.deviceId);
  });
};
