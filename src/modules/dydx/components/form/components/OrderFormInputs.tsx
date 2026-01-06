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
}

// Define as constants for runtime checks
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
  currentPrice,
  bestPrices,
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
}) => {
  const showPrice = PRICE_REQUIRED_TYPES.includes(orderType as any);
  const showTriggerPrice = TRIGGER_REQUIRED_TYPES.includes(orderType as any);

  const handleToggleCurrency = () => {
    if (onCurrencyModeChange) {
      onCurrencyModeChange(currencyMode === 'USD' ? 'BASE' : 'USD');
    }
  };

  const renderPriceButtons = (onChange: (value: string) => void) => (
    <div className="flex gap-1 mt-1">
      <button
        type="button"
        onClick={() => onChange(currentPrice)}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
        title="Use last traded price"
      >
        Last
      </button>
      <button
        type="button"
        onClick={() => onChange(bestPrices.bestBid)}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
        title="Use best bid price"
      >
        Bid
      </button>
      <button
        type="button"
        onClick={() => onChange(bestPrices.bestAsk)}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
        title="Use best ask price"
      >
        Ask
      </button>
    </div>
  );

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

    return `w-full bg-gray-800 border rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-600 ${borderClass}`;
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
          {renderPriceButtons(onPriceChange)}
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
          {renderPriceButtons(onTriggerPriceChange)}
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
        <div id="size-error">{renderFeedback(sizeError, sizeWarning)}</div>
      </div>
    </div>
  );
};
