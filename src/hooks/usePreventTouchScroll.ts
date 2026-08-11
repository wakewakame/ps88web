import { useEffect, useRef } from "react";

/**
 * 要素上でのタッチ操作によるスクロールを抑止する
 *
 * touchmove は passive: false で登録しないと preventDefault できないため、
 * onTouchMove ではなく addEventListener を使う。
 *
 * @returns 抑止したい要素に渡す ref
 */
export const usePreventTouchScroll = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  useEffect(() => {
    const elem = ref.current;
    if (elem == null) {
      return;
    }
    const onTouchMove = (e: TouchEvent) => e.preventDefault();
    elem.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => elem.removeEventListener("touchmove", onTouchMove);
  }, []);
  return ref;
};
