const getPermission = async (): Promise<boolean> => {
  const state = await navigator.permissions.query({ name: "microphone" });
  if (state.state === "denied") {
    return false;
  }
  if (state.state === "granted") {
    return true;
  }
  if (state.state === "prompt") {
    // アクセス権限を得るために、一旦ダミーでマイクを取得する
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    }
  }
  console.assert(false, "unknown state");
  return false;
};

/**
 * マイク or スピーカーのデバイス一覧を取得
 *
 * @param kind - "audioinput"=マイク, "audiooutput"=スピーカー
 * @returns マイク or スピーカーのデバイス一覧
 */
export const getDevices = async (
  kind: "audioinput" | "audiooutput",
): Promise<MediaDeviceInfo[] | null> => {
  if (!(await getPermission())) {
    return null;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(
    (device) => device.kind == kind && device.deviceId !== "",
  );
};

/**
 * マイクのストリームを取得
 *
 * @param deviceId - マイクのデバイスID (省略時はデフォルトのマイクを使用する)
 * @returns マイクの MediaStream
 */
export const getInputStream = async (
  deviceId?: string,
): Promise<MediaStream | null> => {
  if (!(await getPermission())) {
    return null;
  }
  const options: MediaStreamConstraints = {
    audio: {
      autoGainControl: false,
      deviceId: deviceId != undefined ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
    },
    video: false,
  };
  return await navigator.mediaDevices.getUserMedia(options).catch((e) => {
    console.warn(e);
    return null;
  });
};

/**
 * ディスプレイのストリームを取得
 *
 * @returns ディスプレイの MediaStream
 */
export const getInputStreamFromDisplay =
  async (): Promise<MediaStream | null> => {
    const stream = await navigator.mediaDevices
      .getDisplayMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      })
      .catch((e) => {
        console.warn(e);
        return null;
      });
    if (stream?.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      return null;
    }
    return stream;
  };
