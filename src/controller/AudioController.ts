import * as Types from "./AudioControllerTypes.ts";
import workerUrl from "./AudioControllerWorker.ts?worker&url";

type AudioControllerContext = {
  ctx: AudioContext;
  src: MediaStreamAudioSourceNode | null;
  proc: AudioWorkletNode;
  dst: HTMLAudioElement;
  midi: MIDIInput | null;
  canvas: Types.Shape[];
};

const AudioController = class {
  /**
   * 入力の指定
   *
   * @param stream - 入力の MediaStream (null=入力無効化)
   */
  public static async setInput(stream: MediaStream | null) {
    const context = await AudioController.getContexts();
    if (context.src != null) {
      context.src.mediaStream.getTracks().forEach((track) => track.stop());
      context.src.disconnect();
      context.src = null;
    }
    if (stream != null) {
      context.src = new MediaStreamAudioSourceNode(context.ctx, { mediaStream: stream });
      context.src.connect(context.proc);
    }
  }

  /**
   * 出力の指定
   *
   * @param enable - true=出力有効化, false=出力無効化
   * @param deviceId - スピーカーのデバイスID (省略時はデフォルトのスピーカーを使用する)
   */
  public static async setOutput(enable: boolean, deviceId?: string) {
    const context = await AudioController.getContexts();
    context.proc.disconnect();
    context.dst.pause();
    if (enable) {
      const dst = new MediaStreamAudioDestinationNode(context.ctx);
      context.proc.connect(dst);
      context.dst.srcObject = dst.stream;
      if (deviceId != undefined) {
        const dst = context.dst as {
          // setSinkId は一部ブラウザでサポートされていないため typescript の型に含まれていない
          // よって、型定義を無視して呼び出す
          setSinkId?: (deviceId: string) => Promise<undefined>,
        };
        await dst.setSinkId?.(deviceId);
      }
      context.dst.play();
    }
  }

  /**
   * MIDI の指定
   *
   * @param midi - MIDIInput (null=MIDI無効化)
   */
  public static async setMIDI(midi: MIDIInput | null) {
    const onMIDIMessage = (event: MIDIMessageEvent) => {
      if (event.data != null) {
        AudioController.onMIDIMessage(event.data);
      }
    };
    const context = await AudioController.getContexts();
    if (context.midi != null) {
      context.midi.removeEventListener("midimessage", onMIDIMessage);
      await context.midi.close();
    }
    context.midi = midi;
    context.midi?.addEventListener("midimessage", onMIDIMessage);
  }

  /**
   * MIDI メッセージの送信
   *
   * @param data - MIDI メッセージのデータ
   */
  public static onMIDIMessage(data: Uint8Array) {
    const channel = data[0] & 0x0f;
    const type = data[0] >> 4;
    const note = data[1];
    const velocity = data[2] / 127.0;
    if (type === 0x9) {
      AudioController.sendMessage({
        type: "midi",
        data: { type: "NoteOn", timing: 0, channel, note, velocity },
      });
      return;
    }
    if (type === 0x8) {
      AudioController.sendMessage({
        type: "midi",
        data: { type: "NoteOff", timing: 0, channel, note, velocity },
      });
      return;
    }
  }

  public static build(code: string) {
    AudioController.sendMessage({ type: "build", code: code });
  };

  public static draw(w: number, h: number, mouse: { x: number; y: number; pressedL: boolean; pressedR: boolean; }) {
    AudioController.sendMessage({ type: "draw", w, h, mouse });
  }

  public static getShapes(): Types.Shape[] {
    return AudioController.context?.canvas ?? [];
  };

  // context は AudioNode 関連のデータを保持する
  // NOTE: context のインスタンスはクリックイベント等を受け取ってから生成しないと音が出ないかもしれない
  private static context?: AudioControllerContext;
  private static async getContexts(): Promise<AudioControllerContext> {
    if (AudioController.context == undefined) {
      const ctx = new AudioContext({ latencyHint: 0 });

      const processorOptions: Types.ProcessorOptions = { save: null };
      try {
        processorOptions.save = JSON.parse(localStorage.getItem("processor") ?? "null");
      } catch(e) {
        console.error(e);
      }

      // worker の読み込み
      await ctx.audioWorklet.addModule(workerUrl);
      const proc = new AudioWorkletNode(ctx, "ps88web-proc", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: processorOptions,
        channelCount: 2,
        channelCountMode: "explicit",
        channelInterpretation: "speakers",
      });
      proc.port.addEventListener("message", AudioController.onRecvMessage);
      proc.port.start();

      const dst = new Audio();
      AudioController.context = { ctx, src: null, proc, dst, midi: null, canvas: [] };
    }
    return AudioController.context;
  }

  private static sendMessage(event: Types.SendMessage) {
    AudioController.context?.proc.port.postMessage(event);
  }

  private static onRecvMessage(event: MessageEvent) {
    if (AudioController.context == undefined) {
      return;
    }
    if (Types.isRecvMessageDraw(event.data)) {
      AudioController.context.canvas = event.data.shapes;
      return;
    }
    if (Types.isRecvMessageSave(event.data)) {
      try {
        const data = event.data.data;
        if (data == undefined) {
          localStorage.removeItem("processor");
        } else {
          localStorage.setItem("processor", JSON.stringify(data));
        }
      } catch(e) {
        console.error(e);
      }
      return;
    }
    console.assert(false, "unknown message type", event.data);
  }
};

export default AudioController;
