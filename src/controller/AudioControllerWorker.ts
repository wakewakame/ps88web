import * as Types from "./AudioControllerTypes.ts";
import * as ProcessorTypes from "./ProcessorTypes.ts";

class WaveformProcessor extends AudioWorkletProcessor {
  proc?: { audio: ProcessorTypes.AudioFunc, gui?: ProcessorTypes.GuiFunc };
  mouse: { x: number; y: number; pressedL: boolean; pressedR: boolean; };
  midi: Uint8Array[];
  save: object;

  constructor(args :AudioWorkletNodeOptions) {
    super();
    this.proc = undefined;
    this.mouse = { x: 0, y: 0, pressedL: false, pressedR: false };
    this.midi = [];
    this.save = (args.processorOptions as Types.ProcessorOptions)?.save ?? {};

    const sendMessage = (message: Types.RecvMessage) => {
      this.port.postMessage(message);
    }
    const setProcessor: ProcessorTypes.SetProcessorFunc = (audio, gui) => {
      this.proc = { audio, gui };
    };
    const save = (data: object, merge?: boolean) => {
      merge = merge ?? true;
      this.port.postMessage({ type: "save", data: this.save, merge });
      this.save = merge ? { ...this.save, ...data } : data;
    };
    this.port.addEventListener("message", (event: MessageEvent) => {
      if (Types.isSendMessageBuild(event.data)) {
        try {
          (new Function('setProcessor', 'savedata', 'save', event.data.code))(setProcessor, this.save, save);
        } catch (e) {
          this.proc = undefined;
          console.error(e);
        }
        return;
      }
      if (Types.isSendMessageMouse(event.data)) {
        this.mouse.x = event.data.x;
        this.mouse.y = event.data.y;
        this.mouse.pressedL =
          event.data.event === "dwL" ? true :
          event.data.event === "upL" ? false :
          this.mouse.pressedL;
        this.mouse.pressedR =
          event.data.event === "dwR" ? true :
          event.data.event === "upR" ? false :
          this.mouse.pressedR;
        return;
      }
      if (Types.isSendMessageDraw(event.data)) {
        if (this.proc?.gui != undefined) {
          const shapes: Types.Shape[] = [];
          const ctx: ProcessorTypes.GuiContext = {
            w: event.data.size.w,
            h: event.data.size.h,
            mouse: this.mouse,
            addShape: (shape: [number, number][], options?: {
              fill?: number,
              stroke?: number,
              strokeWidth?: number,
              strokeClosed?: boolean,
            }) => {
              shapes.push({ type: "polygon", shape, ...options });
            },
            addText: (text: string, x: number, y: number, options?: {
              size?: number,
              color?: number,
            }) => {
              shapes.push({ type: "text", text, x, y, ...options });
            },
          };
          try {
            this.proc.gui(ctx);
          } catch (e) {
            this.proc = undefined;
            console.error(e);
          }
          sendMessage({ type: "draw", shapes });
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
    if (outputs.length === 0 || outputs[0].length === 0) {
      return true;
    }
    const audio = this.proc?.audio;
    if (audio != undefined && outputs.length > 0) {
      // 入力があるなら出力にコピーする
      if (inputs.length > 0) {
        for (let ch = 0; ch < inputs[0].length; ch++) {
          for (let i = 0; i < inputs[0][ch].length; i++) {
            outputs[0][ch][i] = inputs[0][ch][i];
          }
        }
      }
      const ctx: ProcessorTypes.AudioContext = {
        audio: outputs[0],
        midi: this.midi,
        sampleRate: sampleRate,
        currentFrame: currentFrame,
        bpm: 120,
      };
      try {
        audio(ctx);
      } catch (e) {
        this.proc = undefined;
        console.error(e);
      }
      this.midi = [];
    }
    return true;
  }
}

registerProcessor("ps88web-proc", WaveformProcessor);
