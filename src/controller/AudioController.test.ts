import { describe, expect, it } from "vitest";
import { parseMIDIMessage } from "./AudioController.ts";

describe("parseMIDIMessage", () => {
  it("NoteOn を変換する", () => {
    expect(parseMIDIMessage(new Uint8Array([0x90, 60, 127]))).toEqual({
      type: "NoteOn",
      timing: 0,
      channel: 0,
      note: 60,
      velocity: 1,
    });
  });

  it("NoteOff を変換する", () => {
    expect(parseMIDIMessage(new Uint8Array([0x80, 60, 0]))).toEqual({
      type: "NoteOff",
      timing: 0,
      channel: 0,
      note: 60,
      velocity: 0,
    });
  });

  // MIDI の仕様上、velocity 0 の NoteOn は NoteOff を意味する。
  // これを取り違えると鍵盤が鳴りっぱなしになる
  it("velocity が 0 の NoteOn は NoteOff になる", () => {
    expect(parseMIDIMessage(new Uint8Array([0x90, 60, 0]))?.type).toBe(
      "NoteOff",
    );
  });

  it("ステータスバイトの下位 4 bit をチャンネルとして取り出す", () => {
    expect(parseMIDIMessage(new Uint8Array([0x95, 60, 127]))).toMatchObject({
      type: "NoteOn",
      channel: 5,
    });
    expect(parseMIDIMessage(new Uint8Array([0x8f, 60, 127]))).toMatchObject({
      type: "NoteOff",
      channel: 15,
    });
  });

  it("velocity を 0..1 に正規化する", () => {
    expect(parseMIDIMessage(new Uint8Array([0x90, 60, 64]))?.velocity).toBe(
      64 / 127,
    );
  });

  it("NoteOn / NoteOff 以外のメッセージは null を返す", () => {
    // コントロールチェンジ
    expect(parseMIDIMessage(new Uint8Array([0xb0, 7, 100]))).toBeNull();
    // ピッチベンド
    expect(parseMIDIMessage(new Uint8Array([0xe0, 0, 64]))).toBeNull();
  });

  it("3 バイトに満たないメッセージは null を返す", () => {
    // タイミングクロックなどのシステムリアルタイムメッセージは 1 バイト
    expect(parseMIDIMessage(new Uint8Array([0xf8]))).toBeNull();
    expect(parseMIDIMessage(new Uint8Array([0x90, 60]))).toBeNull();
    expect(parseMIDIMessage(new Uint8Array([]))).toBeNull();
  });
});
