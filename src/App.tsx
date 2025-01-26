import { useState, useEffect, useRef } from 'react';
import ButtonSelector from './components/ButtonSelector';
import Editor from '@monaco-editor/react';

const App = () => {
  const [editor, setEditor] = useState<boolean>(false);

  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current!.getContext('2d')!;
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, 640, 480);
  }, []);

  const options = [
    { id: 1, name: 'Option 1' },
    { id: 2, name: 'Option 2' },
    { id: 3, name: 'Option 3' },
  ];

  return (
    <div className="flex flex-col h-dvh">
      <div className="w-full h-16 flex flex-row gap-4 items-center justify-center">
        <ButtonSelector icon="monitor" />
        <ButtonSelector icon="mic" options={options} />
        <ButtonSelector icon="volume_up" options={options} />
        <ButtonSelector icon="piano" options={options} />
        <ButtonSelector icon="code" onChange={(enable) => setEditor(enable)} />
      </div>
      <div className="w-full h-[calc(100dvh-(var(--spacing)*16))] relative">
        <canvas ref={canvas} width="640" height="480" className="size-full object-contain absolute"></canvas>
        <div className={`size-full ${editor ? 'block' : 'hidden'}`}>
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
