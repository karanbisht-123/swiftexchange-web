

import { Info, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Tooltip } from '../../../../../components/common/Tooltip';

import { useSubaccountStore } from '../../../store/subaccountStore';
import type { MarginMode } from '../../../types/trading.types';

interface MarginTypeSelectorProps {
  selected?: MarginMode;
  onChange?: (type: MarginMode) => void;
  isolatedEquity?: number
  leverage: number;
  maxLeverage: number;
  onLeverageChange: (value: number) => void;
  marketTicker?: string;
  MarketIcon?: string;
}

export type { MarginMode };

export const MarginTypeSelector: React.FC<MarginTypeSelectorProps> = ({
  selected,
  onChange,
  leverage,
  maxLeverage,
  onLeverageChange,
  marketTicker,
  MarketIcon,
}) => {
  const storeMarginMode = useSubaccountStore(state => state.selectedMarginMode);
  const setStoreMarginMode = useSubaccountStore(state => state.setMarginMode);
  const [showLeverageModal, setShowLeverageModal] = useState(false);
  const [tempLeverage, setTempLeverage] = useState(Math.round(leverage));
  const [inputValue, setInputValue] = useState(Math.round(leverage).toString());

  const marginMode = selected ?? storeMarginMode;

  const handleChange = useCallback(
    (mode: MarginMode) => {
      if (onChange) onChange(mode);
      else setStoreMarginMode(mode);
    },
    [onChange, setStoreMarginMode]
  );

  const handleOpenModal = useCallback(() => {
    const rounded = Math.round(leverage);
    setTempLeverage(rounded);
    setInputValue(rounded.toString());
    setShowLeverageModal(true);
  }, [leverage]);

  const handleSaveLeverage = useCallback(() => {
    const finalVal = Math.min(Math.max(Math.round(tempLeverage), 1), maxLeverage);
    onLeverageChange(finalVal);
    setShowLeverageModal(false);
  }, [tempLeverage, maxLeverage, onLeverageChange]);

  const ticks = useMemo(() => Array.from({ length: 45 }), []);
  const safeTempLeverage = Math.min(Math.max(Math.round(tempLeverage), 1), maxLeverage);
  const modalPercentage = ((safeTempLeverage - 1) / (maxLeverage - 1)) * 100;

  return (
    <>
      <div className="flex items-center justify-between px-2 py-2 border-b border-color md:px-4">
        <div className="relative flex items-center gap-1.5 md:gap-2">
          <Tooltip
            position="top"
            unstyled
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 w-4 h-4 justify-center"
            tooltipClassName="max-w-[240px] sm:max-w-[300px] p-2.5 md:p-3"
            content={
              <div className="space-y-2 text-[9px] md:text-[10px] leading-relaxed text-(--color-text-primary) text-left">
                <div>
                  <strong className="block mb-0.5">Cross Margin</strong>
                  <span className="text-(--color-text-secondary)">
                    All assets in your main account are shared to back all open positions.
                  </span>
                </div>
                <div className="w-full h-px bg-(--color-border)" />
                <div>
                  <strong className="block mb-0.5">Isolated Margin</strong>
                  <span className="text-(--color-text-secondary)">
                    Margin is assigned to a specific position.
                  </span>
                </div>
                <div className="p-1.5 md:p-2 bg-indigo-500/10 border border-indigo-500/20 rounded text-indigo-500">
                  <strong className="block mb-0.5">Auto-Transfer</strong>
                  When placing an isolated trade, we automatically transfer equity to the subaccount.
                </div>
              </div>
            }
          >
            <div className="flex items-center w-4 h-4 justify-center rounded-full bg-(--color-bg-secondary) border border-(--color-border) shadow-sm hover:border-indigo-500/50 transition-colors">
              <Info size={10} className="text-(--color-text-muted) hover:text-indigo-400 transition-colors" />
            </div>
          </Tooltip>

          <div className="flex items-center">
            <button
              onClick={() => handleChange('CROSS')}
              className={`px-2  py-1 md:py-1.5 text-[10px] md:text-xs font-semibold transition-all rounded-l-md border ${marginMode === 'CROSS'
                ? 'bg-(--color-brand-primary) text-(--color-text-inverse) border-transparent'
                : 'bg-transparent text-(--color-text-secondary) border-(--color-border) hover:text-(--color-text-primary) hover:bg-(--color-bg-hover)'
                }`}
            >
              Cross
            </button>
            <button
              onClick={() => handleChange('ISOLATED')}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-semibold transition-all rounded-r-md border border-l-0 ${marginMode === 'ISOLATED'
                ? 'bg-(--color-brand-primary) text-(--color-text-inverse) border-transparent'
                : 'bg-transparent text-(--color-text-secondary) border-(--color-border) hover:text-(--color-text-primary) hover:bg-(--color-bg-hover)'
                }`}
            >
              Isolated
            </button>
          </div>
        </div>

        <button
          onClick={handleOpenModal}
          className="px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-bold text-(--color-text-primary) bg-(--color-bg-tertiary) border border-(--color-border) rounded-md hover:bg-(--color-bg-hover) transition-all"
        >
          {Math.round(leverage)}×
        </button>
      </div>

      {showLeverageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-(--color-bg-secondary) border border-(--color-border) rounded-2xl w-[360px] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-(--color-border)">
              <h3 className="text-sm font-bold text-(--color-text-primary)">Set Market Leverage</h3>
              <button
                onClick={() => setShowLeverageModal(false)}
                className="p-1 text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors rounded-lg hover:bg-(--color-bg-hover)"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-(--color-bg-tertiary) border border-(--color-border) flex items-center justify-center overflow-hidden shrink-0">
                  {MarketIcon ? (
                    <img src={MarketIcon} alt={marketTicker} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-(--color-text-secondary)">
                      {marketTicker?.split('-')[0]?.substring(0, 3) || '—'}
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold text-(--color-text-primary)">
                  {marketTicker || '—'}
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 uppercase tracking-wider">
                  Max {maxLeverage}×
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="relative flex-1 h-10 flex items-center">
                  <div className="absolute inset-0 flex items-center justify-between px-1 pointer-events-none">
                    {ticks.map((_, i) => {
                      const tickPos = (i / (ticks.length - 1)) * 100;
                      const isActive = tickPos <= modalPercentage;
                      return (
                        <div
                          key={i}
                          className={`w-[2px] transition-all duration-300 ease-out ${isActive ? 'h-4 bg-green-500' : 'h-3 bg-(--color-border-dark)'
                            }`}
                        />
                      );
                    })}
                  </div>
                  <div
                    className="absolute z-10 w-9 h-9 bg-(--color-bg-secondary) border border-green-500 rounded-full blur-[1px] flex items-center justify-center pointer-events-none transition-transform duration-75 ease-out"
                    style={{ left: `${modalPercentage}%`, transform: 'translateX(-50%)', willChange: 'transform' }}
                  >
                    <div className="w-2 h-2 bg-(--color-brand-primary) rounded-full" />
                  </div>
                  <input
                    type="range"
                    min="1"
                    max={maxLeverage}
                    step="1"
                    value={safeTempLeverage}
                    onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      setTempLeverage(val);
                      setInputValue(val.toString());
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                </div>

                <div className="flex items-center bg-(--color-bg-primary) border border-(--color-border) rounded-lg focus-within:border-indigo-500 transition-colors">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={inputValue}
                    onKeyDown={e => {
                      if (['.', ',', '-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
                    }}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '');
                      setInputValue(raw);
                      const val = parseInt(raw, 10);
                      if (!isNaN(val) && val >= 1) setTempLeverage(Math.min(val, maxLeverage));
                    }}
                    onBlur={() => {
                      let finalVal = parseInt(inputValue, 10);
                      if (isNaN(finalVal) || finalVal < 1) finalVal = 1;
                      if (finalVal > maxLeverage) finalVal = maxLeverage;
                      setTempLeverage(finalVal);
                      setInputValue(finalVal.toString());
                    }}
                    className="w-12 h-9 bg-transparent text-right text-(--color-text-primary) font-mono text-sm font-bold focus:outline-none"
                  />
                  <span className="text-(--color-text-secondary) pr-2 pl-1 text-xs font-bold">×</span>
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