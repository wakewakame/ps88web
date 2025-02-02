import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { ButtonSelector, Option } from './components/ButtonSelector';
import { Canvas } from './components/Canvas';
import { AudioDevices } from './controller/AudioDevices';

const App = () => {
  const [inputs, setInputs] = useState<Option[]>([]);
  const [outputs, setOutputs] = useState<Option[]>([]);
  const [editor, setEditor] = useState<boolean>(false);

  const getInputs = () => {
    AudioDevices.getInputs().then(setInputs);
  };
  const getOutputs = () => {
    AudioDevices.getOutputs().then(setOutputs);
  };
  const setInput = (enable: boolean, id?: string) => {
    AudioDevices.setInput(enable, id);
  };
  const setOutput = (enable: boolean, id?: string) => {
    AudioDevices.setOutput(enable, id);
  };

  const options = [...Array(5)].map((_, i) => ({ id: `${i + 1}`, name: `Option ${i + 1}` }));

  return (
    <div className="flex flex-col h-dvh">
      <div className="w-full h-16 py-2 flex flex-row gap-4 items-center justify-center">
        <ButtonSelector icon="monitor" />
        <ButtonSelector icon="mic" options={inputs} onOpen={getInputs} onChange={setInput} />
        <ButtonSelector icon="volume_up" options={outputs} onOpen={getOutputs} onChange={setOutput} />
        <ButtonSelector icon="piano" options={options} />
        <ButtonSelector icon="code" onChange={(enable) => setEditor(enable)} />
      </div>
      <div className="w-full h-[calc(100dvh-(var(--spacing)*16))] relative">
        <Canvas width={640} height={480}></Canvas>
        <div className={`size-full ${editor ? "" : "opacity-0 invisible"} transition-all duration-100 ease-in-out`}>
          <Editor
            className="size-full absolute opacity-70"
            defaultLanguage="javascript"
            defaultValue="// Write your code here"
            theme="vs-dark"
          />
        </div>
      </div>
    </div>
  );
};

export default App;
