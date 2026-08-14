import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ButtonSelectorArgs, Option } from "../components/ButtonSelector";
import * as AudioController from "../controller/AudioController";
import * as AudioDevices from "../controller/AudioDevices";
import * as MIDIDevices from "../controller/MIDIDevices";
import * as OutputController from "../controller/OutputController";
import * as Storage from "../controller/Storage";

// JSX の spread では余剰プロパティチェックが働かないため、ButtonSelectorArgs と
// 同じ形の型を別に定義するとフィールド名がずれても型エラーにならない。
// (ButtonSelectorArgs 側がほぼ optional なので、必須漏れとしても検出されない)
// そのため以下の型は ButtonSelectorArgs から導出し、定義をひとつに保つ。

/** ButtonSelector に渡す、オン/オフのみを持つデバイスの props */
export type DeviceToggle = Required<Pick<ButtonSelectorArgs, "enable">> & {
  onChange: (enable: boolean) => void;
};

/** ButtonSelector に渡す、デバイス一覧を選択できるデバイスの props */
export type DeviceSelector = Required<
  Pick<
    ButtonSelectorArgs,
    "enable" | "options" | "disabled" | "selected" | "onOpen" | "onChange"
  >
>;

export type AudioDeviceControls = {
  display: DeviceToggle;
  input: DeviceSelector;
  output: DeviceSelector;
  midi: DeviceSelector;
  /**
   * 出力がまだ有効でなければ有効にする
   *
   * 自動再生ポリシーで起動時の復元が拒否されることがあるため、
   * 最初のポインタ操作でこれを呼び出して確実に有効化する。
   */
  initOutput: () => void;
};

// 設定は次回の起動時に復元する。
// 入力 (マイク) は、開いただけで録音インジケータが点灯し驚かせるため復元しない。
// 画面キャプチャは getDisplayMedia が仕様上ユーザー操作を必須とするため復元できない。
// 出力は状態が多く直列化も要るため OutputController が持つ
const MIDI_STORAGE_KEY = "midi";

type MIDISetting = {
  enabled: boolean;
  deviceId: string | null;
};

const listInputs = () => AudioDevices.getDevices("audioinput");
const listOutputs = () => AudioDevices.getDevices("audiooutput");
const listMIDIs = () => MIDIDevices.getDevices();

const toAudioOption = (device: MediaDeviceInfo): Option => ({
  id: device.deviceId,
  name: device.label,
});
const toMIDIOption = (device: MIDIInput): Option => ({
  id: device.id,
  name: device.name ?? "unknown",
});

/**
 * デバイス一覧の取得
 *
 * list が null を返した場合は権限が無いなどで取得できなかったことを表し、
 * ButtonSelector を disabled にする。
 */
const useDeviceOptions = <T>(
  list: () => Promise<T[] | null>,
  toOption: (device: T) => Option,
) => {
  const [options, setOptions] = useState<Option[] | null>([]);
  const onOpen = useCallback(() => {
    list()
      .then((devices) => setOptions(devices?.map(toOption) ?? null))
      // 失敗を握り潰すと一覧が空のまま無反応に見えるため、disabled にして示す
      .catch((e) => {
        console.error(e);
        setOptions(null);
      });
  }, [list, toOption]);
  return { options: options ?? [], disabled: options == null, onOpen };
};

/**
 * 入出力デバイスの選択状態の管理
 *
 * 戻り値の display / input / output / midi は、
 * そのまま ButtonSelector に spread して渡せる形になっている。
 */
export const useAudioDevices = (): AudioDeviceControls => {
  // 画面キャプチャとマイクは同時に使えないため、有効な入力は高々ひとつ
  const [inputSource, setInputSource] = useState<"display" | "mic" | null>(
    null,
  );
  const [midiEnable, setMIDIEnable] = useState(false);

  // 選択中のデバイス (null=既定のデバイス)。
  // ButtonSelector は制御コンポーネントなので、選択状態はここで保持する
  const [inputDeviceId, setInputDeviceId] = useState<string | null>(null);
  const [midiDeviceId, setMIDIDeviceId] = useState<string | null>(null);

  // 出力は状態が多く直列化も必要なため、React の外 (OutputController) が持つ
  const output = useSyncExternalStore(
    OutputController.subscribe,
    OutputController.getSnapshot,
  );

  // 起動時に前回の出力設定を復元する
  useEffect(() => {
    OutputController.restore();
  }, []);

  const inputOptions = useDeviceOptions(listInputs, toAudioOption);
  const outputOptions = useDeviceOptions(listOutputs, toAudioOption);
  const midiOptions = useDeviceOptions(listMIDIs, toMIDIOption);

  const setDisplay = useCallback(async (enable: boolean) => {
    const stream = enable
      ? await AudioDevices.getInputStreamFromDisplay()
      : null;
    setInputSource(stream != null ? "display" : null);
    await AudioController.setInput(stream);
  }, []);

  const setInput = useCallback(async (enable: boolean, id: string | null) => {
    setInputDeviceId(id);
    const stream = enable
      ? await AudioDevices.getInputStream(id ?? undefined)
      : null;
    setInputSource(stream != null ? "mic" : null);
    await AudioController.setInput(stream);
  }, []);

  const applyMIDI = useCallback(async (enable: boolean, id: string | null) => {
    setMIDIDeviceId(id);
    const midi = enable ? await MIDIDevices.getDevice(id ?? undefined) : null;
    setMIDIEnable(midi != null);
    await AudioController.setMIDI(midi);
  }, []);

  // 復元が終わる前にユーザーが操作した場合、復元で上書きしないために見る
  const midiChosen = useRef(false);

  const setMIDI = useCallback(
    async (enable: boolean, id: string | null) => {
      midiChosen.current = true;
      Storage.store(MIDI_STORAGE_KEY, { enabled: enable, deviceId: id });
      await applyMIDI(enable, id);
    },
    [applyMIDI],
  );

  // 起動時に前回の MIDI 設定を復元する。
  // requestMIDIAccess はユーザー操作を必要とせず、権限も既定で granted のため、
  // 出力と違って復元が拒否されることは無い
  useEffect(() => {
    let cancelled = false;
    void Storage.load<MIDISetting>(MIDI_STORAGE_KEY).then((saved) => {
      if (cancelled || midiChosen.current || saved == null || !saved.enabled) {
        return;
      }
      // 保存していたデバイスが見つからない場合は無効のままにする。
      // 出力と違い、別の機器に勝手に繋ぐと想定外の入力になるため
      void applyMIDI(true, saved.deviceId);
    });
    return () => {
      cancelled = true;
    };
  }, [applyMIDI]);

  return {
    display: { enable: inputSource === "display", onChange: setDisplay },
    // 展開は先頭に置く。末尾だと、将来 useDeviceOptions が同名のキーを
    // 返すようになったときに、下で明示した値が黙って上書きされるため
    input: {
      ...inputOptions,
      enable: inputSource === "mic",
      selected: inputDeviceId,
      onChange: setInput,
    },
    output: {
      ...outputOptions,
      enable: output.enabled,
      selected: output.deviceId,
      onChange: OutputController.set,
    },
    midi: {
      ...midiOptions,
      enable: midiEnable,
      selected: midiDeviceId,
      onChange: setMIDI,
    },
    initOutput: OutputController.init,
  };
};
