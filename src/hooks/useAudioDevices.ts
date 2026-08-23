import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ButtonSelectorArgs, Option } from "../components/ButtonSelector";
import * as AudioDevices from "../controller/audio/AudioDevices";
import * as InputController from "../controller/audio/InputController";
import * as MIDIController from "../controller/audio/MIDIController";
import * as MIDIDevices from "../controller/audio/MIDIDevices";
import * as OutputController from "../controller/audio/OutputController";

// JSX の spread では余剰プロパティチェックが働かないため、ButtonSelectorArgs と
// 同じ形の型を別に定義するとフィールド名がずれても型エラーにならない。
// (ButtonSelectorArgs 側がほぼ optional なので、必須漏れとしても検出されない)
// そのため以下の型は ButtonSelectorArgs から導出し、定義をひとつに保つ。

/** ButtonSelector に渡す、オン/オフのみを持つデバイスの props */
export type DeviceToggle = Required<Pick<ButtonSelectorArgs, "pressed">> & {
  onChange: (pressed: boolean) => void;
};

/** ButtonSelector に渡す、デバイス一覧を選択できるデバイスの props */
export type DeviceSelector = Required<
  Pick<
    ButtonSelectorArgs,
    "pressed" | "options" | "disabled" | "selected" | "onOpen" | "onChange"
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
 * 取得できなかった場合は空の一覧として扱う。ボタンは操作可能なままにする。
 * 一覧を出せないことと、そのデバイスを使えないことは別だからで、たとえば
 * スピーカーは一覧を列挙できない環境でも既定のデバイスで鳴らせる
 */
const useDeviceOptions = <T>(
  list: () => Promise<T[] | null>,
  toOption: (device: T) => Option,
) => {
  const [options, setOptions] = useState<Option[]>([]);
  const onOpen = useCallback(() => {
    list()
      .then((devices) => setOptions(devices?.map(toOption) ?? []))
      .catch((e) => {
        console.error(e);
        setOptions([]);
      });
  }, [list, toOption]);
  return { options, onOpen };
};

/**
 * 権限が拒否されているかの購読
 *
 * 拒否されている間は有効化できないため、ボタンを操作不可にする。権限は
 * ブラウザの設定からいつでも変更できるので、一度の問い合わせでは済まさない
 */
const usePermissionDenied = (
  subscribe: (listener: (denied: boolean) => void) => () => void,
) => {
  const [denied, setDenied] = useState(false);
  useEffect(() => subscribe(setDenied), [subscribe]);
  return denied;
};

/**
 * 入出力デバイスの選択状態の管理
 *
 * 戻り値の display / input / output / midi は、
 * そのまま ButtonSelector に spread して渡せる形になっている。
 */
export const useAudioDevices = (): AudioDeviceControls => {
  // 実行時の状態はいずれも React の外 (各コントローラ) が持つ
  const input = useSyncExternalStore(
    InputController.subscribe,
    InputController.getSnapshot,
  );
  const output = useSyncExternalStore(
    OutputController.subscribe,
    OutputController.getSnapshot,
  );
  const midi = useSyncExternalStore(
    MIDIController.subscribe,
    MIDIController.getSnapshot,
  );

  // 起動時に前回の設定を復元する
  useEffect(() => {
    InputController.restore();
    OutputController.restore();
    MIDIController.restore();
  }, []);

  const inputOptions = useDeviceOptions(listInputs, toAudioOption);
  const outputOptions = useDeviceOptions(listOutputs, toAudioOption);
  const midiOptions = useDeviceOptions(listMIDIs, toMIDIOption);

  const inputDenied = usePermissionDenied(
    AudioDevices.subscribePermissionDenied,
  );
  const midiDenied = usePermissionDenied(MIDIDevices.subscribePermissionDenied);

  return {
    display: {
      pressed: input.source === "display",
      onChange: InputController.setDisplay,
    },
    // 展開は先頭に置く。末尾だと、将来 useDeviceOptions が同名のキーを
    // 返すようになったときに、下で明示した値が黙って上書きされるため
    input: {
      ...inputOptions,
      pressed: input.source === "mic",
      disabled: inputDenied,
      selected: input.deviceId,
      onChange: InputController.setMicrophone,
    },
    output: {
      ...outputOptions,
      pressed: output.enabled,
      // 出力に権限は要らない。列挙できない環境でも既定のデバイスで鳴らせる
      disabled: false,
      selected: output.deviceId,
      onChange: OutputController.set,
    },
    midi: {
      ...midiOptions,
      pressed: midi.enabled,
      disabled: midiDenied,
      selected: midi.deviceId,
      onChange: MIDIController.set,
    },
    initOutput: OutputController.init,
  };
};
