type Stream = {
  stream: MediaStream,  // マイク or スピーカーのストリーム
  id?: string,          // マイク or スピーカーのデバイスID
};

type Device = {
  id: string,    // マイク or スピーカーのデバイスID
  name: string,  // マイク or スピーカーのデバイス名
};

export const AudioDevices = class {
  private static devices?: MediaDeviceInfo[];
  private static input?: Stream;
  private static output?: HTMLAudioElement;

  private static async init() {
    if (AudioDevices.devices === undefined) {
      // アクセス権限を得るために、一旦ダミーでマイクを取得する
      // (これを行わないとデバイス一覧が取得できない様子?)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      AudioDevices.input = { stream };

      // マイク/スピーカーのデバイス一覧を取得する
      const getAudioDevices = async () => {
        AudioDevices.devices = await navigator.mediaDevices.enumerateDevices();
      };
      navigator.mediaDevices.addEventListener("devicechange", getAudioDevices);
      await getAudioDevices();

      // ダミーで取得したマイクを停止する
      AudioDevices.input.stream.getAudioTracks().forEach((track) => track.stop());
      AudioDevices.input = undefined;
    }
  }

  /**
   * マイク一覧を取得する
   *
   * @returns マイク一覧
   */
  public static async getInputs(): Promise<Device[]> {
    await AudioDevices.init();
    return (AudioDevices.devices ?? [])
      .filter((device) => (device.kind === "audioinput" && device.deviceId !== ""))
      .map((device) => ({ id: device.deviceId, name: device.label }));
  }

  /**
   * スピーカー一覧を取得する
   *
   * @returns スピーカー一覧
   */
  public static async getOutputs(): Promise<Device[]> {
    await AudioDevices.init();
    return (AudioDevices.devices ?? [])
      .filter((device) => (device.kind === "audiooutput" && device.deviceId !== ""))
      .map((device) => ({ id: device.deviceId, name: device.label }));
  }

  /**
   * マイクを設定する
   *
   * @param enable - true=マイクを有効にする, false=マイクを無効にする
   * @param id - マイクのデバイスID (省略時はデフォルトのマイクを使用する)
   */
  public static async setInput(enable: boolean, id?: string) {
    await AudioDevices.init();
    AudioDevices.input?.stream.getAudioTracks().forEach((track) => track.stop());
    if (!enable) {
      AudioDevices.input = undefined;
      return;
    }
    const found =
      (id !== undefined) &&
      AudioDevices.devices?.some((device) => (device.kind === "audioinput" && device.deviceId === id));
    if (found) {
      AudioDevices.input = {
        stream: await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: id } }, video: false }),
        id,
      };
    } else {
      AudioDevices.input = {
        stream: await navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      };
    }
  }

  /**
   * スピーカーを設定する
   *
   * @param enable - true=スピーカーを有効にする, false=スピーカーを無効にする
   * @param id - スピーカーのデバイスID (省略時はデフォルトのマイクを使用する)
   */
  public static async setOutput(enable: boolean, id?: string) {
    AudioDevices.output?.pause();
    if (!enable) {
      AudioDevices.output = undefined;
      return;
    }
    AudioDevices.output = new Audio();
    AudioDevices.output.srcObject = AudioDevices.input?.stream ?? null;
    const found =
      (id !== undefined) &&
      AudioDevices.devices?.some((device) => (device.kind === "audiooutput" && device.deviceId === id));
    if (found) {
      await ((AudioDevices.output as any).setSinkId?.(id) ?? (async () => {})());
    }
    await AudioDevices.output.play();
  }
};
