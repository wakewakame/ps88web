/**
 * MIDI の権限が既に許可されているか
 *
 * 起動時の設定復元の可否を判断するために使う。requestMIDIAccess はユーザー操作
 * を必要としないが、権限が未許可だとページを開いただけで許可を求めることに
 * なるため。権限を問い合わせられない場合は false とする。
 */
export const isPermissionGranted = async (): Promise<boolean> => {
  try {
    return (
      (await navigator.permissions.query({ name: "midi" })).state === "granted"
    );
  } catch (e) {
    // name: "midi" に対応していないブラウザでは reject する
    console.warn(e);
    return false;
  }
};

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
