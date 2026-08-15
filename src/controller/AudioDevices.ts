import * as Permission from "./Permission.ts";

const getPermissionState = () => Permission.getState("microphone");

/**
 * マイクの権限が既に許可されているか
 *
 * 起動時の設定復元の可否を判断するために使う。未許可の状態で getUserMedia を
 * 呼ぶと、ページを開いただけで許可を求めることになるため。
 */
export const isPermissionGranted = async (): Promise<boolean> =>
  (await getPermissionState()) === "granted";

/**
 * マイクの権限が拒否されているかを購読する
 *
 * 拒否されている間は getUserMedia が必ず失敗するため、ボタンを操作不可に
 * する判断に使う。状態が分からない場合は拒否されていないものとして扱う
 * (押して試せる方が、押せないより回復の余地がある)。
 *
 * @returns 購読を解除する関数
 */
export const subscribePermissionDenied = (
  listener: (denied: boolean) => void,
): (() => void) =>
  Permission.subscribeState("microphone", (state) =>
    listener(state === "denied"),
  );

/** マイクを一瞬だけ取得して停止する */
const openMicrophoneOnce = async (): Promise<boolean> => {
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
};

/**
 * デバイスの列挙を解禁する
 *
 * enumerateDevices は権限が無いとデバイスID もラベルも空文字で返す。さらに
 * Firefox では、権限が granted であっても、そのドキュメントで実際に
 * getUserMedia を呼ぶまで出力デバイスを一切列挙しない。そのため権限の状態に
 * 関わらず一度ストリームを取得し、列挙できる状態にしてから即座に停止する。
 *
 * 権限が未許可の場合はプロンプトが出る。
 *
 * @returns 解禁できたか
 */
const unlockDeviceList = async (): Promise<boolean> => {
  if ((await getPermissionState()) === "denied") {
    return false;
  }
  return await openMicrophoneOnce();
};

/**
 * 権限のプロンプトを出さずに済む場合のみ、デバイスの列挙を解禁する
 *
 * Firefox は setSinkId で出力デバイスを指名する場合も列挙の解禁を要求する。
 * 起動時の設定復元のために使うが、初見のユーザーにいきなりマイクの許可を
 * 求めるのは避けたいため、既に granted の場合に限る。
 *
 * @returns 解禁できたか
 */
export const unlockDeviceListIfGranted = async (): Promise<boolean> => {
  if ((await getPermissionState()) !== "granted") {
    return false;
  }
  // 権限は確認済みなので unlockDeviceList を経由せず直接取得する
  return await openMicrophoneOnce();
};

/**
 * マイク or スピーカーのデバイス一覧を取得
 *
 * @param kind - "audioinput"=マイク, "audiooutput"=スピーカー
 * @returns マイク or スピーカーのデバイス一覧 (取得できなかった場合は null)
 */
export const getDevices = async (
  kind: "audioinput" | "audiooutput",
): Promise<MediaDeviceInfo[] | null> => {
  // デバイスIDが空のものは列挙が解禁されていないことを表すため除く
  const list = async () =>
    (await navigator.mediaDevices.enumerateDevices()).filter(
      (device) => device.kind === kind && device.deviceId !== "",
    );
  // 先に列挙を試す。Chrome は権限があればそのまま列挙できるため、
  // 一覧を見るためだけにマイクを開かずに済む
  const devices = await list();
  if (devices.length > 0) {
    return devices;
  }
  if (!(await unlockDeviceList())) {
    return null;
  }
  return await list();
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
  // 権限の事前確認はしない。下の getUserMedia が必要なら自分でプロンプトを出し、
  // 拒否されれば catch する。先に確認すると getUserMedia を二重に呼ぶことになる
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
