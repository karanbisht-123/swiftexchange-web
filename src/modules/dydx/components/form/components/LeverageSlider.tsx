interface LeverageSliderProps {
  leverage: number;
  maxLeverage: number;
  onChange: (value: number) => void;
}

export const LeverageSlider: React.FC<LeverageSliderProps> = ({
  leverage,
  maxLeverage,
  onChange,
}) => {
  const percentage = maxLeverage > 1 ? ((leverage - 1) / (maxLeverage - 1)) * 100 : 0;

  return (
    <div className="px-5 py-4 bg-gray-900/40 border-y border-gray-800/50">
      <div className="flex items-center justify-between mb-3">
        <label className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">
          Leverage
        </label>
        <span className="text-[10px] text-gray-600 font-medium">Max {maxLeverage}x</span>
      </div>

      <div className="flex items-center gap-4">
        {/* Slider Container */}
        <div className="relative h-5 flex-1 group cursor-pointer">
          {/* Track Background */}
          <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            {/* Progress Fill */}
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-75 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Native Range Input (Hidden but Functional) */}
          <input
            type="range"
            min="1"
            max={maxLeverage}
            step="0.1"
            value={leverage}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="absolute top-1/2 -translate-y-1/2 w-full h-full opacity-0 cursor-pointer z-10"
          />

          {/* Custom Thumb Visual (Positioned absolutely) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow-lg pointer-events-none transition-all duration-75 group-hover:scale-110 ease-out"
            style={{ left: `calc(${percentage}% - 8px)` }}
          />
        </div>

        {/* Value Input */}
        <div className="relative group">
          <div className="flex items-center bg-gray-900 border border-gray-700 rounded-md overflow-hidden transition-colors focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20">
            <input
              type="number"
              value={leverage}
              onChange={e => onChange(parseFloat(e.target.value))}
              onBlur={e => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 1) val = 1;
                if (val > maxLeverage) val = maxLeverage;
                onChange(val);
              }}
              className="w-12 bg-transparent py-1.5 pl-2 pr-1 text-right text-xs font-mono text-white focus:outline-none no-spinner"
              step="0.1"
              min="1"
              max={maxLeverage}
            />
            <div className="bg-gray-800 border-l border-gray-700 px-1.5 py-1.5">
              <span className="text-xs font-bold text-gray-500">x</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
         .no-spinner::-webkit-outer-spin-button,
         .no-spinner::-webkit-inner-spin-button {
           -webkit-appearance: none;
           margin: 0;
         }
         .no-spinner {
           -moz-appearance: textfield;
         }
       `}</style>
    </div>
  );
};
