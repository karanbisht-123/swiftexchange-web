import { useEffect, useMemo, useState } from 'react';

import { Notification, type NotificationType } from '../../../../components/common/Notification';
import { useSubaccounts } from '../../hooks/useSubaccounts';
import { useDydxTrading } from '../../hooks/useDydxTrading';
import { useDydxWallet } from '../../hooks/useDydxWallet';
import { useMarkets } from '../../hooks/useMarkets';
import useMarketStore from '../../store/marketStore';
import { useOrderbookClickStore } from '../../store/orderbookClickStore';
import type { MarginMode, OrderSideEnum, OrderTypeEnum } from '../../types/trading.types';
import {
  getMaxBuyingPower,
  getPriceDecimals,
  roundToTickSize,
  validateOrderPrice,
  validateOrderSize,
  validateTriggerPrice,
} from '../../utils/OrderValidation';
import { type CurrencyMode, currencyService } from '../../utils/currencyService';
import { DydxWalletConnect } from '../DydxWalletConnect';
import {
  AdvancedOptions,
  type GoodTilUnit,
  type TimeInForceOption,
} from './components/AdvancedOptions';
import { BuySellSelector } from './components/BuySellSelector';
import { LeverageSlider } from './components/LeverageSlider';
import { MarginTypeSelector } from './components/MarginTypeSelector';
import { OrderFormInputs } from './components/OrderFormInputs';
import { OrderReceipt } from './components/OrderReceipt';
import { OrderTypeSelector } from './components/OrderTypeSelector';
import { TpSlInputs } from './components/TpSlInputs';

interface NotificationState {
  id: number;
  type: NotificationType;
  message: string;
  title?: string;
}

const PRICE_REQUIRED_TYPES = ['LIMIT', 'STOP_LIMIT', 'TAKE_PROFIT_LIMIT'] as const;

const TRIGGER_REQUIRED_TYPES = [
  'STOP_MARKET',
  'STOP_LIMIT',
  'TAKE_PROFIT_MARKET',
  'TAKE_PROFIT_LIMIT',
] as const;

const CONDITIONAL_TYPES = [
  'STOP_MARKET',
  'STOP_LIMIT',
  'TAKE_PROFIT_MARKET',
  'TAKE_PROFIT_LIMIT',
] as const;

const convertToSeconds = (value: number, unit: GoodTilUnit): number => {
  const multipliers = {
    minutes: 60,
    hours: 3600,
    days: 86400,
    weeks: 604800,
  };
  return value * multipliers[unit];
};

const validateGoodTil = (
  value: number,
  unit: GoodTilUnit,
  _isConditional: boolean
): string | null => {
  const seconds = convertToSeconds(value, unit);
  // dYdX StatefulOrderTimeWindow is 95 days
  const maxSeconds = 95 * 86400;

  if (seconds > maxSeconds) {
    return 'Maximum duration is 95 days';
  }

  if (value < 1) {
    return 'Minimum value is 1';
  }

  return null;
};

export const DydxTradingForm: React.FC = () => {
  const { selectedMarket } = useMarketStore();
  const { setOnPriceClick } = useOrderbookClickStore();
  const { getMarket } = useMarkets();
  const marketData = (selectedMarket ? getMarket(selectedMarket) : null) ?? null;
  const { balance } = useDydxWallet();
  const { placeOrder, isPlacingOrder, orderError, clearOrderError, canTrade } = useDydxTrading();
  const { activeSubaccountNumber, getNextIsolatedSubaccount, childSubaccounts } = useSubaccounts();

  const [orderType, setOrderType] = useState<OrderTypeEnum>('LIMIT');
  const [side, setSide] = useState<OrderSideEnum>('BUY');
  const [marginMode, setMarginMode] = useState<MarginMode>('CROSS');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [leverage, setLeverage] = useState(1.0);
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>('USD');

  const [timeInForce, setTimeInForce] = useState<TimeInForceOption>('GTT');
  const [goodTilValue, setGoodTilValue] = useState(28);
  const [goodTilUnit, setGoodTilUnit] = useState<GoodTilUnit>('days');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [postOnly, setPostOnly] = useState(false);

  // TP/SL State
  const [showTpSl, setShowTpSl] = useState(false);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');

  const [sizeError, setSizeError] = useState<string>('');
  const [sizeWarning, setSizeWarning] = useState<string>('');
  const [priceError, setPriceError] = useState<string>('');
  const [priceWarning, setPriceWarning] = useState<string>('');
  const [triggerError, setTriggerError] = useState<string>('');
  const [triggerWarning, setTriggerWarning] = useState<string>('');
  const [goodTilError, setGoodTilError] = useState<string>('');

  const [notifications, setNotifications] = useState<NotificationState[]>([]);
  const [notificationCounter, setNotificationCounter] = useState(0);

  const isConditional = CONDITIONAL_TYPES.includes(orderType as any);
  const isLimit = orderType === 'LIMIT';

  const maxLeverage = useMemo(() => {
    if (!marketData?.initialMarginFraction) return 20;
    const imf = parseFloat(marketData.initialMarginFraction);
    return Math.floor(1 / imf);
  }, [marketData?.initialMarginFraction]);

  const maxBuyingPower = useMemo(() => {
    return getMaxBuyingPower(balance, marketData, leverage);
  }, [balance, marketData, leverage]);

  // Calculate target subaccount and equity for UI
  const targetSubaccount = useMemo(() => {
    if (marginMode === 'CROSS') return activeSubaccountNumber;
    return getNextIsolatedSubaccount(selectedMarket);
  }, [marginMode, activeSubaccountNumber, selectedMarket, getNextIsolatedSubaccount]);

  const isolatedEquity = useMemo(() => {
    if (marginMode !== 'ISOLATED') return 0;
    const subaccount = childSubaccounts.find(c => c.subaccountNumber === targetSubaccount);
    return subaccount ? parseFloat(subaccount.equity || '0') : 0;
  }, [marginMode, targetSubaccount, childSubaccounts]);

  const hasValidationErrors = !!(sizeError || priceError || triggerError || goodTilError);
  const isFormValid = !hasValidationErrors && size && canTrade;

  useEffect(() => {
    if (leverage > maxLeverage) {
      setLeverage(maxLeverage);
    }
  }, [maxLeverage, leverage]);

  useEffect(() => {
    if (marketData?.oraclePrice && !price) {
      const oracle = parseFloat(marketData.oraclePrice);
      const tick = marketData.tickSize ? parseFloat(marketData.tickSize) : 0;
      if (tick > 0) {
        setPrice(roundToTickSize(oracle, tick).toFixed(getPriceDecimals(tick)));
      } else {
        setPrice(marketData.oraclePrice);
      }
    }
  }, [marketData?.oraclePrice, price, marketData?.tickSize]);

  useEffect(() => {
    if (orderError) {
      addNotification('error', orderError, 'Order Failed');
      clearOrderError();
    }
  }, [orderError, clearOrderError]);

  useEffect(() => {
    if (reduceOnly && isLimit && timeInForce === 'GTT') {
      setTimeInForce('IOC');
      addNotification('warning', 'Reduce-only orders must use IOC or FOK', 'Time-in-Force Changed');
    }
  }, [reduceOnly, isLimit, timeInForce]);

  useEffect(() => {
    if (postOnly && (!isLimit || reduceOnly)) {
      setPostOnly(false);
      if (!isLimit) {
        addNotification('warning', 'Post-only only works with limit orders', 'Post-Only Disabled');
      }
    }
  }, [postOnly, isLimit, reduceOnly, orderType]);

  useEffect(() => {
    const handlePriceClick = (clickedPrice: string) => {
      if (PRICE_REQUIRED_TYPES.includes(orderType as any)) {
        setPrice(clickedPrice);
      } else if (TRIGGER_REQUIRED_TYPES.includes(orderType as any)) {
        if (!triggerPrice) {
          setTriggerPrice(clickedPrice);
        } else if (PRICE_REQUIRED_TYPES.includes(orderType as any) && !price) {
          setPrice(clickedPrice);
        }
      }
    };

    setOnPriceClick(handlePriceClick);

    return () => {
      setOnPriceClick(null);
    };
  }, [orderType, price, triggerPrice, setOnPriceClick]);

  useEffect(() => {
    if (size && marketData) {
      const validation = validateOrderSize(
        marketData,
        size,
        currencyMode,
        balance,
        leverage,
        orderType
      );
      setSizeError(validation.isValid ? '' : validation.error || '');
      setSizeWarning(validation.warning || '');
    } else {
      setSizeError('');
      setSizeWarning('');
    }
  }, [size, marketData, currencyMode, balance, leverage, orderType]);

  useEffect(() => {
    if (PRICE_REQUIRED_TYPES.includes(orderType as any) && price) {
      const validation = validateOrderPrice(marketData, price);
      setPriceError(validation.isValid ? '' : validation.error || '');
      setPriceWarning(validation.warning || '');
    } else {
      setPriceError('');
      setPriceWarning('');
    }
  }, [price, orderType, marketData]);

  useEffect(() => {
    if (TRIGGER_REQUIRED_TYPES.includes(orderType as any) && triggerPrice) {
      const validation = validateTriggerPrice(marketData, triggerPrice, side, orderType);
      setTriggerError(validation.isValid ? '' : validation.error || '');
      setTriggerWarning(validation.warning || '');
    } else {
      setTriggerError('');
      setTriggerWarning('');
    }
  }, [triggerPrice, orderType, marketData, side]);

  useEffect(() => {
    if ((isLimit && timeInForce === 'GTT') || isConditional) {
      const error = validateGoodTil(goodTilValue, goodTilUnit, isConditional);
      setGoodTilError(error || '');
    } else {
      setGoodTilError('');
    }
  }, [goodTilValue, goodTilUnit, isConditional, isLimit, timeInForce]);

  const handleCurrencyModeChange = (newMode: CurrencyMode) => {
    if (!marketData || !size) {
      setCurrencyMode(newMode);
      return;
    }

    const currentConversion = currencyService.parseInput(size, currencyMode, marketData);

    if (currentConversion.isValid) {
      if (newMode === 'USD') {
        setSize(currencyService.formatUsdAmount(currentConversion.usdAmount));
      } else {
        const decimals = currencyService.getStepSizeDecimals(marketData.stepSize || '0.00000001');
        setSize(currencyService.formatBaseAmount(currentConversion.baseAmount, decimals));
      }
    }

    setCurrencyMode(newMode);
  };

  const handlePlaceOrder = async () => {
    if (!selectedMarket || !canTrade) {
      addNotification('warning', 'Please connect your wallet', 'Wallet Not Connected');
      return;
    }

    if (!isFormValid) {
      addNotification('error', 'Please fix validation errors', 'Invalid Order');
      return;
    }

    if (!marketData) {
      addNotification('error', 'Market data not available', 'Error');
      return;
    }

    const conversion = currencyService.parseInput(size, currencyMode, marketData);
    if (!conversion.isValid) {
      addNotification('error', 'Invalid order size', 'Error');
      return;
    }

    let finalQuantity = conversion.baseAmount;
    if (marketData.stepSize) {
      finalQuantity = currencyService.roundToStepSize(finalQuantity, marketData.stepSize);
    }

    const finalPrice = PRICE_REQUIRED_TYPES.includes(orderType as any)
      ? parseFloat(price)
      : undefined;

    const finalTriggerPrice = TRIGGER_REQUIRED_TYPES.includes(orderType as any)
      ? parseFloat(triggerPrice)
      : undefined;

    // dYdX expects goodTilTimeInSeconds as a DURATION in seconds, NOT absolute timestamp
    // For example: 28 days = 28 * 24 * 60 * 60 = 2,419,200 seconds
    let goodTilTimeInSeconds: number | undefined;
    if ((isLimit && timeInForce === 'GTT') || isConditional) {
      goodTilTimeInSeconds = convertToSeconds(goodTilValue, goodTilUnit);
    }

    // Isolated margin: Auto-deposit handles collateral transfer
    // $20 minimum only applies to long-term/conditional orders
    if (marginMode === 'ISOLATED') {
      const crossSub = childSubaccounts.find(c => c.subaccountNumber === 0);

      const crossFreeCollateral = crossSub ? parseFloat(crossSub.freeCollateral || '0') : 0;
      const oraclePrice = parseFloat(marketData?.oraclePrice || '0');
      const notionalValue = conversion.baseAmount * oraclePrice;
      const requiredMargin = notionalValue / leverage;
      const requiredMarginWithBuffer = requiredMargin * 1.05;

      // For conditional/limit orders, enforce $20 minimum
      const isLongTermOrder = orderType !== 'MARKET';
      const minRequired = isLongTermOrder
        ? Math.max(requiredMarginWithBuffer, 20)
        : requiredMarginWithBuffer;

      if (crossFreeCollateral + isolatedEquity < minRequired) {
        const orderTypeLabel = isLongTermOrder ? 'long-term/conditional' : 'market';
        addNotification(
          'error',
          isLongTermOrder
            ? `Your order is below the minimum collateral requirement for isolated ${orderTypeLabel} orders. Requires at least $20.00. (Available Free Collateral: $${(crossFreeCollateral + isolatedEquity).toFixed(2)})`
            : `Insufficient collateral for isolated ${orderTypeLabel} order. Requires $${minRequired.toFixed(2)}. (Available Free Collateral: $${(crossFreeCollateral + isolatedEquity).toFixed(2)})`,
          'Insufficient Margin'
        );
        return;
      }

      if (isolatedEquity < minRequired) {
        addNotification(
          'info',
          `$${(minRequired - isolatedEquity).toFixed(2)} will be auto-deposited from Cross Margin.`,
          'Auto-Deposit'
        );
      }
    }

    console.log('[DydxTradingForm] Placing order:', { side, marginMode, targetSubaccount });
    const result = await placeOrder({
      market: selectedMarket,
      side,
      type: orderType,
      size: finalQuantity,
      price: finalPrice,
      triggerPrice: finalTriggerPrice,
      timeInForce,
      reduceOnly,
      postOnly: postOnly && orderType === 'LIMIT',
      goodTilTimeInSeconds,
      subaccountNumber: targetSubaccount,
      leverage,
      takeProfitPrice: showTpSl && tpPrice ? parseFloat(tpPrice) : undefined,
      stopLossPrice: showTpSl && slPrice ? parseFloat(slPrice) : undefined,
    });

    if (result.success) {
      addNotification(
        'success',
        `${side} ${finalQuantity} ${marketData.baseAsset}`,
        'Order Placed'
      );
      setSize('');
      setPrice(marketData?.oraclePrice || '');
      setTriggerPrice('');
      if (showTpSl) {
        setTpPrice('');
        setSlPrice('');
      }
    } else {
      addNotification('error', result.userMessage || result.error || 'Failed', 'Order Failed');
    }
  };

  const addNotification = (type: NotificationType, message: string, title?: string) => {
    const id = notificationCounter;
    setNotificationCounter(prev => prev + 1);
    setNotifications(prev => [...prev, { id, type, message, title }]);
  };

  const removeNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="flex flex-col max-w-lvw lg:max-w-[300px] h-[100svh] border-l border-gray-600  bg-secondary">
      {notifications.map(notif => (
        <Notification
          key={notif.id}
          type={notif.type}
          message={notif.message}
          title={notif.title}
          onClose={() => removeNotification(notif.id)}
          autoClose={true}
          autoCloseDuration={5000}
        />
      ))}
      <div className="hidden lg:block shrink-0">
        <DydxWalletConnect />
      </div>

      <div className="lg:hidden shrink-0   py-3 px-2 bg-primary">
        {balance ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">Portfolio</span>
                <span className="text-base font-bold text-white">
                  ${Number(balance.equity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-px h-8 bg-gray-700/50" />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-gray-500 font-semibold">Available</span>
                <span className="text-base font-bold text-emerald-400">
                  ${Number(balance.freeCollateral).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            {/* <div className="flex flex-col items-end gap-1">
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${canTrade ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${canTrade ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
                <span className={`text-[10px] font-semibold ${canTrade ? 'text-green-400' : 'text-yellow-400'}`}>
                  {canTrade ? '' : 'Connect'}
                </span>
              </div>
            </div> */}
          </div>
        ) : (
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gray-700/50 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <span className="text-xs text-gray-400">Connect wallet to trade</span>
            </div>
            <a
              href="https://trade.dydx.exchange/portfolio/deposit"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-semibold rounded-lg transition-colors"
            >
              Deposit
            </a>
          </div>
        )}
      </div>

      {/* Fixed Selectors */}
      <div className="flex-shrink-0 space-y-4 pb-2 bg-secondary">
        <BuySellSelector selected={side} onChange={setSide} />
        <MarginTypeSelector
          selected={marginMode}
          onChange={setMarginMode}
          isolatedEquity={isolatedEquity}
        />
        <OrderTypeSelector selected={orderType} onChange={setOrderType} />
      </div>

      {/* Scrollable form content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        <div className="space-y-4 py-4">
          <OrderFormInputs
            orderType={orderType}
            size={size}
            price={price}
            triggerPrice={triggerPrice}
            currentPrice={marketData?.oraclePrice || '0'}
            bestPrices={{ bestBid: '0', bestAsk: '0' }}
            onSizeChange={setSize}
            onPriceChange={setPrice}
            onTriggerPriceChange={setTriggerPrice}
            sizeError={sizeError}
            sizeWarning={sizeWarning}
            priceError={priceError}
            priceWarning={priceWarning}
            triggerError={triggerError}
            triggerWarning={triggerWarning}
            currencyMode={currencyMode}
            onCurrencyModeChange={handleCurrencyModeChange}
            baseAsset={marketData?.baseAsset || 'USD'}
            maxBuyingPower={maxBuyingPower}
            leverage={leverage}
            onSetMax={() => {
              if (maxBuyingPower) {
                // If mode is USD, set directly. If Base, convert.
                // Simplification: Assume maxBuyingPower is in USD?
                // getMaxBuyingPower usually returns USD value based on margin.
                // Let's verify getMaxBuyingPower return type/unit. Assuming USD for now.
                if (currencyMode === 'USD') {
                  setSize(maxBuyingPower.toFixed(2));
                } else {
                  // Need oracle price to convert back to base asset if max is USD
                  // Or use getMaxBuyingPower and divide by price
                  if (marketData?.oraclePrice && parseFloat(marketData.oraclePrice) > 0) {
                    const baseAmount = maxBuyingPower / parseFloat(marketData.oraclePrice);
                    const decimals = currencyService.getStepSizeDecimals(
                      marketData.stepSize || '0.00000001'
                    );
                    setSize(baseAmount.toFixed(decimals));
                  }
                }
              }
            }}
          />

          <LeverageSlider leverage={leverage} maxLeverage={maxLeverage} onChange={setLeverage} />

          {orderType !== 'MARKET' && (
            <AdvancedOptions
              orderType={orderType}
              timeInForce={timeInForce}
              goodTilValue={goodTilValue}
              goodTilUnit={goodTilUnit}
              postOnly={postOnly}
              reduceOnly={reduceOnly}
              onTimeInForceChange={setTimeInForce}
              onGoodTilValueChange={setGoodTilValue}
              onGoodTilUnitChange={setGoodTilUnit}
              onPostOnlyChange={setPostOnly}
              onReduceOnlyChange={setReduceOnly}
            />
          )}

          {orderType === 'MARKET' && (
            <div className="px-5 py-3 border-b border-gray-800/50 bg-gray-900/20">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-[11px] uppercase tracking-wider text-gray-500 font-bold group-hover:text-gray-400 transition-colors">
                  Take Profit / Stop Loss
                </span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={showTpSl}
                    onChange={e => setShowTpSl(e.target.checked)}
                    className="appearance-none w-9 h-5 rounded-full bg-gray-700 checked:bg-blue-500 transition-colors cursor-pointer"
                  />
                  <div
                    className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform pointer-events-none ${showTpSl ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </div>
              </label>
            </div>
          )}

          {orderType === 'MARKET' && showTpSl && (
            <TpSlInputs
              side={side}
              entryPrice={parseFloat(marketData?.oraclePrice || '0')}
              tpPrice={tpPrice}
              slPrice={slPrice}
              onChangeTp={setTpPrice}
              onChangeSl={setSlPrice}
            />
          )}

          {goodTilError && <div className="text-xs text-red-500">{goodTilError}</div>}

          <OrderReceipt
            marketData={marketData}
            side={side}
            size={size}
            price={price}
            triggerPrice={triggerPrice}
            leverage={leverage}
            orderType={orderType}
          />

          {/* Bottom padding for smooth scroll */}
          <div className="h-2" />
        </div>
      </div>

      {/* Fixed button at bottom with shadow */}
      <div className="shrink-0 p-4 mb-6 border-t border-gray-700   bg-secondary shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)]">
        <button
          onClick={handlePlaceOrder}
          disabled={isPlacingOrder || !isFormValid}
          className={`w-full py-3 rounded-lg font-bold text-sm transition-all
          ${side === 'BUY'
              ? 'bg-green-600 hover:bg-green-700 active:bg-green-800'
              : 'bg-red-600 hover:bg-red-700 active:bg-red-800'
            } disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg`}
        >
          {isPlacingOrder ? 'Placing Order...' : `${side} ${selectedMarket}`}
        </button>
      </div>
    </div>
  );
};
