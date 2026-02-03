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

  const handleChange = useCallback((mode: MarginMode) => {
    if (onChange) {
      onChange(mode);
    } else {
      setStoreMarginMode(mode);
    }
  }, [onChange, setStoreMarginMode]);

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
                <p className="text-gray-400 mb-2">Collateral shared across all positions. Higher capital efficiency.</p>
                <p className="font-semibold mb-1.5">Isolated Margin</p>
                <p className="text-gray-400">Collateral locked per position. Limits risk to that position only.</p>
                {hasInsufficientIsolatedEquity && showEquityWarning && (
                  // <p className="text-yellow-400 mt-2 pt-2 border-t border-gray-700">
                  //   ℹ️ Equity will be auto-deposited from Cross Margin if needed (min $20 required).
                  // </p>
                  <p className="text-yellow-400 mt-2 pt-2 border-t border-gray-700">
                    ℹ️ Equity will be auto-deposited from Cross Margin.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          <button
            onClick={() => handleChange('CROSS')}
            className={`px-3 py-1 text-xs font-medium transition-all ${marginMode === 'CROSS'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
              }`}
          >
            Cross
          </button>
          <button
            onClick={() => handleChange('ISOLATED')}
            className={`px-3 py-1 text-xs font-medium transition-all ${marginMode === 'ISOLATED'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
              }`}
            title="Auto-deposit enables starting with $0"
          >
            Isolated
          </button>
        </div>
      </div>

      {marginMode === 'ISOLATED' && isolatedEquity !== undefined && (
        <div className={`flex justify-between text-xs px-1 ${hasInsufficientIsolatedEquity ? 'text-yellow-400' : 'text-gray-500'
          }`}>
          <span>Isolated Equity:</span>
          <span className="font-medium">${isolatedEquity.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
};
