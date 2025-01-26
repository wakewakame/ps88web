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
    <div className="flex flex-col"
      onMouseLeave={() => setOpen(false)}
    >
      { (options !== undefined && open) ? (
        <div className="relative h-0 z-1">
          <div className="absolute w-32 top-12 left-0">
            <Options options={options} selected={selected ?? -1} onSelected={onSelected} />
          </div>
        </div>
      ) : null }
      <div className="
        flex flex-row rounded-full bg-gray-300
        [&:has(>button:first-child:hover)]:bg-gray-200 transition-all duration-150 ease-in-out
      ">
        { (options !== undefined) ? (
          <button onClick={() => setOpen(!open)}
            className="
              w-8 h-12 rounded-l-full bg-gray-800/0
              text-gray-700 hover:text-gray-500 cursor-pointer transition-all duration-150 ease-in-out
            "
          >
            <span className="material-icons ml-2 my-3 text-6">arrow_drop_down</span>
          </button>
        ) : null }
        <button onClick={onClick}
          className={`
            w-12 h-12 rounded-full ${enable ? "bg-blue-500" : "bg-gray-100"} cursor-pointer
            hover:bg-sky-500 transition-all duration-150 ease-in-out
          `}
        >
          <span className={`
            material-icons m-3 text-6 ${enable ? "text-gray-100" : "text-gray-700"}
            transition-all duration-150 ease-in-out
          `}>{icon}</span>
        </button>
      </div>
    </div>
  );
};

type OptionsArgs = {
  options: { id: number, name: string }[];
  selected: number;
  onSelected: (i: number) => void;
};

const Options = ({ options, selected, onSelected }: OptionsArgs) => {
  return (
    <div className="flex flex-col">
      {options.map((option, i) => (
        <button key={option.id}
          onClick={() => onSelected(i)}
          className={`
            px-2 py-0 ${(i === selected) ? "bg-blue-500" : "bg-gray-200"} text-left truncate whitespace-nowrap cursor-pointer
            hover:bg-gray-400 transition-all duration-150 ease-in-out
          `}
        >
          <span className="text-1xl text-gray-800">{option.name}</span>
        </button>
      ))}
    </div>
  );
};

export default ButtonSelector;
