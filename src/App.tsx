import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { ButtonSelector, Option } from './components/ButtonSelector';
import { Canvas } from './components/Canvas';
import { AudioController } from './controller/AudioController';

const App = () => {
  const [inputs, setInputs] = useState<Option[]>([]);
  const [outputs, setOutputs] = useState<Option[]>([]);
  const [editor, setEditor] = useState<boolean>(false);

  const defaultCode =
`console.log('Hello, World!');
let wave = [];
let count = 0;
const audio = (ctx) => {
  wave = wave.concat([...ctx.audio[0]]).slice(-1024);
  for (ch = 0; ch < ctx.audio.length; ch++) {
    for (i = 0; i < ctx.audio[ch].length; i++) {
      if (ch === 0) {
        count += 1;
        ctx.audio[ch][i] = Math.sin(440 * 2 * Math.PI * count / 44100) * 0.01;
      } else {
        ctx.audio[ch][i] = ctx.audio[0][i];
      }
    }
  }
  //console.log(wave.length);
};
const gui = (ctx, area, mouse) => {
  //console.log(wave[0]);
  const w = [...Array(area.width)].map((_, x) => {
    const wi = Math.floor(wave.length * x / area.width);
    const y = wave[wi] * 500.0 + area.height * 0.5;
    return [x, y];
  }).flat();
  ctx.shapes.push({"Polygon": {
    "shape": w,
    "stroke": 0xFFFFFF,
  }});
};
return { audio, gui };
`;
  const [code, setCode] = useState<string>(defaultCode);
  const [build, setBuild] = useState<number | undefined>();
  const onCodeChange = (code?: string) => {
    if (build !== undefined) {
      clearTimeout(build);
    }
    if (code === undefined) {
      return;
    }
    setBuild(setTimeout(() => {
      AudioController.setProcessor(code);
      setCode(code);
    }, 1000));
  };

  const getInputs = () => {
    AudioController.getInputs()
      .then((devices) => devices.map((device) => ({
        id: device.deviceId,
        name: device.deviceName,
      })))
      .then(setInputs);
  };
  const getOutputs = () => {
    AudioController.getOutputs()
      .then((devices) => devices.map((device) => ({
        id: device.deviceId,
        name: device.deviceName,
      })))
      .then(setOutputs);
  };
  const setDisplay = async (enable: boolean) => {
    await AudioController.setDisplay(enable);
    AudioController.setProcessor(code);
  };
  const setInput = async (enable: boolean, id?: string) => {
    await AudioController.setInput(enable, id);
    AudioController.setProcessor(code);
  };
  const setOutput = async (enable: boolean, id?: string) => {
    await AudioController.setOutput(enable, id);
    AudioController.setProcessor(code);
  };
  const dummyMidis = [...Array(5)].map((_, i) => ({ id: `${i + 1}`, name: `Option ${i + 1}` }));

  const onMouse = (event: "up" | "down" | "move", x: number, y: number) => {
    AudioController.setMouse(event, x, y);
  };
  const onDraw = () => {
    AudioController.draw();
    return AudioController.getShapes();
  };

  return (
    <div className="flex flex-col h-dvh">
      <div className="w-full h-16 py-2 flex flex-row gap-4 items-center justify-center">
        <ButtonSelector icon="monitor" onChange={setDisplay} />
        <ButtonSelector icon="mic" options={inputs} onOpen={getInputs} onChange={setInput} />
        <ButtonSelector icon="volume_up" options={outputs} onOpen={getOutputs} onChange={setOutput} />
        <ButtonSelector icon="piano" options={dummyMidis} />
        <ButtonSelector icon="code" onChange={(enable) => setEditor(enable)} />
      </div>
      <div className="w-full h-[calc(100dvh-(var(--spacing)*16))] relative">
        <Canvas width={640} height={480} onMouse={onMouse} onDraw={onDraw}></Canvas>
        <div className={`size-full ${editor ? "" : "opacity-0 invisible"} transition-all duration-100 ease-in-out`}>
          <Editor
            onChange={onCodeChange}
            className="size-full absolute opacity-70"
            defaultLanguage="javascript"
            defaultValue={defaultCode}
            theme="vs-dark"
          />
        </div>
      </div>
    </div>
  );
};

export default App;
