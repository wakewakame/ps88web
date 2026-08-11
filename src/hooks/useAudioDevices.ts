import { useCallback, useRef, useState } from "react";
import type { Option } from "../components/ButtonSelector";
import AudioController from "../controller/AudioController";
import AudioDevices from "../controller/AudioDevices";
import MIDIDevices from "../controller/MIDIDevices";

/** ButtonSelector に渡す、オン/オフのみを持つデバイスの props */
export type DeviceToggle = {
  enable: boolean;
  onChange: (enable: boolean) => void;
};

/** ButtonSelector に渡す、デバイス一覧を選択できるデバイスの props */
export type DeviceSelector = {
  enable: boolean;
  options: Option[];
  disabled: boolean;
  onOpen: () => void;
  onChange: (enable: boolean, id: string | null) => void;
};

export type AudioDeviceControls = {
  display: DeviceToggle;
  input: DeviceSelector;
  output: DeviceSelector;
  midi: DeviceSelector;
  /**
   * 出力をまだ初期化していなければ初期化する
   *
   * AudioContext はユーザー操作を受けてからでないと音が出ないため、
   * 最初のポインタ操作でこれを呼び出す。
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
 * list が null を返した場合は権限が無いなどで取得できなかったことを表し、
 * ButtonSelector を disabled にする。
 */
const useDeviceOptions = <T>(
  list: () => Promise<T[] | null>,
  toOption: (device: T) => Option,
) => {
  const [options, setOptions] = useState<Option[] | null>([]);
  const onOpen = useCallback(() => {
    list().then((devices) => setOptions(devices?.map(toOption) ?? null));
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
  const [outputEnable, setOutputEnable] = useState(false);
  const [midiEnable, setMIDIEnable] = useState(false);

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
    const stream = enable
      ? await AudioDevices.getInputStream(id ?? undefined)
      : null;
    setInputSource(stream != null ? "mic" : null);
    await AudioController.setInput(stream);
  }, []);

  // 初期化中に再度呼ばれても二重に初期化しないよう、state ではなく ref で持つ
  const outputInitialized = useRef(false);
  const setOutput = useCallback(async (enable: boolean, id: string | null) => {
    outputInitialized.current = true;
    await AudioController.setOutput(enable, id ?? undefined);
    setOutputEnable(enable);
  }, []);
  const initOutput = useCallback(() => {
    if (outputInitialized.current) {
      return;
    }
    setOutput(true, null);
  }, [setOutput]);

  const setMIDI = useCallback(async (enable: boolean, id: string | null) => {
    const midi = enable ? await MIDIDevices.getDevice(id ?? undefined) : null;
    setMIDIEnable(midi != null);
    await AudioController.setMIDI(midi);
  }, []);

  return {
    display: { enable: inputSource === "display", onChange: setDisplay },
    input: {
      enable: inputSource === "mic",
      ...inputOptions,
      onChange: setInput,
    },
    output: { enable: outputEnable, ...outputOptions, onChange: setOutput },
    midi: { enable: midiEnable, ...midiOptions, onChange: setMIDI },
    initOutput,
  };
};
