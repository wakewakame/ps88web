import { useState } from 'react';
import Editor from '@monaco-editor/react';
import ButtonSelector from './components/ButtonSelector';
import Canvas from './components/Canvas';

const App = () => {
  const [editor, setEditor] = useState<boolean>(false);

  const options1 = [...Array(3)].map((_, i) => ({ id: i + 1, name: `Option ${i + 1}` }));
  const options2 = [...Array(10)].map((_, i) => ({ id: i + 1, name: `Option ${i + 1}` }));
  const options3 = [...Array(100)].map((_, i) => ({ id: i + 1, name: `Optionaaaaaaaaaaaaaaaa ${i + 1}` }));

  return (
    <div className="flex flex-col h-dvh">
      <div className="w-full h-16 py-2 flex flex-row gap-4 items-center justify-center">
        <ButtonSelector icon="monitor" />
        <ButtonSelector icon="mic" options={options1} />
        <ButtonSelector icon="volume_up" options={options2} />
        <ButtonSelector icon="piano" options={options3} />
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
