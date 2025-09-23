import { useState } from "react";
import Editor from "@monaco-editor/react";
import { ButtonSelector, Option } from "./components/ButtonSelector";
import { Canvas } from "./components/Canvas";
import { Keyboard } from "./components/Keyboard";
import AudioDevices from "./controller/AudioDevices";
import MIDIDevices from "./controller/MIDIDevices";
import AudioController from "./controller/AudioController";
import defaultProcessorCode from "./controller/Processor?raw";

const App = () => {
  const [displayToggle, setDisplayToggle] = useState<boolean>(false);
  const [inputToggle, setInputToggle] = useState<boolean>(false);
  const [outputToggle, setOutputToggle] = useState<boolean>(false);
  const [midiToggle, setMIDIToggle] = useState<boolean>(false);
  const [editorToggle, setEditorToggle] = useState<boolean>(false);

  const [inputs, setInputs] = useState<Option[] | null>([]);
  const [outputs, setOutputs] = useState<Option[] | null>([]);
  const [midis, setMIDIs] = useState<Option[] | null>([]);

  const defaultCode = localStorage.getItem("code") ?? defaultProcessorCode;
  const [code, setCode] = useState<string>(defaultCode);
  const [hotReloadTimeout, sethotReloadTimeout] = useState<number | undefined>();
  const onCodeChange = (code?: string) => {
    if (hotReloadTimeout !== undefined) {
      clearTimeout(hotReloadTimeout);
    }
    if (code === undefined) {
      return;
    }
    sethotReloadTimeout(setTimeout(() => {
      AudioController.build(code);
      setCode(code);
      localStorage.setItem("code", code);
    }, 1000));
  };

  const getInputs = () => {
    AudioDevices.getDevices("audioinput")
      .then((devices) => devices?.map((device) => ({
        id: device.deviceId,
        name: device.label,
      })) ?? null)
      .then(setInputs);
  };
  const getOutputs = () => {
    AudioDevices.getDevices("audiooutput")
      .then((devices) => devices?.map((device) => ({
        id: device.deviceId,
        name: device.label,
      })) ?? null)
      .then(setOutputs);
  };
  const getMIDIs = () => {
    MIDIDevices.getDevices()
      .then((devices) => devices?.map((device) => ({
        id: device.id.toString(),
        name: device.name ?? "unknown",
      })) ?? null)
      .then(setMIDIs);
  };
  const setDisplay = async (enable: boolean) => {
    const stream = enable ? (await AudioDevices.getInputStreamFromDisplay()) : null;
    setInputToggle(false);
    setDisplayToggle(stream != null);
    await AudioController.setInput(stream);
    AudioController.build(code);
  };
  const setInput = async (enable: boolean, id: string | null) => {
    const stream = enable ? (await AudioDevices.getInputStream(id ?? undefined)) : null;
    setInputToggle(stream != null);
    setDisplayToggle(false);
    await AudioController.setInput(stream);
    AudioController.build(code);
  };
  const setOutput = async (enable: boolean, id: string | null) => {
    await AudioController.setOutput(enable, id ?? undefined);
    setOutputToggle(enable);
    AudioController.build(code);
  };
  const setMIDI = async (enable: boolean, id: string | null) => {
    const midi = enable ? (await MIDIDevices.getDevice(id ?? undefined)) : null;
    setMIDIToggle(midi != null);
    await AudioController.setMIDI(midi);
    AudioController.build(code);
  };

  const onDraw = (w: number, h: number) => {
    AudioController.draw(w, h);
    return AudioController.getShapes();
  };

  return (
    <div className="flex flex-col h-dvh">
      <div className="w-full h-16 py-2 flex flex-row gap-4 items-center justify-center">
        <ButtonSelector
          icon="monitor"
          enable={displayToggle}
          onChange={setDisplay} />
        <ButtonSelector
          icon="mic"
          enable={inputToggle}
          options={inputs ?? []}
          disabled={inputs === null}
          onOpen={getInputs}
          onChange={setInput} />
        <ButtonSelector
          icon="volume_up"
          enable={outputToggle}
          options={outputs ?? []}
          onOpen={getOutputs}
          onChange={setOutput} />
        <ButtonSelector
          icon="piano"
          enable={midiToggle}
          options={midis ?? []}
          disabled={midis === null}
          onOpen={getMIDIs}
          onChange={setMIDI} />
        <ButtonSelector
          icon="code"
          enable={editorToggle}
          onChange={(enable) => setEditorToggle(enable)} />
      </div>
      <div className="w-full h-[calc(100dvh-(var(--spacing)*16))] relative">
        <Canvas width={640} height={480} onMouse={AudioController.mouse} onDraw={onDraw}></Canvas>
        <div className={`size-full ${editorToggle ? "" : "opacity-0 invisible"} transition-all duration-100 ease-in-out`}>
          <Editor
            onChange={onCodeChange}
            className="size-full absolute opacity-70"
            defaultLanguage="javascript"
            defaultValue={defaultCode}
            theme="vs-dark"
          />
        </div>
      </div>
      <div className="w-full h-16 pt-1 flex flex-row gap-4 items-center justify-center">
        <Keyboard onMIDIMessage={ AudioController.onMIDIMessage } />
      </div>
    </div>
  );
};

export default App;
