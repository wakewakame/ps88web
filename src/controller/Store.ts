/**
 * 購読可能な状態を作る
 *
 * React の外に置いた状態を useSyncExternalStore から読むための最小の実装。
 * 状態と購読者はクロージャに閉じ込め、update 以外から触れないようにする。
 *
 * @param initial - 初期状態
 */
export const createStore = <T extends object>(initial: T) => {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: (): T => state,

    /**
     * 状態を部分的に更新して購読者に通知する
     *
     * useSyncExternalStore は参照の同一性で変化を判定するため、
     * 内容が変わらない場合はオブジェクトを作り直さない
     */
    update: (next: Partial<T>) => {
      const merged = { ...state, ...next };
      const changed = (Object.keys(merged) as (keyof T)[]).some(
        (key) => merged[key] !== state[key],
      );
      if (!changed) {
        return;
      }
      state = merged;
      listeners.forEach((listener) => listener());
    },
  };
};
