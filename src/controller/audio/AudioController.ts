import * as Types from "./AudioControllerTypes.ts";
import workerUrl from "./AudioControllerWorker.ts?worker&url";
import * as Storage from "../Storage.ts";

// ps88.save() / ps88.load() が読み書きするデータの保存先
const SAVE_STORAGE_KEY = "save";

// 生成後に差し替わらない AudioNode 関連のインスタンス
type AudioGraph = {
  ctx: AudioContext;
  proc: AudioWorkletNode;
  // 出力先。AudioContext の出力を MediaStream 経由で流し込むことで、
  // setSinkId によるスピーカーの切り替えを可能にしている
  audio: HTMLAudioElement;
};

// NOTE: AudioContext はクリックイベント等を受け取ってから生成しないと
// 音が出ないかもしれないため、遅延生成する
let graph: AudioGraph | undefined;

// 初期化中に ensureGraph が並行して呼ばれても AudioContext が
// 二重生成されないよう、Promise 自体をキャッシュする
let graphPromise: Promise<AudioGraph> | undefined;

let input: MediaStreamAudioSourceNode | null = null;
let midiInput: MIDIInput | null = null;

// 最後にビルドしたコード
// AudioWorkletNode は AudioContext の生成時に作られるため、それ以前の build は
// 送信先が無い。ここに保持しておき、生成完了時に改めてビルドする
let lastCode = "";

// worker から届いた最新の描画内容
let shapes: Types.Shape[] = [];

// 返信待ちの draw があるか
// postMessage のキューには上限が無いため、返信を待たずに送り続けると
// worklet の処理が追いつかない場合に遅延とメモリが際限なく増える。
// 送信を高々 1 件に制限し、追いつかない時は fps が落ちるだけにする
let drawPending = false;

// 直前に起きたユーザーコードの実行エラー (null=エラー無し)
// 同じエラーが毎フレーム届くことがあるため、最新の 1 件だけを保持する
let lastError: Types.RecvMessageError | null = null;
const errorListeners = new Set<() => void>();

// --- worker との通信 ------------------------------------------------------

const sendMessage = (message: Types.SendMessage) => {
  graph?.proc.port.postMessage(message);
};

const onRecvMessage = (event: MessageEvent) => {
  const message: Types.RecvMessage = event.data;
  switch (message.type) {
    case "draw": {
      drawPending = false;
      if (message.shapes != null) {
        shapes = message.shapes;
      }
      return;
    }
    case "save": {
      Storage.store(SAVE_STORAGE_KEY, message.data);
      return;
    }
    case "error": {
      setLastError(message);
      return;
    }
    default: {
      Types.assertNever(message);
    }
  }
};

const setLastError = (error: Types.RecvMessageError | null) => {
  // useSyncExternalStore は参照の同一性で変化を判定するため、
  // 内容が同じうちは同じオブジェクトを返し続ける
  if (
    lastError?.phase === error?.phase &&
    lastError?.message === error?.message
  ) {
    return;
  }
  lastError = error;
  for (const listener of errorListeners) {
    listener();
  }
};

// --- AudioNode グラフ -----------------------------------------------------

const createGraph = async (): Promise<AudioGraph> => {
  const ctx = new AudioContext({ latencyHint: 0 });

  // worker の読み込み
  await ctx.audioWorklet.addModule(workerUrl);

  const processorOptions: Types.ProcessorOptions = {
    save: await Storage.load<Types.SaveData>(SAVE_STORAGE_KEY),
  };
  const proc = new AudioWorkletNode(ctx, "ps88web-proc", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: processorOptions,
    channelCount: 2,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
  });
  proc.port.addEventListener("message", onRecvMessage);
  proc.port.start();

  return { ctx, proc, audio: new Audio() };
};

/** AudioNode のグラフを返す (未生成であれば生成する) */
const ensureGraph = (): Promise<AudioGraph> => {
  if (graphPromise == undefined) {
    graphPromise = createGraph().then((created) => {
      graph = created;
      // 生成前に build されたコードをここで反映する
      sendMessage({ type: "build", code: lastCode });
      return created;
    });
  }
  return graphPromise;
};

// --- 公開 API -------------------------------------------------------------

/**
 * 入力の指定
 *
 * @param stream - 入力の MediaStream (null=入力無効化)
 */
export const setInput = async (stream: MediaStream | null) => {
  const { ctx, proc } = await ensureGraph();
  if (input != null) {
    input.mediaStream.getTracks().forEach((track) => track.stop());
    input.disconnect();
    input = null;
  }
  if (stream != null) {
    input = new MediaStreamAudioSourceNode(ctx, { mediaStream: stream });
    input.connect(proc);
  }
};

/**
 * 出力の指定
 *
 * @param enable - true=出力有効化, false=出力無効化
 * @param deviceId - スピーカーのデバイスID (省略時はデフォルトのスピーカーを使用する)
 * @param byUserGesture - ユーザー操作を受けての呼び出しか (resume の可否を分ける)
 * @returns 実際に出力が有効になったか
 */
export const setOutput = async (
  enable: boolean,
  deviceId?: string,
  byUserGesture = false,
): Promise<boolean> => {
  const { ctx, proc, audio } = await ensureGraph();
  proc.disconnect();
  audio.pause();
  if (!enable) {
    return false;
  }
  const dst = new MediaStreamAudioDestinationNode(ctx);
  proc.connect(dst);
  audio.srcObject = dst.stream;
  try {
    // AudioContext は自動再生ポリシーで suspended のまま開始することがあり、
    // また Chrome では実行中に suspended へ落ちることもある。この状態では
    // process() が呼ばれず、GUI だけが動いて無音になるため、操作のたびに戻す。
    //
    // ただしユーザー操作を受けずに resume を呼ぶと、Chrome では promise が
    // 解決も拒否もされないまま残る。呼び出し元は操作を直列化しているため、
    // ここで返らないと以降の入出力の操作がすべて実行されなくなる。
    // 操作前に戻せなくても、最初のポインタ操作で改めて有効化が試みられる
    if (byUserGesture && ctx.state === "suspended") {
      await ctx.resume();
    }
    if (deviceId != undefined) {
      // setSinkId は一部のブラウザで未実装のため、存在する場合のみ呼び出す
      await audio.setSinkId?.(deviceId);
    }
    // 自動再生ポリシーやデバイスの指定失敗で reject し得る。
    // 握り潰すと音が出ないまま UI が有効表示になるため、結果を返す
    await audio.play();
  } catch (e) {
    console.error(e);
    return false;
  }
  return true;
};

// MIDI デバイスからのイベント
// removeEventListener で解除できるよう、参照が変わらないここに置く
const onMIDIEvent = (event: MIDIMessageEvent) => {
  if (event.data != null) {
    sendMIDIMessage(event.data);
  }
};

/**
 * MIDI の指定
 *
 * @param device - MIDIInput (null=MIDI無効化)
 */
export const setMIDI = async (device: MIDIInput | null) => {
  await ensureGraph();
  if (midiInput != null) {
    midiInput.removeEventListener("midimessage", onMIDIEvent);
    await midiInput.close();
  }
  midiInput = device;
  midiInput?.addEventListener("midimessage", onMIDIEvent);
};

/**
 * MIDI メッセージを NoteEvent に変換する
 *
 * @param data - MIDI メッセージのデータ
 * @returns 対応する NoteEvent (NoteOn / NoteOff 以外のメッセージは null)
 */
export const parseMIDIMessage = (data: Uint8Array): Types.NoteEvent | null => {
  // NoteOn / NoteOff は必ず 3 バイト。満たないものは壊れたメッセージとして捨てる
  // (data[1] や data[2] が undefined になり note や velocity が NaN になるため)
  if (data.length < 3) {
    return null;
  }
  const channel = data[0] & 0x0f;
  const status = data[0] >> 4;
  const note = data[1];
  const velocity = data[2] / 127.0;
  if (status === 0x9) {
    // velocity が 0 の NoteOn は NoteOff として扱う
    const type = velocity === 0 ? "NoteOff" : "NoteOn";
    return { type, timing: 0, channel, note, velocity };
  }
  if (status === 0x8) {
    return { type: "NoteOff", timing: 0, channel, note, velocity };
  }
  return null;
};

/**
 * MIDI メッセージの送信
 *
 * @param data - MIDI メッセージのデータ
 */
export const sendMIDIMessage = (data: Uint8Array) => {
  const event = parseMIDIMessage(data);
  if (event != null) {
    sendMessage({ type: "midi", data: event });
  }
};

/**
 * コードのビルド
 *
 * ビルドしたコードは保持され、AudioContext の生成時に自動で再ビルドされる。
 * そのため AudioContext の生成前に呼び出しても構わない。
 *
 * @param code - ビルドするコード
 */
export const build = (code: string) => {
  lastCode = code;
  // 前のコードのエラーは、コードを差し替えた時点で無効になる
  setLastError(null);
  sendMessage({ type: "build", code });
};

/** 直前に起きたユーザーコードの実行エラーを返す (null=エラー無し) */
export const getLastError = () => lastError;

/** ユーザーコードの実行エラーを購読する */
export const subscribeError = (listener: () => void) => {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
};

/**
 * 記録しているエラーを消す
 *
 * コードを編集した時点で、それまでのエラーは古い内容についてのものになる。
 * ビルドは入力が止まるまで待つため、その間もエラーが残っていると、
 * 直したコードに直す前のエラーが添えられて AI に渡ってしまう
 */
export const clearError = () => setLastError(null);

/**
 * 描画の要求
 *
 * 結果は worker から非同期に届くため、直後の getShapes では反映されない。
 * 前回の要求への返信を受け取るまでは、呼び出しても何もしない。
 */
export const draw = (w: number, h: number, mouse: Types.Mouse) => {
  // graph が未生成のうちは送信しても返信が来ないため、pending にしない
  if (graph == undefined || drawPending) {
    return;
  }
  drawPending = true;
  sendMessage({ type: "draw", w, h, mouse });
};

/** worker から最後に届いた描画内容を返す */
export const getShapes = (): Types.Shape[] => shapes;
