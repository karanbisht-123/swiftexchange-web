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
  const presets = [1, 2, 3, 5, 10];
  const displayPresets = presets.filter(p => p <= maxLeverage);
  if (maxLeverage > 10 && !displayPresets.includes(maxLeverage)) {
    displayPresets.push(maxLeverage);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-gray-400">Leverage</label>
        <span className="text-sm font-semibold text-white">{leverage.toFixed(1)}x</span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <input
          type="range"
          min="1"
          max={maxLeverage}
          step="0.1"
          value={leverage}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      <div className="flex gap-1 flex-wrap">
        {displayPresets.map(preset => (
          <button
            key={preset}
            onClick={() => onChange(preset)}
            className={`px-2.5 py-1 text-xs rounded transition ${
              Math.abs(leverage - preset) < 0.1
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {preset}x
          </button>
        ))}
      </div>
    </div>
  );
};
