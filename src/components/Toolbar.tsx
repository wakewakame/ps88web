import { ButtonSelector } from "./ButtonSelector";
import type { AudioDeviceControls } from "../hooks/useAudioDevices";

const LINKS = [
  { name: "Docs", href: "./docs/index.html" },
  { name: "Examples", href: "./examples/index.html" },
  { name: "License", href: "./license.md" },
  { name: "GitHub", href: "https://github.com/wakewakame/ps88web" },
];

type ToolbarArgs = {
  devices: AudioDeviceControls;
  editorVisible: boolean;
  onEditorVisibleChange: (visible: boolean) => void;
};

export const Toolbar = ({
  devices,
  editorVisible,
  onEditorVisibleChange,
}: ToolbarArgs) => {
  return (
    <div className="w-full h-16 py-2 box-border flex-none flex flex-row gap-4 items-center justify-center relative">
      <nav className="absolute right-4">
        {LINKS.map(({ name, href }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 mx-1"
          >
            {name}
          </a>
        ))}
      </nav>
      <ButtonSelector icon="monitor" {...devices.display} />
      <ButtonSelector icon="mic" {...devices.input} />
      <ButtonSelector icon="volume_up" {...devices.output} />
      <ButtonSelector icon="piano" {...devices.midi} />
      <ButtonSelector
        icon="code"
        enable={editorVisible}
        onChange={onEditorVisibleChange}
      />
    </div>
  );
};
