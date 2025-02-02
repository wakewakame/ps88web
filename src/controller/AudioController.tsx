export const AudioController = class {
  // デバイス一覧
  // NOTE: devices のインスタンスはクリックイベント等を受け取ってから生成する
  private static devices?: MediaDeviceInfo[];
  private static async getDevices(): Promise<MediaDeviceInfo[]> {
    if (AudioController.devices === undefined) {
      // アクセス権限を得るために、一旦ダミーでマイクを取得する
      // (これを行わないとデバイス一覧が取得できない様子?)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getAudioTracks().forEach((track) => track.stop());

      // マイク/スピーカーのデバイス一覧を取得する
      const getAudioController = async () => {
        AudioController.devices = await navigator.mediaDevices.enumerateDevices();
      };
      navigator.mediaDevices.addEventListener("devicechange", getAudioController);
      await getAudioController();
    }

    return AudioController.devices ?? [];
  }

  // 波形処理のフロー
  // NOTE: contexts のインスタンスはクリックイベント等を受け取ってから生成する
  private static contexts?: { ctx: AudioContext, proc: AudioWorkletNode, dest: MediaStreamAudioDestinationNode };
  private static shapes?: any[];
  private static async getContexts(): Promise<{ ctx: AudioContext, proc: AudioWorkletNode, dest: MediaStreamAudioDestinationNode }> {
    if (AudioController.contexts === undefined) {
      const processorCode = `
        class WaveformProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.func = undefined;
            this.mouse = { x: 0, y: 0, click: false };
            this.port.addEventListener('message', (event) => {
              if (event.data.message === "build") {
                try {
                  this.func = (new Function(event.data.script))();
                } catch (e) {
                  this.func = undefined;
                  console.error(e);
                }
              }
              if (event.data.message === "mouse") {
                this.mouse.x = event.data.data.x;
                this.mouse.y = event.data.data.y;
                if (event.data.data.event === "down") {
                  this.mouse.click = true;
                }
                if (event.data.data.event === "up") {
                  this.mouse.click = false;
                }
              }
              if (event.data.message === "draw") {
                if (this.func?.gui != undefined) {
                  const ctx = { shapes: [] }; // TODO
                  const area = { width: 640, height: 480 }; // TODO
                  this.func.gui(ctx, area, this.mouse);
                  const shapes = JSON.stringify(ctx.shapes);
                  this.port.postMessage({ message: "draw", shapes });
                }
              }
            });
            this.port.start();
          }
          process(inputs, outputs) {
            const audio = this.func?.audio;
            if (audio != undefined && outputs.length > 0) {
              // 入力があるなら出力にコピーする
              if (inputs.length > 0) {
                for (let ch = 0; ch < inputs[0].length; ch++) {
                  for (let i = 0; i < inputs[0][ch].length; i++) {
                    outputs[0][ch][i] = inputs[0][ch][i];
                  }
                }
              }
              const ctx = { audio: outputs[0] };  // TODO
              try {
                audio(ctx);
              } catch (e) {
                this.func = undefined;
                console.error(e);
              }
            }
            return true;
          }
        }
        registerProcessor('ps88web-proc', WaveformProcessor);
      `;
      const blob = new Blob([processorCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule(url);
      const proc = new AudioWorkletNode(ctx, 'ps88web-proc');
      proc.port.addEventListener("message", (event) => {
        if (event.data.message === "draw") {
          AudioController.shapes = JSON.parse(event.data.shapes);
        }
      });
      proc.port.start();
      const dest = ctx.createMediaStreamDestination();
      proc.connect(ctx.destination);
      AudioController.contexts = { ctx, proc, dest };
    }
    return AudioController.contexts;
  }

  /**
   * マイク一覧の取得
   *
   * @returns マイク一覧
   */
  public static async getInputs(): Promise<{ deviceId: string, deviceName: string }[]> {
    return (await AudioController.getDevices())
      .filter((device) => (device.kind === "audioinput" && device.deviceId !== ""))
      .map((device) => ({ deviceId: device.deviceId, deviceName: device.label }));
  }

  /**
   * スピーカー一覧の取得
   *
   * @returns スピーカー一覧
   */
  public static async getOutputs(): Promise<{ deviceId: string, deviceName: string }[]> {
    return (await AudioController.getDevices())
      .filter((device) => (device.kind === "audiooutput" && device.deviceId !== ""))
      .map((device) => ({ deviceId: device.deviceId, deviceName: device.label }));
  }

  private static input?: { stream: MediaStream, node: MediaStreamAudioSourceNode };

  /**
   * ディスプレイの指定
   */
  public static async setDisplay(enable: boolean) {
    if (AudioController.input !== undefined) {
      AudioController.input.node.disconnect();
      AudioController.input.stream.getAudioTracks().forEach((track) => track.stop());
    }
    if (!enable) {
      AudioController.input = undefined;
      return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true });
    const contexts = await AudioController.getContexts();
    const source = contexts.ctx.createMediaStreamSource(stream);
    source.connect(contexts.proc);
    AudioController.input = { stream, node: source };
  }

  /**
   * マイクの指定
   *
   * @param enable - true=マイク有効化, false=マイク無効化
   * @param deviceId - マイクのデバイスID (省略時はデフォルトのマイクを使用する)
   */
  public static async setInput(enable: boolean, deviceId?: string) {
    if (AudioController.input !== undefined) {
      AudioController.input.node.disconnect();
      AudioController.input.stream.getAudioTracks().forEach((track) => track.stop());
    }
    if (!enable) {
      AudioController.input = undefined;
      return;
    }
    const found =
      (deviceId !== undefined) &&
      AudioController.devices?.some((device) => (device.kind === "audioinput" && device.deviceId === deviceId));
    const options: MediaStreamConstraints = (found) ?
      { video: false, audio: { deviceId: { exact: deviceId } } } :
      { video: false, audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(options);
    const contexts = await AudioController.getContexts();
    const source = contexts.ctx.createMediaStreamSource(stream);
    source.connect(contexts.proc);
    AudioController.input = { stream, node: source };
  }

  private static output?: HTMLAudioElement;

  /**
   * スピーカーの指定
   *
   * @param enable - true=スピーカー有効化, false=スピーカー無効化
   * @param deviceId - スピーカーのデバイスID (省略時はデフォルトのマイクを使用する)
   */
  public static async setOutput(enable: boolean, deviceId?: string) {
    if (AudioController.output === undefined) {
      AudioController.output = new Audio();
      AudioController.output.srcObject = (await AudioController.getContexts()).dest.stream;
    }
    if (!enable) {
      AudioController.output.pause();
      return;
    }
    const found =
      (deviceId !== undefined) &&
      AudioController.devices?.some((device) => (device.kind === "audiooutput" && device.deviceId === deviceId));
    if (found) {
      await ((AudioController.output as any).setSinkId?.(deviceId) ?? (async () => {})());
    }
    await AudioController.output.play();
  }

  public static async setProcessor(script: string) {
    const contexts = AudioController.contexts;
    if (contexts === undefined) {
      return;
    }
    contexts.proc.port.postMessage({ message: "build", script: script });
  };

  public static setMouse(event: "up" | "down" | "move", x: number, y: number) {
    const contexts = AudioController.contexts;
    if (contexts === undefined) {
      return;
    }
    contexts.proc.port.postMessage({ message: "mouse", data: { event, x, y } });
  }

  public static draw() {
    const contexts = AudioController.contexts;
    if (contexts === undefined) {
      return;
    }
    contexts.proc.port.postMessage({ message: "draw" });
  }

  public static getShapes(): any[] {
    return AudioController.shapes ?? [];
  };
};
