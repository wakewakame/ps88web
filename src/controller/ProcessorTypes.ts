export type Api = {
  audio: (audio: AudioFunc) => void;
  gui: (gui: GuiFunc) => void;
  save: (data: SaveData) => void;
  load: () => SaveData;
};

export type AudioFunc = (ctx: AudioContext) => void;
export type AudioContext = {
  audio: Float32Array[];
  midi: NoteEvent[];
  sampleRate: number;
  posSamples: number;
  bpm: number;
};

export type NoteEvent = NoteEventNoteOn | NoteEventNoteOff;
export type NoteEventNoteOn = {
  type: "NoteOn";
  timing: number;
  channel: number;
  note: number;
  velocity: number;
};
export type NoteEventNoteOff = {
  type: "NoteOff";
  timing: number;
  channel: number;
  note: number;
  velocity: number;
};

export type GuiFunc = (ctx: GuiContext) => void;
export type GuiContext = {
  w: number;
  h: number;
  mouse: { x: number; y: number; pressedL: boolean; pressedR: boolean; };
  addPolygon: (path: [number, number][], options?: {
    fill?: number;
    stroke?: number;
    strokeWidth?: number;
    strokeClosed?: boolean;
  }) => void;
  addText: (text: string, x: number, y: number, options?: {
    size?: number;
    color?: number;
  }) => void;
};

export type SaveData = Uint8Array | string | null | undefined;
