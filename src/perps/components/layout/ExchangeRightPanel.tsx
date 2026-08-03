import React, { useState } from 'react';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useAsterDataSync } from '../../adapters/aster/hooks/useAsterDataSync';
import { useOrders } from '../../adapters/aster/hooks/useOrders';
import { useAccountStore } from '../../core/stores/accountStore';
import { usePositionStore } from '../../core/stores/positionStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { useMarketStore } from '../../core/stores/marketStore';
import { OrderForm } from '../trade/OrderForm';
import { MarginModeModal } from '../trade/MarginModeModal';
import { LeverageModal } from '../trade/LeverageModal';
import { AccountModal } from '../trade/AccountModal';
import { AssetModeModal } from '../trade/AssetModeModal';
import { useTradeCalculations } from '../../hooks/useTradeCalculations';

const useLiveTotalPnl = (positions: Record<string, any>) => {
  const assetCtxByMarket = useTickerStore(state => state.assetCtxByMarket);
  
  return Object.values(positions).reduce((acc, p) => {
    const isLong = parseFloat(p.size) > 0;
    const markPrice = assetCtxByMarket[p.symbol]?.markPx || p.markPrice || '0';
    const entryVal = parseFloat(p.entryPrice);
    const markVal = parseFloat(markPrice);
    const absSize = Math.abs(parseFloat(p.size));
    const pnlVal = isLong ? (markVal - entryVal) * absSize : (entryVal - markVal) * absSize;
    return acc + pnlVal;
  }, 0);
};

const useTotalWalletBalance = (balances: Record<string, any>) => {
  const assetCtxByMarket = useTickerStore(state => state.assetCtxByMarket);
  
  return Object.values(balances).reduce((acc, b) => {
    let price = 1;
    if (b.asset !== 'USDT' && b.asset !== 'USDC') {
      const symbol = `${b.asset}USDT`;
      const markPrice = assetCtxByMarket[symbol]?.markPx || assetCtxByMarket[`${b.asset}-USDT`]?.markPx;
      if (markPrice) {
        price = parseFloat(markPrice);
      } else {
        // Fallback: If we don't have the ticker, don't count it for now to avoid zeroing it out.
        // Or assume 0 if it's a completely unknown asset. For ETH, we usually have it.
        price = 0;
      }
    }
    return acc + (parseFloat(b.total) * price);
  }, 0);
};

export const ExchangeRightPanel: React.FC = () => {
  const { asterSigner, userAddr } = useAsterAgent();
  const market = useMarketStore(state => state.markets[state.selectedSymbol]);
  
  // Start the background synchronization of balances, positions, and orders
  useAsterDataSync(asterSigner, userAddr);

  const { place } = useOrders(asterSigner, userAddr);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeModal, setActiveModal] = useState<'margin' | 'leverage' | 'account' | 'assetMode' | null>(null);
  const [accountModalTab, setAccountModalTab] = useState<'deposit' | 'withdraw' | 'transfer'>('deposit');

  // We can pass dummy values for the symbol-specific args since we only want global account values here
  const { totalMaintenanceMargin, crossMarginRatio } = useTradeCalculations(market?.symbol || 'BTCUSDT', '0', 'quote', 1, 'cross');

  const balances = useAccountStore((state) => state.balances);
  const positions = usePositionStore((state) => state.positions);
  const totalPnl = useLiveTotalPnl(positions);
  const walletBalance = useTotalWalletBalance(balances);
  
  const accountEquity = walletBalance + totalPnl;

  const handlePlaceOrder = async (payload: any) => {
    if (!asterSigner || !userAddr) return;
    
    setIsSubmitting(true);
    try {
      // Map payload to Aster's PlaceOrderParams
      let tif = payload.timeInForce;
      if (payload.isPostOnly) {
        tif = 'GTX';
      }

      // Format to precision based on market stepSize and tickSize
      const formatPrecision = (val: string | number | undefined, step: number | undefined): string | undefined => {
        if (val === undefined || val === null || val === '') return undefined;
        if (!step) return String(val);
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return String(val);
        const decimals = Math.max(0, -Math.floor(Math.log10(step)));
        return num.toFixed(decimals);
      };

      let finalSize = payload.size;
      if (payload.sizeAsset === 'quote') {
        let conversionPrice = 1;
        if ((payload.type === 'LIMIT' || payload.type === 'STOP' || payload.type === 'TAKE_PROFIT') && payload.price) {
          conversionPrice = parseFloat(payload.price);
        } else {
          const assetCtx = useTickerStore.getState().getAssetCtx(payload.symbol);
          conversionPrice = parseFloat(assetCtx?.markPx || '1');
        }
        
        if (!isNaN(conversionPrice) && conversionPrice > 0) {
          finalSize = String(parseFloat(payload.size) / conversionPrice);
        }
      }

      const formattedQty = formatPrecision(finalSize, market?.stepSize);
      const formattedPrice = formatPrecision(payload.price, market?.tickSize);
      const formattedStopPrice = formatPrecision(payload.stopPrice, market?.tickSize);
      const formattedActivation = formatPrecision(payload.activationPrice, market?.tickSize);

      const result = await place({
        symbol: payload.symbol.replace('-', ''),
        side: payload.side,
        type: payload.type,
        quantity: formattedQty,
        price: (payload.type === 'LIMIT' || payload.type === 'STOP' || payload.type === 'TAKE_PROFIT') ? formattedPrice : undefined,
        timeInForce: (payload.type === 'LIMIT' || payload.type === 'STOP' || payload.type === 'TAKE_PROFIT') ? tif : undefined,
        reduceOnly: payload.isReduceOnly,
        workingType: payload.workingType,
        stopPrice: (payload.type === 'STOP' || payload.type === 'STOP_MARKET' || payload.type === 'TAKE_PROFIT' || payload.type === 'TAKE_PROFIT_MARKET') ? formattedStopPrice : undefined,
        activationPrice: payload.type === 'TRAILING_STOP_MARKET' && formattedActivation ? formattedActivation : undefined,
        callbackRate: payload.type === 'TRAILING_STOP_MARKET' ? payload.callbackRate : undefined,
      });

      console.log('Order placed successfully!', result);
      // alert('Order Placed!'); // or toast
    } catch (err: any) {
      console.error('Failed to place order:', err);
      // alert('Order failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full md:w-[320px] shrink-0 flex flex-col gap-1 overflow-hidden h-full">
      <div className="flex-1 bg-secondary border border-color rounded-lg flex flex-col overflow-hidden">
        <OrderForm 
          onSubmitOrder={handlePlaceOrder} 
          isLoading={isSubmitting} 
          onOpenMarginModal={() => setActiveModal('margin')}
          onOpenLeverageModal={() => setActiveModal('leverage')}
          onOpenDepositModal={() => {
            setAccountModalTab('deposit');
            setActiveModal('account');
          }}
        />
      </div>

      {/* Bottom Footer block */}
      <div className="shrink-0 bg-secondary border border-color rounded-lg p-4 space-y-4">
        {/* Action Buttons */}
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setAccountModalTab('deposit');
              setActiveModal('account');
            }}
            className="flex-1 bg-tertiary border border-brand text-brand hover:bg-hover py-1.5 rounded-md text-[11px] font-semibold transition-colors"
          >
            Deposit
          </button>
          <button 
            onClick={() => {
              setAccountModalTab('withdraw');
              setActiveModal('account');
            }}
            className="flex-1 bg-tertiary text-primary hover:bg-hover py-1.5 rounded-md text-[11px] font-semibold transition-colors"
          >
            Withdraw
          </button>
          <button 
            onClick={() => {
              setAccountModalTab('transfer');
              setActiveModal('account');
            }}
            className="flex-1 bg-tertiary text-primary hover:bg-hover py-1.5 rounded-md text-[11px] font-semibold transition-colors"
          >
            Transfer
          </button>
        </div>

        {/* Account Equity Section */}
        <div className="space-y-4">
          {/* Account Equity */}
          <div className="space-y-2">
            <h4 className="text-[12px] font-medium text-primary mb-2">Account Equity</h4>
            <div className="flex justify-between items-center text-[11px] text-secondary">
              <span>Spot Total Value</span>
              <span className="text-primary font-medium">0.00 USD</span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-secondary">
              <span>Perp Total Value</span>
              <span className="text-primary font-medium">{walletBalance.toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-secondary">
              <span className="cursor-help">Perpetuals Unrealized Pnl</span>
              <span className={`font-medium ${totalPnl > 0 ? 'text-success' : totalPnl < 0 ? 'text-danger' : 'text-primary'}`}>
                {totalPnl > 0 ? '+' : ''}{totalPnl.toFixed(2)} USD
              </span>
            </div>
          </div>

          {/* Margin */}
          <div className="space-y-2">
            <h4 className="text-[12px] font-medium text-primary mb-2">Margin</h4>
            <div className="flex justify-between items-center text-[11px] text-secondary">
              <span>Account Margin Ratio</span>
              <span className={crossMarginRatio > 80 ? 'text-danger font-medium' : crossMarginRatio > 50 ? 'text-warning font-medium' : 'text-success font-medium'}>
                {crossMarginRatio.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-secondary">
              <span>Account Maintenance Margin</span>
              <span className="text-primary font-medium">{totalMaintenanceMargin.toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-secondary">
              <span className="cursor-help">Account Equity</span>
              <span className="text-primary font-medium">{accountEquity.toFixed(2)} USD</span>
            </div>
          </div>

          <button 
            onClick={() => setActiveModal('assetMode')}
            className="w-full py-1.5 text-[11px] text-secondary bg-tertiary rounded hover:text-primary transition-colors mt-2"
          >
            Multi-Asset Mode
          </button>
        </div>
      </div>

      <AssetModeModal
        isOpen={activeModal === 'assetMode'}
        onClose={() => setActiveModal(null)}
      />

      <MarginModeModal 
        isOpen={activeModal === 'margin'} 
        onClose={() => setActiveModal(null)} 
      />
      <LeverageModal 
        isOpen={activeModal === 'leverage'} 
        onClose={() => setActiveModal(null)} 
      />
      <AccountModal 
        isOpen={activeModal === 'account'}
        onClose={() => setActiveModal(null)}
        initialTab={accountModalTab}
      />
    </div>
  );
};
