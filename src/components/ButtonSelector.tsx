import { useState, useRef, useEffect } from "react";

export type Option = {
  /** 選択肢を区別するID (デバイスの場合は deviceId) */
  id: string;
  /** 一覧に表示する名前 */
  name: string;
};

export type ButtonSelectorArgs = {
  /** Material Icons のアイコン名 */
  icon: string;
  /**
   * オンになっているか
   *
   * 押している間ではなく、押した結果として続いている状態を表す
   * (aria-pressed と同じ意味で、そのまま属性としても出す)
   */
  pressed: boolean;
  /**
   * 操作を受け付けないか
   *
   * 権限が拒否されているなど、押しても目的を果たせないことが分かっている場合に
   * 立てる。一覧を取得できないだけの場合はここに含めない。押して試せる方が
   * 回復の余地があるため
   */
  disabled?: boolean;
  /**
   * 選択肢の一覧
   *
   * undefined を渡すとドロップダウン自体を表示しない。オン・オフだけを持つ
   * ボタン (エディタの表示切り替えなど) で使う。空配列の場合はドロップダウンを
   * 表示したうえで中身を空にする
   */
  options?: Option[];
  /** 選択中のアイテムのID (null=未選択)。選択状態は呼び出し側が保持する */
  selected?: string | null;
  /** ドロップダウンを開いたときに呼ばれる。一覧の取得はここで行う */
  onOpen?: () => void;
  /**
   * ボタンを押したときと、一覧から選んだときに呼ばれる
   *
   * @param pressed - 呼び出し後にあるべきオン・オフの状態
   * @param id - 選択中のアイテムのID (null=未選択)
   */
  onChange?: (pressed: boolean, id: string | null) => void;
};

export const ButtonSelector = (args: ButtonSelectorArgs) => {
  const [open, setOpen] = useState(false);

  const onToggleClick = () => {
    args.onChange?.(!args.pressed, args.selected ?? null);
  };

  const onSelectorClick = () => {
    setOpen(!open);
    if (!open) {
      args.onOpen?.();
    }
  };

  const onSelected = (id: string) => {
    args.onChange?.(args.pressed, id);
  };

  // タッチデバイスでは mouseleave が発火しないため、外側のタップでも閉じる
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node)) {
        return;
      }
      if (rootRef.current != null && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={rootRef}
      onMouseLeave={() => setOpen(false)}
      className="flex flex-col h-full"
    >
      <div
        className="
          flex flex-row h-full rounded-full bg-zinc-700/50
          [&:has(>button:first-child:hover:not(:disabled))]:bg-zinc-700/80
          transition-all duration-150 ease-in-out
        "
      >
        {args.options !== undefined ? (
          <button
            onClick={onSelectorClick}
            disabled={args.disabled}
            aria-expanded={open}
            className="
              relative aspect-2/3 h-full rounded-l-full bg-zinc-800/0
              text-zinc-300 cursor-pointer
              disabled:text-zinc-500 disabled:cursor-not-allowed
              transition-all duration-150 ease-in-out
            "
          >
            <span className="material-icons absolute top-1/2 right-0 -translate-y-1/2">
              arrow_drop_down
            </span>
          </button>
        ) : null}
        <button
          onClick={onToggleClick}
          disabled={args.disabled}
          aria-pressed={args.pressed}
          className={`
            relative aspect-1/1 h-full rounded-full text-zinc-100 cursor-pointer
            disabled:text-zinc-500 disabled:cursor-not-allowed
            ${args.pressed ? "bg-blue-400 enabled:hover:bg-blue-300" : "bg-zinc-700 enabled:hover:bg-zinc-600"}
            transition-all duration-150 ease-in-out
          `}
        >
          <span
            className={`material-icons absolute top-1/2 left-1/2 -translate-1/2`}
          >
            {args.icon}
          </span>
        </button>
      </div>
      {args.options !== undefined ? (
        <div className="relative w-full h-0 z-1">
          <div className="absolute w-4/1 top-0 left-1/2 -translate-x-1/2">
            <Options
              options={args.options}
              open={open}
              selected={args.selected ?? null}
              onSelected={onSelected}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

type OptionsArgs = {
  options: { id: string; name: string }[];
  open: boolean;
  selected: string | null;
  onSelected: (id: string) => void;
};

const Options = ({ options, open, selected, onSelected }: OptionsArgs) => {
  return (
    <div
      className={`
        ${open ? "max-h-40 mt-1" : "max-h-0 opacity-0 invisible"} rounded-md bg-zinc-700 shadow-xl overflow-auto
        transition-all duration-150 ease-in-out
      `}
    >
      <div className="flex flex-col">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelected(option.id)}
            className={`
              px-2 rounded-md text-left break-words text-xl text-zinc-100 cursor-pointer
              ${option.id === selected ? "bg-blue-400 hover:bg-blue-300" : "hover:bg-zinc-600"}
              transition-all duration-150 ease-in-out
            `}
          >
            <p>{option.name}</p>
          </button>
        ))}
      </div>
    </div>
  );
};
