import { ArrowLeftRight } from 'lucide-react';

import type { OrderTypeEnum } from '../../../types/trading.types';
import type { CurrencyMode } from '../../../utils/currencyService';

interface OrderFormInputsProps {
  orderType: OrderTypeEnum;
  size: string;
  price: string;
  triggerPrice: string;
  currentPrice: string;
  bestPrices: { bestBid: string; bestAsk: string };
  onSizeChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onTriggerPriceChange: (value: string) => void;
  sizeError?: string;
  sizeWarning?: string;
  priceError?: string;
  priceWarning?: string;
  triggerError?: string;
  triggerWarning?: string;
  currencyMode?: CurrencyMode;
  onCurrencyModeChange?: (mode: CurrencyMode) => void;
  baseAsset?: string;
  maxBuyingPower?: number;
  leverage?: number;
  onSetMax?: () => void;
}

const PRICE_REQUIRED_TYPES = ['LIMIT', 'STOP_LIMIT', 'TAKE_PROFIT_LIMIT'] as const;

const TRIGGER_REQUIRED_TYPES = [
  'STOP_MARKET',
  'STOP_LIMIT',
  'TAKE_PROFIT_MARKET',
  'TAKE_PROFIT_LIMIT',
] as const;

export const OrderFormInputs: React.FC<OrderFormInputsProps> = ({
  orderType,
  size,
  price,
  triggerPrice,
  onSizeChange,
  onPriceChange,
  onTriggerPriceChange,
  sizeError,
  sizeWarning,
  priceError,
  priceWarning,
  triggerError,
  triggerWarning,
  currencyMode = 'USD',
  onCurrencyModeChange,
  baseAsset = 'USD',
  maxBuyingPower,
  leverage = 1,
  onSetMax,
}) => {
  const showPrice = PRICE_REQUIRED_TYPES.includes(orderType as any);
  const showTriggerPrice = TRIGGER_REQUIRED_TYPES.includes(orderType as any);

  const handleToggleCurrency = () => {
    if (onCurrencyModeChange) {
      onCurrencyModeChange(currencyMode === 'USD' ? 'BASE' : 'USD');
    }
  };

  const renderFeedback = (error?: string, warning?: string) => {
    if (error) {
      return <p className="text-xs text-red-400 mt-1 flex items-start gap-1">{error}</p>;
    }
    if (warning) {
      return (
        <p className="text-xs text-yellow-400 mt-1 flex items-start gap-1">
          <span>⚠</span>
          <span>{warning}</span>
        </p>
      );
    }
    return null;
  };

  const getInputClasses = (hasError?: string, hasWarning?: string) => {
    let borderClass = 'border-gray-700';
    if (hasError) borderClass = 'border-red-500';
    else if (hasWarning) borderClass = 'border-yellow-500';

    return `w-full bg-gray-900/50 border ${borderClass} rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all`;
  };

  return (
    <div className="space-y-3 px-4">
      {/* LIMIT PRICE INPUT */}
      {showPrice && (
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Limit Price (USD)</label>
          <input
            type="text"
            value={price}
            onChange={e => onPriceChange(e.target.value)}
            placeholder="0.00"
            className={getInputClasses(priceError, priceWarning)}
            aria-label="Limit Price"
            aria-invalid={!!priceError}
            aria-describedby={priceError ? 'price-error' : undefined}
          />
          <div id="price-error">{renderFeedback(priceError, priceWarning)}</div>
        </div>
      )}

      {/* TRIGGER PRICE INPUT */}
      {showTriggerPrice && (
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Trigger Price (USD)</label>
          <input
            type="text"
            value={triggerPrice}
            onChange={e => onTriggerPriceChange(e.target.value)}
            placeholder="0.00"
            className={getInputClasses(triggerError, triggerWarning)}
            aria-label="Trigger Price"
            aria-invalid={!!triggerError}
            aria-describedby={triggerError ? 'trigger-error' : undefined}
          />
          <div id="trigger-error">{renderFeedback(triggerError, triggerWarning)}</div>
        </div>
      )}

      {/* SIZE INPUT */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-gray-400">Amount</label>
          <button
            type="button"
            onClick={handleToggleCurrency}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
            title={`Switch to ${currencyMode === 'USD' ? baseAsset : 'USD'} input mode`}
          >
            <ArrowLeftRight size={12} />
            {currencyMode === 'USD' ? 'USD' : baseAsset}
          </button>
        </div>
        <div className="relative">
          <input
            type="text"
            value={size}
            onChange={e => onSizeChange(e.target.value)}
            placeholder={currencyMode === 'USD' ? '0.00' : '0.00000000'}
            className={getInputClasses(sizeError, sizeWarning)}
            aria-label="Order Size"
            aria-invalid={!!sizeError}
            aria-describedby={sizeError ? 'size-error' : undefined}
          />
          {maxBuyingPower && maxBuyingPower > 0 && (
            <div
              className="absolute right-3 top-2.5 text-[10px] text-gray-400 cursor-pointer hover:text-blue-400 transition-colors bg-gray-900/80 px-1.5 rounded z-10"
              onClick={onSetMax}
              title="Click to fill max size"
            >
              Max: ${maxBuyingPower.toFixed(2)} @ {leverage}x
            </div>
          )}
        </div>
        <div id="size-error">{renderFeedback(sizeError, sizeWarning)}</div>
      </div>
    </div>
  );
};
