import React, { useState, useMemo, useEffect } from 'react';

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
  const [isDragging, setIsDragging] = useState(false);
  const [localValue, setLocalValue] = useState(leverage.toString());
  useEffect(() => {
    if (!isDragging) {
      setLocalValue(leverage.toString());
    }
  }, [leverage, isDragging]);
  const safeLeverage = Math.min(Math.max(leverage, 1), maxLeverage);
  const percentage = ((safeLeverage - 1) / (maxLeverage - 1)) * 100;

  const ticks = useMemo(() => Array.from({ length: 45 }), []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;

    // 1. Allow empty string so user can delete and type new numbers
    if (val === '') {
      setLocalValue('');
      return;
    }

    const numericVal = parseFloat(val);
    if (numericVal > maxLeverage) {
      setLocalValue(maxLeverage.toString());
      onChange(maxLeverage);
      return;
    }

    setLocalValue(val);
    if (!isNaN(numericVal) && numericVal >= 0) {
      onChange(Math.max(numericVal, 1));
    }
  };

  const handleBlur = () => {
    let numericVal = parseFloat(localValue);
    if (isNaN(numericVal) || numericVal < 1) numericVal = 1;
    if (numericVal > maxLeverage) numericVal = maxLeverage;
    const finalVal = Math.round(numericVal * 10) / 10;
    setLocalValue(finalVal.toString());
    onChange(finalVal);
  };

  return (
    <div className="w-full max-w-md p-4 bg-primary ">
      <div className="flex items-center gap-2 mb-4">
        <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded border border-indigo-500/20 uppercase tracking-tighter">
          Max {maxLeverage}x
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 h-10 flex items-center group">


          <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none">
            {ticks.map((_, i) => {
              const tickPos = (i / (ticks.length - 1)) * 100;
              const isActive = tickPos <= percentage;
              return (
                <div
                  key={i}
                  className={`w-[2px] transition-all duration-300 ease-out ${isActive
                    ? 'h-4 bg-green-800'
                    : 'h-3 bg-secondary'
                    }`}
                />
              );
            })}
          </div>

          <div
            className="absolute z-10 w-9 h-9 bg-secondary border border-green-400 rounded-full blur-[1px] flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out"
            style={{
              left: `${percentage}%`,
              transform: `translateX(-50%)`,
              willChange: 'transform'
            }}
          >
            <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_12px_#fff]" />
          </div>

          <input
            type="range"
            min="1"
            max={maxLeverage}
            step="0.1"
            value={safeLeverage}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="absolute  inset-0 w-full h-full opacity-0 cursor-pointer z-20"
          />
        </div>

        {/* Input Box */}
        <div className="relative rounded-lg flex items-center bg-secondary rounded border border-gray-700 focus-within:border-indigo-500 transition-colors">
          <input
            type="number"
            value={localValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            className="w-12 h-9 rounded-lg bg-transparent text-right text-primary font-mono text-sm font-bold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-secondary  pr-2 pl-1 text-xs font-bold">x</span>
        </div>
      </div>
    </div>
  );
};