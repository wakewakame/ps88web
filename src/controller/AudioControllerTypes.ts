import type * as PS88 from "../ps88.d.ts";

// worker のコンストラクタに渡すオプションの型
export type ProcessorOptions = {
  save: SaveData;
};

// worker に送信するメッセージの型
export type SendMessage = SendMessageBuild | SendMessageDraw | SendMessageMIDI;
export type SendMessageBuild = {
  type: "build";
  code: string;
};
export const isSendMessageBuild = (msg: SendMessage): msg is SendMessageBuild =>
  msg.type === "build";
export type SendMessageDraw = {
  type: "draw";
  w: number;
  h: number;
  mouse: {
    x: number;
    y: number;
    pressedL: boolean;
    pressedR: boolean;
  };
};
export const isSendMessageDraw = (msg: SendMessage): msg is SendMessageDraw =>
  msg.type === "draw";
export type SendMessageMIDI = {
  type: "midi";
  data: NoteEvent;
};
export const isSendMessageMIDI = (msg: SendMessage): msg is SendMessageMIDI =>
  msg.type === "midi";

// worker から受信するメッセージの型
export type RecvMessage = RecvMessageDraw | RecvMessageSave;
export type RecvMessageDraw = {
  type: "draw";
  shapes: Shape[];
};
export const isRecvMessageDraw = (msg: RecvMessage): msg is RecvMessageDraw =>
  msg.type === "draw";
export type RecvMessageSave = {
  type: "save";
  data: SaveData;
};
export const isRecvMessageSave = (msg: RecvMessage): msg is RecvMessageSave =>
  msg.type === "save";

// 永続化データの型
export type SaveData = SaveDataBytes | SaveDataText | null | undefined;
export type SaveDataBytes = { type: "bytes"; data: Uint8Array };
export const isSaveDataBytes = (data: SaveData): data is SaveDataBytes =>
  data?.type === "bytes";
export type SaveDataText = { type: "string"; data: string };
export const isSaveDataText = (data: SaveData): data is SaveDataText =>
  data?.type === "string";

// MIDI イベントの型
export type NoteEvent = PS88.NoteEvent;

// GUI 描画用の図形の型
export type Shape = ShapePolygon | ShapeText;
export type ShapePolygon = {
  type: "polygon";
  path: [number, number][]; // [[x1, y1], [x2, y2], ...]
  fill?: number;
  stroke?: number;
  strokeWidth?: number;
  strokeClosed?: boolean;
};
export const isShapePolygon = (shape: Shape): shape is ShapePolygon =>
  shape.type === "polygon";
export type ShapeText = {
  type: "text";
  text: string;
  x: number;
  y: number;
  size?: number;
  color?: number;
};
export const isShapeText = (shape: Shape): shape is ShapeText =>
  shape.type === "text";
