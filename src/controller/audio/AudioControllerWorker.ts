/// <reference types="audioworklet" />
import * as Types from "./AudioControllerTypes.ts";
import type * as PS88 from "../../../lib/ps88.d.ts";

class WaveformProcessor extends AudioWorkletProcessor {
  audioCallback?: PS88.AudioFunc;
  guiCallback?: PS88.GuiFunc;
  save: Types.SaveData;
  midi: PS88.NoteEvent[] = [];

  constructor(args: AudioWorkletNodeOptions) {
    super();
    this.save = (args.processorOptions as Types.ProcessorOptions)?.save ?? null;

    const recvMessage = (message: Types.RecvMessage) => {
      this.port.postMessage(message);
    };
    const reportError = (phase: Types.RecvMessageError["phase"], e: unknown) =>
      this.reportError(phase, e);

    const api: PS88.PS88 = {
      audio: (callback: PS88.AudioFunc) => {
        if (typeof callback !== "function") {
          throw new TypeError("argument must be a function");
        }
        this.audioCallback = callback;
      },
      gui: (callback: PS88.GuiFunc) => {
        if (typeof callback !== "function") {
          throw new TypeError("argument must be a function");
        }
        this.guiCallback = callback;
      },
      save: (data: PS88.SaveData) => {
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
      load: () => this.save?.data ?? null,
    };

    this.port.addEventListener("message", (event: MessageEvent) => {
      const message: Types.SendMessage = event.data;
      switch (message.type) {
        case "build": {
          try {
            new Function("ps88", message.code)(api);
          } catch (e) {
            this.audioCallback = undefined;
            this.guiCallback = undefined;
            reportError("build", e);
          }
          return;
        }
        case "draw": {
          if (this.guiCallback == undefined) {
            recvMessage({ type: "draw", shapes: null });
            return;
          }
          const shapes: Types.Shape[] = [];
          const ctx: PS88.GuiContext = {
            w: message.w,
            h: message.h,
            mouse: message.mouse,
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
            // gui の失敗で audio まで止めない
            this.guiCallback = undefined;
            reportError("gui", e);
          }
          recvMessage({ type: "draw", shapes });
          return;
        }
        case "midi": {
          this.midi.push(message.data);
          return;
        }
        default: {
          Types.assertNever(message);
        }
      }
    });
    this.port.start();
  }

  /**
   * 例外を console と main 側の両方へ伝える
   *
   * AudioWorklet の console は開発者ツールを開かないと見えないため、
   * 画面や AI チャットからも拾えるようにしておく
   */
  reportError(phase: Types.RecvMessageError["phase"], e: unknown) {
    console.error(e);
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    this.port.postMessage({
      type: "error",
      phase,
      message,
    } satisfies Types.RecvMessageError);
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
            outputs[input][ch][sample] = inputs[input][ch][sample];
          }
        }
      }
      const ctx: PS88.AudioContext = {
        audio: outputs[0] ?? [],
        midi: this.midi,
        sampleRate: sampleRate,
        // DAW が無いため再生位置とテンポは不明。
        // ps88.d.ts の定義どおり、いずれも 0 を「不明」として扱う
        posSamples: 0,
        bpm: 0,
      };
      try {
        this.audioCallback(ctx);
      } catch (e) {
        // audio の失敗で gui まで止めない
        this.audioCallback = undefined;
        this.reportError("audio", e);
      }
    }
    // audioCallback が無い場合は消費者がいないため、溜めずに捨てる
    this.midi = [];
    return true;
  }
}

registerProcessor("ps88web-proc", WaveformProcessor);
