import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Types from "./AudioControllerTypes.ts";

// AudioWorkletGlobalScope は Node に無いため、worker が使う分だけを差し替える。
// registerProcessor で登録されるクラスを横取りして直接組み立てる

type Listener = (event: { data: Types.SendMessage }) => void;

class FakePort {
  private readonly listeners: Listener[] = [];
  readonly posted: Types.RecvMessage[] = [];

  addEventListener(_type: string, listener: Listener) {
    this.listeners.push(listener);
  }
  start() {}
  postMessage(message: Types.RecvMessage) {
    this.posted.push(message);
  }

  /** main 側から worker へメッセージを届ける */
  send(message: Types.SendMessage) {
    this.listeners.forEach((listener) => listener({ data: message }));
  }
}

class FakeAudioWorkletProcessor {
  readonly port = new FakePort();
}

type Processor = {
  port: FakePort;
  midi: Types.NoteEvent[];
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
};
type ProcessorClass = new (args: {
  processorOptions?: Types.ProcessorOptions;
}) => Processor;

const SAMPLE_RATE = 48000;

let create: (save?: Types.SaveData) => Processor;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.resetModules();
  let captured: ProcessorClass | undefined;
  vi.stubGlobal("AudioWorkletProcessor", FakeAudioWorkletProcessor);
  vi.stubGlobal("sampleRate", SAMPLE_RATE);
  vi.stubGlobal("registerProcessor", (_name: string, cls: ProcessorClass) => {
    captured = cls;
  });
  // ユーザーコードの失敗を握り潰す設計なので、期待するテスト以外でも出力される
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  await import("./AudioControllerWorker.ts");
  if (captured == undefined) {
    throw new Error("registerProcessor が呼ばれなかった");
  }
  const cls = captured;
  create = (save: Types.SaveData = null) =>
    new cls({ processorOptions: { save } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const build = (proc: Processor, code: string) =>
  proc.port.send({ type: "build", code });

const draw = (proc: Processor) =>
  proc.port.send({
    type: "draw",
    w: 100,
    h: 50,
    mouse: { x: 3, y: 4, pressedL: true, pressedR: false },
  });

const noteOn = (note: number): Types.NoteEvent => ({
  type: "NoteOn",
  timing: 0,
  channel: 0,
  note,
  velocity: 1,
});

/** process を 1 回だけ回して 1 ブロック分の出力を得る */
const render = (proc: Processor, length = 4, input?: number[]) => {
  const outputs = [[new Float32Array(length)]];
  const inputs = input != undefined ? [[Float32Array.from(input)]] : [];
  proc.process(inputs, outputs);
  return [...outputs[0][0]];
};

describe("ps88.audio", () => {
  it("登録したコールバックが process で呼ばれる", () => {
    const proc = create();
    build(proc, `ps88.audio((ctx) => { ctx.audio[0][0] = 0.5; });`);
    expect(render(proc)[0]).toBe(0.5);
  });

  it("登録が無い場合は出力に何も書き込まない", () => {
    const proc = create();
    expect(render(proc, 2, [1, 2])).toEqual([0, 0]);
  });

  it("入力を出力にコピーしてからコールバックを呼ぶ", () => {
    const proc = create();
    build(proc, `ps88.audio((ctx) => { ctx.audio[0][0] += 10; });`);
    expect(render(proc, 3, [1, 2, 3])).toEqual([11, 2, 3]);
  });

  // DAW が無いため再生位置とテンポは不明。0 を「不明」として扱う
  it("sampleRate を渡し、posSamples と bpm は 0 にする", () => {
    const proc = create();
    build(
      proc,
      `ps88.audio((ctx) => {
        ctx.audio[0][0] = ctx.sampleRate;
        ctx.audio[0][1] = ctx.posSamples;
        ctx.audio[0][2] = ctx.bpm;
      });`,
    );
    expect(render(proc, 3)).toEqual([SAMPLE_RATE, 0, 0]);
  });
});

describe("MIDI", () => {
  it("受け取った MIDI をコールバックに渡し、process ごとに捨てる", () => {
    const proc = create();
    build(proc, `ps88.audio((ctx) => { ctx.audio[0][0] = ctx.midi.length; });`);
    proc.port.send({ type: "midi", data: noteOn(60) });
    proc.port.send({ type: "midi", data: noteOn(62) });
    expect(render(proc)[0]).toBe(2);
    // 次のブロックには持ち越さない
    expect(render(proc)[0]).toBe(0);
  });

  // 消費者がいないまま溜め続けると、鍵盤を押すほどメモリが増え続ける
  it("audio コールバックが無くても溜め込まない", () => {
    const proc = create();
    for (let i = 0; i < 100; i++) {
      proc.port.send({ type: "midi", data: noteOn(60) });
    }
    expect(proc.midi.length).toBe(100);
    render(proc);
    expect(proc.midi.length).toBe(0);
  });
});

describe("ps88.gui", () => {
  it("addPolygon と addText を図形として返す", () => {
    const proc = create();
    build(
      proc,
      `ps88.gui((ctx) => {
        ctx.addPolygon([[0, 0], [1, 1]], { fill: 0xff0000 });
        ctx.addText("hello", 1, 2, { size: 8 });
      });`,
    );
    draw(proc);
    expect(proc.port.posted).toEqual([
      {
        type: "draw",
        shapes: [
          {
            type: "polygon",
            path: [
              [0, 0],
              [1, 1],
            ],
            fill: 0xff0000,
          },
          { type: "text", text: "hello", x: 1, y: 2, size: 8 },
        ],
      },
    ]);
  });

  it("キャンバスの大きさとマウスの状態を渡す", () => {
    const proc = create();
    build(
      proc,
      `ps88.gui((ctx) => {
        ctx.addText([ctx.w, ctx.h, ctx.mouse.x, ctx.mouse.y, ctx.mouse.pressedL].join(","), 0, 0);
      });`,
    );
    draw(proc);
    expect(proc.port.posted[0]).toMatchObject({
      shapes: [{ text: "100,50,3,4,true" }],
    });
  });

  // main 側は返信を待って次の draw を送るため、描画しない場合も返信が要る
  it("登録が無い場合も shapes を null にして返信する", () => {
    const proc = create();
    draw(proc);
    expect(proc.port.posted).toEqual([{ type: "draw", shapes: null }]);
  });
});

describe("ユーザーコードの失敗", () => {
  it("build に失敗すると audio と gui の両方を無効にする", () => {
    const proc = create();
    build(
      proc,
      `ps88.audio((ctx) => { ctx.audio[0][0] = 1; }); ps88.gui(() => {});`,
    );
    build(proc, `throw new Error("boom");`);

    expect(render(proc)[0]).toBe(0);
    proc.port.posted.length = 0;
    draw(proc);
    expect(proc.port.posted).toEqual([{ type: "draw", shapes: null }]);
    expect(consoleError).toHaveBeenCalled();
  });

  it("関数以外を登録しようとした場合も build の失敗として扱う", () => {
    const proc = create();
    build(
      proc,
      `ps88.audio((ctx) => { ctx.audio[0][0] = 1; }); ps88.gui(123);`,
    );
    expect(render(proc)[0]).toBe(0);
    expect(consoleError).toHaveBeenCalled();
  });

  it("gui が例外を投げても audio は動き続ける", () => {
    const proc = create();
    build(
      proc,
      `ps88.audio((ctx) => { ctx.audio[0][0] = 1; });
       ps88.gui(() => { throw new Error("boom"); });`,
    );
    draw(proc);
    expect(render(proc)[0]).toBe(1);
    // 例外を投げた gui は止める。返信はする
    proc.port.posted.length = 0;
    draw(proc);
    expect(proc.port.posted).toEqual([{ type: "draw", shapes: null }]);
  });

  it("audio が例外を投げても gui は動き続ける", () => {
    const proc = create();
    build(
      proc,
      `ps88.audio(() => { throw new Error("boom"); });
       ps88.gui((ctx) => { ctx.addText("alive", 0, 0); });`,
    );
    render(proc);
    draw(proc);
    expect(proc.port.posted[0]).toMatchObject({
      shapes: [{ text: "alive" }],
    });
  });
});

describe("ps88.save / ps88.load", () => {
  it("Uint8Array を型のまま保存して通知する", () => {
    const proc = create();
    build(proc, `ps88.save(new Uint8Array([1, 2, 3]));`);
    expect(proc.port.posted).toEqual([
      {
        type: "save",
        data: { type: "bytes", data: new Uint8Array([1, 2, 3]) },
      },
    ]);
  });

  it("文字列を保存して通知する", () => {
    const proc = create();
    build(proc, `ps88.save("hello");`);
    expect(proc.port.posted).toEqual([
      { type: "save", data: { type: "string", data: "hello" } },
    ]);
  });

  it("undefined と null は削除として扱う", () => {
    const proc = create();
    build(proc, `ps88.save(undefined); ps88.save(null);`);
    expect(proc.port.posted).toEqual([
      { type: "save", data: null },
      { type: "save", data: null },
    ]);
  });

  it("対応していない型は build の失敗として扱う", () => {
    const proc = create();
    build(proc, `ps88.audio(() => {}); ps88.save(123);`);
    expect(proc.port.posted).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
  });

  it("起動時に渡された値を load で読み出せる", () => {
    const proc = create({ type: "string", data: "restored" });
    build(
      proc,
      `ps88.audio((ctx) => { ctx.audio[0][0] = ps88.load() === "restored" ? 1 : 0; });`,
    );
    expect(render(proc)[0]).toBe(1);
  });

  it("保存が無い場合の load は null を返す", () => {
    const proc = create();
    build(
      proc,
      `ps88.audio((ctx) => { ctx.audio[0][0] = ps88.load() === null ? 1 : 0; });`,
    );
    expect(render(proc)[0]).toBe(1);
  });

  it("save した値をそのまま load で読み戻せる", () => {
    const proc = create();
    build(
      proc,
      `ps88.save("written");
       ps88.audio((ctx) => { ctx.audio[0][0] = ps88.load() === "written" ? 1 : 0; });`,
    );
    expect(render(proc)[0]).toBe(1);
  });
});
