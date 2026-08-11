import Editor from "@monaco-editor/react";
import ps88_d_ts from "../../lib/ps88.d.ts?raw";

type CodeEditorArgs = {
  code: string;
  visible: boolean;
  onChange: (code?: string) => void;
};

export const CodeEditor = ({ code, visible, onChange }: CodeEditorArgs) => {
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
        onChange={onChange}
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
