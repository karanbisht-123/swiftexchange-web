import { AlertTriangle, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { validateNumberInput } from '../utils/inputValidation';

export interface PriceTriggersProps {
  isOpen: boolean;
  onClose: () => void;
  position: {
    market: string;
    side: 'LONG' | 'SHORT';
    size: string;
    entryPrice: string;
  };
  oraclePrice?: number;
  onSave: (triggers: TriggerConfig) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  marketIcon?: React.ReactNode;
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
  customSize?: string;
}

const PriceTriggers: React.FC<PriceTriggersProps> = ({
  isOpen,
  onClose,
  position,
  oraclePrice,
  onSave,
  isLoading,
  error,
  marketIcon,
}) => {
  const [tpInputMode, setTpInputMode] = useState<'percentage' | 'price' | null>(null);
  const [slInputMode, setSlInputMode] = useState<'percentage' | 'price' | null>(null);
  const [tpPrice, setTpPrice] = useState('');
  const [tpPercentage, setTpPercentage] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [slPercentage, setSlPercentage] = useState('');
  const [customAmount, setCustomAmount] = useState(false);
  const [customSize, setCustomSize] = useState('');

  const entryPrice = parseFloat(position.entryPrice);
  const isLong = position.side === 'LONG';
  const positionSize = Math.abs(parseFloat(position.size));

  // Initialize customSize to total size by default if empty
  useEffect(() => {
    if (isOpen) {
      setCustomSize(positionSize.toString());
    }
  }, [isOpen, positionSize]);

  const activeSize = customAmount ? parseFloat(customSize) || 0 : positionSize;

  const calculatePercentageFromPrice = (targetPrice: number): number => {
    if (!targetPrice || !entryPrice) return 0;
    const rawPercentage = isLong
      ? ((targetPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - targetPrice) / entryPrice) * 100;
    return rawPercentage; // Retain sign for accurate gain/loss display
  };

  const calculatePriceFromPercentage = (percentage: number, isTP: boolean): number => {
    if (percentage === 0 || !entryPrice) return 0;
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
    } else if (tpInputMode === 'price' && tpPrice === '') {
      setTpPercentage('');
    }
  }, [tpPrice, tpInputMode, entryPrice, isLong]);

  useEffect(() => {
    if (
      tpInputMode === 'percentage' &&
      tpPercentage &&
      tpPercentage !== '-' &&
      tpPercentage !== '.'
    ) {
      const val = parseFloat(tpPercentage);
      if (!isNaN(val)) {
        const prc = calculatePriceFromPercentage(val, true);
        const precision = prc < 1 ? 4 : prc < 10 ? 3 : 1;
        setTpPrice(prc.toFixed(precision));
      }
    } else if (tpInputMode === 'percentage' && tpPercentage === '') {
      setTpPrice('');
    }
  }, [tpPercentage, tpInputMode, entryPrice, isLong]);

  useEffect(() => {
    if (slInputMode === 'price' && slPrice) {
      const val = parseFloat(slPrice);
      if (!isNaN(val)) {
        const pct = calculatePercentageFromPrice(val);
        setSlPercentage(pct.toFixed(2));
      }
    } else if (slInputMode === 'price' && slPrice === '') {
      setSlPercentage('');
    }
  }, [slPrice, slInputMode, entryPrice, isLong]);

  useEffect(() => {
    if (
      slInputMode === 'percentage' &&
      slPercentage &&
      slPercentage !== '-' &&
      slPercentage !== '.'
    ) {
      const val = parseFloat(slPercentage);
      if (!isNaN(val)) {
        const prc = calculatePriceFromPercentage(val, false);
        const precision = prc < 1 ? 4 : prc < 10 ? 3 : 1;
        setSlPrice(prc.toFixed(precision));
      }
    } else if (slInputMode === 'percentage' && slPercentage === '') {
      setSlPrice('');
    }
  }, [slPercentage, slInputMode, entryPrice, isLong]);

  const handleSave = async () => {
    if (!tpPrice && !slPrice) return;
    const config: TriggerConfig = {
      customAmount,
      customSize: customAmount ? customSize : undefined,
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

  const tpProfit = useMemo(() => {
    const prc = parseFloat(tpPrice);
    if (isNaN(prc)) return null;
    return isLong ? (prc - entryPrice) * activeSize : (entryPrice - prc) * activeSize;
  }, [tpPrice, activeSize, entryPrice, isLong]);

  const slLoss = useMemo(() => {
    const prc = parseFloat(slPrice);
    if (isNaN(prc)) return null;
    return isLong ? (prc - entryPrice) * activeSize : (entryPrice - prc) * activeSize;
  }, [slPrice, activeSize, entryPrice, isLong]);

  const isTpInvalid = useMemo(() => {
    const prc = parseFloat(tpPrice);
    if (isNaN(prc)) return false;
    return isLong ? prc <= entryPrice : prc >= entryPrice;
  }, [tpPrice, isLong, entryPrice]);

  const isSlInvalid = useMemo(() => {
    const prc = parseFloat(slPrice);
    if (isNaN(prc)) return false;
    return isLong ? prc >= entryPrice : prc <= entryPrice;
  }, [slPrice, isLong, entryPrice]);

  const tpOracleInvalid = useMemo(() => {
    const prc = parseFloat(tpPrice);
    if (isNaN(prc) || !oraclePrice) return false;
    // For longs, TP must be above oracle. For shorts, TP must be below oracle.
    return isLong ? prc <= oraclePrice : prc >= oraclePrice;
  }, [tpPrice, oraclePrice, isLong]);

  const slOracleInvalid = useMemo(() => {
    const prc = parseFloat(slPrice);
    if (isNaN(prc) || !oraclePrice) return false;
    // For longs, SL must be below oracle. For shorts, SL must be above oracle.
    return isLong ? prc >= oraclePrice : prc <= oraclePrice;
  }, [slPrice, oraclePrice, isLong]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-secondary rounded-xl max-w-[420px] w-full border border-white/5 shadow-premium animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            {marketIcon ? (
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center">
                {marketIcon}
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-lg">
                {position.market.charAt(0)}
              </div>
            )}
            <h2 className="text-base font-semibold text-primary">Price triggers</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-transparent text-muted hover:text-primary hover:bg-hover transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-2 space-y-6 overflow-y-auto hide-scrollbar flex-1">
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Prices Card */}
          <div className="bg-tertiary rounded-lg p-4 flex justify-between items-center">
            <div>
              <span className="text-xs text-muted block mb-1">Avg. Entry Price</span>
              <span className="text-[15px] text-primary font-mono font-semibold">
                $
                {entryPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6,
                })}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted block mb-1">Oracle Price</span>
              <span className="text-[15px] text-primary font-mono font-semibold">
                {oraclePrice
                  ? `$${oraclePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Take Profit */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-primary font-medium flex items-center gap-2">
                Take Profit
              </label>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted">
                  Profit:{' '}
                  {tpProfit !== null ? (
                    <span className={tpProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {tpProfit < 0 ? '-' : ''}${Math.abs(tpProfit).toFixed(2)}
                    </span>
                  ) : (
                    '—'
                  )}
                </span>
                {(tpPrice || tpPercentage) && (
                  <button
                    onClick={() => handleClear(true)}
                    className="text-red-400 hover:text-red-300 transition-colors font-medium ml-1"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 relative bg-tertiary rounded-lg border border-transparent focus-within:border-brand transition-colors overflow-hidden">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                  <span className="text-xs text-muted font-medium">TP Price</span>
                  <span className="text-[10px] bg-primary text-muted px-1.5 py-0.5 rounded font-bold">
                    {position.market.split('-')[0]}
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tpPrice}
                  onFocus={() => setTpInputMode('price')}
                  onChange={e => setTpPrice(validateNumberInput(e.target.value))}
                  placeholder="$0"
                  className="w-full bg-transparent p-3 pl-[88px] text-primary text-sm focus:outline-none placeholder:text-muted/50 font-mono"
                />
              </div>
              <div className="flex-1 relative bg-tertiary rounded-lg border border-transparent focus-within:border-brand transition-colors overflow-hidden">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                  <span className="text-xs text-muted font-medium">Gain</span>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tpPercentage}
                  onFocus={() => setTpInputMode('percentage')}
                  onChange={e => setTpPercentage(validateNumberInput(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-transparent p-3 pl-12 pr-8 text-primary text-sm focus:outline-none placeholder:text-muted/50 font-mono"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs pointer-events-none">
                  %
                </div>
              </div>
            </div>
            {tpPrice && tpOracleInvalid && (
              <div className="p-3 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-xs font-medium">
                Your take profit trigger price must be {isLong ? 'above' : 'below'} the current
                oracle price: ${oraclePrice?.toLocaleString()}.
              </div>
            )}
            {tpPrice && !tpOracleInvalid && isTpInvalid && (
              <div className="p-3 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-xs font-medium">
                Your take profit trigger price must be {isLong ? 'above' : 'below'} the entry price:
                ${entryPrice.toLocaleString()}.
              </div>
            )}
          </div>

          {/* Stop Loss */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm text-primary font-medium flex items-center gap-2">
                Stop Loss
              </label>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted">
                  Loss:{' '}
                  {slLoss !== null ? (
                    <span className={slLoss >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {slLoss < 0 ? '-' : ''}${Math.abs(slLoss).toFixed(2)}
                    </span>
                  ) : (
                    '—'
                  )}
                </span>
                {(slPrice || slPercentage) && (
                  <button
                    onClick={() => handleClear(false)}
                    className="text-red-400 hover:text-red-300 transition-colors font-medium ml-1"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 relative bg-tertiary rounded-lg border border-transparent focus-within:border-brand transition-colors overflow-hidden">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                  <span className="text-xs text-muted font-medium">SL Price</span>
                  <span className="text-[10px] bg-primary text-muted px-1.5 py-0.5 rounded font-bold">
                    {position.market.split('-')[0]}
                  </span>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={slPrice}
                  onFocus={() => setSlInputMode('price')}
                  onChange={e => setSlPrice(validateNumberInput(e.target.value))}
                  placeholder="$0"
                  className="w-full bg-transparent p-3 pl-[88px] text-primary text-sm focus:outline-none placeholder:text-muted/50 font-mono"
                />
              </div>
              <div className="flex-1 relative bg-tertiary rounded-lg border border-transparent focus-within:border-brand transition-colors overflow-hidden">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                  <span className="text-xs text-muted font-medium">Loss</span>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={slPercentage}
                  onFocus={() => setSlInputMode('percentage')}
                  onChange={e => setSlPercentage(validateNumberInput(e.target.value))}
                  placeholder="0.00"
                  className="w-full bg-transparent p-3 pl-12 pr-8 text-primary text-sm focus:outline-none placeholder:text-muted/50 font-mono"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs pointer-events-none">
                  %
                </div>
              </div>
            </div>
            {slPrice && slOracleInvalid && (
              <div className="p-3 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-xs font-medium">
                Your stop loss trigger price must be {isLong ? 'below' : 'above'} the current oracle
                price: ${oraclePrice?.toLocaleString()}.
              </div>
            )}
            {slPrice && !slOracleInvalid && isSlInvalid && (
              <div className="p-3 bg-red-900/20 border border-red-500/20 rounded-lg text-red-400 text-xs font-medium">
                Your stop loss trigger price must be {isLong ? 'below' : 'above'} the entry price: $
                {entryPrice.toLocaleString()}.
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/5">
            <span className="text-[11px] text-muted/70 block mb-3 uppercase tracking-wider">
              Advanced
            </span>
            <label
              onClick={e => {
                e.preventDefault();
                setCustomAmount(!customAmount);
              }}
              className="flex items-center gap-2 cursor-pointer mb-3 group w-fit"
            >
              <div
                className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${customAmount ? 'bg-brand' : 'bg-tertiary border border-white/10 group-hover:border-white/20'}`}
              >
                {customAmount && (
                  <svg
                    className="w-3 h-3 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
              <span className="text-sm text-primary font-medium">Custom amount</span>
            </label>

            {customAmount && (
              <div className="mb-4 space-y-3 p-3 bg-tertiary rounded-lg border border-transparent">
                <div className="flex gap-3 items-center">
                  <div className="flex-1 px-1">
                    <input
                      type="range"
                      min="0"
                      max={positionSize}
                      step={0.0001}
                      value={customSize}
                      onChange={e => setCustomSize(e.target.value)}
                      className="w-full accent-brand bg-primary h-1.5 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="w-[130px] relative bg-primary rounded-lg border border-transparent focus-within:border-brand transition-colors">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={customSize}
                      onChange={e => {
                        const val = validateNumberInput(e.target.value);
                        if (parseFloat(val) <= positionSize || val === '') {
                          setCustomSize(val);
                        }
                      }}
                      className="w-full bg-transparent p-2 pr-[46px] text-primary text-sm focus:outline-none font-mono text-right"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-muted text-[10px] font-bold">
                      {position.market.split('-')[0]}
                    </div>
                  </div>
                </div>
                {parseFloat(customSize) > positionSize && (
                  <p className="text-xs text-red-400">Amount exceeds position size</p>
                )}
              </div>
            )}

            <p className="text-xs text-muted/50 leading-relaxed">
              Take Profit and Stop Loss orders will automatically be canceled if the underlying
              position is closed. Configuring a custom amount will apply to both Take Profit and
              Stop Loss orders.
            </p>
          </div>
        </div>

        <div className="px-5 pb-5 pt-4 shrink-0">
          {!tpPrice && !slPrice ? (
            <div className="w-full py-3.5 rounded-lg border border-warning/30 text-warning bg-warning/5 text-sm font-semibold flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Enter trigger price
            </div>
          ) : tpOracleInvalid ||
            slOracleInvalid ||
            isTpInvalid ||
            isSlInvalid ||
            (customAmount &&
              (!customSize ||
                parseFloat(customSize) <= 0 ||
                parseFloat(customSize) > positionSize)) ? (
            <div className="w-full py-3.5 rounded-lg border border-warning/30 text-warning bg-warning/5 text-sm font-semibold flex items-center justify-center gap-2 cursor-not-allowed opacity-80">
              <AlertTriangle className="w-4 h-4" />
              Modify trigger price
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="w-full py-3.5 rounded-lg bg-brand hover:bg-brand/90 text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Confirm triggers'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PriceTriggers;
