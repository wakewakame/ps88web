export type SetProcessorFunc = (audio: AudioFunc, gui?: GuiFunc) => void;

export type AudioFunc = (ctx: AudioContext) => void;

export type AudioContext = {
  audio: Float32Array[];
  midi: Uint8Array[];
  sampleRate: number;
  currentFrame: number;
  bpm: number;
};

export type GuiFunc = (ctx: GuiContext) => void;

export type GuiContext = {
  w: number,
  h: number,
  mouse: { x: number, y: number, pressedL: boolean, pressedR: boolean };
  addShape: (shape: [number, number][], options?: {
    fill?: number,
    stroke?: number,
    strokeWidth?: number,
    strokeClosed?: boolean,
  }) => void,
  addText: (text: string, x: number, y: number, options?: {
    size?: number,
    color?: number,
  }) => void,
};

