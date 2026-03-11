import { ArrowLeftRight } from 'lucide-react';

import type { OrderTypeEnum } from '../../../types/trading.types';
import type { CurrencyMode } from '../../../utils/currencyService';
import { validateNumberInput } from '../../../utils/inputValidation';
import { Tooltip } from '../../../../../components/common/Tooltip';

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
  currentPrice,
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


  const parsedSize = parseFloat(size || '0');
  const parsedPrice = parseFloat(currentPrice || '1');
  const cryptoEquivalent =
    currencyMode === 'USD'
      ? parsedPrice > 0 ? (parsedSize / parsedPrice).toFixed(4) : '0.0000'
      : (parsedSize * parsedPrice).toFixed(2);

  const otherCurrencyMode = currencyMode === 'USD' ? baseAsset : 'USD';

  return (
    <div className="space-y-2.5 px-1 lg:px-3 mt-2">
      {showPrice && (
        <div className="animate-fade-in">
          <div className="bg-primary border border-color rounded-xl px-3 py-1.5 md:px-4 md:py-1.5 shadow-sm focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary/20 transition-all">
            <div className="flex justify-between items-center">
              <Tooltip content="The precise price at which your order will execute" position="left">
                <span className="text-[11px] font-semibold text-muted">Limit Price</span>
              </Tooltip>
              <span className="text-[10px] font-semibold bg-tertiary px-1.5 py-0.5 rounded text-secondary uppercase">
                USD
              </span>
            </div>
            <div className="flex items-center">
              <span className="text-md font-semibold text-primary mr-1">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={price}
                onChange={e => onPriceChange(validateNumberInput(e.target.value))}
                placeholder="0.00"
                className="w-full bg-transparent text-md font-semibold text-primary outline-none placeholder-muted/50"
                aria-label="Limit Price"
                aria-invalid={!!priceError}
                aria-describedby={priceError ? 'price-error' : undefined}
              />
            </div>
          </div>
          <div id="price-error">{renderFeedback(priceError, priceWarning)}</div>
        </div>
      )}

      {showTriggerPrice && (
        <div className="animate-fade-in">
          <div className="bg-primary border border-color rounded-xl px-3 py-1.5 md:px-4 md:py-1.5 shadow-sm focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary/20 transition-all">
            <div className="flex justify-between items-center">
              <Tooltip content="The price that will trigger your order to become active" position="left">
                <span className="text-[11px] font-semibold text-muted">Trigger Price</span>
              </Tooltip>
              <span className="text-[10px] font-semibold bg-tertiary px-1.5 py-0.5 rounded text-secondary uppercase">
                USD
              </span>
            </div>
            <div className="flex items-center">
              <span className="text-md font-semibold text-primary mr-1">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={triggerPrice}
                onChange={e => onTriggerPriceChange(validateNumberInput(e.target.value))}
                placeholder="0.00"
                className="w-full bg-transparent text-md font-semibold text-primary outline-none placeholder-muted/50"
                aria-label="Trigger Price"
                aria-invalid={!!triggerError}
                aria-describedby={triggerError ? 'trigger-error' : undefined}
              />
            </div>
          </div>
          <div id="trigger-error">{renderFeedback(triggerError, triggerWarning)}</div>
        </div>
      )}

      <div className="animate-fade-in space-y-2.5">
        <div className="bg-primary border border-color rounded-xl px-3 py-1.5 md:px-4 md:py-1.5 shadow-sm focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary/20 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tooltip content="The total size of your position" position="left">
                <span className="text-[11px] font-semibold text-muted">Amount</span>
              </Tooltip>
              <span className="text-[10px] font-semibold bg-tertiary px-1.5 py-0.5 rounded text-secondary uppercase">
                {currencyMode === 'USD' ? 'USD' : baseAsset}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center mt-[-2px]">
            <div className="flex items-center flex-1">
              {currencyMode === 'USD' && <span className="text-md font-semibold text-primary mr-1">$</span>}
              <input
                type="text"
                inputMode="decimal"
                value={size}
                onChange={e => onSizeChange(validateNumberInput(e.target.value))}
                placeholder="0.00"
                className="w-full bg-transparent text-md font-semibold text-primary outline-none placeholder-muted/50"
                aria-label="Order Size"
                aria-invalid={!!sizeError}
                aria-describedby={sizeError ? 'size-error' : undefined}
              />
            </div>

            <div className="flex items-center gap-2 shrink-0 border-l border-color pl-3">
              <span className="text-xs font-medium text-muted">
                ≈ {cryptoEquivalent} <span className="text-[10px] font-semibold bg-tertiary px-1 py-0.5 rounded text-secondary uppercase ml-0.5">{otherCurrencyMode}</span>
              </span>
              <button
                type="button"
                onClick={handleToggleCurrency}
                className="p-1 bg-tertiary hover:bg-hover rounded-md text-secondary transition-colors"
                title={`Switch to ${otherCurrencyMode}`}
              >
                <ArrowLeftRight size={12} />
              </button>
            </div>
          </div>
        </div>

        <div id="size-error" className="ml-1">{renderFeedback(sizeError, sizeWarning)}</div>

        {maxBuyingPower && maxBuyingPower > 0 && (
          <div className="flex justify-between items-center px-1 mt-1">
            <span className="text-xs text-muted">
              Avail: ${maxBuyingPower.toFixed(2)} @ {leverage}x
            </span>
            <button
              type="button"
              onClick={onSetMax}
              className="text-xs font-semibold text-brand-primary hover:text-brand-primary-hover transition-colors"
            >
              MAX
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
