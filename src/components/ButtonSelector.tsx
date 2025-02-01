import { useState } from 'react';

type ButtonSelectorArgs = {
  icon: string;
  options?: { id: number, name: string }[];
  defaultSelected?: number;
  onChange?: (enable: boolean, selected: number) => void;
};

const ButtonSelector = ({ icon, options, defaultSelected, onChange }: ButtonSelectorArgs) => {
  const [enable, setEnable] = useState(false);
  const [selected, setSelected] = useState(defaultSelected);
  const [open, setOpen] = useState(false);

  const onClick = () => {
    setEnable(!enable);
    onChange?.(!enable, selected ?? -1);
  };

  const onSelected = (i: number) => {
    setSelected(i);
    onChange?.(enable, i);
  }

  return (
    <div onMouseLeave={() => setOpen(false)} className="flex flex-col h-full">
      <div className="
        flex flex-row h-full rounded-full bg-zinc-700/50
        [&:has(>button:first-child:hover)]:bg-zinc-700/80 transition-all duration-150 ease-in-out
      ">
        { (options !== undefined) ? (
          <button onClick={() => setOpen(!open)}
            className="
              relative aspect-2/3 h-full rounded-l-full bg-zinc-800/0
              text-zinc-300 cursor-pointer transition-all duration-150 ease-in-out
            "
          >
            <span className="material-icons absolute top-1/2 right-0 -translate-y-1/2">arrow_drop_down</span>
          </button>
        ) : null }
        <button onClick={onClick}
          className={`
            relative aspect-1/1 h-full rounded-full text-zinc-100 cursor-pointer
            ${enable ? "bg-blue-400 hover:bg-blue-300" : "bg-zinc-700 hover:bg-zinc-600"} transition-all duration-150 ease-in-out
          `}
        >
          <span className={`material-icons absolute top-1/2 left-1/2 -translate-1/2`}>
            {icon}
          </span>
        </button>
      </div>
      { (options !== undefined) ? (
        <div className="relative w-full h-0 z-1">
          <div className="absolute w-2/1 pt-1 top-0 left-1/2 -translate-x-1/2">
            <Options options={options} open={open} selected={selected ?? -1} onSelected={onSelected} />
          </div>
        </div>
      ) : null }
    </div>
  );
};

type OptionsArgs = {
  options: { id: number, name: string }[];
  open: boolean;
  selected: number;
  onSelected: (i: number) => void;
};

const Options = ({ options, open, selected, onSelected }: OptionsArgs) => {
  return (
    <div className={`${open ? "max-h-40" : "max-h-0 opacity-0 invisible"} rounded-md bg-zinc-700 shadow-xl overflow-scroll transition-all duration-150 ease-in-out`}>
      <div className="flex flex-col">
        {options.map((option, i) => (
          <button key={option.id} onClick={() => onSelected(i)}
            className={`
              px-2 rounded-md text-left break-words text-1xl text-zinc-100 cursor-pointer
              ${(i === selected) ? "bg-blue-400 hover:bg-blue-300" : "hover:bg-zinc-600"} transition-all duration-150 ease-in-out
            `}
          >
            <p>{option.name}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ButtonSelector;
