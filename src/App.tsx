import { useState } from "react";
import { Canvas } from "./components/Canvas";
import { CodeEditor } from "./components/CodeEditor";
import { Keyboard } from "./components/Keyboard";
import { Toolbar } from "./components/Toolbar";
import AudioController from "./controller/AudioController";
import { useAudioDevices } from "./hooks/useAudioDevices";
import { usePreventTouchScroll } from "./hooks/usePreventTouchScroll";

// Canvas は onDraw の参照が変わると描画ループを作り直すため、
// コンポーネントの外に置いて参照を固定する
const onDraw = (
  w: number,
  h: number,
  mouse: { x: number; y: number; pressedL: boolean; pressedR: boolean },
) => {
  AudioController.draw(w, h, mouse);
  return AudioController.getShapes();
};

const App = () => {
  const devices = useAudioDevices();
  const [editorVisible, setEditorVisible] = useState(false);
  const appRef = usePreventTouchScroll<HTMLDivElement>();

  return (
    <div ref={appRef} className="flex flex-col h-dvh select-none">
      <Toolbar
        devices={devices}
        editorVisible={editorVisible}
        onEditorVisibleChange={setEditorVisible}
      />
      <div
        className="w-full flex-auto box-border relative"
        onPointerDown={devices.initOutput}
      >
        <Canvas width={640} height={480} onDraw={onDraw} />
        <CodeEditor visible={editorVisible} />
      </div>
      <div
        className="w-full h-16 pt-1 box-border flex-none"
        onPointerDown={devices.initOutput}
      >
        <Keyboard onMIDIMessage={AudioController.onMIDIMessage} />
      </div>
    </div>
  );
};

export default App;
