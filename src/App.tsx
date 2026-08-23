import { useState } from "react";
import { Canvas } from "./components/Canvas";
import { ChatPanel } from "./components/ChatPanel";
import { CodeEditor } from "./components/CodeEditor";
import { Keyboard } from "./components/Keyboard";
import { Toolbar } from "./components/Toolbar";
import * as AudioController from "./controller/audio/AudioController";
import type * as Types from "./controller/audio/AudioControllerTypes";
import { useAudioDevices } from "./hooks/useAudioDevices";
import { usePreventTouchScroll } from "./hooks/usePreventTouchScroll";

// Canvas は onDraw の参照が変わると描画ループを作り直すため、
// コンポーネントの外に置いて参照を固定する
const onDraw = (w: number, h: number, mouse: Types.Mouse) => {
  AudioController.draw(w, h, mouse);
  return AudioController.getShapes();
};

const App = () => {
  const devices = useAudioDevices();
  const [editorVisible, setEditorVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const appRef = usePreventTouchScroll<HTMLDivElement>();

  return (
    <div ref={appRef} className="flex flex-col h-dvh select-none">
      <Toolbar
        devices={devices}
        editorVisible={editorVisible}
        onEditorVisibleChange={setEditorVisible}
        chatVisible={chatVisible}
        onChatVisibleChange={setChatVisible}
      />
      {/* min-h-0 が無いと、中身が縦に伸びたときに flex の子が縮まず、
          ページ全体が h-dvh を超えて伸びてしまう */}
      <div className="w-full flex-auto min-h-0 box-border relative flex flex-row">
        <div
          className="grow relative overflow-hidden"
          onPointerDown={devices.initOutput}
        >
          <Canvas width={640} height={480} onDraw={onDraw} />
          <CodeEditor visible={editorVisible} />
        </div>
        {/* 非表示のときもアンマウントせず、会話と入力中の文章を保つ */}
        <ChatPanel visible={chatVisible} />
      </div>
      <div
        className="w-full h-16 pt-1 box-border flex-none"
        onPointerDown={devices.initOutput}
      >
        <Keyboard onMIDIMessage={AudioController.sendMIDIMessage} />
      </div>
    </div>
  );
};

export default App;
