import { describe, expect, it } from "vitest";
import { en } from "./en.ts";
import { ja } from "./ja.ts";

/**
 * 訳の抜けや余りは Messages 型で防いでいるが、型は「文字列であること」しか
 * 見てくれない。訳し忘れて英語のまま残っている、といった中身の問題はここで見る。
 */

/** 入れ子のオブジェクトを "chat.title" のような平らなキーにする */
const flatten = (
  value: unknown,
  prefix = "",
): { key: string; text: string }[] => {
  if (typeof value === "string") {
    return [{ key: prefix, text: value }];
  }
  if (typeof value === "function") {
    // 書式を組み立てる項目。適当な引数を入れて結果を見る
    return [
      { key: prefix, text: String((value as (a: string) => string)("X")) },
    ];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => flatten(item, `${prefix}[${i}]`));
  }
  if (typeof value === "object" && value != null) {
    return Object.entries(value).flatMap(([k, v]) =>
      flatten(v, prefix === "" ? k : `${prefix}.${k}`),
    );
  }
  return [];
};

const enEntries = flatten(en);
const jaEntries = flatten(ja);

describe("メッセージの定義", () => {
  it("同じ項目を同じ数だけ持つ", () => {
    expect(jaEntries.map((e) => e.key)).toEqual(enEntries.map((e) => e.key));
  });

  it("空の文言が無い", () => {
    for (const entries of [enEntries, jaEntries]) {
      for (const { key, text } of entries) {
        expect(text.trim(), key).not.toBe("");
      }
    }
  });

  it("日本語の訳が英語のまま残っていない", () => {
    // 固有名詞だけの項目は訳す必要が無いので、日本語を含むかではなく
    // 英語の文をそのまま持ってきていないかで見る
    const untranslated = jaEntries.filter((entry, i) => {
      const source = enEntries[i];
      return (
        source != undefined &&
        entry.text === source.text &&
        // 空白で区切られた語が 3 つ以上あるものは英文とみなす
        source.text.split(/\s+/).length >= 3
      );
    });
    expect(untranslated.map((e) => e.key)).toEqual([]);
  });

  it("書式の項目は引数を埋め込んでいる", () => {
    // 引数を無視した訳を書くと、理由が出ない文言になってしまう
    expect(en.settings.modelsFailed("boom")).toContain("boom");
    expect(ja.settings.modelsFailed("boom")).toContain("boom");
  });
});
