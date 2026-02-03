import { Info } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { useSubaccountStore } from '../../../store/subaccountStore';
import type { MarginMode } from '../../../types/trading.types';

interface MarginTypeSelectorProps {
  selected?: MarginMode;
  onChange?: (type: MarginMode) => void;
  isolatedEquity?: number;
  showEquityWarning?: boolean;
}

export type { MarginMode };

export const MarginTypeSelector: React.FC<MarginTypeSelectorProps> = ({
  selected,
  onChange,
  isolatedEquity,
  showEquityWarning = true,
}) => {
  const storeMarginMode = useSubaccountStore(state => state.selectedMarginMode);
  const setStoreMarginMode = useSubaccountStore(state => state.setMarginMode);

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

  const hasInsufficientIsolatedEquity = useMemo(() => {
    if (isolatedEquity === undefined) return false;
    return isolatedEquity < 20;
  }, [isolatedEquity]);

  return (
    <div className="flex flex-col px-4 gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
            Margin Mode
          </label>
          <div className="relative group">
            <Info className="w-3 h-3 text-gray-500 cursor-help" />
            <div className="absolute -left-12 bottom-full mb-2 hidden group-hover:block z-50 w-56">
              <div className="bg-gray-800 text-gray-200 text-xs rounded-lg p-3 shadow-xl border border-gray-700">
                <p className="font-semibold mb-1.5">Cross Margin</p>
                <p className="text-gray-400 mb-2">
                  Collateral shared across all positions. Higher capital efficiency.
                </p>
                <p className="font-semibold mb-1.5">Isolated Margin</p>
                <p className="text-gray-400">
                  Collateral locked per position. Limits risk to that position only.
                </p>
                {hasInsufficientIsolatedEquity && showEquityWarning && (
                  <p className="text-yellow-400 mt-2 pt-2 border-t border-gray-700">
                    ℹ️ Equity will be auto-deposited from Cross Margin.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => handleChange('CROSS')} className="relative group/cross">
            <span
              className={`text-sm font-medium transition-colors ${
                marginMode === 'CROSS' ? 'text-white' : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              Cross
            </span>
            <div
              className={`absolute -bottom-1 left-0 right-0 h-0.5 border-b-2 transition-all ${
                marginMode === 'CROSS' ? 'border border-color border-dotted' : 'border-transparent'
              }`}
            />
          </button>

          <div className="h-4 w-px bg-gray-700" />

          <button
            onClick={() => handleChange('ISOLATED')}
            className="relative group/isolated"
            title="Auto-deposit enables starting with $0"
          >
            <span
              className={`text-sm font-medium transition-colors ${
                marginMode === 'ISOLATED' ? 'text-white' : 'text-gray-500 hover:text-gray-400'
              }`}
            >
              Isolated
            </span>
            <div
              className={`absolute -bottom-1 left-0 right-0 h-0.5 border-b-2 transition-all ${
                marginMode === 'ISOLATED'
                  ? 'border border-color  border-dotted'
                  : 'border-transparent'
              }`}
            />
          </button>
        </div>
      </div>

      {/* {marginMode === 'ISOLATED' && isolatedEquity !== undefined && (
        <div
          className={`flex justify-between text-xs px-1 ${
            hasInsufficientIsolatedEquity ? 'text-yellow-400' : 'text-gray-500'
          }`}
        >
          <span>Isolated Equity:</span>
          <span className="font-medium">${isolatedEquity.toFixed(2)}</span>
        </div>
      )} */}
    </div>
  );
};
