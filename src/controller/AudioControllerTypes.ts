import type * as PS88 from "../../lib/ps88.d.ts";

/**
 * 判別可能ユニオンの網羅性をコンパイル時に検査する
 *
 * switch の default で呼び出すと、すべての case を処理している場合のみ
 * 引数が never に絞られる。処理漏れがあるとコンパイルエラーになる。
 */
export const assertNever = (value: never) => {
  console.assert(false, "unhandled value", value);
};

// マウスの状態
export type Mouse = {
  x: number;
  y: number;
  pressedL: boolean;
  pressedR: boolean;
};

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
export type SendMessageDraw = {
  type: "draw";
  w: number;
  h: number;
  mouse: Mouse;
};
export type SendMessageMIDI = {
  type: "midi";
  data: NoteEvent;
};

// worker から受信するメッセージの型
export type RecvMessage = RecvMessageDraw | RecvMessageSave;
export type RecvMessageDraw = {
  type: "draw";
  // null は「描画しなかった」ことを表し、この場合は前回の内容を保持する。
  // main 側は返信を待って次の draw を送るため、描画しない場合も返信は必要
  shapes: Shape[] | null;
};
export type RecvMessageSave = {
  type: "save";
  data: SaveData;
};

// 永続化データの型
export type SaveData = SaveDataBytes | SaveDataText | null | undefined;
export type SaveDataBytes = { type: "bytes"; data: Uint8Array };
export type SaveDataText = { type: "string"; data: string };

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
export type ShapeText = {
  type: "text";
  text: string;
  x: number;
  y: number;
  size?: number;
  color?: number;
};
