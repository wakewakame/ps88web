import { useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import { ButtonSelector, type Option } from "./components/ButtonSelector";
import { Canvas } from "./components/Canvas";
import { Keyboard } from "./components/Keyboard";
import AudioDevices from "./controller/AudioDevices";
import MIDIDevices from "./controller/MIDIDevices";
import AudioController from "./controller/AudioController";
import defaultProcessorCode from "./controller/Processor?raw";
import ps88_d_ts from "../lib/ps88.d.ts?raw";

const buttonState = (() => {
  const State = class {
    #state = {
      input: false,
      output: false,
      midi: false,
      editor: false,
    };
    constructor() {
      this.load();
    }
    load() {
      const saved = localStorage.getItem("buttonState");
      if (saved) {
        this.#state = JSON.parse(saved);
      }
      return this.#state;
    }
    save() {
      localStorage.setItem("buttonState", JSON.stringify(this.#state));
    }
    get input() {
      return this.#state.input;
    }
    set input(value: boolean) {
      this.#state.input = value;
      this.save();
    }
    get output() {
      return this.#state.output;
    }
    set output(value: boolean) {
      this.#state.output = value;
      this.save();
    }
    get midi() {
      return this.#state.midi;
    }
    set midi(value: boolean) {
      this.#state.midi = value;
      this.save();
    }
    get editor() {
      return this.#state.editor;
    }
    set editor(value: boolean) {
      this.#state.editor = value;
      this.save();
    }
    async init(code: string) {
      if (this.#state.input) {
        const stream = await AudioDevices.getInputStream();
        await AudioController.setInput(stream);
      }
      if (this.#state.output) {
        await AudioController.setOutput(true);
      }
      if (this.#state.midi) {
        const midi = await MIDIDevices.getDevice();
        await AudioController.setMIDI(midi);
      }
      AudioController.build(code);
    }
  };
  return new State();
})();

const App = () => {
  const [isOutputInit, setIsOutputInit] = useState<boolean>(false);

  const [displayToggle, setDisplayToggle] = useState<boolean>(false);
  const [inputToggle, setInputToggle] = useState<boolean>(buttonState.input);
  const [outputToggle, setOutputToggle] = useState<boolean>(buttonState.output);
  const [midiToggle, setMIDIToggle] = useState<boolean>(buttonState.midi);
  const [editorToggle, setEditorToggle] = useState<boolean>(buttonState.editor);

  const [inputs, setInputs] = useState<Option[] | null>([]);
  const [outputs, setOutputs] = useState<Option[] | null>([]);
  const [midis, setMIDIs] = useState<Option[] | null>([]);

  const codeURL = new URLSearchParams(window.location.search).get("src");
  const [code, setCode] = useState<string>(
    codeURL == undefined
      ? (localStorage.getItem("code") ?? defaultProcessorCode)
      : "// loading...",
  );
  buttonState.init(code).then(() => { setIsOutputInit(true); });
  const [hotReloadTimeout, sethotReloadTimeout] = useState<
    number | undefined
  >();
  const onCodeChange = (code?: string) => {
    if (hotReloadTimeout != undefined) {
      clearTimeout(hotReloadTimeout);
    }
    if (code == undefined) {
      return;
    }
    setCode(code);
    sethotReloadTimeout(
      setTimeout(() => {
        AudioController.build(code);
        if (codeURL == undefined) {
          localStorage.setItem("code", code);
        }
      }, 1000),
    );
  };

  const [loading, setLoading] = useState<boolean>(true);
  if (codeURL != undefined && loading) {
    fetch(codeURL)
      .then(async (res) => {
        setLoading(false);
        if (!res.ok) {
          setCode("// error: failed to load the code from URL");
          return;
        }
        const text = await res.text();
        setCode(text);
        buttonState.init(text).then(() => { setIsOutputInit(true); });
      })
      .catch((e) => {
        setLoading(false);
        setCode("// error: failed to load the code from URL");
        console.error(e);
      });
  }

  const getInputs = () => {
    AudioDevices.getDevices("audioinput")
      .then(
        (devices) =>
          devices?.map((device) => ({
            id: device.deviceId,
            name: device.label,
          })) ?? null,
      )
      .then(setInputs);
  };
  const getOutputs = () => {
    AudioDevices.getDevices("audiooutput")
      .then(
        (devices) =>
          devices?.map((device) => ({
            id: device.deviceId,
            name: device.label,
          })) ?? null,
      )
      .then(setOutputs);
  };
  const getMIDIs = () => {
    MIDIDevices.getDevices()
      .then(
        (devices) =>
          devices?.map((device) => ({
            id: device.id.toString(),
            name: device.name ?? "unknown",
          })) ?? null,
      )
      .then(setMIDIs);
  };
  const setDisplay = async (enable: boolean) => {
    const stream = enable
      ? await AudioDevices.getInputStreamFromDisplay()
      : null;
    setInputToggle(false);
    buttonState.input = false;
    setDisplayToggle(stream != null);
    await AudioController.setInput(stream);
    AudioController.build(code);
  };
  const setInput = async (enable: boolean, id: string | null) => {
    const stream = enable
      ? await AudioDevices.getInputStream(id ?? undefined)
      : null;
    setInputToggle(stream != null);
    buttonState.input = stream != null;
    setDisplayToggle(false);
    await AudioController.setInput(stream);
    AudioController.build(code);
  };
  const setOutputIfNotInit = () => {
    if (!isOutputInit) {
      setOutput(true, null);
    }
  };
  const setOutput = async (enable: boolean, id: string | null) => {
    await AudioController.setOutput(enable, id ?? undefined);
    setOutputToggle(enable);
    buttonState.output = enable;
    AudioController.build(code);
    setIsOutputInit(true);
  };
  const setMIDI = async (enable: boolean, id: string | null) => {
    const midi = enable ? await MIDIDevices.getDevice(id ?? undefined) : null;
    setMIDIToggle(midi != null);
    buttonState.midi = midi != null;
    await AudioController.setMIDI(midi);
    AudioController.build(code);
  };

  const onDraw = (
    w: number,
    h: number,
    mouse: { x: number; y: number; pressedL: boolean; pressedR: boolean },
  ) => {
    AudioController.draw(w, h, mouse);
    return AudioController.getShapes();
  };

  const appRef = useRef<HTMLDivElement>(null);
  appRef.current?.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
    },
    { passive: false },
  );

  return (
    <div ref={appRef} className="flex flex-col h-dvh select-none">
      <div className="w-full h-16 py-2 box-border flex-none flex flex-row gap-4 items-center justify-center relative">
        <div className="absolute right-4">
          <a
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 mx-1"
            href="./docs/index.html"
          >
            Docs
          </a>
          <a
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 mx-1"
            href="./examples/index.html"
          >
            Examples
          </a>
          <a
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 mx-1"
            href="https://github.com/wakewakame/ps88web"
          >
            GitHub
          </a>
        </div>
        <ButtonSelector
          icon="monitor"
          enable={displayToggle}
          onChange={setDisplay}
        />
        <ButtonSelector
          icon="mic"
          enable={inputToggle}
          options={inputs ?? []}
          disabled={inputs === null}
          onOpen={getInputs}
          onChange={setInput}
        />
        <ButtonSelector
          icon="volume_up"
          enable={outputToggle}
          options={outputs ?? []}
          onOpen={getOutputs}
          onChange={setOutput}
        />
        <ButtonSelector
          icon="piano"
          enable={midiToggle}
          options={midis ?? []}
          disabled={midis === null}
          onOpen={getMIDIs}
          onChange={setMIDI}
        />
        <ButtonSelector
          icon="code"
          enable={editorToggle}
          onChange={(enable) => {
            setEditorToggle(enable);
            buttonState.editor = enable;
          }}
        />
      </div>
      <div
        className="w-full flex-auto box-border relative"
        onPointerDown={setOutputIfNotInit}
      >
        <Canvas width={640} height={480} onDraw={onDraw}></Canvas>
        <div
          className={`size-full ${editorToggle ? "" : "opacity-0 invisible"} transition-all duration-100 ease-in-out`}
        >
          <Editor
            onChange={onCodeChange}
            onMount={(_, monaco) => {
              // 補完用の型定義を追加
              monaco.languages.typescript.javascriptDefaults.addExtraLib(
                ps88_d_ts,
                "ps88.d.ts",
              );
            }}
            className="size-full absolute opacity-70"
            defaultLanguage="javascript"
            value={code}
            theme="vs-dark"
          />
        </div>
      </div>
      <div
        className="w-full h-16 pt-1 box-border flex-none"
        onPointerDown={setOutputIfNotInit}
      >
        <Keyboard onMIDIMessage={AudioController.onMIDIMessage} />
      </div>
    </div>
  );
};

export default App;
