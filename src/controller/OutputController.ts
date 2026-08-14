import * as AudioController from "./AudioController.ts";
import * as AudioDevices from "./AudioDevices.ts";
import { enqueue } from "./Queue.ts";
import { createStore } from "./Store.ts";
import * as Storage from "./Storage.ts";

// 出力の実行時の状態と、その永続化を持つ。
//
// これらは「オーディオグラフの状態」であってコンポーネントの状態ではないため、
// React の外に置く。React 側に持たせると、コールバックから同期的に読むために
// state の写しを ref で持つことになり、実体のない変数が増えていく。

const STORAGE_KEY = "output";

/** 保存する設定。実際に有効化できたかではなく、ユーザーの要求値を保存する */
type Setting = {
  enabled: boolean;
  deviceId: string | null;
};

export type OutputState = {
  /** 実際に有効になっているか */
  enabled: boolean;
  /** ユーザーが選んだデバイス (null=既定)。適用できているとは限らない */
  deviceId: string | null;
  /** ユーザーがこのセッションで明示的に選択したか */
  chosen: boolean;
};

const store = createStore<OutputState>({
  enabled: false,
  deviceId: null,
  chosen: false,
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;

// AudioContext の再開はユーザー操作を受けてからでないと完了しないため、
// 操作由来の呼び出しかどうかを経路ごとに渡す (詳細は AudioController.setOutput)
type Origin = { byUserGesture: boolean };

const apply = async (
  enabled: boolean,
  deviceId: string | null,
  { byUserGesture }: Origin,
): Promise<boolean> => {
  // 再生に失敗することがあるため、要求値ではなく実際の結果を反映する
  const ok = await AudioController.setOutput(
    enabled,
    deviceId ?? undefined,
    byUserGesture,
  );
  store.update({ enabled: ok });
  return ok;
};

/**
 * 出力を有効にする。指定したデバイスを使えない場合は既定のデバイスに落とす
 *
 * 既定に落とさないと、保存していたデバイスが使えない環境で復元もポインタ操作も
 * 失敗し続け、音が出せなくなる。
 */
const enable = async (deviceId: string | null, origin: Origin) => {
  if (await apply(true, deviceId, origin)) {
    return;
  }
  if (deviceId == null) {
    return;
  }
  // Firefox は、そのドキュメントで getUserMedia を呼ぶまで出力デバイスを
  // 指名できず setSinkId が NotFoundError になる。Chrome も権限が無いと
  // SecurityError になる。既に権限がある場合に限り解禁して再試行する
  // (起動時にプロンプトを出さないため granted の場合のみ)
  if (await AudioDevices.unlockDeviceListIfGranted()) {
    if (await apply(true, deviceId, origin)) {
      return;
    }
  }
  await apply(true, null, origin);
};

/**
 * 出力を切り替える
 *
 * ユーザーの操作によるものとして扱い、設定を保存する。
 *
 * @param enabled - true=有効化, false=無効化
 * @param deviceId - スピーカーのデバイスID (null=既定のデバイス)
 */
export const set = (enabled: boolean, deviceId: string | null) => {
  // 復元より先に操作されたことを同期的に記録する
  store.update({ deviceId, chosen: true });
  // 保存するのは要求値。自動再生ポリシーで拒否されても、
  // 次回の起動では改めて有効化を試みる
  Storage.store(STORAGE_KEY, { enabled, deviceId } satisfies Setting);
  // set はボタンの操作か init (最初のポインタ操作) からしか呼ばれない
  enqueue(async () => {
    if (enabled) {
      await enable(deviceId, { byUserGesture: true });
    } else {
      await apply(false, null, { byUserGesture: true });
    }
  });
};

/**
 * 出力がまだ有効でなければ有効にする
 *
 * AudioContext はユーザー操作を受けてからでないと音が出ないことがあるため、
 * 最初のポインタ操作でこれを呼び出す。ユーザーが明示的に無効にしていた場合は
 * 何もしない。
 */
export const init = () => {
  // 実行中かどうかは見ない。復元はグラフの生成を含むため数百 ms かかることが
  // あり、その間のクリックを捨てると、自動再生を解禁する最初のジェスチャを
  // 無駄にしてしまう。連打は set が chosen を同期的に立てることで弾ける
  const { chosen, enabled, deviceId } = store.getSnapshot();
  if (chosen || enabled) {
    return;
  }
  set(true, deviceId);
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
      // 明示的に無効にされていたので、ポインタ操作でも有効化しない。
      // ただし worklet は動かしたいので、出力を無効のままグラフだけ生成する
      // (setOutput(false) は ensureGraph したうえで出力を切断する)
      store.update({ chosen: true });
      await apply(false, null, { byUserGesture: false });
      return;
    }
    // 自動再生ポリシーで拒否された場合はここで有効にできない。
    // その場合は最初のポインタ操作 (init) に任せる
    await enable(saved.deviceId, { byUserGesture: false });
  });
};
