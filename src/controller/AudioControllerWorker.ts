import * as Types from "./AudioControllerTypes.ts";
import * as ProcessorTypes from "./ProcessorTypes.ts";

class WaveformProcessor extends AudioWorkletProcessor {
  audioCallback?: ProcessorTypes.AudioFunc;
  guiCallback?: ProcessorTypes.GuiFunc;
  save: Types.SaveData;
  midi: ProcessorTypes.NoteEvent[] = [];

  constructor(args: AudioWorkletNodeOptions) {
    super();
    this.save = (args.processorOptions as Types.ProcessorOptions)?.save ?? null;

    const recvMessage = (message: Types.RecvMessage) => {
      this.port.postMessage(message);
    };

    const api: ProcessorTypes.Api = {
      audio: (callback: ProcessorTypes.AudioFunc) => {
        if (typeof callback !== "function") {
          throw new TypeError("argument must be a function");
        }
        this.audioCallback = callback;
      },
      gui: (callback: ProcessorTypes.GuiFunc) => {
        if (typeof callback !== "function") {
          throw new TypeError("argument must be a function");
        }
        this.guiCallback = callback;
      },
      save: (data: ProcessorTypes.SaveData) => {
        if (data instanceof Uint8Array) {
          this.save = { type: "bytes", data };
        } else if (typeof data === "string") {
          this.save = { type: "string", data };
        } else if (data == undefined) {
          this.save = null;
        } else {
          throw new TypeError(
            "argument must be a Uint8Array, string, null, or undefined",
          );
        }
        recvMessage({ type: "save", data: this.save });
      },
      load: () => {
        if (Types.isSaveDataBytes(this.save)) {
          return this.save.data;
        } else if (Types.isSaveDataText(this.save)) {
          return this.save.data;
        } else {
          return null;
        }
      },
    };

    this.port.addEventListener("message", (event: MessageEvent) => {
      if (Types.isSendMessageBuild(event.data)) {
        try {
          new Function("ps88", event.data.code)(api);
        } catch (e) {
          this.audioCallback = undefined;
          this.guiCallback = undefined;
          console.error(e);
        }
        return;
      }
      if (Types.isSendMessageDraw(event.data)) {
        if (this.guiCallback != undefined) {
          const shapes: Types.Shape[] = [];
          const ctx: ProcessorTypes.GuiContext = {
            w: event.data.w,
            h: event.data.h,
            mouse: event.data.mouse,
            addPolygon: (
              path: [number, number][],
              options?: {
                fill?: number;
                stroke?: number;
                strokeWidth?: number;
                strokeClosed?: boolean;
              },
            ) => {
              shapes.push({ type: "polygon", path, ...options });
            },
            addText: (
              text: string,
              x: number,
              y: number,
              options?: {
                size?: number;
                color?: number;
              },
            ) => {
              shapes.push({ type: "text", text, x, y, ...options });
            },
          };
          try {
            this.guiCallback(ctx);
          } catch (e) {
            this.audioCallback = undefined;
            this.guiCallback = undefined;
            console.error(e);
          }
          recvMessage({ type: "draw", shapes });
        }
        return;
      }
      if (Types.isSendMessageMIDI(event.data)) {
        this.midi.push(event.data.data);
        return;
      }
      console.assert(false, "unknown message type", event.data);
    });
    this.port.start();
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.audioCallback != undefined) {
      // 入力を出力にコピー
      for (
        let input = 0;
        input < Math.min(inputs.length, outputs.length);
        input++
      ) {
        for (
          let ch = 0;
          ch < Math.min(inputs[input].length, outputs[input].length);
          ch++
        ) {
          for (
            let sample = 0;
            sample <
            Math.min(inputs[input][ch].length, outputs[input][ch].length);
            sample++
          ) {
            outputs[input][ch][sample] = inputs[0][ch][sample];
          }
        }
      }
      const ctx: ProcessorTypes.AudioContext = {
        audio: outputs[0] ?? [],
        midi: this.midi,
        sampleRate: sampleRate,
        posSamples: 0,
        bpm: 120,
      };
      try {
        this.audioCallback(ctx);
      } catch (e) {
        this.audioCallback = undefined;
        this.guiCallback = undefined;
        console.error(e);
      }
      this.midi = [];
    }
    return true;
  }
}

registerProcessor("ps88web-proc", WaveformProcessor);
