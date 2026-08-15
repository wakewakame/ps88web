import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// enqueue はモジュールレベルにキューを持つため、テストごとに読み込み直す
let enqueue: (task: () => Promise<void>) => void;

beforeEach(async () => {
  vi.resetModules();
  ({ enqueue } = await import("./Queue.ts"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** それまでに積んだタスクがすべて終わるまで待つ */
const drain = () =>
  new Promise<void>((resolve) =>
    enqueue(async () => {
      resolve();
    }),
  );

describe("enqueue", () => {
  it("積んだ順に実行する", async () => {
    const order: number[] = [];
    // 先に積んだ方を遅くする。順番を守らなければ 2 が先に入る
    enqueue(async () => {
      await sleep(20);
      order.push(1);
    });
    enqueue(async () => {
      order.push(2);
    });
    await drain();
    expect(order).toEqual([1, 2]);
  });

  // オーディオグラフという単一の資源を触るため、並走させてはいけない
  it("前のタスクが終わるまで次を始めない", async () => {
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await sleep(10);
      running--;
    };
    enqueue(task);
    enqueue(task);
    enqueue(task);
    await drain();
    expect(maxRunning).toBe(1);
  });

  it("失敗したタスクがあっても後続を実行する", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const order: string[] = [];
    enqueue(async () => {
      throw new Error("boom");
    });
    enqueue(async () => {
      order.push("後続");
    });
    await drain();
    expect(order).toEqual(["後続"]);
    expect(consoleError).toHaveBeenCalled();
  });

  it("同期的に投げた例外でも後続を実行する", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const order: string[] = [];
    enqueue(() => {
      throw new Error("boom");
    });
    enqueue(async () => {
      order.push("後続");
    });
    await drain();
    expect(order).toEqual(["後続"]);
    expect(consoleError).toHaveBeenCalled();
  });

  it("タスクの完了を待たずに返る", () => {
    let done = false;
    enqueue(async () => {
      await sleep(10);
      done = true;
    });
    expect(done).toBe(false);
  });
});
