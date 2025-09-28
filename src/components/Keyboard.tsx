import { useState } from "react";

type KeyboardArgs = {
  onMIDIMessage?: (data: Uint8Array) => void;
};

export const Keyboard = (args: KeyboardArgs) => {
  const [octave, setOctave] = useState(3);
  const [pressed, setPressed] = useState(false);
  const keyDown = (note: number) => {
    args.onMIDIMessage?.(new Uint8Array([0x90, note, 127]));
    setPressed(true);
  };
  const keyUp = (note: number) => {
    args.onMIDIMessage?.(new Uint8Array([0x80, note, 127]));
    setPressed(false);
  };
  return (
    <div className="w-full h-full flex flex-row items-end justify-center">
      {/* オクターブを下げるボタン */}
      {octave > -1 ? (
        <button
          onClick={() => {
            setOctave(Math.max(octave - 1, -1));
          }}
          className="group relative flex-1 h-4/5 cursor-pointer"
        >
          <span
            className="
              text-zinc-100 material-icons absolute top-1/2 left-1/2 group-hover:left-2/5 -translate-1/2
              transition-all duration-100 ease-in-out
            "
          >
            keyboard_arrow_left
          </span>
        </button>
      ) : (
        <div className="flex-1"></div>
      )}

      {/* 鍵盤 25 個 */}
      {[...Array(25)].map((_, i) => {
        const note = (octave + 1) * 12 + i;
        const isWhiteKey = ![1, 3, 6, 8, 10].includes(note % 12);
        return 0 <= note && note <= 127 ? (
          <button
            key={note}
            onPointerDown={() => {
              keyDown(note);
            }}
            onPointerUp={() => {
              keyUp(note);
            }}
            onPointerEnter={(e) => {
              if (e.buttons === 1) keyDown(note);
            }}
            onPointerLeave={(e) => {
              if (e.buttons === 1) keyUp(note);
            }}
            className={`
              flex-1 h-4/5 ${pressed ? "hover:h-9/10" : "hover:h-full"} rounded-t-md cursor-pointer
              ${isWhiteKey ? "bg-zinc-300 hover:bg-zinc-100" : "bg-zinc-800 hover:bg-zinc-500"}
              transition-all duration-100 ease-in-out
            `}
          >
            {note % 12 == 0 ? (
              <span className="text-zinc-500">{`C${(note - 12) / 12}`}</span>
            ) : null}
          </button>
        ) : (
          <div key={note} className="flex-1"></div>
        );
      })}

      {/* オクターブを上げるボタン */}
      {octave < 8 ? (
        <button
          onClick={() => {
            setOctave(Math.min(octave + 1, 8));
          }}
          className="group relative flex-1 h-4/5 cursor-pointer"
        >
          <span
            className="
              text-zinc-100 material-icons absolute top-1/2 left-1/2 group-hover:left-3/5 -translate-1/2
              transition-all duration-100 ease-in-out
            "
          >
            keyboard_arrow_right
          </span>
        </button>
      ) : (
        <div className="flex-1"></div>
      )}
    </div>
  );
};
