import { AlertTriangle, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

export interface PriceTriggersProps {
  isOpen: boolean;
  onClose: () => void;
  position: {
    market: string;
    side: 'LONG' | 'SHORT';
    size: string;
    entryPrice: string;
  };
  oraclePrice: number;
  onSave: (triggers: TriggerConfig) => Promise<void>;
}

export interface TriggerConfig {
  takeProfit?: {
    enabled: boolean;
    price: number;
    percentage: number;
    type: 'MARKET' | 'LIMIT';
  };
  stopLoss?: {
    enabled: boolean;
    price: number;
    percentage: number;
    type: 'MARKET' | 'LIMIT';
  };
  customAmount?: boolean;
}

const PriceTriggers: React.FC<PriceTriggersProps> = ({
  isOpen,
  onClose,
  position,
  oraclePrice,
  onSave,
}) => {
  const [saving, setSaving] = useState(false);

  // Track which input is driving the calculation to prevent circular dependency loops
  const [tpInputMode, setTpInputMode] = useState<'percentage' | 'price' | null>(null);
  const [slInputMode, setSlInputMode] = useState<'percentage' | 'price' | null>(null);

  const [tpPrice, setTpPrice] = useState('');
  const [tpPercentage, setTpPercentage] = useState('');

  const [slPrice, setSlPrice] = useState('');
  const [slPercentage, setSlPercentage] = useState('');

  // Advanced
  const [customAmount, setCustomAmount] = useState(false);

  const entryPrice = parseFloat(position.entryPrice);
  const isLong = position.side === 'LONG';

  // --- MATH HELPERS ---

  /**
   * Calculates the ROI percentage based on Entry Price and Target Price.
   * Returns a positive number for the UI (absolute gain/loss).
   */
  const calculatePercentageFromPrice = (targetPrice: number, _: any): number => {
    if (!targetPrice || !entryPrice) return 0;

    // PnL Formula: (Exit - Entry) if Long, (Entry - Exit) if Short
    // ROI = PnL / Entry
    let rawPercentage = 0;

    if (isLong) {
      rawPercentage = ((targetPrice - entryPrice) / entryPrice) * 100;
    } else {
      rawPercentage = ((entryPrice - targetPrice) / entryPrice) * 100;
    }

    // For SL, the math returns a negative %, but UI usually shows "5% Loss"
    // For TP, the math returns a positive %.
    return Math.abs(rawPercentage);
  };

  /**
   * Calculates the Target Price based on a desired ROI percentage.
   */
  const calculatePriceFromPercentage = (percentage: number, isTP: boolean): number => {
    if (!percentage || !entryPrice) return 0;

    const decimal = percentage / 100;

    if (isLong) {
      // Long TP: Entry * (1 + %)
      // Long SL: Entry * (1 - %)
      return isTP ? entryPrice * (1 + decimal) : entryPrice * (1 - decimal);
    } else {
      // Short TP: Entry * (1 - %) (Price goes down)
      // Short SL: Entry * (1 + %) (Price goes up)
      return isTP ? entryPrice * (1 - decimal) : entryPrice * (1 + decimal);
    }
  };

  // --- EFFECTS ---

  // Handle TP Changes
  useEffect(() => {
    if (tpInputMode === 'price' && tpPrice) {
      const val = parseFloat(tpPrice);
      if (!isNaN(val)) {
        const pct = calculatePercentageFromPrice(val, true);
        setTpPercentage(pct.toFixed(2));
      }
    }
  }, [tpPrice, tpInputMode, entryPrice, isLong]);

  useEffect(() => {
    if (tpInputMode === 'percentage' && tpPercentage) {
      const val = parseFloat(tpPercentage);
      if (!isNaN(val)) {
        const prc = calculatePriceFromPercentage(val, true);
        // Determine precision based on price magnitude, roughly
        const precision = prc < 1 ? 4 : prc < 10 ? 3 : 1;
        setTpPrice(prc.toFixed(precision));
      }
    }
  }, [tpPercentage, tpInputMode, entryPrice, isLong]);

  // Handle SL Changes
  useEffect(() => {
    if (slInputMode === 'price' && slPrice) {
      const val = parseFloat(slPrice);
      if (!isNaN(val)) {
        const pct = calculatePercentageFromPrice(val, false);
        setSlPercentage(pct.toFixed(2));
      }
    }
  }, [slPrice, slInputMode, entryPrice, isLong]);

  useEffect(() => {
    if (slInputMode === 'percentage' && slPercentage) {
      const val = parseFloat(slPercentage);
      if (!isNaN(val)) {
        const prc = calculatePriceFromPercentage(val, false);
        const precision = prc < 1 ? 4 : prc < 10 ? 3 : 1;
        setSlPrice(prc.toFixed(precision));
      }
    }
  }, [slPercentage, slInputMode, entryPrice, isLong]);

  // --- HANDLERS ---

  const handleSave = async () => {
    if (!tpPrice && !slPrice) {
      // You might want a toast here instead of alert in production
      return;
    }

    setSaving(true);
    try {
      const config: TriggerConfig = {
        customAmount,
        takeProfit:
          tpPrice && !isNaN(parseFloat(tpPrice))
            ? {
                enabled: true,
                price: parseFloat(tpPrice),
                percentage: parseFloat(tpPercentage || '0'),
                type: 'MARKET', // Defaulting to Market triggers for UX simplicity
              }
            : undefined,
        stopLoss:
          slPrice && !isNaN(parseFloat(slPrice))
            ? {
                enabled: true,
                price: parseFloat(slPrice),
                percentage: parseFloat(slPercentage || '0'),
                type: 'MARKET',
              }
            : undefined,
      };

      await onSave(config);
      onClose();
    } catch (error) {
      console.error('Failed to save triggers:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = (isTakeProfit: boolean) => {
    if (isTakeProfit) {
      setTpPrice('');
      setTpPercentage('');
      setTpInputMode(null);
    } else {
      setSlPrice('');
      setSlPercentage('');
      setSlInputMode(null);
    }
  };

  if (!isOpen) return null;

  // Validation visual helper
  const isTpInvalid = isLong
    ? parseFloat(tpPrice) <= entryPrice
    : parseFloat(tpPrice) >= entryPrice;

  const isSlInvalid = isLong
    ? parseFloat(slPrice) >= entryPrice
    : parseFloat(slPrice) <= entryPrice;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-[#1c1c1c] rounded-xl max-w-md w-full border border-gray-700 shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              {/* Icon placeholder */}
              <div className="w-4 h-4 rounded-sm bg-gradient-to-tr from-purple-500 to-blue-500" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Price triggers</h2>
              <p className="text-xs text-gray-400">
                {position.market} • {position.side}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-6 space-y-6">
          {/* Position Info */}
          <div className="grid grid-cols-2 gap-4 bg-[#141414] p-3 rounded-lg border border-gray-800">
            <div>
              <span className="text-xs text-gray-500 block mb-1">Avg. Entry Price</span>
              <span className="text-sm text-white font-mono font-medium">
                $
                {entryPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-500 block mb-1">Oracle Price</span>
              <span
                className={`text-sm font-mono font-medium ${isLong ? (oraclePrice > entryPrice ? 'text-green-400' : 'text-red-400') : oraclePrice < entryPrice ? 'text-green-400' : 'text-red-400'}`}
              >
                $
                {oraclePrice.toLocaleString(undefined, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          {/* Take Profit Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-green-400 font-medium flex items-center gap-2">
                Take Profit
                {tpPrice && isTpInvalid && (
                  <span className="text-[10px] text-red-500 bg-red-500/10 px-1 rounded">
                    Invalid Price
                  </span>
                )}
              </label>
              {(tpPrice || tpPercentage) && (
                <button
                  onClick={() => handleClear(true)}
                  className="text-xs text-gray-500 hover:text-white transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex gap-3">
              {/* TP Price Input */}
              <div className="flex-1 space-y-1">
                <div className="relative group">
                  <input
                    type="number"
                    value={tpPrice}
                    onFocus={() => setTpInputMode('price')}
                    onChange={e => setTpPrice(e.target.value)}
                    placeholder="0.0"
                    step="0.1"
                    className="w-full bg-[#0f0f0f] border border-gray-700 rounded-lg pl-3 pr-12 py-2.5 text-white text-sm focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-all placeholder-gray-600 font-mono"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                    USD
                  </div>
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">
                    Target Price
                  </span>
                </div>
              </div>

              {/* Gain Percentage */}
              <div className="flex-1 space-y-1">
                <div className="relative group">
                  <input
                    type="number"
                    value={tpPercentage}
                    onFocus={() => setTpInputMode('percentage')}
                    onChange={e => setTpPercentage(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#0f0f0f] border border-gray-700 rounded-lg pl-3 pr-10 py-2.5 text-white text-sm focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 transition-all placeholder-gray-600 font-mono"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                    %
                  </div>
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">
                    Est. Gain
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stop Loss Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-red-400 font-medium flex items-center gap-2">
                Stop Loss
                {slPrice && isSlInvalid && (
                  <span className="text-[10px] text-red-500 bg-red-500/10 px-1 rounded">
                    Invalid Price
                  </span>
                )}
              </label>
              {(slPrice || slPercentage) && (
                <button
                  onClick={() => handleClear(false)}
                  className="text-xs text-gray-500 hover:text-white transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex gap-3">
              {/* SL Price Input */}
              <div className="flex-1 space-y-1">
                <div className="relative group">
                  <input
                    type="number"
                    value={slPrice}
                    onFocus={() => setSlInputMode('price')}
                    onChange={e => setSlPrice(e.target.value)}
                    placeholder="0.0"
                    step="0.1"
                    className="w-full bg-[#0f0f0f] border border-gray-700 rounded-lg pl-3 pr-12 py-2.5 text-white text-sm focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all placeholder-gray-600 font-mono"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                    USD
                  </div>
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">
                    Trigger Price
                  </span>
                </div>
              </div>

              {/* Loss Percentage */}
              <div className="flex-1 space-y-1">
                <div className="relative group">
                  <input
                    type="number"
                    value={slPercentage}
                    onFocus={() => setSlInputMode('percentage')}
                    onChange={e => setSlPercentage(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#0f0f0f] border border-gray-700 rounded-lg pl-3 pr-10 py-2.5 text-white text-sm focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all placeholder-gray-600 font-mono"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                    %
                  </div>
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">
                    Est. Loss
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Section */}
          <div className="pt-2 border-t border-gray-800">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  checked={customAmount}
                  onChange={e => setCustomAmount(e.target.checked)}
                  className="peer h-4 w-4 appearance-none rounded border border-gray-600 bg-[#0f0f0f] checked:border-purple-500 checked:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                />
                <svg
                  className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
                Apply to partial position (Custom amount)
              </span>
            </label>
          </div>

          {/* Warning Message */}
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200/80 leading-relaxed">
              Trigger orders are separate from your position. They will reduce your position size
              when triggered. Ensure you have sufficient balance for fees.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-700 flex gap-3 bg-[#141414] rounded-b-xl">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (!tpPrice && !slPrice)}
            className="flex-1 py-2.5 rounded-lg bg-white text-black hover:bg-gray-200 text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Setting...
              </>
            ) : (
              'Confirm Triggers'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PriceTriggers;
