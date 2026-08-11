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
