import * as Permission from "./Permission.ts";

/**
 * MIDI の権限が既に許可されているか
 *
 * 起動時の設定復元の可否を判断するために使う。requestMIDIAccess はユーザー操作
 * を必要としないが、権限が未許可だとページを開いただけで許可を求めることに
 * なるため。権限を問い合わせられない場合は false とする。
 */
export const isPermissionGranted = async (): Promise<boolean> =>
  (await Permission.getState("midi")) === "granted";

/**
 * MIDI の権限が拒否されているかを購読する
 *
 * 拒否されている間は requestMIDIAccess が必ず失敗するため、ボタンを操作不可に
 * する判断に使う。状態が分からない場合は拒否されていないものとして扱う。
 *
 * @returns 購読を解除する関数
 */
export const subscribePermissionDenied = (
  listener: (denied: boolean) => void,
): (() => void) =>
  Permission.subscribeState("midi", (state) => listener(state === "denied"));

/**
 * MIDI デバイス一覧を取得
 *
 * @returns MIDI デバイス一覧
 */
export const getDevices = async (): Promise<MIDIInput[] | null> => {
  let midiAccess: MIDIAccess;
  try {
    midiAccess = await navigator.requestMIDIAccess();
  } catch (e) {
    console.warn(e);
    return null;
  }
  return [...midiAccess.inputs.values()];
};

/**
 * MIDI デバイスを取得
 *
 * @param id - MIDI デバイスID (省略時はデフォルトのデバイスを使用する)
 * @returns MIDI デバイス
 */
export const getDevice = async (id?: string): Promise<MIDIInput | null> => {
  const devices = await getDevices();
  if (devices == null) {
    return null;
  }
  if (id == undefined && devices.length > 0) {
    return devices[0];
  }
  return devices.find((device) => device.id === id) ?? null;
};
