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
      return (
        <p className="text-xs text-red-500 mt-1 flex items-start gap-1 font-medium">{error}</p>
      );
    }
    if (warning) {
      return (
        <p className="text-xs text-amber-500 mt-1 flex items-start gap-1 font-medium">
          <span>⚠</span>
          <span>{warning}</span>
        </p>
      );
    }
    return null;
  };

  const getInputClasses = (hasError?: string, hasWarning?: string) => {
    let borderClass = 'border-color';
    if (hasError) borderClass = 'border-red-500/50';
    else if (hasWarning) borderClass = 'border-amber-500/50';

    return `w-full bg-primary border ${borderClass} rounded-xl px-4 py-3 text-sm text-primary placeholder-muted focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm`;
  };

  return (
    <div className="space-y-4 px-1 lg:px-4">
      {/* LIMIT PRICE INPUT */}
      {showPrice && (
        <div className="animate-fade-in">
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2 ml-1">
            Limit Price (USD)
          </label>
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
        <div className="animate-fade-in">
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2 ml-1">
            Trigger Price (USD)
          </label>
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
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-2 ml-1">
          <label className="text-xs font-semibold text-muted uppercase tracking-wider">
            Amount
          </label>
          <button
            type="button"
            onClick={handleToggleCurrency}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-tertiary hover:bg-hover border border-color rounded-lg text-secondary transition-all font-medium shadow-sm"
            title={`Switch to ${currencyMode === 'USD' ? baseAsset : 'USD'} input mode`}
          >
            <ArrowLeftRight size={12} className="text-brand-primary" />
            {currencyMode === 'USD' ? 'USD' : baseAsset}
          </button>
        </div>
        <div className="relative group">
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted cursor-pointer hover:text-brand-primary hover:bg-tertiary transition-all bg-tertiary/80 border border-color px-2 py-1 rounded-md z-10 font-bold"
              onClick={onSetMax}
              title="Click to fill max size"
            >
              MAX
            </div>
          )}
        </div>
        {maxBuyingPower && maxBuyingPower > 0 && (
          <div className="mt-1.5 ml-1 flex justify-between items-center text-[10px]">
            <span className="text-muted italic">
              Max: ${maxBuyingPower.toFixed(2)} @ {leverage}x
            </span>
          </div>
        )}
        <div id="size-error">{renderFeedback(sizeError, sizeWarning)}</div>
      </div>
    </div>
  );
};
