import { useCallback, useEffect, useSyncExternalStore } from "react";
import * as CodeStore from "../controller/CodeStore";

/**
 * エディタに表示するコードの管理
 *
 * 実体は CodeStore にあり、ここはその React 側の入口。
 * 初期コードの読み込みと、編集内容の書き戻しを行う。
 */
export const useProcessorCode = () => {
  const code = useSyncExternalStore(CodeStore.subscribe, CodeStore.get);

  useEffect(() => {
    void CodeStore.load();
  }, []);

  const onCodeChange = useCallback((code?: string) => {
    if (code == undefined) {
      return;
    }
    CodeStore.set(code);
  }, []);

  return { code, onCodeChange };
};
