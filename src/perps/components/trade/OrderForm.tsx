import React, { useMemo, useState } from 'react';
import { useOrderEntryStore } from '../../core/stores/orderEntryStore';
import { useAccountStore } from '../../core/stores/accountStore';
import { useMarketStore } from '../../core/stores/marketStore';
import { validateOrder } from '../../utils/orderValidation';
import { OrderInput } from './OrderInput';
import { OrderTypeSelector } from './OrderTypeSelector';
import { OrderActionButton } from './OrderActionButton';
import { useTradeCalculations } from '../../hooks/useTradeCalculations';
import { AssetModeModal } from './AssetModeModal';

interface OrderFormProps {
  onSubmitOrder: (params: any) => Promise<void>;
  isLoading?: boolean;
  onOpenMarginModal: () => void;
  onOpenLeverageModal: () => void;
  onOpenDepositModal: () => void;
}

export const OrderForm: React.FC<OrderFormProps> = ({ onSubmitOrder, isLoading, onOpenMarginModal, onOpenLeverageModal, onOpenDepositModal }) => {
  const store = useOrderEntryStore();
  const [isAssetModeModalOpen, setIsAssetModeModalOpen] = useState(false);

  const balances = useAccountStore((state) => state.balances);
  const markets = useMarketStore((state) => state.markets);
  const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
  
  const market = markets[selectedSymbol] || null;

  const {
    walletBalance: calcWalletBalance,
    maxPossibleSize,
    orderCost,
    crossAccountEquity,
    crossMarginRatio,
    estimatedIsolatedLiqPrice,
    currentPrice
  } = useTradeCalculations(selectedSymbol, store.size, store.sizeAsset, store.leverage, store.marginType);

  // Validation
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
      store.callbackRate
    );
  }, [market, currentPrice, balances, store.side, store.orderType, store.price, store.size, store.sizeAsset, store.stopPrice, store.callbackRate]);

  const handleSubmit = (side: 'BUY' | 'SELL') => {
    store.setSide(side);
    // Note: We bypass strict validation state check here to let action button handle it or submit anyway
    const payload = {
      symbol: selectedSymbol,
      side,
      type: store.orderType,
      size: store.size,
      sizeAsset: store.sizeAsset,
      price: store.price,
      leverage: store.leverage,
      isReduceOnly: store.isReduceOnly,
      isPostOnly: store.isPostOnly,
      stopPrice: store.stopPrice,
      activationPrice: store.activationPrice,
      callbackRate: store.callbackRate,
      timeInForce: store.timeInForce,
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

  const actionSubtext = useMemo(() => {
    const size = parseFloat(store.size) || 0;
    if (size <= 0) return undefined;
    if (store.sizeAsset === 'quote') {
      const eqBase = currentPrice > 0 ? size / currentPrice : 0;
      const decimals = market?.stepSize ? Math.max(0, -Math.floor(Math.log10(market.stepSize))) : 4;
      return `≈${eqBase.toFixed(decimals)} ${baseAsset}`;
    } else {
      return `≈${orderCost.toFixed(2)} USDT`;
    }
  }, [store.size, store.sizeAsset, currentPrice, orderCost, market?.stepSize, baseAsset]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Layer 1: Order Type */}
      <OrderTypeSelector activeType={store.orderType} onChange={store.setOrderType} />

      {/* Layer 2: Available Balance */}
      <div className="flex justify-end items-center text-[11px] text-secondary">
        <span>Avbl <span className="text-primary font-medium">{calcWalletBalance.toFixed(2)} USDT</span></span>
        <button onClick={onOpenDepositModal} className="ml-1 text-brand hover:opacity-80">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        </button>
      </div>

      {/* Layer 3: Settings Row */}
      <div className="flex gap-2">
        <button 
          onClick={onOpenMarginModal}
          className="flex-1 bg-tertiary border border-color rounded py-1.5 text-[11px] font-medium text-secondary hover:text-primary transition-colors"
        >
          {store.marginType === 'cross' ? 'Cross' : 'Isolated'}
        </button>
        <button 
          onClick={onOpenLeverageModal}
          className="flex-1 bg-tertiary border border-color rounded py-1.5 text-[11px] font-medium text-secondary hover:text-primary transition-colors"
        >
          {store.leverage}x
        </button>
        <button 
          onClick={() => setIsAssetModeModalOpen(true)}
          className="w-10 bg-tertiary border border-color rounded py-1.5 text-[11px] font-medium text-secondary hover:text-primary transition-colors flex items-center justify-center"
        >
          M
        </button>
      </div>

      {/* Layer 4: Inputs */}
      <div className="space-y-4 mt-2">
        {(store.orderType === 'LIMIT' || store.orderType === 'STOP' || store.orderType === 'TAKE_PROFIT') && (
          <OrderInput 
            label="Price"
            value={store.price}
            onChange={store.setPrice}
            currency="USDT"
            quickActionLabel="BBO"
            onQuickAction={() => { /* TODO: get BBO from orderbook */ }}
          />
        )}

        {(store.orderType === 'STOP' || store.orderType === 'STOP_MARKET' || store.orderType === 'TAKE_PROFIT' || store.orderType === 'TAKE_PROFIT_MARKET') && (
          <OrderInput 
            label="Stop Price"
            value={store.stopPrice}
            onChange={store.setStopPrice}
            currency="USDT"
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
            />
          </>
        )}

        {/* Validation Error Display */}
        {!validation.isValid && validation.error && (
          <div className="px-1 text-danger text-[11px] font-medium animate-fade-in">
            {validation.error}
          </div>
        )}

        <OrderInput 
          label="Size"
          value={store.size}
          onChange={store.setSize}
          currency={currentCurrency}
          currencyOptions={[quoteAsset, baseAsset]}
          onCurrencyChange={(curr) => store.setSizeAsset(curr === baseAsset ? 'base' : 'quote')}
        />

        {/* Custom Size Slider */}
        <div className="px-3 pt-3 pb-4">
          <div className="relative w-full h-1 bg-tertiary rounded-lg flex items-center">
            {/* Filled Track */}
            <div 
              className="absolute h-full bg-brand rounded-l-lg pointer-events-none"
              style={{ width: `${Math.min(100, Math.max(0, maxPossibleSize > 0 ? ((parseFloat(store.size) || 0) / maxPossibleSize * 100) : 0))}%` }}
            />
            
            {/* Marks */}
            <div className="absolute inset-0 flex justify-between items-center pointer-events-none px-[1px]">
              {[0, 25, 50, 75, 100].map(mark => {
                const currentPct = maxPossibleSize > 0 ? ((parseFloat(store.size) || 0) / maxPossibleSize * 100) : 0;
                return (
                  <div 
                    key={mark} 
                    className={`w-1.5 h-1.5 rounded-full z-0 transition-colors ${currentPct >= mark ? 'bg-brand' : 'bg-color group-hover:bg-brand/50'}`} 
                  />
                );
              })}
            </div>

            {/* Invisible Native Input for interaction */}
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={maxPossibleSize > 0 ? ((parseFloat(store.size) || 0) / maxPossibleSize * 100).toFixed(0) : 0}
              onChange={(e) => {
                const pct = parseFloat(e.target.value) / 100;
                const newSize = maxPossibleSize * pct;
                store.setSize(newSize > 0 ? newSize.toFixed(market?.stepSize ? Math.max(0, -Math.floor(Math.log10(market.stepSize))) : 4) : '');
              }}
              className="absolute inset-0 w-full h-4 -top-1.5 opacity-0 cursor-pointer z-10" 
            />
            
            {/* Thumb Visual */}
            <div 
              className="absolute w-3.5 h-3.5 bg-brand rounded-full shadow pointer-events-none border-2 border-secondary z-10"
              style={{ 
                left: `calc(${Math.min(100, Math.max(0, maxPossibleSize > 0 ? ((parseFloat(store.size) || 0) / maxPossibleSize * 100) : 0))}% - 7px)`
              }}
            />
          </div>
        </div>
      </div>

      {/* Layer 5: Stacked Checkboxes */}
      <div className="space-y-3 text-[11px] text-secondary">
        {/* Slippage Tolerance */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors ${store.slippageEnabled ? 'bg-secondary text-primary' : 'border border-color bg-tertiary group-hover:border-primary'}`}>
              {store.slippageEnabled && <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            </div>
            <input type="checkbox" className="hidden" checked={store.slippageEnabled} onChange={(e) => store.setSlippageEnabled(e.target.checked)} />
            <span className="group-hover:text-primary transition-colors">Slippage Tolerance</span>
          </label>
          {store.slippageEnabled && (
            <div className="pl-5.5">
              <OrderInput label="Slippage" value={store.slippageTolerance} onChange={store.setSlippageTolerance} currency="%" />
            </div>
          )}
        </div>

        {/* TP/SL */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer group">
            <div className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors ${(store.attachedTpEnabled || store.attachedSlEnabled) ? 'bg-secondary text-primary' : 'border border-color bg-tertiary group-hover:border-primary'}`}>
              {(store.attachedTpEnabled || store.attachedSlEnabled) && <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
            </div>
            <input type="checkbox" className="hidden" checked={store.attachedTpEnabled || store.attachedSlEnabled} onChange={(e) => {
              store.setAttachedTpEnabled(e.target.checked);
              store.setAttachedSlEnabled(e.target.checked);
            }} />
            <span className="group-hover:text-primary transition-colors">TP/SL</span>
          </label>

          {(store.attachedTpEnabled || store.attachedSlEnabled) && (
            <div className="pl-5.5 space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span>Take Profit</span>
                  <select value={store.attachedTpTrigger} onChange={(e) => store.setAttachedTpTrigger(e.target.value as any)} className="bg-transparent text-primary outline-none cursor-pointer">
                    <option value="MARK_PRICE">Mark</option>
                    <option value="CONTRACT_PRICE">Last</option>
                  </select>
                </div>
                <OrderInput label="TP" value={store.attachedTpPrice} onChange={store.setAttachedTpPrice} currency="USDT" />
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span>Stop Loss</span>
                  <select value={store.attachedSlTrigger} onChange={(e) => store.setAttachedSlTrigger(e.target.value as any)} className="bg-transparent text-primary outline-none cursor-pointer">
                    <option value="MARK_PRICE">Mark</option>
                    <option value="CONTRACT_PRICE">Last</option>
                  </select>
                </div>
                <OrderInput label="SL" value={store.attachedSlPrice} onChange={store.setAttachedSlPrice} currency="USDT" />
              </div>
            </div>
          )}
        </div>

        {/* Reduce-Only */}
        <label className="flex items-center gap-2 cursor-pointer group">
          <div className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors ${store.isReduceOnly ? 'bg-secondary text-primary' : 'border border-color bg-tertiary group-hover:border-primary'}`}>
            {store.isReduceOnly && <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
          </div>
          <input type="checkbox" className="hidden" checked={store.isReduceOnly} onChange={(e) => store.setReduceOnly(e.target.checked)} />
          <span className="group-hover:text-primary transition-colors">Reduce-Only</span>
        </label>
      </div>

      {/* Layer 6: Action Buttons */}
      <div className="pt-2">
        <OrderActionButton 
          onSubmit={handleSubmit}
          isLoading={isLoading}
          validationError={!validation.isValid ? validation.error : undefined}
          onOpenDepositModal={onOpenDepositModal}
          walletBalance={calcWalletBalance}
          actionSubtext={actionSubtext}
        />
      </div>

      {/* Layer 7: Margin Info Grid */}
      <div className="flex justify-between text-[11px] mt-2">
        {store.marginType === 'isolated' ? (
          <>
            {/* Long Side Stats */}
            <div className="space-y-1 flex-1 pr-4">
              <div className="flex justify-between"><span className="text-secondary">Liq.Price</span><span className="text-primary">{estimatedIsolatedLiqPrice.long ? estimatedIsolatedLiqPrice.long.toFixed(2) : '--'}</span></div>
              <div className="flex justify-between"><span className="text-secondary">Margin</span><span className="text-success">{orderCost > 0 ? orderCost.toFixed(2) : '0.00'}</span></div>
              <div className="flex justify-between"><span className="text-secondary">Max</span><span className="text-success">{maxPossibleSize > 0 ? maxPossibleSize.toFixed(4) : '--'}</span></div>
              <div className="text-secondary mt-1 pt-1">Fees</div>
            </div>
            
            {/* Short Side Stats */}
            <div className="space-y-1 flex-1 pl-4">
              <div className="flex justify-between"><span className="text-secondary">Liq.Price</span><span className="text-danger">{estimatedIsolatedLiqPrice.short ? estimatedIsolatedLiqPrice.short.toFixed(2) : '--'}</span></div>
              <div className="flex justify-between"><span className="text-secondary">Margin</span><span className="text-danger">{orderCost > 0 ? orderCost.toFixed(2) : '0.00'}</span></div>
              <div className="flex justify-between"><span className="text-secondary">Max</span><span className="text-danger">{maxPossibleSize > 0 ? maxPossibleSize.toFixed(4) : '--'}</span></div>
            </div>
          </>
        ) : (
          <div className="w-full space-y-1">
            <div className="flex justify-between"><span className="text-secondary">Cross Margin Ratio</span><span className={crossMarginRatio > 80 ? 'text-danger' : crossMarginRatio > 50 ? 'text-brand' : 'text-success'}>{crossMarginRatio.toFixed(2)}%</span></div>
            <div className="flex justify-between"><span className="text-secondary">Account Equity</span><span className="text-primary">{crossAccountEquity.toFixed(2)} USDT</span></div>
            <div className="flex justify-between"><span className="text-secondary">Order Cost</span><span className="text-primary">{orderCost > 0 ? orderCost.toFixed(2) : '0.00'} USDT</span></div>
            <div className="flex justify-between"><span className="text-secondary">Max Size</span><span className="text-primary">{maxPossibleSize > 0 ? maxPossibleSize.toFixed(4) : '--'}</span></div>
          </div>
        )}
      </div>

      <AssetModeModal 
        isOpen={isAssetModeModalOpen} 
        onClose={() => setIsAssetModeModalOpen(false)} 
      />
    </div>
  );
};
