// 権限の状態を問い合わせる。マイクと MIDI で共通の処理をここにまとめる。
//
// Permissions API は対応していない名前に対して reject する。状態が分からない
// ことと拒否されていることは区別したいため、いずれも undefined で表す。

/**
 * 権限の状態を一度だけ問い合わせる
 *
 * @returns 権限の状態 (問い合わせできなかった場合は undefined)
 */
export const getState = async (
  name: PermissionName,
): Promise<PermissionState | undefined> => {
  try {
    return (await navigator.permissions.query({ name })).state;
  } catch (e) {
    console.warn(e);
    return undefined;
  }
};

/**
 * 権限の状態を購読する
 *
 * 権限はブラウザの設定からいつでも変更できるため、一度問い合わせて終わりには
 * しない。購読を開始した時点の状態も一度通知する。
 *
 * @returns 購読を解除する関数
 */
export const subscribeState = (
  name: PermissionName,
  listener: (state: PermissionState | undefined) => void,
): (() => void) => {
  let status: PermissionStatus | undefined;
  let unsubscribed = false;
  const onChange = () => listener(status?.state);

  navigator.permissions
    .query({ name })
    .then((queried) => {
      // 問い合わせの完了前に解除されることがある
      if (unsubscribed) {
        return;
      }
      status = queried;
      status.addEventListener("change", onChange);
      onChange();
    })
    .catch((e) => {
      console.warn(e);
      if (!unsubscribed) {
        listener(undefined);
      }
    });

  return () => {
    unsubscribed = true;
    status?.removeEventListener("change", onChange);
  };
};
