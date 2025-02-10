export type ProcessorOptions = {
  save: object,
};

// worker に送信するメッセージの型
export type SendMessage =
  SendMessageBuild |
  SendMessageMouse |
  SendMessageDraw |
  SendMessageMIDI;
export type SendMessageBuild = {
  type: "build",
  code: string,
};
export const isSendMessageBuild = (msg: SendMessage): msg is SendMessageBuild => (msg.type === "build");
export type SendMessageMouse = {
  type: "mouse",
  event: MouseEvent,
  x: number,
  y: number,
};
export const isSendMessageMouse = (msg: SendMessage): msg is SendMessageMouse => (msg.type === "mouse");
export type SendMessageDraw = {
  type: "draw",
  size: { w: number, h: number },
};
export const isSendMessageDraw = (msg: SendMessage): msg is SendMessageDraw => (msg.type === "draw");
export type SendMessageMIDI = {
  type: "midi",
  data: Uint8Array,
};
export const isSendMessageMIDI = (msg: SendMessage): msg is SendMessageMIDI => (msg.type === "midi");

// worker から受信するメッセージの型
export type RecvMessage = RecvMessageDraw | RecvMessageSave;
export type RecvMessageDraw = {
  type: "draw",
  shapes: Shape[],
};
export const isRecvMessageDraw = (msg: RecvMessage): msg is RecvMessageDraw => (msg.type === "draw");
export type RecvMessageSave = {
  type: "save",
  data: object,
  merge: boolean,
};
export const isRecvMessageSave = (msg: RecvMessage): msg is RecvMessageSave => (msg.type === "save");

export type MouseEvent = "move" | "dwL" | "upL" | "dwR" | "upR";

export type Shape = ShapePolygon | ShapeText;
export type ShapePolygon = {
  type: "polygon",
  shape: [number, number][],  // [[x1, y1], [x2, y2], ...]
  fill?: number,
  stroke?: number,
  strokeWidth?: number,
  strokeClosed?: boolean,
};
export const isShapePolygon = (shape: Shape): shape is ShapePolygon => (shape.type === "polygon");
export type ShapeText = {
  type: "text",
  text: string
  x: number,
  y: number
  size?: number,
  color?: number,
};
export const isShapeText = (shape: Shape): shape is ShapeText => (shape.type === "text");
