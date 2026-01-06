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
  isLoading?: boolean;
  error?: string | null;
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
  isLoading,
  error,
}) => {
  const [tpInputMode, setTpInputMode] = useState<'percentage' | 'price' | null>(null);
  const [slInputMode, setSlInputMode] = useState<'percentage' | 'price' | null>(null);
  const [tpPrice, setTpPrice] = useState('');
  const [tpPercentage, setTpPercentage] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [slPercentage, setSlPercentage] = useState('');
  const [customAmount, setCustomAmount] = useState(false);

  const entryPrice = parseFloat(position.entryPrice);
  const isLong = position.side === 'LONG';

  const calculatePercentageFromPrice = (targetPrice: number): number => {
    if (!targetPrice || !entryPrice) return 0;
    let rawPercentage = isLong
      ? ((targetPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - targetPrice) / entryPrice) * 100;
    return Math.abs(rawPercentage);
  };

  const calculatePriceFromPercentage = (percentage: number, isTP: boolean): number => {
    if (!percentage || !entryPrice) return 0;
    const decimal = percentage / 100;
    if (isLong) {
      return isTP ? entryPrice * (1 + decimal) : entryPrice * (1 - decimal);
    } else {
      return isTP ? entryPrice * (1 - decimal) : entryPrice * (1 + decimal);
    }
  };

  useEffect(() => {
    if (tpInputMode === 'price' && tpPrice) {
      const val = parseFloat(tpPrice);
      if (!isNaN(val)) {
        const pct = calculatePercentageFromPrice(val);
        setTpPercentage(pct.toFixed(2));
      }
    }
  }, [tpPrice, tpInputMode, entryPrice, isLong]);

  useEffect(() => {
    if (tpInputMode === 'percentage' && tpPercentage) {
      const val = parseFloat(tpPercentage);
      if (!isNaN(val)) {
        const prc = calculatePriceFromPercentage(val, true);
        const precision = prc < 1 ? 4 : prc < 10 ? 3 : 1;
        setTpPrice(prc.toFixed(precision));
      }
    }
  }, [tpPercentage, tpInputMode, entryPrice, isLong]);

  useEffect(() => {
    if (slInputMode === 'price' && slPrice) {
      const val = parseFloat(slPrice);
      if (!isNaN(val)) {
        const pct = calculatePercentageFromPrice(val);
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

  const handleSave = async () => {
    if (!tpPrice && !slPrice) return;
    const config: TriggerConfig = {
      customAmount,
      takeProfit:
        tpPrice && !isNaN(parseFloat(tpPrice))
          ? {
              enabled: true,
              price: parseFloat(tpPrice),
              percentage: parseFloat(tpPercentage || '0'),
              type: 'MARKET',
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

  const isTpInvalid = isLong
    ? parseFloat(tpPrice) <= entryPrice
    : parseFloat(tpPrice) >= entryPrice;
  const isSlInvalid = isLong
    ? parseFloat(slPrice) >= entryPrice
    : parseFloat(slPrice) <= entryPrice;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-[#1c1c1c] rounded-xl max-w-md w-full border border-gray-700 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <div className="w-4 h-4 rounded-sm bg-linear-to-tr from-purple-500 to-blue-500" />
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

        <div className="px-5 py-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 bg-[#141414] p-3 rounded-lg border border-gray-800">
            <div>
              <span className="text-xs text-gray-500 block mb-1">Avg. Entry Price</span>
              <span className="text-sm text-white font-mono font-medium">
                ${entryPrice.toLocaleString()}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-500 block mb-1">Oracle Price</span>
              <span className="text-sm text-white font-mono font-medium">
                ${oraclePrice.toLocaleString()}
              </span>
            </div>
          </div>

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
                  className="text-xs text-gray-500 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="number"
                  value={tpPrice}
                  onFocus={() => setTpInputMode('price')}
                  onChange={e => setTpPrice(e.target.value)}
                  placeholder="Price"
                  className="w-full bg-[#0f0f0f] border border-gray-700 rounded-lg p-2.5 text-white text-sm"
                />
              </div>
              <div className="flex-1">
                <input
                  type="number"
                  value={tpPercentage}
                  onFocus={() => setTpInputMode('percentage')}
                  onChange={e => setTpPercentage(e.target.value)}
                  placeholder="ROI %"
                  className="w-full bg-[#0f0f0f] border border-gray-700 rounded-lg p-2.5 text-white text-sm"
                />
              </div>
            </div>
          </div>

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
                  className="text-xs text-gray-500 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="number"
                  value={slPrice}
                  onFocus={() => setSlInputMode('price')}
                  onChange={e => setSlPrice(e.target.value)}
                  placeholder="Price"
                  className="w-full bg-[#0f0f0f] border border-gray-700 rounded-lg p-2.5 text-white text-sm"
                />
              </div>
              <div className="flex-1">
                <input
                  type="number"
                  value={slPercentage}
                  onFocus={() => setSlInputMode('percentage')}
                  onChange={e => setSlPercentage(e.target.value)}
                  placeholder="Loss %"
                  className="w-full bg-[#0f0f0f] border border-gray-700 rounded-lg p-2.5 text-white text-sm"
                />
              </div>
            </div>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 flex gap-3">
            <AlertTriangle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-200/80 leading-relaxed">
              Trigger orders reduce position size when hit. Ensure sufficient balance for fees.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-700 flex gap-3 bg-[#141414] rounded-b-xl">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 text-white text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || (!tpPrice && !slPrice)}
            className="flex-1 py-2.5 rounded-lg bg-white text-black text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              'Confirm'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PriceTriggers;
