// 入出力の操作はどれもオーディオグラフという単一の資源を触る。並走させると
// AudioController の各関数が await を跨いで互いの接続を切り合い、戻り値も
// 実際の状態と食い違うため、前の操作の完了を待ってから実行する。
//
// 入力・出力・MIDI で 1 本のキューを共有する。互いに独立しているように見えても
// ensureGraph を共有しており、独立性を都度確かめるより直列化した方が安全。
// この規模では並列に実行する利点も無い。

let queue: Promise<void> = Promise.resolve();

/**
 * オーディオグラフを触る操作を順番に実行する
 *
 * 実行の完了は待たない。ひとつが失敗しても後続は実行される。
 */
export const enqueue = (task: () => Promise<void>) => {
  queue = queue.then(task).catch((e) => console.error(e));
};
