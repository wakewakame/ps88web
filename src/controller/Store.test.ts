import { describe, expect, it, vi } from "vitest";
import { createStore } from "./Store.ts";

type State = { count: number; name: string; nested: { value: number } };

const initial = (): State => ({ count: 1, name: "x", nested: { value: 0 } });

describe("createStore", () => {
  it("初期状態をそのまま返す", () => {
    const store = createStore(initial());
    expect(store.getSnapshot()).toEqual({
      count: 1,
      name: "x",
      nested: { value: 0 },
    });
  });

  it("update は指定したキーだけを変更する", () => {
    const store = createStore(initial());
    store.update({ count: 2 });
    expect(store.getSnapshot()).toMatchObject({ count: 2, name: "x" });
  });

  it("変化があると購読者に通知する", () => {
    const store = createStore(initial());
    const listener = vi.fn();
    store.subscribe(listener);
    store.update({ count: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("すべての購読者に通知する", () => {
    const store = createStore(initial());
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);
    store.update({ count: 2 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("解除した購読者には通知しない", () => {
    const store = createStore(initial());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.update({ count: 2 });
    expect(listener).not.toHaveBeenCalled();
  });

  // useSyncExternalStore は getSnapshot の戻り値の参照で変化を判定する。
  // 内容が同じでも新しいオブジェクトを返すと再描画が止まらなくなる
  it("内容が変わらない update では参照を保つ", () => {
    const store = createStore(initial());
    const before = store.getSnapshot();
    store.update({ count: 1, name: "x" });
    expect(store.getSnapshot()).toBe(before);
  });

  it("内容が変わらない update では通知しない", () => {
    const store = createStore(initial());
    const listener = vi.fn();
    store.subscribe(listener);
    store.update({ count: 1 });
    store.update({});
    expect(listener).not.toHaveBeenCalled();
  });

  it("変化があると新しい参照になる", () => {
    const store = createStore(initial());
    const before = store.getSnapshot();
    store.update({ count: 2 });
    expect(store.getSnapshot()).not.toBe(before);
    // 元の状態は書き換えない
    expect(before.count).toBe(1);
  });

  // 比較は浅い。オブジェクトを持たせる場合は、内容が同じでも
  // 新しく作って渡すと変化として扱われる
  it("オブジェクトの値は参照で比較する", () => {
    const store = createStore(initial());
    const listener = vi.fn();
    store.subscribe(listener);
    store.update({ nested: { value: 0 } });
    expect(listener).toHaveBeenCalledTimes(1);
    store.update({ nested: store.getSnapshot().nested });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // 通知より先に状態を差し替えていないと、購読者が古い値を読んでしまう
  it("通知を受けた時点で購読者は新しい状態を読める", () => {
    const store = createStore(initial());
    let seen = 0;
    store.subscribe(() => {
      seen = store.getSnapshot().count;
    });
    store.update({ count: 5 });
    expect(seen).toBe(5);
  });
});
