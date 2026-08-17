import { ChevronDown, Plus } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import InfoBanner from '../../../components/common/InfoBanner';
import { useAccountStore } from '../../core/stores/accountStore';
import { useMarketStore } from '../../core/stores/marketStore';
import {
  type TimeInForce,
  type WorkingType,
  useOrderEntryStore,
} from '../../core/stores/orderEntryStore';
import { useTradeCalculations } from '../../hooks/useTradeCalculations';
import { validateOrder } from '../../utils/orderValidation';
import { AssetModeModal } from './AssetModeModal';
import { OrderActionButton } from './OrderActionButton';
import { OrderInput } from './OrderInput';
import { OrderTypeSelector } from './OrderTypeSelector';

interface OrderFormProps {
  onSubmitOrder: (params: any) => Promise<void>;
  isLoading?: boolean;
  onOpenMarginModal: () => void;
  onOpenLeverageModal: () => void;
  onOpenDepositModal: () => void;
}

const TIF_OPTIONS: { label: string; value: TimeInForce }[] = [
  { label: 'GTC', value: 'GTC' },
  { label: 'IOC', value: 'IOC' },
  { label: 'FOK', value: 'FOK' },
  { label: 'GTX (Post Only)', value: 'GTX' },
];

export const OrderForm: React.FC<OrderFormProps> = ({
  onSubmitOrder,
  isLoading,
  onOpenMarginModal,
  onOpenLeverageModal,
  onOpenDepositModal,
}) => {
  const store = useOrderEntryStore();
  const [isAssetModeModalOpen, setIsAssetModeModalOpen] = useState(false);
  const [isTifOpen, setIsTifOpen] = useState(false);

  const balances = useAccountStore(state => state.balances);
  const markets = useMarketStore(state => state.markets);
  const selectedSymbol = useMarketStore(state => state.selectedSymbol);

  const market = markets[selectedSymbol] || null;

  const {
    walletBalance: calcWalletBalance,
    maxPossibleSize,
    orderCost,
    estimatedIsolatedLiqPrice,
    currentPrice,
  } = useTradeCalculations(
    selectedSymbol,
    store.size,
    store.sizeAsset,
    store.leverage,
    store.marginType
  );

  const validation = useMemo(() => {
    return validateOrder(
      market,
      currentPrice,
      Object.values(balances),
      store.side,
      store.orderType,
      store.price,
      store.size,
      store.sizeAsset,
      store.stopPrice,
      store.callbackRate,
      maxPossibleSize
    );
  }, [
    market,
    currentPrice,
    balances,
    store.side,
    store.orderType,
    store.price,
    store.size,
    store.sizeAsset,
    store.stopPrice,
    store.callbackRate,
    maxPossibleSize,
  ]);

  const handleSubmit = (side: 'BUY' | 'SELL') => {
    store.setSide(side);
    const payload = {
      symbol: selectedSymbol,
      side,
      type: store.orderType === 'POST_ONLY' ? 'LIMIT' : store.orderType,
      size: store.size,
      sizeAsset: store.sizeAsset,
      price: store.price,
      leverage: store.leverage,
      isReduceOnly: store.isReduceOnly,
      isPostOnly: store.orderType === 'POST_ONLY' || store.isPostOnly,
      stopPrice: store.stopPrice,
      activationPrice: store.activationPrice,
      callbackRate: store.callbackRate,
      chaseOffset: store.chaseOffset,
      maxChaseOffset: store.maxChaseOffset,
      scaledPriceLower: store.scaledPriceLower,
      scaledPriceUpper: store.scaledPriceUpper,
      scaledOrderCount: store.scaledOrderCount,
      scaledDistribution: store.scaledDistribution,
      timeInForce: store.orderType === 'POST_ONLY' ? 'GTX' : store.timeInForce,
      workingType: store.workingType,
      slippageEnabled: store.slippageEnabled,
      slippageTolerance: store.slippageTolerance,
      attachedTpEnabled: store.attachedTpEnabled,
      attachedTpPrice: store.attachedTpPrice,
      attachedTpTrigger: store.attachedTpTrigger,
      attachedSlEnabled: store.attachedSlEnabled,
      attachedSlPrice: store.attachedSlPrice,
      attachedSlTrigger: store.attachedSlTrigger,
    };

    onSubmitOrder(payload);
  };

  const baseAsset = market?.baseAsset || selectedSymbol.split('-')[0] || 'ASSET';
  const quoteAsset = market?.quoteAsset || selectedSymbol.split('-')[1] || 'USDT';
  const currentCurrency = store.sizeAsset === 'base' ? baseAsset : quoteAsset;
  const baseDecimals = market?.stepSize ? Math.max(0, -Math.floor(Math.log10(market.stepSize))) : 4;
  const priceDecimals = market?.tickSize
    ? Math.max(0, -Math.floor(Math.log10(market.tickSize)))
    : 2;

  const actionSubtext = useMemo(() => {
    const size = parseFloat(store.size) || 0;
    if (size <= 0) return undefined;
    if (store.sizeAsset === 'quote') {
      const eqBase = currentPrice > 0 ? size / currentPrice : 0;
      return `≈${eqBase.toFixed(baseDecimals)} ${baseAsset}`;
    } else {
      return `≈${orderCost.toFixed(2)} USDT`;
    }
  }, [store.size, store.sizeAsset, currentPrice, orderCost, baseDecimals, baseAsset]);

  const handleCurrencyToggle = (curr: string) => {
    const newAsset = curr === baseAsset ? 'base' : 'quote';
    if (newAsset !== store.sizeAsset) {
      const currentSize = parseFloat(store.size) || 0;
      if (currentSize > 0 && currentPrice > 0) {
        if (newAsset === 'quote') {
          store.setSize((currentSize * currentPrice).toFixed(2));
        } else {
          store.setSize((currentSize / currentPrice).toFixed(baseDecimals));
        }
      }
      store.setSizeAsset(newAsset);
    }
  };

  const handleBboFill = () => {
    if (currentPrice > 0) {
      store.setPrice(currentPrice.toFixed(priceDecimals));
    }
  };

  const isStopOrder =
    store.orderType === 'STOP' ||
    store.orderType === 'STOP_MARKET' ||
    store.orderType === 'TAKE_PROFIT' ||
    store.orderType === 'TAKE_PROFIT_MARKET';

  const isPriceOrder =
    store.orderType === 'LIMIT' ||
    store.orderType === 'POST_ONLY' ||
    store.orderType === 'STOP' ||
    store.orderType === 'TAKE_PROFIT';

  const currentSliderPct = Math.min(
    100,
    Math.max(0, maxPossibleSize > 0 ? ((parseFloat(store.size) || 0) / maxPossibleSize) * 100 : 0)
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 py-0 space-y-2.5 scrollbar-thin ">
      <OrderTypeSelector activeType={store.orderType} onChange={store.setOrderType} />

      <div className="flex justify-between items-center text-[12px] text-secondary pt-0.5">
        <div className="flex items-center gap-1.5">
          <span>Avbl</span>
          <span className="text-primary font-medium">{calcWalletBalance.toFixed(2)} USDT</span>
        </div>
        <button
          type="button"
          onClick={onOpenDepositModal}
          className="w-4 h-4 rounded-full border border-brand/50 text-brand hover:bg-brand/10 flex items-center justify-center transition-colors cursor-pointer"
          title="Deposit"
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onOpenMarginModal}
          className="flex-1 bg-tertiary border border-color hover:border-border-dark rounded-md py-1.5 text-[12px] font-medium text-primary transition-colors cursor-pointer text-center"
        >
          {store.marginType === 'cross' ? 'Cross' : 'Isolated'}
        </button>
        <button
          type="button"
          onClick={onOpenLeverageModal}
          className="flex-1 bg-tertiary border border-color hover:border-border-dark rounded-md py-1.5 text-[12px] font-medium text-primary transition-colors cursor-pointer text-center"
        >
          {store.leverage}x
        </button>
        <button
          type="button"
          onClick={() => setIsAssetModeModalOpen(true)}
          className="w-9 bg-tertiary border border-color hover:border-border-dark rounded-md py-1.5 text-[12px] font-medium text-primary transition-colors flex items-center justify-center cursor-pointer"
          title="Multi-Asset Mode"
        >
          M
        </button>
      </div>

      <div className="space-y-2">
        {isStopOrder && (
          <OrderInput
            label="Trigger price"
            value={store.stopPrice}
            onChange={store.setStopPrice}
            currency="USDT"
            placeholder="0.00"
            triggerOption={store.workingType === 'MARK_PRICE' ? 'Mark' : 'Last'}
            triggerOptions={['Mark', 'Last']}
            onTriggerOptionChange={opt =>
              store.setWorkingType(opt === 'Mark' ? 'MARK_PRICE' : 'CONTRACT_PRICE')
            }
            error={validation.errorField === 'stopPrice'}
          />
        )}

        {isPriceOrder && (
          <OrderInput
            label="Order price"
            value={store.price}
            onChange={store.setPrice}
            currency="USDT"
            placeholder="0.00"
            onBboClick={handleBboFill}
            error={validation.errorField === 'price'}
          />
        )}

        {store.orderType === 'TRAILING_STOP_MARKET' && (
          <>
            <OrderInput
              label="Activation"
              value={store.activationPrice}
              onChange={store.setActivationPrice}
              currency="USDT"
              placeholder="Latest price if empty"
            />
            <OrderInput
              label="Callback %"
              value={store.callbackRate}
              onChange={store.setCallbackRate}
              currency="%"
              placeholder="0.1 to 5"
              error={validation.errorField === 'callbackRate'}
            />
          </>
        )}

        {store.orderType === 'CHASE' && (
          <>
            <OrderInput
              label="Chase Offset"
              value={store.chaseOffset}
              onChange={store.setChaseOffset}
              currency="USDT"
              placeholder="0"
            />
            <OrderInput
              label="Max Offset"
              value={store.maxChaseOffset}
              onChange={store.setMaxChaseOffset}
              currency="USDT"
              placeholder="10"
            />
          </>
        )}

        {store.orderType === 'SCALED' && (
          <>
            <OrderInput
              label="Price Lower"
              value={store.scaledPriceLower}
              onChange={store.setScaledPriceLower}
              currency="USDT"
              placeholder="0.00"
            />
            <OrderInput
              label="Price Upper"
              value={store.scaledPriceUpper}
              onChange={store.setScaledPriceUpper}
              currency="USDT"
              placeholder="0.00"
            />
            <OrderInput
              label="Order Count"
              value={store.scaledOrderCount}
              onChange={store.setScaledOrderCount}
              currency=""
              placeholder="2 - 20"
            />
            <div className="flex justify-between items-center text-[12px] bg-tertiary border border-color rounded-md p-1">
              {['FLAT', 'ASCENDING', 'DESCENDING'].map(dist => (
                <button
                  key={dist}
                  type="button"
                  onClick={() => store.setScaledDistribution(dist as any)}
                  className={`flex-1 py-1 text-center rounded transition-colors ${
                    store.scaledDistribution === dist
                      ? 'bg-secondary text-primary shadow-sm'
                      : 'text-secondary hover:text-primary'
                  }`}
                >
                  {dist === 'FLAT' ? 'Flat' : dist === 'ASCENDING' ? 'Scale Up' : 'Scale Down'}
                </button>
              ))}
            </div>

            {store.scaledPriceLower && store.scaledPriceUpper && store.scaledOrderCount && (
              <div className="text-[11px] text-secondary bg-brand/5 p-2 rounded-md border border-brand/10 leading-relaxed text-center">
                Places <strong className="text-brand">{store.scaledOrderCount}</strong> limit orders
                from <strong className="text-primary">{store.scaledPriceLower}</strong> to{' '}
                <strong className="text-primary">{store.scaledPriceUpper}</strong> with a{' '}
                <strong className="text-primary">
                  {store.scaledDistribution === 'FLAT'
                    ? 'Flat'
                    : store.scaledDistribution === 'ASCENDING'
                      ? 'Scale Up'
                      : 'Scale Down'}
                </strong>{' '}
                size distribution.
              </div>
            )}
          </>
        )}

        <OrderInput
          label="Size"
          value={store.size}
          onChange={store.setSize}
          currency={currentCurrency}
          currencyOptions={[quoteAsset, baseAsset]}
          onCurrencyChange={handleCurrencyToggle}
          placeholder="0.00"
          error={validation.errorField === 'size'}
        />

        {/* Theme Range Slider */}
        <div className="px-1 py-1">
          <div className="relative w-full h-1 bg-border-color rounded-full flex items-center">
            <div
              className="absolute h-full bg-brand rounded-l-full pointer-events-none"
              style={{ width: `${currentSliderPct}%` }}
            />

            <div className="absolute inset-0 flex justify-between items-center pointer-events-none px-[1px]">
              {[0, 25, 50, 75, 100].map(mark => (
                <div
                  key={mark}
                  className={`w-1.5 h-1.5 rounded-full z-0 transition-colors ${
                    currentSliderPct >= mark
                      ? 'bg-brand ring-2 ring-brand/30'
                      : 'bg-tertiary border border-color'
                  }`}
                />
              ))}
            </div>

            <input
              type="range"
              min="0"
              max="100"
              value={currentSliderPct.toFixed(0)}
              onChange={e => {
                const pct = parseFloat(e.target.value) / 100;
                const newSize = maxPossibleSize * pct;
                if (newSize > 0) {
                  const stepPrecision = store.sizeAsset === 'quote' ? 2 : baseDecimals;
                  store.setSize(newSize.toFixed(stepPrecision));
                } else {
                  store.setSize('');
                }
              }}
              className="absolute inset-0 w-full h-4 -top-1.5 opacity-0 cursor-pointer z-10"
            />

            <div
              className="absolute w-3.5 h-3.5 bg-white rounded-full shadow pointer-events-none border-2 border-brand z-10"
              style={{
                left: `calc(${currentSliderPct}% - 7px)`,
              }}
            />
          </div>
        </div>

        {validation.error && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-danger/10 border border-danger/30 text-danger text-[11px] font-medium animate-fade-in">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{validation.error}</span>
          </div>
        )}
      </div>

      <div className="space-y-1.5 text-[12px] text-secondary">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer group select-none">
            <input
              type="checkbox"
              checked={store.attachedTpEnabled || store.attachedSlEnabled}
              onChange={e => {
                store.setAttachedTpEnabled(e.target.checked);
                store.setAttachedSlEnabled(e.target.checked);
              }}
              className="rounded border-color bg-tertiary text-brand focus:ring-0 cursor-pointer"
            />
            <span className="group-hover:text-primary transition-colors text-[12px]">TP/SL</span>
          </label>
        </div>

        {(store.attachedTpEnabled || store.attachedSlEnabled) && (
          <div className="pl-4 space-y-2 border-l border-color my-1">
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span>Take Profit</span>
                <select
                  value={store.attachedTpTrigger}
                  onChange={e => store.setAttachedTpTrigger(e.target.value as WorkingType)}
                  className="bg-transparent text-primary text-[11px] outline-none cursor-pointer"
                >
                  <option value="MARK_PRICE" className="bg-secondary">
                    Mark
                  </option>
                  <option value="CONTRACT_PRICE" className="bg-secondary">
                    Last
                  </option>
                </select>
              </div>
              <OrderInput
                label="TP"
                value={store.attachedTpPrice}
                onChange={store.setAttachedTpPrice}
                currency="USDT"
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span>Stop Loss</span>
                <select
                  value={store.attachedSlTrigger}
                  onChange={e => store.setAttachedSlTrigger(e.target.value as WorkingType)}
                  className="bg-transparent text-primary text-[11px] outline-none cursor-pointer"
                >
                  <option value="MARK_PRICE" className="bg-secondary">
                    Mark
                  </option>
                  <option value="CONTRACT_PRICE" className="bg-secondary">
                    Last
                  </option>
                </select>
              </div>
              <OrderInput
                label="SL"
                value={store.attachedSlPrice}
                onChange={store.setAttachedSlPrice}
                currency="USDT"
                placeholder="0.00"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer group select-none">
            <input
              type="checkbox"
              checked={store.isReduceOnly}
              onChange={e => store.setReduceOnly(e.target.checked)}
              className="rounded border-color bg-tertiary text-brand focus:ring-0 cursor-pointer"
            />
            <span className="group-hover:text-primary transition-colors text-[12px]">
              Reduce-Only
            </span>
          </label>

          {isPriceOrder && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTifOpen(!isTifOpen)}
                className="flex items-center gap-1 text-[11px] text-secondary hover:text-primary transition-colors"
              >
                <span>{store.timeInForce}</span>
                <ChevronDown size={11} />
              </button>

              {isTifOpen && (
                <div className="absolute right-0 bottom-full mb-1 w-32 bg-secondary border border-color rounded shadow-2xl overflow-hidden z-50 py-1">
                  {TIF_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        store.setTimeInForce(opt.value);
                        setIsTifOpen(false);
                      }}
                      className={`block w-full text-left px-3 py-1.5 text-[11px] hover:bg-hover transition-colors ${
                        store.timeInForce === opt.value
                          ? 'text-brand font-semibold'
                          : 'text-primary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <OrderActionButton
        onSubmit={handleSubmit}
        isLoading={isLoading}
        isValid={validation.isValid}
        validationError={validation.error}
        onOpenDepositModal={onOpenDepositModal}
        walletBalance={calcWalletBalance}
        actionSubtext={actionSubtext}
      />

      {/* Margin & Max Summary (Clean and compact like Aster) */}
      <div className="space-y-1 text-[11px] pt-1 text-secondary">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <span>Margin</span>
            <span className="text-primary font-medium">
              {orderCost > 0 ? orderCost.toFixed(2) : '0.00'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Margin</span>
            <span className="text-primary font-medium">
              {orderCost > 0 ? orderCost.toFixed(2) : '0.00'}
            </span>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <span>Max</span>
            <span className="text-primary font-medium">
              {maxPossibleSize > 0
                ? `${maxPossibleSize.toFixed(store.sizeAsset === 'quote' ? 2 : baseDecimals)} ${currentCurrency}`
                : '0.00 USDT'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Max</span>
            <span className="text-primary font-medium">
              {maxPossibleSize > 0
                ? `${maxPossibleSize.toFixed(store.sizeAsset === 'quote' ? 2 : baseDecimals)} ${currentCurrency}`
                : '0.00 USDT'}
            </span>
          </div>
        </div>

        {store.marginType === 'isolated' && (
          <div className="flex justify-between items-center pt-0.5">
            <div className="flex items-center gap-1.5">
              <span>Liq.Price</span>
              <span className="text-success font-medium">
                {estimatedIsolatedLiqPrice.long ? estimatedIsolatedLiqPrice.long.toFixed(2) : '--'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>Liq.Price</span>
              <span className="text-danger font-medium">
                {estimatedIsolatedLiqPrice.short
                  ? estimatedIsolatedLiqPrice.short.toFixed(2)
                  : '--'}
              </span>
            </div>
          </div>
        )}
      </div>
      <InfoBanner
        variant="warning"
        label="Beta:"
        message={"This feature is currently in Beta. We're actively testing and improving it."}
        margin="mx-0 mt-0 mb-2"
      />
      <AssetModeModal
        isOpen={isAssetModeModalOpen}
        onClose={() => setIsAssetModeModalOpen(false)}
      />
    </div>
  );
};
