import Editor from "@monaco-editor/react";
import { useProcessorCode } from "../hooks/useProcessorCode";
import ps88_d_ts from "../../lib/ps88.d.ts?raw";

type CodeEditorArgs = {
  visible: boolean;
};

export const CodeEditor = ({ visible }: CodeEditorArgs) => {
  // コードの state をここに閉じ込めることで、1文字入力するたびに
  // App (と Toolbar / Canvas / Keyboard) が再 render されるのを防ぐ
  const { code, onCodeChange } = useProcessorCode();

  return (
    // 非表示のときもアンマウントせず、透明度だけを変えて編集状態を保つ
    <div
      className={`size-full ${visible ? "" : "opacity-0 invisible"} transition-all duration-100 ease-in-out`}
    >
      <Editor
        className="size-full absolute opacity-70"
        defaultLanguage="javascript"
        theme="vs-dark"
        value={code}
        onChange={onCodeChange}
        onMount={(_, monaco) => {
          // 補完用の型定義を追加
          monaco.languages.typescript.javascriptDefaults.addExtraLib(
            ps88_d_ts,
            "ps88.d.ts",
          );
        }}
      />
    </div>
  );
};
