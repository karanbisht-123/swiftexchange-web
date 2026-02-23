import { useCallback, useMemo, useState } from 'react';
import { Info, X } from 'lucide-react';

import { useSubaccountStore } from '../../../store/subaccountStore';
import type { MarginMode } from '../../../types/trading.types';

interface MarginTypeSelectorProps {
  selected?: MarginMode;
  onChange?: (type: MarginMode) => void;
  isolatedEquity?: number;
  leverage: number;
  maxLeverage: number;
  onLeverageChange: (value: number) => void;
  marketTicker?: string;
}

export type { MarginMode };

export const MarginTypeSelector: React.FC<MarginTypeSelectorProps> = ({
  selected,
  onChange,
  leverage,
  maxLeverage,
  onLeverageChange,
  marketTicker,
}) => {
  const storeMarginMode = useSubaccountStore(state => state.selectedMarginMode);
  const setStoreMarginMode = useSubaccountStore(state => state.setMarginMode);
  const [showLeverageModal, setShowLeverageModal] = useState(false);
  const [tempLeverage, setTempLeverage] = useState(leverage);

  const marginMode = selected ?? storeMarginMode;

  const handleChange = useCallback(
    (mode: MarginMode) => {
      if (onChange) {
        onChange(mode);
      } else {
        setStoreMarginMode(mode);
      }
    },
    [onChange, setStoreMarginMode]
  );

  const handleOpenModal = useCallback(() => {
    setTempLeverage(leverage);
    setShowLeverageModal(true);
  }, [leverage]);

  const handleSaveLeverage = useCallback(() => {
    const finalVal = Math.min(Math.max(Math.round(tempLeverage * 10) / 10, 1), maxLeverage);
    onLeverageChange(finalVal);
    setShowLeverageModal(false);
  }, [tempLeverage, maxLeverage, onLeverageChange]);

  const ticks = useMemo(() => Array.from({ length: 45 }), []);
  const modalPercentage = ((Math.min(Math.max(tempLeverage, 1), maxLeverage) - 1) / (maxLeverage - 1)) * 100;

  return (
    <>
      <div className="flex items-center justify-between px-4 mt-2 mb-1">
        <div className="relative flex items-center">
          <div className="group absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center z-10 w-4 h-4 justify-center rounded-full bg-[#12131a] border border-gray-700/50 shadow-sm cursor-help hover:border-indigo-500/50 transition-colors">
            <Info size={10} className="text-gray-400 group-hover:text-indigo-400" />
            <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 w-[280px] sm:w-[300px] p-3 bg-[#1a1b2e] border border-gray-700 rounded-lg shadow-xl z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none transform origin-bottom">
              <div className="space-y-2.5 text-[10px] leading-relaxed text-gray-300 text-left">
                <div>
                  <strong className="text-white block mb-0.5">Cross Margin</strong>
                  <span className="opacity-80">All assets in your main account are shared to back all open positions.</span>
                </div>

                <div className="w-full h-px bg-gray-700/50" />

                <div>
                  <strong className="text-white block mb-0.5">Isolated Margin</strong>
                  <span className="opacity-80">Margin is assigned to a specific position.</span>
                </div>

                <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded text-indigo-300">
                  <strong className="block mb-0.5 text-indigo-400">Auto-Transfer</strong>
                  When placing an isolated trade, we automatically transfer equity to the subaccount.
                </div>
              </div>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1a1b2e] border-b border-r border-gray-700 transform rotate-45" />
            </div>
          </div>

          <div className="flex items-center">
            <button
              onClick={() => handleChange('CROSS')}
              className={`px-3 py-1.5 text-xs font-semibold transition-all rounded-l-md border ${marginMode === 'CROSS'
                ? 'bg-gray-700/60 text-white border-gray-600 relative z-0'
                : 'bg-transparent text-gray-500 border-gray-700 hover:text-gray-400 relative z-0'
                }`}
            >
              Cross
            </button>
            <button
              onClick={() => handleChange('ISOLATED')}
              className={`px-3 py-1.5 text-xs font-semibold transition-all rounded-r-md border border-l-0 ${marginMode === 'ISOLATED'
                ? 'bg-gray-700/60 text-white border-gray-600 relative z-0'
                : 'bg-transparent text-gray-500 border-gray-700 hover:text-gray-400 relative z-0'
                }`}
            >
              Isolated
            </button>
          </div>
        </div>

        <button
          onClick={handleOpenModal}
          className="px-3 py-1.5 text-xs font-bold text-white bg-gray-700/60 border border-gray-600 rounded-md hover:bg-gray-600/60 transition-all flex items-center gap-1"
        >
          {Math.round(leverage)}×
        </button>
      </div>

      {showLeverageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1b2e] border border-gray-700 rounded-2xl w-[360px] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50">
              <h3 className="text-sm font-bold text-white">Set Market Leverage</h3>
              <button
                onClick={() => setShowLeverageModal(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700/50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-700/50 flex items-center justify-center overflow-hidden">
                  <span className="text-[10px] font-bold text-gray-300">
                    {marketTicker?.split('-')[0]?.substring(0, 3) || '—'}
                  </span>
                </div>
                <span className="text-sm font-semibold text-white">{marketTicker || '—'}</span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                  Max {maxLeverage}×
                </span>
              </div>

              <div className="relative flex items-center h-10">
                <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none">
                  {ticks.map((_, i) => {
                    const tickPos = (i / (ticks.length - 1)) * 100;
                    const isActive = tickPos <= modalPercentage;
                    return (
                      <div
                        key={i}
                        className={`w-[2px] transition-all duration-300 ease-out ${isActive ? 'h-4 bg-green-800' : 'h-3 bg-gray-700'
                          }`}
                      />
                    );
                  })}
                </div>
                <div
                  className="absolute z-10 w-9 h-9 bg-[#1a1b2e] border border-green-400 rounded-full blur-[1px] flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out"
                  style={{ left: `${modalPercentage}%`, transform: 'translateX(-50%)', willChange: 'transform' }}
                >
                  <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_12px_#fff]" />
                </div>
                <input
                  type="range"
                  min="1"
                  max={maxLeverage}
                  step="0.1"
                  value={tempLeverage}
                  onChange={e => setTempLeverage(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                />
              </div>

              <div className="flex items-center justify-center">
                <div className="relative rounded-lg flex items-center bg-gray-800 border border-gray-600 focus-within:border-indigo-500 transition-colors">
                  <input
                    type="number"
                    value={Math.round(tempLeverage * 10) / 10}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 0) {
                        setTempLeverage(Math.min(val, maxLeverage));
                      }
                    }}
                    onBlur={() => {
                      if (tempLeverage < 1) setTempLeverage(1);
                      if (tempLeverage > maxLeverage) setTempLeverage(maxLeverage);
                    }}
                    className="w-16 h-10 bg-transparent text-center text-white font-mono text-lg font-bold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-gray-400 pr-3 text-sm font-bold">×</span>
                </div>
              </div>

              <button
                onClick={handleSaveLeverage}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
