const MIDIDevices = class {
  /**
   * MIDI デバイス一覧を取得
   *
   * @returns MIDI デバイス一覧
   */
  public static async getDevices(): Promise<MIDIInput[] | null> {
    let midiAccess: MIDIAccess;
    try {
      midiAccess = await navigator.requestMIDIAccess();
    } catch (e) {
      console.warn(e);
      return null;
    }
    return [...midiAccess.inputs.values()];
  }

  /**
   * MIDI デバイスを取得
   *
   * @param id - MIDI デバイスID (省略時はデフォルトのデバイスを使用する)
   * @returns MIDI デバイス
   */
  public static async getDevice(id?: string): Promise<MIDIInput | null> {
    const devices = await MIDIDevices.getDevices();
    if (devices == null) {
      return null;
    }
    if (id == undefined && devices.length > 0) {
      return devices[0];
    }
    return devices.find((device) => device.id === id) ?? null;
  }
};

export default MIDIDevices;
