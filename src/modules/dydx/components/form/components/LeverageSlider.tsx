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
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-2">Leverage: {leverage.toFixed(1)}x</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min="1"
          max={maxLeverage}
          step="0.1"
          value={leverage}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <span className="text-xs text-gray-500 w-12 text-right">{maxLeverage}x</span>
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>1x</span>
        <span>{(maxLeverage / 2).toFixed(0)}x</span>
        <span>{maxLeverage}x</span>
      </div>
    </div>
  );
};
